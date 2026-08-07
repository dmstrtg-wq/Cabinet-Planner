-- Team collaboration (Gold tier) — team_members table + RLS
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Create the team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id             UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT        NOT NULL,
  name           TEXT,
  role           TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active')),
  invited_at     TIMESTAMPTZ DEFAULT NOW(),
  joined_at      TIMESTAMPTZ,
  UNIQUE (owner_id, email)
);
CREATE INDEX IF NOT EXISTS team_members_owner_idx  ON team_members(owner_id);
CREATE INDEX IF NOT EXISTS team_members_member_idx ON team_members(member_user_id);

-- 2. Enable Row Level Security
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- 3. An account owner can see and manage their own team roster.
--    (Inviting/removing actually goes through the invite-team-member /
--    remove-team-member Netlify functions, which use the service role key and
--    also allow Dan's account as a support/admin bypass — that bypass lives in
--    those functions, not here, since they already skip RLS entirely.)
CREATE POLICY "team_owner_manage" ON team_members
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 4. A team member can see their own membership row(s) — this is how the app
--    figures out "which owner's account am I acting under" on login. Read-only;
--    status/role changes go through the service-role functions, never direct
--    client writes, so a member can't self-promote or reactivate themselves.
CREATE POLICY "team_member_view_own" ON team_members
  FOR SELECT
  TO authenticated
  USING (auth.uid() = member_user_id);

-- ════════════════════════════════════════════════════════════════════════
-- Shared access: let an ACTIVE team member read/write the owner's data too.
-- These are ADDITIVE policies — they don't touch or replace whatever RLS
-- already exists on these tables for an owner accessing their own rows.
-- ════════════════════════════════════════════════════════════════════════

-- 5. projects — any active team member (admin or member) can fully use the
--    owner's projects, same as the owner.
CREATE POLICY "team_member_access_projects" ON projects
  FOR ALL
  TO authenticated
  USING (
    user_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  );

-- 6. company_profiles — every active team member can READ (they need the
--    company's pricing/finishes to build accurate quotes), but WRITE (company
--    settings, pricing, styles, billing fields) stays owner-only — no team
--    member, including Admins, can change pricing. The owner's own existing
--    RLS already covers their own writes, so no write policy is added here.
CREATE POLICY "team_member_view_company" ON company_profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  );

-- 7. company_files (uploaded price sheets) — read-only for team members, same
--    owner-only-write rule as company_profiles above.
CREATE POLICY "team_member_view_files" ON company_files
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  );
