-- ════════════════════════════════════════════════════════════════════════════
-- Homeowner mode (Build Plan 6.1) — run in the Supabase SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT:
--   • A Gold company can turn on its own homeowner design link
--     (mycabinetplanner.com/app?pro=<design_slug>). Homeowners design there — no prices —
--     and send the design straight to that company's Leads tab.
--   • The link's public info lives on pro_listings (already public-safe: name, logo, phone…),
--     plus the company's finish NAMES and colors (never prices) so homeowners pick real finishes.
--   • Leads can now carry the whole design (JSON) and which project it became.
-- SAFETY:
--   • Anonymous visitors can only read a listing whose design link is on AND whose company is Gold.
--   • A lead can only be addressed to such a company (or to nobody, the old network leads).
--   • Size cap on the design, and a rate limit per company and per email address.

-- 1) Design link fields on the public listing
alter table public.pro_listings add column if not exists design_link boolean not null default false;
alter table public.pro_listings add column if not exists design_slug text;
alter table public.pro_listings add column if not exists finishes jsonb;          -- [{code,name,swatch,tier}] — no prices
create unique index if not exists pro_listings_design_slug_idx on public.pro_listings (lower(design_slug));

-- Is this company's design link open? (Gold + switched on.) Reads company_profiles, which
-- visitors can't read themselves, so it runs with the owner's rights but only answers yes/no.
create or replace function public.design_link_open(company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pro_listings pl
    join company_profiles cp on cp.user_id = pl.user_id
    where pl.user_id = company and pl.design_link = true and cp.subscription_tier = 'gold'
  );
$$;
grant execute on function public.design_link_open(uuid) to anon, authenticated;

-- Visitors may read a listing with an open design link (even when it isn't in Find a Pro)
drop policy if exists "pro_listings_design_link_read" on public.pro_listings;
create policy "pro_listings_design_link_read" on public.pro_listings
  for select to anon, authenticated
  using (design_link = true and public.design_link_open(user_id));

-- 2) Leads carry the design and, once opened, the project it became
alter table public.leads add column if not exists design jsonb;
alter table public.leads add column if not exists source text;                    -- 'design_link' | null (network)
alter table public.leads add column if not exists project_id uuid;

-- Who can send a lead: to nobody in particular (network lead, as before), or to a company
-- whose design link is open. Design capped at ~400 KB.
drop policy if exists "leads_anon_insert" on public.leads;
create policy "leads_anon_insert" on public.leads
  for insert to anon, authenticated
  with check (
    (company_id is null or public.design_link_open(company_id))
    and (design is null or octet_length(design::text) < 400000)
    and (floor_plan_dataurl is null or length(floor_plan_dataurl) < 200000)
  );

-- 3) Rate limit: at most 30 leads per company per hour, 3 per email address per 10 minutes
create or replace function public.leads_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is not null and (
       select count(*) from leads where company_id = new.company_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many requests for this company right now. Please try again later.';
  end if;
  if new.email is not null and (
       select count(*) from leads where lower(email) = lower(new.email) and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'You''ve already sent a few requests. Please wait a few minutes.';
  end if;
  return new;
end;
$$;
drop trigger if exists leads_rate_limit on public.leads;
create trigger leads_rate_limit before insert on public.leads
  for each row execute function public.leads_rate_limit();

-- Check it worked:
--   select column_name from information_schema.columns
--   where table_name = 'leads' and column_name in ('design','source','project_id');
--   select column_name from information_schema.columns
--   where table_name = 'pro_listings' and column_name in ('design_link','design_slug','finishes');
