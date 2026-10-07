-- ════════════════════════════════════════════════════════════════════════════
-- Price-list import, part 2 (Build Plan 5.8b) — run in the Supabase SQL Editor.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT: one JSON column per company for the price-list importer's memory:
--   { "suppliers": { "<supplier name>": { "pending": [ …open questions skipped for now… ] } } }
--   Open questions are items from an import that weren't priced yet ("skip for now"); the
--   company finishes them later from Profile → My Pricing. (Later: confirmed matches per
--   supplier, so next year's price list imports in one go.)
-- WHO: same row-level rules as the rest of company_profiles (the owner edits their own row).
alter table public.company_profiles
  add column if not exists price_import_state jsonb not null default '{}'::jsonb;

-- Check it worked — should return one row:
--   select column_name from information_schema.columns
--   where table_name = 'company_profiles' and column_name = 'price_import_state';
