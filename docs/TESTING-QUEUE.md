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
