-- ════════════════════════════════════════════════════════════════════════════
-- Customer share links (Build Plan 5.6) — run in the Supabase SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT: a Gold company shares a design with its customer: /app?share=<token>. The customer
-- sees a frozen, view-only copy (3D, floor plan, elevations, and — if the company chose —
-- the quote total or the itemized quote) and can tap "Approve this design".
-- SAFETY:
--   • The customer never touches the projects table. They only get the frozen copy, through
--     get_share(), and only while the link is on, not expired, and the company is still Gold.
--   • The token is 256 random bits — it can't be guessed. Turning the link off works at once.
--   • approve_share() records one approval (name, time, quote version) and adds a line to the
--     project's activity log. It's a design approval, not a contract (Dan, 2026-10-05).

create table if not exists public.project_shares (
  id               uuid primary key default gen_random_uuid(),
  token            text not null unique,
  user_id          uuid not null references auth.users(id) on delete cascade,   -- the company (team owner)
  project_id       uuid not null,
  show_prices      text not null default 'none' check (show_prices in ('none', 'total', 'full')),
  payload          jsonb not null,                -- the frozen copy the customer sees
  quote_label      text,                          -- e.g. "Quote #CD-4F2A9K · revision 2" or "Draft"
  quote_sig        text,                          -- fingerprint of the design + price shown
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expires_at       timestamptz,
  revoked          boolean not null default false,
  views            integer not null default 0,
  last_viewed_at   timestamptz,
  approved_at      timestamptz,
  approved_name    text,
  approved_label   text,                          -- the quote_label at the moment of approval
  approval_seen    boolean not null default false
);
create index if not exists project_shares_owner_idx on public.project_shares (user_id, project_id);

alter table public.project_shares enable row level security;

-- Is this company on Gold? (company_profiles isn't readable by visitors; this only answers yes/no)
create or replace function public.is_gold(company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_profiles where user_id = company and subscription_tier = 'gold');
$$;
grant execute on function public.is_gold(uuid) to anon, authenticated;

-- The company (owner or active team member) manages its own share links; creating or changing
-- one needs Gold.
drop policy if exists "project_shares_company_all" on public.project_shares;
create policy "project_shares_company_all" on public.project_shares
  for all to authenticated
  using (
    user_id = auth.uid()
    or user_id in (select owner_id from team_members where member_user_id = auth.uid() and status = 'active')
  )
  with check (
    (user_id = auth.uid()
      or user_id in (select owner_id from team_members where member_user_id = auth.uid() and status = 'active'))
    and public.is_gold(user_id)
    and octet_length(payload::text) < 2000000
  );

-- What the customer's browser calls. Returns the frozen copy (or nothing) and counts the view.
create or replace function public.get_share(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s project_shares;
begin
  select * into s from project_shares
   where token = p_token and not revoked and (expires_at is null or expires_at > now())
     and public.is_gold(user_id);
  if not found then return null; end if;
  update project_shares set views = views + 1, last_viewed_at = now() where id = s.id;
  return jsonb_build_object('payload', s.payload, 'show_prices', s.show_prices, 'quote_label', s.quote_label,
    'approved_at', s.approved_at, 'approved_name', s.approved_name, 'expires_at', s.expires_at);
end;
$$;
grant execute on function public.get_share(text) to anon, authenticated;

-- The customer's "Approve this design". One approval per link (until the company updates it).
create or replace function public.approve_share(p_token text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s project_shares; nm text := btrim(coalesce(p_name, ''));
begin
  if length(nm) < 2 or length(nm) > 80 then raise exception 'Please type your full name.'; end if;
  nm := regexp_replace(nm, '[<>]', '', 'g');
  select * into s from project_shares
   where token = p_token and not revoked and (expires_at is null or expires_at > now())
     and public.is_gold(user_id)
   for update;
  if not found then raise exception 'This link is no longer active.'; end if;
  if s.approved_at is not null then
    return jsonb_build_object('approved_at', s.approved_at, 'approved_name', s.approved_name, 'already', true);
  end if;
  update project_shares
     set approved_at = now(), approved_name = nm, approved_label = s.quote_label, approval_seen = false
   where id = s.id;
  -- a line in the project's activity log, so the approval travels with the job
  update projects
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{activityLog}',
           jsonb_build_array(jsonb_build_object(
             'id', 'share-' || s.id::text, 'type', 'approval',
             'text', 'Design approved by ' || nm || ' on the share link' || coalesce(' (' || s.quote_label || ')', ''),
             'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'user', nm))
           || coalesce(data->'activityLog', '[]'::jsonb)),
         updated_at = now()
   where id = s.project_id and user_id = s.user_id;
  return jsonb_build_object('approved_at', now(), 'approved_name', nm, 'already', false);
end;
$$;
grant execute on function public.approve_share(text, text) to anon, authenticated;

-- Check it worked:
--   select count(*) from public.project_shares;
--   select proname from pg_proc where proname in ('get_share', 'approve_share', 'is_gold');
