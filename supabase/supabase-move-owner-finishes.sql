-- ════════════════════════════════════════════════════════════════════════════
-- Move the owner accounts' built-in supplier finishes into their saved finish lists
-- (2026-10-07) — run in the Supabase SQL Editor BEFORE pushing the code that deletes
-- js/owner-styles.js. Safe to re-run (only adds codes that aren't there yet).
-- ════════════════════════════════════════════════════════════════════════════
-- WHY: the 21 finish names were in a public JavaScript file every visitor downloads, even
-- though only Dan's and Sam's accounts showed them. After this they live only in those two
-- accounts' company_profiles.custom_styles, which nobody else can read.
-- WHAT EACH ACCOUNT SEES: exactly the same list as before. The built-in list was shown when
-- the account had no saved finishes, or had finishes from a supplier import; an account with
-- only its own hand-made finishes didn't show it — so that case is left alone.
-- Prices, projects and everything else are untouched (prices are keyed by finish code).

-- 1) Before: what each owner account has saved
select user_id, company_name, jsonb_array_length(coalesce(custom_styles, '[]'::jsonb)) as saved_finishes
from public.company_profiles
where user_id in ('f464edfb-8f74-49b7-b366-79b89605bbb7', 'd7620158-9fbd-44de-9770-2f00bdabe71c');

-- 2) The move
with builtin as (
  select '[{"tier":"Gold","code":"AW","name":"Ice White Shaker","swatch":"#F2F1EE"},{"tier":"Gold","code":"AP","name":"Pepper Shaker","swatch":"#2B2926"},{"tier":"Gold","code":"PW","name":"Petit White","swatch":"#FAF9F7"},{"tier":"Gold","code":"PR","name":"Petit Brown","swatch":"#8C6634"},{"tier":"Gold","code":"PS","name":"Petit Sand","swatch":"#D3C4A0"},{"tier":"Gold","code":"PD","name":"Petit Blue","swatch":"#1B3A5C"},{"tier":"Platinum","code":"AB","name":"Lait Grey Shaker","swatch":"#B9BDC6"},{"tier":"Platinum","code":"AR","name":"Woodland Brown","swatch":"#6A4B2A"},{"tier":"Platinum","code":"GW","name":"Gramercy White","swatch":"#EFECE7"},{"tier":"Platinum","code":"TW","name":"Uptown White","swatch":"#FEFEFE"},{"tier":"Platinum","code":"SL","name":"Signature Pearl","swatch":"#ECE7DA"},{"tier":"Platinum","code":"TS","name":"Townsquare Grey","swatch":"#697080"},{"tier":"Platinum","code":"AG","name":"Greystone Shaker","swatch":"#4B4F5C"},{"tier":"Platinum","code":"AX","name":"Xterra Blue Shaker","swatch":"#5C8DB9"},{"tier":"Platinum","code":"PH","name":"Petit Oak","swatch":"#C9A96D"},{"tier":"Platinum","code":"AZ","name":"Champagne Shaker","swatch":"#E7DFD0"},{"tier":"Titanium","code":"AN","name":"Nova Light Grey Shaker","swatch":"#C6C9CD"},{"tier":"Titanium","code":"TQ","name":"Townplace Crema","swatch":"#EDDFC8"},{"tier":"Titanium","code":"TG","name":"Midtown Grey","swatch":"#5B6069"},{"tier":"Titanium","code":"AA","name":"Blaze Black Shaker","swatch":"#1C1B1A"},{"tier":"Titanium","code":"AH","name":"Homestead Oak Shaker","swatch":"#B99050"}]'::jsonb as list
)
update public.company_profiles cp
set custom_styles = coalesce((
      select jsonb_agg(b.s order by b.n)
      from jsonb_array_elements((select list from builtin)) with ordinality as b(s, n)
      where not exists (
        select 1 from jsonb_array_elements(coalesce(cp.custom_styles, '[]'::jsonb)) o
        where o->>'code' = b.s->>'code')
    ), '[]'::jsonb) || coalesce(cp.custom_styles, '[]'::jsonb),
    updated_at = now()
where cp.user_id in ('f464edfb-8f74-49b7-b366-79b89605bbb7', 'd7620158-9fbd-44de-9770-2f00bdabe71c')
  and (
    cp.custom_styles is null
    or jsonb_array_length(cp.custom_styles) = 0
    or exists (select 1 from jsonb_array_elements(cp.custom_styles) o where coalesce(o->>'supplier', '') <> '')
  );

-- 3) After: Dan should now have 25 (21 + 4 from the Matrix import); Sam 21 + whatever she had
select user_id, company_name, jsonb_array_length(coalesce(custom_styles, '[]'::jsonb)) as saved_finishes
from public.company_profiles
where user_id in ('f464edfb-8f74-49b7-b366-79b89605bbb7', 'd7620158-9fbd-44de-9770-2f00bdabe71c');
