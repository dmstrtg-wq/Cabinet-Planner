-- ════════════════════════════════════════════════════════════════════════════
-- Quote settings on the company profile (Build Plan 7.2) — run in the Supabase SQL Editor.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT: one JSON column for quote preferences, starting with
--   { "slidesIncluded": true|false }  — do drawer slides come with the company's cabinets?
-- WHO: same row-level rules as the rest of company_profiles (the owner edits their own row).
--      This is not a billing column, so the billing-protection trigger doesn't touch it.
alter table public.company_profiles
  add column if not exists quote_settings jsonb not null default '{}'::jsonb;

-- Check it worked — should return one row named quote_settings:
--   select column_name, data_type from information_schema.columns
--   where table_name = 'company_profiles' and column_name = 'quote_settings';
