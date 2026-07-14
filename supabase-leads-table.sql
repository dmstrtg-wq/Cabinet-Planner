-- Task #86: Leads table + RLS for "Connect with a Pro" feature
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Create the leads table
CREATE TABLE IF NOT EXISTS leads (
  id               UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  name             TEXT,
  email            TEXT,
  phone            TEXT,
  zip              TEXT,
  note             TEXT,
  plan_summary     TEXT,
  floor_plan_dataurl TEXT,      -- JPEG thumbnail as data URL (~300px wide)
  contacted        BOOLEAN     DEFAULT FALSE
);

-- 2. Enable Row Level Security
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 3. Anyone (including anonymous/unauthenticated users) can INSERT
--    This lets homeowners submit the lead form even before signing up
CREATE POLICY "leads_anon_insert" ON leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 4. Only Dan's account can SELECT (read) leads
CREATE POLICY "leads_admin_select" ON leads
  FOR SELECT
  TO authenticated
  USING (auth.email() = 'dmstrtg@gmail.com');

-- 5. Only Dan's account can UPDATE leads (e.g. mark as contacted)
CREATE POLICY "leads_admin_update" ON leads
  FOR UPDATE
  TO authenticated
  USING (auth.email() = 'dmstrtg@gmail.com')
  WITH CHECK (auth.email() = 'dmstrtg@gmail.com');
