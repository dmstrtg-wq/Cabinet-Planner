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
- [x] **Sample kitchen (1.1):** ✅ Claude verified live 2026-09-24. open mycabinetplanner.com/app?demo=1 in a private/incognito window. It opens straight to "Sample Kitchen" in 3D (L-shaped run + island, White Shaker).
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
- [x] **Declined cookies:** ✅ Claude verified live 2026-09-24. in a private window, open mycabinetplanner.com/app?demo=1, click **Decline** on the cookie banner, reload. The sample kitchen appears and the 3D view works. (Declining cookies is what broke 3D once before.)
- [ ] **Logged in:** open a real project and click through Floor Plan / Elevation / 3D / Quote / PDF export once.

### 2.1 Selection + edit popover (built 2026-09-24)
Claude tested locally in demo mode: selection syncs across all three views + side list, popover edits/duplicate/delete, Esc, empty-click clears, no console errors. Easy to check on the live demo (no login needed).
- [ ] **Select in floor plan:** click the range. It gets a teal outline with corner handles, the side panel switches to that wall with the row highlighted, and switching to Elevation and 3D shows it highlighted there too.
- [ ] **Select in elevation:** click an upper. The selection moves, and the floor plan and side list follow.
- [ ] **Click empty floor / Esc:** the selection clears.
- [ ] **Double-click → popover:** a small box opens by the pointer (Type, Width, Height, Door style, Notes, Duplicate, More…, Delete). Changing Width updates all views immediately. "More…" opens the full edit dialog.
- [ ] **Duplicate:** the copy goes right after the original if there's room, otherwise into the first gap that fits, never into a corner. If the wall is full it lands at the end with a red "doesn't fit" flag.
- [ ] **With "Dims" on:** clicking and dragging cabinets in the Elevation still lands on the right cabinet (this used to be off by about an inch-and-a-half of screen space).
- [ ] **Layer filter:** set the floor plan dropdown to "Wall Only". Clicking where an upper sits over a base now selects the upper.
- [ ] **Phone/tablet:** tap selects, double-tap opens the popover.

### 2.2 Catalog palette + drag onto walls (built 2026-09-24)
Claude tested locally with simulated drags: a full wall built by dragging only, uppers built in the elevation, click-to-add, search/categories, red rejections. **Not yet tried with a real mouse.** Please do that first (live demo, no login needed, desktop browser).
- [ ] **Real mouse drag:** in the right panel's new **Catalog** section, press on a tile (e.g. B36), drag it onto the floor plan near a wall, and let go. A teal ghost follows the wall while you drag, and the cabinet lands where the ghost was.
- [ ] **Snapping:** drop roughly next to an existing cabinet. It butts up against it with no gap. Drop near a wall end and it sits flush to the end.
- [ ] **Red = rejected:** drag over a spot that overlaps a cabinet, runs past the wall end, sits in a corner already taken by the next wall's run, or covers a door. The ghost turns red with the reason, and letting go adds nothing.
- [ ] **Elevation:** switch to Elevation and drag uppers (W30…) onto the wall shown.
- [ ] **Click a tile** (no drag): it's added at the end of the active wall's run and skips past a filled corner.
- [ ] **Search + chips:** type "B3", "sink" or "30"; tap Base / Wall / Tall / Corner / Fillers & Panels / Appliances.
- [ ] **Esc while dragging** cancels.
- [ ] **Tablet (touch):** drag a tile with your finger onto the plan.
- [ ] The old "Add Cabinet" form below the palette still works as before.

### 2.3 Move + nudge (built 2026-09-24)
Claude tested locally with simulated drags and key presses: stops flush against neighbours and wall ends, hops over into open space, arrow/Shift/Alt steps, mirrored elevation direction, typing in a field doesn't nudge, and moves save. Try it by hand on the live demo:
- [ ] **Drag into a neighbour:** drag a cabinet toward the one next to it. It stops flush (0" gap) and never overlaps. Keep dragging past it into open space and it hops over.
- [ ] **Drag to the wall end:** it stops flush at the end.
- [ ] **Arrow keys:** click a cabinet, then press ← / → (1" per press). Shift+arrow = 1/8". Option/Alt+arrow = 3". The tooltip shows the position with fractions, e.g. "96 3/8" from left".
- [ ] **Blocked nudge:** hold Option+→ toward a neighbour. It ends exactly flush, then shows "Can't move: overlaps B18" in red.
- [ ] **East/West walls in the floor plan:** use ↑ / ↓ (they run top-to-bottom on screen).
- [ ] **Elevation:** ← / → move the cabinet the way you see it, including on the South/West walls.
- [ ] **Island:** click it and use the arrows. It moves in all four directions and stays inside the room.
- [ ] Arrow keys do nothing while you're typing in a box (search, notes, etc.).

### 2.4 Live gap dimensions (built 2026-09-24)
Claude checked the numbers on the sample kitchen (e.g. the east wall's 26 1/4" open after the fridge, 1" / 2" gaps beside a moved B9) and that nothing extra prints on PDFs. Try it on the live demo:
- [ ] **Select a cabinet:** bold teal measurements appear on each side showing the exact gap to the next cabinet, wall end, door/window, or the face of the run on the next wall (e.g. `2 1/4"`). No line appears on a side that's flush.
- [ ] **Open space:** the rest of that wall shows grey dashed "open 26 1/4"" labels wherever there's room.
- [ ] **While dragging** (a placed cabinet or a palette tile), the numbers update live.
- [ ] **Dims button on,** nothing selected: every wall shows its open space (floor plan) and the elevation shows open space for both the base and upper rows.
- [ ] **Printed floor plan / PDF:** none of these live measurements appear on the printout.

### 2.5 Shortcuts + undo/redo (built 2026-09-24)
Claude tested locally: 6 different edit types (add, nudge burst, room resize, door style, delete, island move) undo back to the exact original and redo forward exactly; business records (status, activity log) are untouched by undo; a new edit clears redo; 100 steps kept. Try on the live demo (a desktop browser, since shortcuts need a keyboard):
- [ ] **↶ / ↷ buttons** next to Log. Greyed out until there's something to undo or redo.
- [ ] **⌘Z / Shift⌘Z** (Ctrl on Windows) undo and redo: adding, moving, deleting, resizing the room (Room Settings), changing door style, moving the island. A whole drag counts as one undo.
- [ ] Undo does **not** change the job status, the activity log, or quote revisions.
- [ ] **Delete / Backspace** removes the selected item. **⌘D** duplicates it (the browser's bookmark box doesn't pop up).
- [ ] **B / W / T / C / F / A** jump to that catalog category with the cursor in the search box. Type "36" right after pressing B.
- [ ] **?** or the ⌨ button shows the shortcut list.
- [ ] Shortcuts don't fire while typing in a box. ⌘Z inside a text box undoes the typing, not the design.

### 2.6 View layers + Print Plans fix (built 2026-09-24)
Claude tested locally: each of the 7 layers changes the floor plan and elevation, and turning it back on restores the drawing exactly; hidden items can't be clicked; 3D drops hidden appliances/cabinets; item numbers vanish from printed output when off; the layer choice is remembered. Also fixed: **Print Plans crashed for any project with cabinets** unless Export PDF had been clicked first (it never loaded the table add-on for its cut-list page). Now 6 pages from a cold start; Export PDF still 8 pages.
- [ ] **Layers ▾** (where the "Show: All Cabinets" dropdown used to be, and in the Elevation toolbar) lists Dimensions, Item numbers, Base & tall cabinets, Wall cabinets, Appliances, Doors & windows, Grid. Each checkbox hides or shows that part right away.
- [ ] **Item numbers are now ON by default,** so the numbered hexagon tags show on screen in both the floor plan and elevation, matching the cut list. (Before, they only appeared on PDFs.) Turn them off in Layers if you prefer, and it's remembered.
- [ ] **Item numbers off → Print Plans / Export PDF:** the hexagon tags are gone from the printed drawings too.
- [ ] The **Dims** and **Item #s** buttons still work and stay in sync with the Layers checkboxes.
- [ ] Hide Wall cabinets, then click where an upper sits over a base. You get the base.
- [ ] **Print Plans (Silver/Gold, fresh page load):** click Print Plans without clicking Export PDF first. The PDF downloads, including the cut-list page. **This was broken on the live site.**

### Fillers: any size, anywhere (built 2026-09-24, before 5.2)
Dan's rules: a filler is just a filler (not base or upper). Any width, any height, any spot on the plan. Priced as the stock piece it's ripped from: ≤3" = your 3" filler price, over 3" up to 6" = your 6" price, wider = your 6" price × the number of 6" pieces. Claude tested locally: fraction entry, 1/16" precision, pricing at 1/8", 1 3/8", 3", 3 1/16", 6", 7", 13" (+ markup), the add form, popover, edit dialog, drag-to-fit, upper-run drop, and the printed quote line.
- [ ] **Add form:** Type → "Filler (any size)". Width/Height boxes accept `1 3/8`, `3/8`, `1.375`; "Bottom from floor" puts it anywhere (0 = on the floor, 54 = in the upper run).
- [ ] **Double-click a filler:** the popover has Width / Height / Bottom from floor boxes (fractions OK).
- [ ] **Drag FL3 or FL6 from the Catalog into a small gap (6" or less):** it resizes to exactly fill the gap. In the Elevation, dropping it up high puts it in the upper run.
- [ ] **Fillers can go in corners and against door/window casings** (no red). They still can't sit on top of another cabinet.
- [ ] **Quote:** a filler line reads like `Filler | 5/8"W × 34 1/2"H`. Heights on all quote lines now show as fractions (`34 1/2"` instead of `34.5"`).
- [ ] **⚠ Price sheet — ACTION:** fillers were never in the price-sheet template, so every filler has always quoted as "No price set". Profile → download a fresh price-sheet template: it now has "Filler - 3 inch stock" and "Filler - 6 inch stock" rows. Fill those in and re-upload. (Your other prices are unaffected.)
- [ ] **Edit dialog fixes:** open a cabinet with a per-cabinet door style, click Save. The style is kept (it used to be wiped, and the style list was empty). A cabinet at a fractional position (e.g. 81 3/4") keeps it after Save (it used to round down to 81).

### 5.2 Fill this gap (built 2026-09-24)
Claude tested locally: solver on 105" (offers 36+36+30 + 3" filler, the Build Plan example), 102", 144", 200", 30 1/2", 26 1/4", 13 3/4", 9", 7 1/2", 1 3/8", and a 60" sink run, every option summing exactly. Filled the sample kitchen's east base gap (B24 + 2 1/4" filler at the wall end) and upper corner gap (W12), no problems, and one undo removed the whole fill.
- [ ] **Side panel → Open space:** each open stretch on the active wall shows with its size, base or upper run, and a **Fill…** button.
- [ ] **Fill…** shows up to 3 exact options with a little scale bar (filler hatched). Change "Cabinet type" (Base, Drawer Base, Sink Base, Vanity / Wall) and the options update.
- [ ] **Use this:** everything drops in, the gap is closed exactly, and the filler sits against the wall/corner end.
- [ ] **One ⌘Z** removes the whole fill.
- [ ] A gap narrower than 9" offers a single filler of exactly that width.

### 5.7 Order List (built 2026-09-24) — Silver/Gold only
Claude tested locally as a simulated Gold account: CSV + printable list for the sample kitchen, grouping of identical items, fillers as stock pieces, hinge flags, no Forevermark names, hidden/blocked for Free.
- [ ] **Order List ▾** (floor-plan toolbar, next to Print Plans) → **Download CSV**: opens cleanly in Excel with Room, Qty, SKU (B36, W3030, SB33, FL3…), size, door style + finish code, hinge, item #s, notes. Identical pieces in a room are combined (e.g. `2× W2430`).
- [ ] **Print order list:** a clean printable sheet per room.
- [ ] **Fillers** show as the stock piece to order plus the rip size (a 7" filler = `2× FL6 — rip to 7"`).
- [ ] **Hinge side:** double-click a single-door cabinet (≤21" base/wall, ≤18" tall, blind corners, diagonal walls) and set Hinge side Left/Right. Anything unset shows **SPECIFY** in red and you get a heads-up on download. Doubles, drawers and fillers show "—".
- [ ] Appliances are not on the order list.
- [ ] Free account: the Order List button isn't shown.

### 3.1 Door styles in 3D (built 2026-09-24)
Claude checked renders of the sample kitchen in White Shaker, Espresso, Natural Wood (+ knobs), plus a test room with Raised Panel, Slab Gloss, glass uppers, tall pantries, blind corners on a normal and a mirrored wall, and a sink base. 242 meshes, under 1 ms per frame on the CPU side.
- [ ] **3D view of a White Shaker kitchen** reads as white Shaker: 5-piece doors with recessed panels, a drawer over the doors on base cabinets, 3 drawers on drawer bases, a false front on sink bases, stacked doors on talls, glass uppers where "Glass Doors" is ticked.
- [ ] **Change the Door Style** (right panel): 3D updates immediately. A per-cabinet style (double-click → Door style) shows on just that cabinet.
- [ ] **Hardware:** new "Bar pulls / Knobs on doors" buttons under Door Style. Knobs go on doors, and drawers always keep pulls.
- [ ] **Single doors:** the handle is on the side opposite the hinge you set (2.x hinge side). Doubles have handles at the center.
- [ ] **Wood finishes** (names with oak, walnut, natural wood, etc.) show grain.
- [ ] **Orbiting a full kitchen is smooth** on your laptop (tell me if it stutters).
- [ ] Does anything look off to your trade eye (proportions, drawer height, pull placement)? These are easy to tune.

### Door style "stuck" fix (2026-09-24, Dan's report)
- [ ] Pick a new door style in the right panel. The line under the project name ("Kitchen · Style: … ") now changes immediately, along with the right panel, floor plan, elevation and 3D. (Before, that header line stayed on the old style until you reopened the project.)
- [ ] If the style **still** doesn't change anywhere for you (right panel swatch, 3D colors), tell Claude exactly which part stayed on Ice White. That would be a different problem than the one fixed here.

### 3.2 Countertops, toe kicks, end panels, trim (built 2026-10-02)
Claude checked on the sample kitchen: one continuous north countertop over the DW and sink (with bowl), east runs broken at the range and trimmed cleanly into the corner, island top, recessed toe kicks, end panels on the two exposed upper ends, crown + light rail, all four materials, elevation drawing, undo, and stats (20.8 linear ft / 48.5 sq ft).
- [ ] **3D:** base runs have a 1.5" countertop with a 1" front overhang. It stops at the range, has a sink bowl, covers the dishwasher, and corners meet cleanly. Islands get a top.
- [ ] **Toe kicks** are recessed (dark, set back 3") under base cabinets, talls and floor fillers.
- [ ] **End panels** appear where a run ends in open space (not against a wall, tall cabinet, appliance or door), and the countertop overhangs them by 1".
- [ ] **Right panel → Countertop & Trim:** Quartz / Granite / Butcher block / Laminate changes the 3D top. Crown molding and Light rail checkboxes add trim to the uppers. ⌘Z undoes these.
- [ ] **Elevation + Print Plans:** the countertop band, toe kick, end panels, crown and light rail are drawn.
- [ ] **The footage line** ("≈ X linear ft · Y sq ft") under Countertop & Trim looks right for a kitchen you know. It's saved on the project for a future countertop quote line (no pricing yet).

### 3.4 Lighting + camera (built 2026-10-02)
Claude checked: the opening angle picked for L, U, galley, single-wall and an L-shaped room; walls fading correctly at every angle in a full 360° orbit (96 checks, 0 wrong); doorway at 64" eye height with no walls faded; glide lands exactly; all presets on the sample kitchen and the L room's inner walls; lighting/floor saved on the project; toolbar fits at 1280px. Fixed along the way: a floor-texture bug (blotchy wood), overexposed Studio light, blocky shadows (now 2× sharper), Face-a-wall now looks over islands.
- [ ] **Open 3D on several real projects:** it starts on a good angle every time and never behind a wall.
- [ ] **Orbit around:** whichever wall is between you and the kitchen goes see-through, and it comes back when you move past it.
- [ ] **3/4 View / Doorway / Face a wall… / Overhead** glide smoothly to their views. Doorway stands in your drawn door at eye height (or on the open side if there's no door).
- [ ] **Light:** Daylight / Warm interior / Studio. Studio is the clean white look for presentations.
- [ ] **Floor:** Plain / Wood / Tile / LVP (looks only). Your choice is remembered per project.
- [ ] **Orbiting a full kitchen stays smooth** on your laptop (shadows are now higher resolution, so tell me if it stutters).

### 3.6 3D views on the quote (built 2026-10-02) — Silver/Gold
**First: run `supabase-quote-snapshots-storage.sql` in the Supabase SQL editor** (creates the private bucket + access rules). Until then, "Add to quote" will show an error.
Claude tested locally against a stand-in for storage: capture/upload, 3-view limit, Quote-window thumbnails, printed quote + PDF, Gold versions recording their views, file cleanup, project delete, demo/Free blocked.
- [ ] **3D → 📷 Add to quote:** the button counts up (1/3, 2/3, 3/3). A 4th says to remove one first.
- [ ] **Quote window → "3D Views on This Quote":** thumbnails appear, and × removes one.
- [ ] **Print / Save PDF:** a "Your Kitchen" row of the views sits above the cabinet line items. Same for **Export PDF** (quote page).
- [ ] **Gold:** after marking a quote as sent, changing which views are on it and printing makes **Revision 2**. Reprinting without changes keeps the same version and the same views.
- [ ] **Team member (Gold):** can add and see views on the owner's projects.
- [ ] **Free / demo:** no Add-to-quote button.
- [ ] **Tip:** set Light to **Studio** before capturing for the cleanest presentation images.

### Door style picker — real fix (2026-10-02, found with Dan's live login)
Root cause: the Door Style picker was filled in once at page load, BEFORE the account was known, so every account saw the generic starter list (White Shaker / Grey Shaker / Espresso / Natural Wood) instead of its own finishes. Picking one saved a code the account doesn't have (e.g. Dan's "Daniel Muller" project = `ES`), so 3D/elevation fell back to the first finish (Ice White Shaker) and pricing couldn't find the finish ("No price set").
- [ ] After the push, **reload /app**. Door Style → Change shows **your** finishes (Gold / Platinum / Titanium groups for your account, or the company's own list for others).
- [ ] Open **"Daniel Muller"**. The Door Style box is red: "Not one of your finishes — pick one". Pick the right finish. The box turns normal, and 3D, elevation and prices follow.
- [ ] Check your other projects the same way (any red Door Style box needs a finish picked).
- [ ] **Trial companies with their own finishes** had the same problem. Worth a quick look at any test projects they made.

### Corner cabinets on two walls — Lazy Susan + Diagonal Corner Wall (2026-10-02)
What changed: a Lazy Susan or Diagonal Corner Wall placed at the end of a wall now also takes up the same width on the wall that meets it there, like the real cabinet. LS = an L, 24" deep, bifold doors in the corner. DCW = 12" sides with one angled door. Added **LS36**. Old projects' DCWs are automatically fixed to 12" sides.
Claude tested locally on a copy of the "Daniel Muller" layout (LS33 west@0, sink north@33, DCW24 west@0) plus an LS36 and DCW27 at other corners. Checked: floor plan shapes, all 4 elevations (true view: the corner 24" shaded, then this wall's door), 3D (L-shaped LS with no gap to the sink, 5-sided DCW with angled door), placing a cabinet into either leg is refused ("Hits LS33 in the corner"), the gap finder, countertop running through the corner, elevation PDF mode, and a mid-wall LS still drawing as before. No console errors.
- [ ] Open **"Daniel Muller"**: 3D has no gap between the lazy susan and the sink base; the corner upper has an angled door.
- [ ] **Floor plan:** LS is an L across both walls; DCW is the 5-sided shape. Click either leg to select it, and drag it.
- [ ] **Elevation, both walls of the corner:** the same cabinet appears on each (shaded part = the other leg, then the door). Price/quote lists it once.
- [ ] **Countertop** runs continuously around the LS corner (3D and elevation).
- [ ] **Add an LS36** in your price sheet (Profile → prices) if you sell it. Until it has a price it shows as "No price set".
- [ ] **PDF / Print Plans:** the corner elevations look right.
- Live check by Claude after push (2026-10-02, view only, "Daniel Muller"): LS33 is L-shaped in plan; north + west elevations show it on both walls; 3D has no gap at the sink, and the countertop runs around the corner; DCW24 auto-corrected to 12" with an angled door. Found + fixed (needs push): in the floor plan the corner upper was hidden under the lazy susan. All uppers now draw after all bases.

### 3.3 Appliances in 3D (built 2026-10-02)
What changed: appliances are real 3D models now, not flat boxes. Choices per appliance (double-click → popover, or More…): **Style** (fridge: French door / Side-by-side / Top freezer; hood: Auto / Chimney / Under-cabinet), **Size** (fridge heights; wall oven Single 29" / Double 51"), **Finish** (Stainless / Black stainless / White; Panel-ready on fridge, dishwasher, beverage cooler = fronts in your door style). Finish and style are looks only. Appliance prices work exactly as before.
New (Dan's choice): **Oven Cabinet** (OC 27/30/33 × 84/90/96) and **Microwave Drawer Base** (MDB 24/30) are priced cabinets; the **Wall Oven** and **Microwave Drawer** appliances go inside them and move/duplicate with them. A cooktop can now sit over a base cabinet. **Add rows for OC and MDB to your price sheet** (download a fresh template from Profile; OC is priced by width × height like Tall).
Claude tested locally: every appliance type in 3D and elevation, all finishes and fridge styles, auto hood (insert under a cabinet, chimney to the ceiling otherwise), single ↔ double oven (height from the floor follows), empty oven cabinet shows "Oven opening", moving/nudging/duplicating the cabinet carries the oven, an oven half out of its cabinet is refused ("Fit it inside the OC30"), palette click drops the oven centred into a free oven cabinet, order list SKUs (OC3084, MDB30), printed elevation mode. No console errors.
- [ ] Open a real kitchen in **3D**: fridge, range, hood, dishwasher and microwave are recognizable at normal distance.
- [ ] Double-click an appliance → change **Style / Finish / Size** → 3D and elevation update.
- [ ] Add an **Oven Cabinet**, then a **Wall Oven** (palette click or sidebar): the oven lands inside it. Drag the cabinet: the oven goes with it.
- [ ] **Hood over a range with a wall cabinet above** → slim insert. No cabinet above → chimney to the ceiling.
- [ ] **Price sheet:** after adding OC/MDB prices, the quote prices those cabinets; the oven/microwave keep their own price box.
- [ ] Orbit a full kitchen: still smooth (models add a few hundred small parts).

### 3.5 Elevation drawings an installer can work from (built 2026-10-03)
What changed:
- Every cabinet's doors and drawers in elevation now come from the same layout as the 3D (door-style panels, glass, pulls or knobs where they really are). Labels use the order-list codes (B18, SB36, W3030, WP2484).
- **Hinge marks:** dashed lines on each door meet at its hinge side. A single door with no hinge side set says **"Hinge L/R?"** (set it with double-click → Hinge side).
- **Backsplash** (Countertop & Trim panel): None / 4" in the countertop material / Full-height tile (up to the uppers, 18" where there are none, stopping at window sills). Shows in elevation and 3D. New projects start at None.
- **Dimensions** (always on printed plans; on screen with Dims):
  - bottom: every floor piece and open space, then the whole wall
  - top: the uppers/hood/talls and spaces, plus doors and windows located from the wall ends
  - left: floor → counter → bottom of uppers → top of uppers → ceiling, plus overall height
- **Windows and doors** drawn with 3-1/2" casing; windows with sash, sill and apron, labelled with size and sill height.
- **Quote:** a **#** column on cabinet and appliance lines matches the numbered tags on the drawings. Printed quote and PDF. Doesn't change revision numbering.
- Dark finishes (e.g. Espresso) now get light labels automatically.
Claude tested locally: a 15' wall with corner base, drawer base, sink, glass uppers, tall, hood, window, DW; the "Daniel Muller" layout copy in Espresso; print mode; no console errors.
- [ ] **Print Plans** on a real job: the elevation pages read like a shop drawing (sizes, hinge marks, heights on the left).
- [ ] Set **Backsplash → Full-height tile** and look at elevation + 3D.
- [ ] Doors showing **Hinge L/R?** → set the side, the mark appears.
- [ ] **Print / PDF a quote:** the # column matches the hexagon numbers on the drawings.

### Live test session on Dan's Gold account (2026-10-03, Claude, test project "ZZ Claude Test" only)
Passed live: 3.5 on "Daniel Muller" (no errors); building a kitchen by palette clicks (LS33 pushes the next wall's run to 33", wall oven drops into the oven cabinet); Print Quote (# column matches the drawing tags; declining "Mark as sent" leaves it unlocked, no history); Export PDF (8 pages) and Print Plans (6 pages) build without errors. Printing and PDFs were captured in memory, so nothing was printed or downloaded.
Found + fixed (needs push):
- **PDFs were ~12 MB** (images embedded uncompressed, since day one). Now lossless-compressed: a 6-page Print Plans went to ~0.25 MB, same sharpness.
- **Hood snapping:** dragging a hood near a range/cooktop now lines it up centred over it.
Found, not code:
- **Your account has no price sheet uploaded** (no prices at all), so every cabinet on every quote shows N/A. Upload one in Profile when you're ready.
- Empty walls still get their own blank elevation page in Print Plans. Could skip them; your call.
To do (Dan): delete "ZZ_Door_Style_Test (delete me)" (Claude isn't allowed to delete projects). "ZZ Claude Test" stays until the PDF fix is verified live, then delete it too.
- [ ] After the push: Export PDF on a real job. The file should now be well under 1 MB.
- Live re-check after push (2026-10-03): quote PDF 229 KB (8 pages), Print Plans 206 KB (6 pages), down from ~12 MB; hood snaps over the range. "ZZ Claude Test" kept as the reusable test kitchen (Dan's account = test environment).

### 5.1 Design Check (built 2026-10-03) — Silver (demo shows it in full; Free sees the count + upgrade)
New **Design Check** section in the right panel (under Countertop & Trim) with a badge (✓ or a count). Each line is a problem (red), warning (amber) or tip (blue); click one to select the piece and flash its area on the floor plan (click again to step through the pieces involved). Marks on the plan can be turned off: Layers ▸ Design check marks. All numbers are in one place (DESIGN_RULES in js/designcheck.js) so they can be tuned.
Rules (NKBA-style, measured countertop edge to countertop edge):
- Aisles between facing runs or a run and an island: under 36" problem, under 42" warning, under 48" tip (two cooks)
- Dishwasher (26"), range (22") or wall-oven (22") door hits the opposite run/island when open
- Landing space: range/cooktop 12" one side + 15" other; sink 24" one side (18" other = tip); fridge 15" beside it or an island within 48"
- Uppers less than 18" above the countertop; hood less than 24" above the range/cooktop
- Inside corners: doors/drawers on both runs with no filler (blind corners: "no pull clearance")
- Pieces that overlap, run past the wall, hit a corner, or block a door/window (and anything taller than the ceiling)
- Tip: single doors with no hinge side set
Not yet (needs Phase 4 data): seating overhang at islands.
The demo **Sample Kitchen** was corrected so it passes (3" filler at the blind corner, island moved for 42" aisles, hinge sides set). This only affects new demo visitors.
Claude tested locally: sample passes (0 problems/warnings); a deliberately bad layout lists every rule; L-shaped room; click-to-locate; Free-tier teaser; no console errors.
- [ ] Open your real jobs: does the list make sense? Anything it flags that a pro would call fine? (Tell Claude and the numbers get tuned.)
- [ ] Click a few lines: the right piece gets selected and its area flashes on the plan.

### 7.1 Wall offset (bump-out) + "Case in this fridge" (built 2026-10-04)
- Double-click any cabinet → **Wall offset** (inches, fractions OK): the box moves out from the wall at its normal depth. Plan, 3D, doors, countertop, crown, placement and Design Check all follow. The elevation notes "out 12" from wall".
- The gap behind is **cased in with filler** on each side a neighbour doesn't already hide (fridge panels, a tall, an equally bumped neighbour). Drawn in plan (grey strips) and 3D (cabinet finish), and added to the **quote and order list** as filler stock on its own line ("Bump-out casing for W3615", e.g. 12" deep = 2× FL6).
- Double-click a **refrigerator** → **Case in this fridge**: fridge end panels on each open side (if there's 3/4" of room) and any upper above it brought out flush with the 24" run. The toast says what it did, and if a side had no room.
- Not included: a bottom panel under a bumped-out upper (only the sides are cased). Corner units (lazy susan, diagonal corner wall) always stay against the wall.
Claude tested locally: fridge case-in (panel + W3615 out 12"), casing counted only on the open side, order list "2× FL6 … (bump-out casing)", 3D casing, Design Check clean, no console errors.
- [ ] On a real job: double-click the upper over the fridge → Wall offset 12 → check plan, 3D, elevation note, and the quote line.
- [ ] Double-click the fridge → Case in this fridge.
- 7.1 live check (2026-10-04, "ZZ Claude Test"): W36 over the fridge, Case in this fridge → panel on one side (other side is the oven cabinet's corner, reported as no room), W36 out 12"; printed quote shows "Wall (out 12" from wall)", the panel, and "Filler — bump-out casing … for W36". No quote history created.

### 7.2 Hardware & accessories on the quote (built 2026-10-04)
**First: run `supabase-quote-settings.sql` in the Supabase SQL editor** (adds the quote_settings column for the slides setting). Until then Profile still saves everything else; the slides box just won't stick.
- **Quote window → Hardware & Accessories:** counted from the plan. Pulls/knobs per door and drawer (from the same front layout as 3D/elevations; corner units = 1; false fronts and panels = 0), trash pull-out kits, and drawer slides (only if Profile says slides don't come with your cabinets). Counted quantity shows in grey; type to change it. Type the **each** price, untick a line to leave it off. **＋ Add Accessory** for roll-out trays, spice pull-outs, LED, soft-close upgrades, etc. (preset list, or type your own).
- **Door Style panel → hardware:** Bar pulls / Knobs on doors (pulls on drawers) / **All knobs**. Drives the 3D, elevations and the counts.
- **Trash pull-out:** double-click a Base cabinet → Trash pull-out: Single / Trash + recycle. It becomes a top drawer over one tall pull-out (3D, elevation note "trash + recycle"), and its kit is counted. Its slides aren't counted separately.
- Printed quote and PDF get a "Hardware & Accessories" section and total line; the order list gets a "Hardware & accessories" section; Gold revisions notice hardware changes.
- **Pricing fix found along the way:** the PDF export and the Quote window's summary left **appliance prices** out of the total, while the printed quote included them. All three now use one shared total, and the PDF lists appliance prices.
Claude tested locally: counts on a known layout (9 doors / 7 drawers; 16 pulls, 7+9 split, or 16 knobs; 6 slide pairs with slides off, since the trash front's slides come with its kit), totals with an $899 dishwasher, order list section, elevation look, Quote window rows. No console errors. (Printing is blocked in demo, so the printed quote/PDF get checked live after the push.)
- [ ] Profile → untick "Drawer slides come with our cabinets" → Quote window shows a slides line.
- [ ] Set a base to Trash + recycle → see it in 3D/elevation and as a kit line on the quote.
- 7.2 live check (2026-10-04, "ZZ Claude Test"): quote_settings column exists; trash + recycle on a B24, knobs on doors; $231 of hardware matched on the Quote window, printed quote, PDF and order list. No quote history created.

### 7.3 Floating shelves (built 2026-10-04)
Double-click a floating shelf: **Length** (any, fractions OK, 6–240"), **Depth** 8/10/12/14", **Thickness** 1½–3", **Shelves** 1–6 with **Spacing** (bottom to bottom), **Bottom from floor**, **Finish** (natural wood, walnut, match the cabinets, white, black). Works on any wall in any room. Price stays on the quote line (custom work), and the quote line reads e.g. "Floating Shelf ×4, 10" deep, walnut". A stack can't overlap uppers (placement rules use the whole stack).
Claude tested locally: 4-shelf walnut stack + single shelf in elevation/3D/plan, popover fields, overlap rule. No console errors.
- [ ] Add a floating shelf, make it 3 shelves at 12" spacing, change finish → check elevation, 3D and the quote line.
- 7.3 live check (2026-10-04, "ZZ Claude Test"): 3-shelf walnut stack, quote line "Floating Shelf ×3, 10" deep, walnut — $300". No quote history created.

### 7.4a Bathrooms (built 2026-10-04)
- **Room types:** Add Room has a **Room Type** (Kitchen, Bathroom, Hallway, Living room, Laundry, Other); a new project's type sets its first room. Older rooms are typed from their name ("Bathroom", "Powder", "Vanity"… → bath).
- **Start with a bathroom layout** (ticked by default for bathrooms): sized to the room. A tub across the end wall (or a 48" shower if it doesn't fit), a toilet with code clearance, a cabinet over the toilet, a vanity as wide as fits (double sink at 60"+), mirror(s), sconces, and a linen tower if there's room. All ordinary items you can move, resize or delete.
- **Catalog → Bath** (opens by itself in a bathroom): Vanity (now up to 72"), **Linen Tower** (priced like Tall, 84/90/96 — add to your price sheet), Toilet, Bathtub, Shower (depth 32–48"), Mirror, Medicine Cabinet, Wall Sconce, Floating Shelf. Also in the sidebar Add forms.
- **Double vanity:** double-click a vanity 48"+ → Sinks: Single / Double. Doors | drawer bank | doors, two bowls in the top.
- **Fixtures** (toilet, tub, shower, mirror, medicine cabinet, sconce) are placed for layout/looks. They go on the quote **only if you give them a price** (double-click → More… → Price).
- **Design Check for bathrooms:** toilet 15" from its centre to anything beside it, 21" clear in front (30" recommended = tip). Kitchen aisle rules no longer apply to bathrooms.
- **3D fix found along the way:** the north and east walls stood 3½" INSIDE the room in 3D (south/west were correct), hiding anything shallow on them (mirrors, sconces, medicine cabinets) and burying the back of every cabinet on those walls. All walls now stand outside the room, rectangle and L-shaped.
Claude tested locally: starter layouts for 8'×5', 10'×8', 12'×9', 9'×5'6" rooms (no placement problems, Design Check clean), plan symbols (toilet, tub, shower X), elevation, 3D, quote rule (unpriced fixtures off, priced mirror on), kitchen sample still renders. All 30 scripts compile; no runtime errors.
- [ ] New project → type Bathroom → keep "Start with a bathroom layout" → look at plan, elevation, 3D.
- [ ] Add Room → Bathroom on an existing job; try a double vanity.
- [ ] Your kitchens in 3D: cabinets on the north/east walls now sit right against the wall (check nothing looks off).
- 7.4a live check (2026-10-04, "ZZ Claude Test" → Add Room "Hall Bath" 9'×5'6"): tub 66, toilet, V36, mirror, sconce; Design Check clean; 3D right. Fixed after: the catalog now switches to the room's tab when a room is added or switched to.

### 7.4b Living room + Hallway/mudroom (built 2026-10-04)
- **Add Room → Living room** ("Start with an entertainment center"): media base centred on the north wall (up to 72"), open bookcases each side when the wall is 9'+ (24") or 12'6"+ (30"), and a TV sized to the base (75" set on a 72" base).
- **Add Room → Hallway** ("Start with a mudroom locker wall"): up to four 18" lockers, centred.
- New priced cabinets (add to your price sheet; fresh template from Profile): **Media Base** (24–72" wide, 24/30" tall, 18" deep), **Open Bookcase** (18–36" × 84/90/96, 12" deep, open shelves), **Locker / Mudroom Unit** (15/18/24 × 84/90/96: shoe cubby, bench seat, open coat area with hooks, door over), **Bench Seat Base** (24–48", drawers under the seat).
- **TV** (wall-mounted) in 50/55/65/75/85" sizes; placement/looks only unless priced.
- Catalog tabs **Living** and **Hall** open by themselves in those rooms. The "Counter Height 36"" guide only shows in kitchens/laundry now.
- Hardware counts: open shelving has no hardware; locker doors and bench drawers are counted.
Claude tested locally: living rooms 14'/10'/8' and halls 6'8"/5' (no placement problems, Design Check clean), elevation, 3D, hardware counts. All scripts compile; no errors.
- [ ] Add a Living room and a Hallway to a job with the starter option on; check plan, elevation, 3D, quote.
- 7.4b live check (2026-10-04, "ZZ Claude Test" → Add Room "Family Room" 14'×12', living): BC30 ×2, MB72, 75" TV; Living tab opened; Design Check clean; no errors.

### 7.5 Kitchen extras (built 2026-10-04) — looks only, never on the quote
- **Catalog → Extras:** Dining Table (60/72/84"), Round Table (42/48/54"), Dining Chair, Counter Stool, and countertop appliances (Coffee Maker, Stand Mixer, Toaster, Countertop Microwave).
- Tables/chairs/stools are free-standing like an island: click a tile (lands mid-room) or drag it onto the floor plan, then drag it anywhere. Double-click: size (or turned), which way it faces, **＋ 4 chairs** on tables, duplicate, delete.
- **Island → double-click → Counter stools:** adds stools along any side, one every 24", facing the island.
- Countertop appliances land on the first open stretch of countertop (or drag one onto a counter).
- Shown in plan and 3D (not elevations). Nothing here is quoted or ordered, even if a price is typed.
Claude tested locally: island stools, round table + chairs, all four countertop appliances placed on the counter, 3D, popover/duplicate/delete, quote total unaffected. All scripts compile; no errors.
- [ ] On a kitchen with an island: add stools, a table with chairs and a coffee maker; look in 3D.

### 5.8 AI supplier price-list import (built 2026-10-05) — Silver + Gold
**Setup before it works live (Dan):**
1. Run `supabase-price-import.sql` in the Supabase SQL Editor (adds `supplier_skus` + the `price_import_log` table).
2. Create an Anthropic API key (console.anthropic.com → API Keys; add a payment method and set a monthly spend limit, e.g. $20).
3. Netlify → Site configuration → Environment variables → add `ANTHROPIC_API_KEY` (mark it secret). Then push / redeploy.
**What it does:** Profile → My Pricing → **✨ Import Supplier Price List**. Pick the file (Excel/CSV, as the supplier sent it), name the supplier, set the list-price multiplier (1 = the list is your cost; 0.42 = you pay 42% of list) → the AI finds the columns → you connect each price column (or each finish in a "finish" column) to one or more finishes (existing, or new ones tagged with that supplier) → the AI reads each item code → review: **Needs a look / Matched / Skipped** → Save shows new / changed / unchanged counts and the biggest changes before anything is written.
- Prices are read straight from the file in the browser; the AI never supplies a number.
- Sizes the planner doesn't have (e.g. a B39) go to "Needs a look"; variants (full-height door, left/right, 24" deep) are skipped when the plain item exists; the same code listed twice at different prices shows both and you pick.
- Multiple suppliers: each import only touches the finishes it prices. New finishes show grouped under the supplier name in the planner's style picker. Finish names auto-match only within the same supplier.
- Owner accounts (Dan, sister): imported finishes are added **after** the built-in catalog, never replacing it.
- Supplier item codes are saved and used on the **Order List** for that size + finish (falls back to our generic code).
- Old template upload: a non-template file now offers to open the AI import instead of being rejected.
- Company Settings → Door Styles / Finishes has a new **Supplier** box on each finish.
- Limits: 10 imports per account per day, Silver/Gold only, account owner only. Dan sees the AI cost of each import at the bottom of the review screen.
Claude tested locally with a made-up "Acme" list and a simulated AI (no API key yet): wide layout with title rows, section headings, "$210.00"/"N/A" cells, a duplicate code at two prices, variant codes, an off-size B39, moulding/unknown items, price group feeding two finishes, 0.5 multiplier, long layout (finish column) on an owner account, save contents, quote prices and order-list codes in the planner. All scripts compile; no errors.
- [ ] After setup: import a real supplier list on the Gold test account; spot-check 10 prices against the file; run a quote.
- [ ] Silver account: button works; Free account: button greyed out.

### 24" wall cabinet height (added 2026-10-05)
- Wall cabinets now come in **24" high** (e.g. W3624 over a fridge). Price sheet template has the new rows — re-download it if you price by template.
Claude tested locally: W3624 prices by width × height, order code W3624, plan/elevation/3D draw with no errors.
- [ ] Add a 36×24 wall cabinet over a fridge; check elevation + quote.
