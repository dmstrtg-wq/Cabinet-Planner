-- ════════════════════════════════════════════════════════════════════════════
-- Protect billing columns on company_profiles
-- ════════════════════════════════════════════════════════════════════════════
-- WHY: app.html and profile.html decide what a user can do (Silver/Gold features)
-- from company_profiles.subscription_tier, and profile.html saves the user's own
-- company_profiles row from the browser. If the table's policy lets a user update
-- their own row, someone could run one line in the browser console and give
-- themselves Gold, or point stripe_customer_id at another customer's billing.
--
-- WHAT THIS DOES: a trigger that ignores any change to subscription_tier,
-- stripe_customer_id or stripe_subscription_id coming from a logged-in user or
-- an anonymous visitor. These are still allowed to change them:
--   • the Stripe webhook (Netlify function, uses the service_role key)
--   • you, in the Supabase dashboard (SQL editor / table editor), e.g. to flip a
--     trial company to Gold by hand
-- A user creating their own row for the first time always starts as 'free'.
--
-- The app itself never writes these three columns from the browser, so nothing
-- that works today stops working.
--
-- ── STEP 1 (optional, before running): see what's allowed today ─────────────
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies where tablename = 'company_profiles';
--
-- ── STEP 2: run everything below ────────────────────────────────────────────

create or replace function public.protect_company_billing_columns()
returns trigger
language plpgsql
as $$
begin
  -- auth.role() is 'authenticated' or 'anon' for requests from the website;
  -- 'service_role' for the webhook; null in the Supabase dashboard.
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.subscription_tier      := 'free';
      new.stripe_customer_id     := null;
      new.stripe_subscription_id := null;
    else
      new.subscription_tier      := old.subscription_tier;
      new.stripe_customer_id     := old.stripe_customer_id;
      new.stripe_subscription_id := old.stripe_subscription_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_company_billing_columns on public.company_profiles;
create trigger protect_company_billing_columns
  before insert or update on public.company_profiles
  for each row execute function public.protect_company_billing_columns();

-- ── STEP 3: check it worked ─────────────────────────────────────────────────
-- Should return one row named protect_company_billing_columns:
--   select tgname from pg_trigger
--   where tgrelid = 'public.company_profiles'::regclass and not tgisinternal;
