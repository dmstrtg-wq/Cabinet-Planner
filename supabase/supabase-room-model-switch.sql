-- Room model v2 switch (Phase 4, docs/ROOM-MODEL-V2.md), 2026-11-20
-- Turns the new room model on for one login. The planner reads app_metadata.room_v2,
-- which only the database can change (a user can't turn it on for themselves).
-- Safe to run more than once. Changes nothing else on the account.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"room_v2": true}'::jsonb
where email = 'dmstrtg@gmail.com';

-- Check it:
select email, raw_app_meta_data -> 'room_v2' as room_v2 from auth.users where email = 'dmstrtg@gmail.com';

-- To turn it OFF again (projects already converted keep working and look the same):
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'room_v2' where email = 'dmstrtg@gmail.com';
