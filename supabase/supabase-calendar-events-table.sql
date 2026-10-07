-- Calendar (Silver+ project-management feature) — calendar_events table + RLS
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Create the calendar_events table
--    owner_id is the ACCOUNT the event belongs to (for a team member that's the
--    team owner's id, same as projects.user_id), not necessarily who created it.
CREATE TABLE IF NOT EXISTS calendar_events (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID        REFERENCES projects(id) ON DELETE SET NULL,  -- null for standalone tasks
  kind        TEXT        NOT NULL DEFAULT 'job' CHECK (kind IN ('job','task')),
  title       TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT 'teal',
  start_date  DATE        NOT NULL,
  end_date    DATE        NOT NULL,
  start_time  TIME,                                                    -- null = all day
  end_time    TIME,
  notes       TEXT,
  done        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by  TEXT,                                                    -- email of whoever added it
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT calendar_events_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS calendar_events_owner_date_idx ON calendar_events(owner_id, start_date);
CREATE INDEX IF NOT EXISTS calendar_events_project_idx    ON calendar_events(project_id);

-- 2. Enable Row Level Security
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- 3. The account owner has full access to their own events
CREATE POLICY "calendar_owner_all" ON calendar_events
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 4. Any ACTIVE team member (admin or member) can fully use the owner's calendar,
--    mirroring the team_member_access_projects policy on the projects table.
CREATE POLICY "calendar_team_member_all" ON calendar_events
  FOR ALL
  TO authenticated
  USING (
    owner_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    owner_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  );
