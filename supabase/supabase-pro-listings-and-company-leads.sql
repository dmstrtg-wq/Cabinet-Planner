-- Find a Pro: public company listings + per-company lead routing
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ════════════════════════════════════════════════════════════════════════
-- 1. pro_listings — the PUBLIC face of a company. Kept separate from
--    company_profiles on purpose: that table holds pricing, subscription and
--    billing fields that must never be readable by anonymous visitors.
--    One row per account (user_id = the team owner's id).
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pro_listings (
  user_id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  listed               BOOLEAN     NOT NULL DEFAULT FALSE,   -- the opt-in switch
  company_name         TEXT        NOT NULL,
  blurb                TEXT,
  phone                TEXT,
  email                TEXT,
  website              TEXT,
  logo_url             TEXT,
  city                 TEXT,
  state                TEXT,
  service_zip          TEXT,                                 -- home base for distance search
  service_radius_miles INTEGER     NOT NULL DEFAULT 25,
  lat                  DOUBLE PRECISION,                     -- filled in later by the Find a Pro geocoder
  lng                  DOUBLE PRECISION,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pro_listings_listed_idx ON pro_listings(listed) WHERE listed = TRUE;
CREATE INDEX IF NOT EXISTS pro_listings_state_idx  ON pro_listings(state, city);

ALTER TABLE pro_listings ENABLE ROW LEVEL SECURITY;

-- The account owner manages their own listing
CREATE POLICY "pro_listings_owner_all" ON pro_listings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Anyone — including homeowners who aren't signed in — can read LISTED companies.
-- Unlisted rows stay private.
CREATE POLICY "pro_listings_public_read" ON pro_listings
  FOR SELECT
  TO anon, authenticated
  USING (listed = TRUE);

-- ════════════════════════════════════════════════════════════════════════
-- 2. leads — route a lead to a specific company.
--    company_id NULL = a general "network" lead (today's Connect with a Pro
--    form), which only the site admin sees, same as before.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leads_company_idx ON leads(company_id);

-- A company (owner or active team member) can see the leads routed to it…
CREATE POLICY "leads_company_select" ON leads
  FOR SELECT
  TO authenticated
  USING (
    company_id = auth.uid()
    OR company_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  );

-- …and mark them contacted. (The WITH CHECK stops a company from re-routing a
-- lead to someone else by changing company_id.)
CREATE POLICY "leads_company_update" ON leads
  FOR UPDATE
  TO authenticated
  USING (
    company_id = auth.uid()
    OR company_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  )
  WITH CHECK (
    company_id = auth.uid()
    OR company_id IN (
      SELECT owner_id FROM team_members
      WHERE member_user_id = auth.uid() AND status = 'active'
    )
  );
-- The existing leads_admin_select / leads_admin_update policies (Dan's account)
-- are untouched: the admin still sees every lead and is the one who assigns
-- company_id from the Leads tab.
