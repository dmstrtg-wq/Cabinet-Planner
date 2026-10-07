-- ════════════════════════════════════════════════════════════════════════════
-- Email alerts to companies (new leads + design approvals) — run in the Supabase SQL Editor.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT: when a lead lands with a company (from its homeowner design link, or when the admin
-- assigns a network lead to it), or a customer approves a shared design, the database asks
-- the Netlify function /.netlify/functions/notify to email that company.
-- HOW: a trigger queues a web request with pg_net. The request only carries WHICH row changed
-- ({kind, id}). The function reads the row itself with the service key, sends at most one email
-- per lead per company / per approval (it stamps the row), and only to that company. So a forged
-- request can't send anything that wouldn't have been sent anyway, and needs no secret.
-- SAFETY: if the request can't be queued, the lead/approval still saves (errors are swallowed).
-- (Network leads with no company keep going to the site admin by the existing Netlify form email.)

create extension if not exists pg_net with schema extensions;

-- Which company has already been emailed about this lead / when this approval was emailed
alter table public.leads add column if not exists notified_company uuid;
alter table public.project_shares add column if not exists approval_emailed_at timestamptz;

-- A company can switch the emails off (Company Settings → Email alerts)
alter table public.company_profiles add column if not exists alert_emails boolean not null default true;

create or replace function public.queue_company_alert(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://mycabinetplanner.com/.netlify/functions/notify',
    body := jsonb_build_object('kind', p_kind, 'id', p_id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'queue_company_alert failed: %', sqlerrm;   -- never block the lead/approval
end;
$$;
revoke all on function public.queue_company_alert(text, uuid) from public, anon, authenticated;

-- Leads: a new lead for a company, or a lead (re)assigned to a different company
create or replace function public.leads_alert_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is not null and new.company_id is distinct from new.notified_company
     and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    perform public.queue_company_alert('lead', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists leads_alert on public.leads;
create trigger leads_alert after insert or update of company_id on public.leads
  for each row execute function public.leads_alert_trigger();

-- Share links: a customer just approved (approve_share sets approved_at)
create or replace function public.shares_alert_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approved_at is not null and old.approved_at is distinct from new.approved_at then
    perform public.queue_company_alert('approval', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists shares_alert on public.project_shares;
create trigger shares_alert after update of approved_at on public.project_shares
  for each row execute function public.shares_alert_trigger();

-- Check it worked:
--   select extname from pg_extension where extname = 'pg_net';
--   select tgname from pg_trigger where tgname in ('leads_alert', 'shares_alert');
-- After a test lead/approval, see the request and its answer:
--   select id, status_code, content, created from net._http_response order by created desc limit 5;
