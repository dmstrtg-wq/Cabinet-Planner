# Testing Queue: things that need a real login

Claude can't sign in or create accounts, so these checks wait for Dan. Work top to bottom, tick each box, and note anything odd next to it.

## One-time setup (skip once done)
- [ ] Create two test accounts on mycabinetplanner.com: `dmstrtg+free@gmail.com` and `dmstrtg+gold@gmail.com`.
- [ ] Make the second one Gold in the Supabase SQL editor:
  ```sql
  update company_profiles set subscription_tier = 'gold'
  where user_id = (select id from auth.users where email = 'dmstrtg+gold@gmail.com');
  ```
  (0 rows updated → log in as that account, open Profile, save once, run again.)
- [ ] Name every test project "TEST – …". Don't turn on a Find a Pro listing for test accounts.
- Tip: sign in inside Claude's browser pane, and Claude can run most of the checks below for you.

## From 0.2 (pushed 2026-09-24)
- [ ] **Free account keeps projects:** log in as the Free test account, make a project, log out, log back in. The project is still there.
- [ ] **Gold reprint isn't a revision:** Gold account, a project whose quote is marked as sent. Print the quote twice with no changes. The activity log gets no new "Revision" line.
- [ ] **Gold real change is a revision:** change something (e.g., labor amount) and print. The quote says "REVISION 2" and the log shows it.
- [ ] **Silver/Gold status warning:** print a quote, then move the job to Ordered. No "hasn't had a quote sent" warning. On a job never quoted, the warning appears and you can still continue.
- [ ] Old leftovers: delete the "TEST - Claude (delete me)" lead in Supabase → `leads` table.

## Older items still open (from earlier sessions)
- [ ] Calendar: add, edit, delete an event (Profile → Calendar).
- [ ] Find a Pro: listing toggle saves; admin lead assignment works.
- [ ] Team invite end to end (real email, role limits, removal, 5-member cap).
- [ ] Billing History shows real Stripe invoices.

## Added during today's build session
<!-- Claude appends a section per task below -->

### Phase 0.3 + Phase 1 (built 2026-09-24, needs push, then these checks)
Claude already tested all of this locally in demo mode. These confirm it on the live site and with real logins.
- [ ] **Sample kitchen (1.1):** open mycabinetplanner.com/app?demo=1 in a private/incognito window. It opens straight to "Sample Kitchen" in 3D (L-shaped run + island, White Shaker).
- [ ] **Reset demo (1.1):** make a change, click "Reset demo" in the green banner, confirm. The sample comes back and your changes are gone.
- [ ] **Banner (1.6):** Floor Plan / Elevation / 3D tabs are fully visible and clickable under the banner. Close it with ✕. It stays closed after a page refresh (until the tab is closed).
- [ ] **New Project defaults (1.2):** New Project shows real numbers 120 / 120 / 96 / 96 / 96 (dark text, not grey hints). Leave them and create: the room is 120 × 96. Clear the East field and try again: red "East wall is blank" message, no project created.
- [ ] **Auto-advance (1.4):** add Base 36, Sink Base 36, Base 24 without touching "From left". They land at 0, 36, 72 with no gaps. Switch the type to Wall and "From left" goes back to 0 (uppers are their own run).
- [ ] **Overlap warning (1.4):** set "From left" to 0 and add another base. You're asked "This overlaps B36…" and can cancel.
- [ ] **Upper heights (1.5):** add a Wall cabinet without touching height. It's 30" tall with the bottom at 54". In Room Settings, set the ceiling to 108: new uppers default to 36".
- [ ] **Room Settings (1.3):** the toolbar button now says "Room Settings". Change the North and South walls from 120 to 90. The floor plan, elevation, and 3D all resize, and the B24 at 72" is outlined in red with a warning. Nothing is deleted.
- [ ] **Logged-in, same checks:** repeat 1.2–1.5 on your Gold test account. Also confirm a quote total on an existing real project matches what it was before the push.
- [ ] **New project style:** on a non-owner account (e.g., the Free test account), a new project's header shows a real style name (e.g., "WS – White Shaker"), not blank.

### 0.4 Schema groundwork (built 2026-09-24, push separately from Phase 1)
Claude tested this locally with fake data: identical drawings old vs. new (35 renders), identical save/reload, identical quote totals, old saved projects load fine. These checks confirm it with real saved data.
- [ ] **Your real projects still open:** after the push, log in to your real Gold account and open 3–4 existing projects (include an L-shaped one if you have one). Each looks exactly as before, and the quote total matches what it was.
- [ ] **Edit + reload:** change one thing on a real project (e.g., a note), wait for "Saved", reload. The change is there, and so are job costs and trim items.
- [ ] **Free account:** repeat on the Free test account (projects still there after logging out and back in).

### Code split into files (option b, built 2026-09-24)
Claude verified locally: all 37 drawings identical, identical page layout and styles in all three views (1280px), quote print + 10-page PDF export work, login screen loads, no console errors. Claude can check the first item below on the live site right after the push (no login needed).
- [ ] **Declined cookies:** in a private window, open mycabinetplanner.com/app?demo=1, click **Decline** on the cookie banner, reload. The sample kitchen appears and the 3D view works. (Declining cookies is what broke 3D once before.)
- [ ] **Logged in:** open a real project and click through Floor Plan / Elevation / 3D / Quote / PDF export once.
