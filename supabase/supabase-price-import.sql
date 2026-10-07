-- ════════════════════════════════════════════════════════════════════════════
-- AI price-list import (Build Plan 5.8) — run in the Supabase SQL Editor.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Supplier item codes, saved alongside prices so the order list (5.7) can print the
--    supplier's real SKU. Same shape as price_overrides:
--      { "<cabinet type>": { "<width>" or "<width>x<height>": { "<finish code>": "SKU" } } }
--    Same row-level rules as the rest of company_profiles (the owner edits their own row).
alter table public.company_profiles
  add column if not exists supplier_skus jsonb not null default '{}'::jsonb;

-- 2) One row per AI call, written only by the Netlify function (service key). Used to
--    rate-limit imports per account and to measure what each import really costs.
--    No price data is stored here — only counts and token usage.
create table if not exists public.price_import_log (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  import_id     text not null,
  step          text not null,          -- 'structure' or 'map'
  model         text,
  items         int,
  input_tokens  int,
  output_tokens int,
  ok            boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists price_import_log_user_time on public.price_import_log (user_id, created_at);

-- Row-level security on, with no policies: browsers can't read or write this table at all.
-- Only the Netlify function (service key) can.
alter table public.price_import_log enable row level security;

-- Check it worked:
--   select column_name from information_schema.columns
--   where table_name = 'company_profiles' and column_name = 'supplier_skus';
--   select count(*) from public.price_import_log;
--
-- Cost per import later (tokens → dollars at the model's list price):
--   select import_id, min(created_at), sum(items) as items,
--          sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens
--   from public.price_import_log group by import_id order by 2 desc limit 20;
