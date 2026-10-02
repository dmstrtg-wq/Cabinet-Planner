-- ════════════════════════════════════════════════════════════════════════════
-- 3D snapshots on quotes (Build Plan 3.6) — private storage bucket + access rules
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query). Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT: a PRIVATE storage bucket "quote-snapshots" for the 3D views a company adds to
-- its quotes. Files are stored as  <account owner id>/<project id>/<snapshot id>.jpg
--
-- WHO CAN DO WHAT:
--   • An account can see, add and delete only files in its OWN folder.
--   • Active team members get the same access to their owner's folder (same rule as
--     projects in supabase-team-members-table.sql).
--   • Adding a file also requires the account to be on Silver or Gold — quote PDFs are
--     a Silver+ feature, so a Free account can't use storage by editing the browser.
--   • Nobody can read anything without being signed in (the bucket is not public).
-- LIMITS: 2 MB per file, JPEG/PNG only. (Snapshots are ~150–400 KB JPEGs.)

-- 1. The bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-snapshots', 'quote-snapshots', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Access rules (dropped first so this script can be re-run)
drop policy if exists "quote_snapshots_read"   on storage.objects;
drop policy if exists "quote_snapshots_insert" on storage.objects;
drop policy if exists "quote_snapshots_delete" on storage.objects;

-- Read: own folder, or the folder of the owner you're an active team member of
create policy "quote_snapshots_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quote-snapshots'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] in (
        select owner_id::text from public.team_members
        where member_user_id = auth.uid() and status = 'active'
      )
    )
  );

-- Add: same folder rule, and that account must be Silver or Gold
create policy "quote_snapshots_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quote-snapshots'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] in (
        select owner_id::text from public.team_members
        where member_user_id = auth.uid() and status = 'active'
      )
    )
    and exists (
      select 1 from public.company_profiles cp
      where cp.user_id::text = (storage.foldername(name))[1]
        and cp.subscription_tier in ('silver', 'gold')
    )
  );

-- Delete: same folder rule
create policy "quote_snapshots_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'quote-snapshots'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] in (
        select owner_id::text from public.team_members
        where member_user_id = auth.uid() and status = 'active'
      )
    )
  );

-- 3. Check it worked — should list the bucket (public = false) and three policies:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'quote-snapshots';
--   select policyname, cmd from pg_policies where tablename = 'objects' and policyname like 'quote_snapshots%';
