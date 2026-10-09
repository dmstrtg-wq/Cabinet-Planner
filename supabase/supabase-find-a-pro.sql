-- ════════════════════════════════════════════════════════════════════════════
-- Find a Pro: quote requests straight to a listed company (2026-10-08) — run in the Supabase
-- SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
-- WHY: the public /find-a-pro page lets a homeowner ask a LISTED company for a quote. Until now a
-- lead could only be addressed to nobody (a network lead for the admin) or to a company whose
-- homeowner design link is on. This adds "or the company is listed on Find a Pro".
-- The email alert to the company (supabase-email-alerts.sql) fires on its own for these leads.
-- Same size caps and the same rate limit (30 per company per hour, 3 per email per 10 minutes).

-- Is this company listed on Find a Pro? (answers yes/no only)
create or replace function public.pro_listed(company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from pro_listings where user_id = company and listed = true);
$$;
grant execute on function public.pro_listed(uuid) to anon, authenticated;

drop policy if exists "leads_anon_insert" on public.leads;
create policy "leads_anon_insert" on public.leads
  for insert to anon, authenticated
  with check (
    (company_id is null or public.design_link_open(company_id) or public.pro_listed(company_id))
    and (design is null or octet_length(design::text) < 400000)
    and (floor_plan_dataurl is null or length(floor_plan_dataurl) < 200000)
  );

-- Check it worked:
--   select proname from pg_proc where proname = 'pro_listed';
