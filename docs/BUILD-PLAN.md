# My Cabinet Planner — Build Plan (Competitive Upgrade)

For Claude Code. This is the working build plan for the next round of development on My Cabinet Planner (MCP). Read this whole file before writing any code. Work one task at a time, in order, and stop for Dan's review at the end of each task. Don't start the next task until Dan says go.

> **Status notes (checked against the code on 2026-09-24).** A few items in the original draft were already out of date. They're corrected inline and marked **[Verified]**. Anything not marked still has to be confirmed in Phase 0.

---

## 1. Why this plan exists

A free consumer tool (spaceplanner.co) is advertising on Instagram. We tested it hands-on against MCP on 2026-09-24:

- **They are better at presentation and feel.** Drag-to-draw rooms, keyboard shortcuts, layers panel, searchable symbol library, textured 3D with shadows, lighting presets, camera presets, saved views, see-through walls, screenshot button, first-person walkthrough.
- **We are better at substance.** They have no wall/upper cabinets, no sink base/corner/filler/end panel, no 3" increments (their "counters" are metric modules shown in feet), no pricing, no quotes, no job tracking, no leads.

**Goal:** close the presentation gap without diluting the mission. MCP is cabinet design + quoting + job tracking for independent cabinet sellers and installers (solo to ~10-person shops). Tagline: *"Design it. Price it. Close it — before you leave their driveway."*

**Keep the comparison in proportion.** spaceplanner.co is a consumer toy and doesn't compete for our paying customer. It sets what a homeowner *expects to see* on a laptop screen. It doesn't set what a pro needs. Borrow its polish, and don't chase its feature list.

### 1.1 The decision filter (apply to every task, including detours)

Every task must name which of these it serves. If it serves none, flag it to Dan before building.

| Lens | Question | Example |
|---|---|---|
| **Faster** | Does a pro finish a kitchen design in fewer minutes? | Auto-advance placement, drag from catalog, run auto-fill |
| **More convincing** | Does the homeowner in the driveway trust it and say yes? | Door styles in 3D, snapshot in quote, share link + approve |
| **More accurate** | Is the order/install less likely to be wrong? | Gap dimensions, design-rule checker, SKU export |

Then run the **driveway test**: *would a rep use this sitting at a homeowner's kitchen table on a laptop, in the first visit?* A feature that only helps the second visit is fine. A feature that helps nobody at the table goes to the bottom of the list.

**Moat vs. parity.** Label each task as one of:
- **Parity**: closes a gap free tools already fill (drag, shortcuts, 3D looks). We need enough to not look dated, but it isn't why anyone pays.
- **Moat**: something free planners won't build because it needs cabinet expertise or business data (corner logic, auto-fill, clearance rules, quote, SKU export, approvals).

Rule of thumb: **don't ship two parity phases in a row without a moat task between them.** Phases 2–4 below are mostly parity and very large. Section 4.0 shows where moat tasks are interleaved.

### 1.2 How we'll know it worked

Track these before and after each phase (Dan decides how to collect them; even rough manual numbers count):
- **Time to first quote**: blank project → printable quote for a standard L-kitchen. Target is under 10 minutes for a practiced rep.
- **Demo → signup conversion** from `/app?demo=1`.
- **Trial-company feedback** from the 8–10 companies Dan is recruiting. What they actually use, and what they ask for.

### Out of scope, do not build

Electrical plans, gardens/landscaping/pools, roofs, multi-story houses, general furniture libraries (beyond a few scale references like stools/table), first-person WASD walkthrough.

---

## 2. Codebase facts and constraints

Confirm each of these against the repo in Phase 0. Don't assume.

- **Repo:** `dmstrtg-wq/Cabinet-Planner`, locally at `~/Documents/Claude/Claude/Projects/CabinetRepo/Cabinet-Planner`. This is the only source of truth. Ignore any stale `app.html` / `app.html.bak` copies in other folders.
- **Structure:** no build step, all HTML/CSS/JS inline. `app.html` (planner, ~7,500 lines, served at `/app`), `index.html` (marketing, `/`), plus `profile.html` (company settings, calendar, leads), `project.html`, and the legal pages. Netlify functions live in `netlify/`.
- **3D:** Three.js r128 from cdnjs + OrbitControls from unpkg **[Verified: app.html:31–32]**. Both tags carry `data-categories="essential"` so the Termly cookie blocker doesn't break 3D. Keep that on any new script tag. r128 constraints apply (e.g., no `CapsuleGeometry`). The existing scene already has an orbit camera, ambient + directional light, soft shadows, wall openings as `THREE.Shape` holes, box cabinets with inset door-panel details, billboard labels, and appliance front faces painted as `CanvasTexture` via the shared `drawApplianceFace()`.
- **Walls today are hard-coded `north/south/east/west`** **[Verified]**. There's no `schemaVersion` or `migrateProject` anywhere yet **[Verified]**.
- **Backend:** Supabase. Tables include `projects`, `company_profiles`, `leads`, `pro_listings`, `calendar_events`, `team_members`.
- **Billing:** Stripe live mode (Silver $39 / Gold $99). Tier checks go through `canAccess('silver' | 'gold')`. Demo mode gates pricing and PDF export.
- **Demo mode is browser-local, not a shared cloud account** **[Verified: app.html:1980, 2305, 2329]**. `?demo=1` sets `IS_DEMO`, projects live in `localStorage.cp_demo_projects`, and `demo@mycabinetplanner.com` is only a display label. Logged-in free users also save to that same localStorage key.
- **Hosting:** Netlify auto-deploys from `main` (~1 min).
- **Design system:** CSS custom properties in `:root`. After the 2026-09-24 WCAG pass, brand teal is `--accent #0f766e`, and teal text on dark navy uses `--accent-light #5eead4`. New UI must pass WCAG AA contrast.
- **Brand-sensitivity rule:** Forevermark names must never reach non-owner accounts. The owner-only `STYLES` catalog still ships in `app.html` source. Any export that emits SKU codes or style names (5.5, 5.6, 5.7) must pull from the account's own styles, never from `STYLES`.
- **Roadmap:** there's no `ROADMAP.md` in the repo **[Verified]**. The pointer to this file lives in `README.md`.

### Workflow rules

1. Try normal file edits first. If you hit EPERM, fall back to a small Python script (read → `str.replace` with `assert count == 1` → write). Anchor every splice on a unique string (e.g., a function signature). Comment markers like `/* ── TOAST ── */` can appear in both CSS and JS.
2. **Never run `git commit` or `git push` from the terminal.** Read-only git (`status`, `diff`, `log`) is fine. At the end of each task, summarize what changed and tell Dan to commit + push via GitHub Desktop.
3. After Dan pushes, verify the change live on mycabinetplanner.com in a browser.
4. If GitHub Desktop shows "0 changed files," check for a duplicate nested `.git` folder.
5. Local testing: run your own `python3 -m http.server <port>` from the repo and open `app.html?demo=1`. Seed test projects in `localStorage.cp_demo_projects`. Appliance `type` must be a real `APPLIANCES` key.

### Build-step decision (ask Dan, don't assume)

`app.html` will grow significantly with this plan. Before Phase 2 (not Phase 4: selection, drag, and undo are where the file starts to hurt), propose one of:

- (a) keep single-file and organize with clearly delimited sections,
- (b) split into native ES modules (`<script type="module">`) with no bundler, still no build step, or
- (c) introduce a build step (Vite).

Recommend (b) unless there's a strong reason otherwise. Watch out for two things with (b): inline `onclick="fn()"` handlers need the functions on `window`, and Termly's blocker has to allow the module files. Do not change the build approach without Dan's approval.

---

## 3. Guardrails for every task

- **Never break saved projects.** Existing projects in Supabase must load and render correctly after every change. Any change to the saved project shape needs a `schemaVersion` field and a `migrateProject(p)` function that upgrades old data on load. Never write a project back in a shape that older code can't detect as newer.
- **Round-trip test every data change.** Create → save → reload → confirm identical, for both the Supabase path and the localStorage path.
- **Security and business risk, flagged unprompted.** For any new upload, share link, endpoint, or storage bucket, state the auth model, Supabase RLS policy, rate limiting, file-size/type limits, and what's exposed client-side. Pricing logic and anything tied to paid tiers must not be bypassable by editing client state where that matters.
- **Paywall parity.** New features must respect Demo / Silver / Gold gating. Proposed tiers are in 4.0. When unsure, ask.
- **Performance.** Must stay usable on an ordinary contractor laptop. Target 60fps orbit in 3D on a 20-cabinet kitchen, and flag anything that drops it.
- **No regressions in quoting.** Changing a cabinet must still update the quote live. Run the quote on the reference test project before and after each task and compare totals.
- **Small, reviewable diffs.** One task per session. If a task balloons, stop and propose splitting it.

---

## 4. Phases and tasks

Each task lists Goal, Requirements, and Done when. Report back against the "Done when" list.

### 4.0 Sequencing and tier map (build order + tier map confirmed by Dan 2026-09-24)

Phases stay numbered as written so references don't break, but the **build order** interleaves moat work so we never spend months on parity alone:

1. Phase 0 (baseline) → Phase 1 (first five minutes)
2. **0.4 schema groundwork**, then Phase 2 (canvas interaction)
3. **5.2 Run auto-fill** and **5.7 SKU export**. Both are cheap once the wall abstraction exists, and both are pure moat.
4. Phase 3 (visuals) → **5.1 Design check** → **5.6 Share link + approve**. 5.6 pays off 3.1/3.6 directly.
5. Phase 4 (room model v2) → 5.3, 5.4, 5.5
6. Phase 6

| Task | Lens | Type | Tier (confirmed) |
|---|---|---|---|
| 1.x first-five-minutes fixes | Faster | Parity | All |
| 2.x canvas interaction | Faster | Parity | All |
| 3.1–3.5 visuals | Convincing | Parity | All (3D is the demo hook) |
| 3.6 3D snapshot in quote | Convincing | Moat | Silver (quote PDF is Silver) |
| 4.x room model v2 | Faster/Accurate | Parity→Moat | All; multi-room quote grouping follows quote tier |
| 5.1 Design check | Accurate | Moat | Silver |
| 5.2 Run auto-fill | Faster | Moat | All (shows off expertise in demo) |
| 5.3 Corner logic | Accurate | Moat | All |
| 5.4 Reference image import | Faster | Moat | Silver (needs cloud storage) |
| 5.5 Pro export package | Convincing | Moat | Silver; Gold keeps versioning |
| 5.6 Share link + approve | Convincing | Moat | Gold (or Silver, Dan's call) |
| 5.7 SKU export | Accurate | Moat | Silver |
| 6.1 Homeowner mode | Lead funnel | Moat | Free (feeds Leads) |

### Phase 0 — Baseline (do this first, no feature work)

**0.1 Map the code**
- Goal: understand the current structure before changing it.
- Requirements: write `docs/ARCHITECTURE.md` covering the project/room/wall/cabinet data model as saved to Supabase and to localStorage; how cabinets are positioned; how floor plan, elevation, and 3D are rendered; how the quote is computed; where tier gating lives (`canAccess`, `IS_DEMO`, owner-account overrides); and a list of global state and major functions with line ranges.
- Done when: Dan can read the doc and understand where each piece lives. No code changes.

**0.2 Verify known audit bugs**
1. ~~`jobCosts` and `trimItems` never written to the Supabase save payload.~~ **[Verified fixed]**: both are written at app.html:2320 and read back at 2360–2361. Just add them to the round-trip test.
2. **Printing a quote auto-increments the revision counter.** **[Verified still true]**: on Gold, once `quoteLocked`, *every* print pushes a new `quoteHistory` entry and activity-log line (app.html:5333+), even if nothing changed. Fix: only create a revision when the total or line items differ from the last entry; otherwise reprint the last revision.
3. **A project can advance to Installing/Complete with no quote.** **[Verified partially addressed]**: `setProjectStatus()` (app.html:6681) now shows a `confirm()` warning but allows it. **Dan decided 2026-09-24: keep the warning, not a hard stop.** The user acknowledges it and can continue. Current behavior already matches, so no code change. Just confirm it still works.
- Done when: each open item has a before/after description and a manual test that proves it.

**0.3 Reproduce demo issues from the 2026-09-24 test.** Confirm each and note file/line:
1. New Project form: East/West show "96" as a grey *placeholder* **[Verified: app.html:1377–1378]**. Blank fields parse to `0` (app.html:2484). Find where 0 turns into the 48"-deep room.
2. Room dimensions can't be edited after creation.
3. "From left" doesn't advance after adding a cabinet.
4. A wall cabinet added without a height renders roughly 12" tall.
5. ~~`/app?demo=1` opens a shared account showing other visitors' projects.~~ **[Verified: not a shared account.]** Demo is per-browser localStorage. "sefse"/"test" were earlier test projects in the tester's own browser. The real issues: (a) a first-time visitor sees an empty app, not a sample; (b) demo and logged-in free users share the `cp_demo_projects` key on the same browser.
6. Demo banner overlaps the header on load.
7. 3D camera can open behind a wall, and the selected door style (e.g., White Shaker) isn't visibly rendered.
- Done when: a short findings list is added to `docs/ARCHITECTURE.md`. No fixes yet.

**0.4 Schema groundwork (new, required before Phase 2)**
- Goal: Phase 2's "wall abstraction" changes the saved shape, so it needs the migration safety net first. Don't wait until Phase 4 for it.
- Requirements: add `schemaVersion` and a `migrateProject(p)` that runs on every load path (Supabase and localStorage). v1 → v2 only *adds* explicit wall records (`walls: [{id:'north', length, …}]`) and a `wallId` on each cabinet, derived from today's N/E/S/W data. Old fields are kept so older code still reads the project. Build a small fixture set (rectangle room, step walls, cutouts, appliances, trim/job costs, locked quote with history).
- Done when: every fixture round-trips with identical quote totals, and a v2 project opened by the current live code still renders.

### Phase 1 — Fix the first five minutes

Small, high-impact changes that remove friction for a first-time visitor.

**1.1 Demo sample project** (rescoped: demo is already browser-local)
- Requirements: when `?demo=1` opens with no saved demo projects, seed one polished sample project: an L-shaped kitchen with an island (or the best approximation until Phase 4), sink base under a window, range with hood, fridge with end panel, uppers, White Shaker. Add a "Reset demo" action. Give demo mode its own localStorage key so it doesn't mix with a logged-in free user's projects (migrate existing `cp_demo_projects` safely). Pricing stays gated.
- Security: confirm demo mode makes no Supabase reads/writes of project rows.
- Done when: a fresh browser on `/app?demo=1` lands on the sample kitchen, and "Reset demo" restores it.

**1.2 Real defaults in New Project**
- Requirements: pre-fill dimension fields with real values instead of placeholders: walls 120" / 120" / 96" / 96", ceiling 96". Validate on submit (positive numbers, sane min/max). Blank fields must not silently become other numbers. Apply the same to the Add Room form (`ar-*`, app.html:1426+).
- Done when: submitting the form untouched creates a 120 × 96 room exactly as shown.

**1.3 Editable room dimensions**
- Requirements: a Room Settings panel (per room) to edit wall lengths and ceiling height at any time. When a wall shrinks, cabinets that no longer fit get flagged visually (not deleted), with a warning listing them.
- Done when: resizing a wall updates floor plan, elevation, 3D, and quote, and overflowing cabinets are flagged, not lost.

**1.4 Auto-advance placement**
- Requirements: after adding a cabinet to a wall, "From left" advances to the right edge of the last cabinet on that wall at that level (base and upper tracked separately).
- Done when: adding B36, SB36, B24 back-to-back with no manual input produces a gapless run at 0, 36, 72.

**1.5 Smart upper defaults**
- Requirements: wall cabinet height defaults from ceiling height (96" → 30", 108" → 36", 120" → 42"), with the bottom at 54". The height select is pre-selected, never blank.
- Done when: adding an upper with no height choice renders at the correct default in all three views.

**1.6 Demo banner layout**
- Requirements: the banner pushes the layout down instead of overlapping. Dismissible, and stays dismissed for the session.
- Done when: all header controls are fully visible and clickable with the banner showing, at 1280px and 1440px widths.

### Phase 2 — Canvas interaction

Make designing feel direct. Build on the wall abstraction from 0.4 (cabinet position = `wallId` + `offset` + `level`), not on hard-coded N/E/S/W. Phase 4 will add arbitrary walls, and this phase must not have to be redone.

**2.1 Selection model**
- Requirements: click a cabinet in floor plan or elevation to select it (highlight + handles). Selection syncs across views. Double-click opens a compact popover with type, width, height, door style, notes, delete, and duplicate. The side panel stays as the precise-entry option.
- Done when: selecting in one view highlights the same cabinet in the other two.

**2.2 Drag from catalog**
- Requirements: the catalog becomes a searchable, filterable palette (Base / Wall / Tall / Corner / Fillers & Panels / Appliances). Drag an item onto a wall in floor plan or elevation. It snaps to the wall and to neighbors and shows a ghost preview while dragging. Invalid drops (overlap, past wall end, blocking a door opening) show red and are rejected.
- Done when: a full wall can be built by dragging only, with no typing.

**2.3 Move and nudge**
- Requirements: drag a placed cabinet to slide it along its wall. Arrow keys nudge 1" (Shift = 1/8", Alt = 3"). Snap to neighbors and wall ends within 1". Collision prevention on the same level.
- Done when: cabinets can be repositioned precisely without typing and never overlap.

**2.4 Live gap dimensions**
- Requirements: while a cabinet is selected or dragging, show dimension strings to the nearest neighbor (or wall end) on each side, in inches with fractions. Show the remaining open space at the end of each run.
- Done when: an installer can read the exact remaining gap on any wall at a glance.

**2.5 Keyboard shortcuts and undo/redo**
- Requirements: `B` base, `W` wall, `T` tall, `F` filler, `A` appliance (opens palette filtered), `Delete`, `Ctrl/Cmd+D` duplicate, `Ctrl/Cmd+Z` / `Shift+Ctrl/Cmd+Z` undo/redo (at least 50 steps covering all design edits), `Esc` deselect. Visible undo/redo buttons. A `?` shortcut sheet. Shortcuts must not fire while typing in an input.
- Done when: every design action can be undone and redone, including room resizes.

**2.6 View layers**
- Requirements: a toggle panel for dimensions, item numbers, uppers, bases, appliances, openings, and grid. Toggles also apply to PDF output (the `_pdfMode` render path).
- Done when: turning off item numbers removes them from the canvas and from the exported floor plan PDF.

### Phase 3 — Visuals that sell the job

Make the 3D and elevation look like the homeowner's actual kitchen. Stay within Three.js r128, or propose an upgrade with a migration note if a feature truly needs it.

**3.1 Door styles in 3D**
- Requirements: procedural door and drawer-front geometry per style: Shaker (5-piece rails/stiles, recessed center), Slab, Raised Panel, and Glass (framed). Drawer bases show drawer fronts, and sink bases show a false front. Finish color/material per door style, with optional wood-grain texture. Hardware is a bar pull or knob, placed per door/drawer with sensible defaults (pulls on drawers, knobs or pulls on doors, hinge side from settings).
- Performance: use shared geometries/materials and instancing where possible.
- Done when: the sample kitchen in White Shaker clearly reads as a white shaker kitchen, and switching the project door style updates everything instantly.

**3.2 Countertops, toe kicks, trim**
- Requirements: an auto-generated countertop over every base run (1.5" thick, 1" overhang, continuous across runs, cut around range/sink openings), with a material picker (quartz, granite, butcher block, laminate) shown as color/texture. Recessed toe kick (4.5" H × 3" D). Optional crown molding and light rail on uppers. Finished end panels where a run ends exposed. Countertop and trim show in elevation too.
- Future hook: store countertop material and linear/square footage on the project so it can become a quote line later. Don't add pricing yet.
- Done when: base runs look finished in 3D and elevation, with no floating boxes.

**3.3 Appliances**
- Requirements: recognizable low-poly models for fridge (French door, side-by-side), range (with backguard + knobs), cooktop, wall oven, hood (chimney and under-cabinet), dishwasher, and microwave (OTR and drawer). Stainless and panel-ready finishes. Build on the existing `drawApplianceFace()` textures rather than replacing them. Appliances keep their existing quote behavior.
- Done when: each appliance is recognizable at normal viewing distance.

**3.4 Lighting and camera**
- Lighting presets: Daylight, Warm Interior, and Studio (neutral, for PDFs). Keep soft shadows.
- Camera presets: Doorway (human eye height ~64"), Face each wall, Overhead, 3/4 Hero.
- The default camera must never start behind or inside a wall. Compute a hero angle from the room bounds and open side.
- Cutaway: walls between the camera and the room center fade to transparent or are hidden.
- Floor material picker (wood, tile, LVP), visual only.
- Done when: opening 3D on any project shows a good view immediately, and each preset lands correctly on L, U, and galley layouts.

**3.5 Elevation drawing upgrade**
- Requirements: draw door/drawer lines matching the door style, a hinge-side indicator on doors, countertop and backsplash lines, toe kick, and crown. Dimension strings along the bottom (each cabinet + overall) and side (counter height, upper bottom, upper top, ceiling). Item numbers keyed to the quote line items. Openings (windows/doors) drawn with trim.
- Done when: an elevation printout could be handed to an installer as a working drawing.

**3.6 3D snapshot into the quote**
- Requirements: an "Add to quote" button in 3D captures the current view at high resolution (render at 2×, then downscale) and inserts it into the quote PDF above the line items. Up to 3 snapshots per quote, removable. Store with the quote version (Gold versioning must keep each snapshot tied to its version).
- Storage/security: if snapshots go in Supabase Storage, use a private bucket with RLS by `user_id` and state size limits. Don't put base64 images in the `projects` JSON row.
- Done when: a quote PDF shows the homeowner their kitchen in 3D next to the price and signature line.

### Phase 4 — Room model v2 (single room → whole job)

This is the largest rebuild. Start with a design doc, not code.

**4.0 Design doc (required before any 4.x code)**

Write `docs/ROOM-MODEL-V2.md` proposing:
- Data model: `Project → Rooms → Walls (polyline segments with length, angle, thickness, height) → Openings → Runs/Cabinets (wallId + offset + level)`, plus free-standing runs (islands/peninsulas) with position + rotation. Build on the v2 wall records from 0.4.
- How rooms connect on a single floor plan (shared walls, doorway openings between rooms).
- `schemaVersion` bump and a `migrateProject()` step that converts every existing rectangle project into the new model losslessly.
- How elevations are generated per wall ("Wall A, B, C…" labels, user-renamable).
- How the quote groups line items by room.
- Risks, a rollout plan (feature flag, owner accounts first), and a rollback path.
- Done when: Dan approves the doc. Do not start 4.1 until then.

**4.1 Polygon rooms**
- Requirements: draw a room by clicking corners (live length labels, 90°/45° snapping), or start from a rectangle and edit. Support L-shaped rooms, angled walls, and bump-outs. Edit any wall length numerically. Soffits as an optional per-wall property (height + depth) that constrains upper heights.
- Done when: an L-shaped room with a 45° corner can be drawn, cabinets placed on every wall, and every wall gets an elevation.

**4.2 Islands and peninsulas**
- Requirements: free-standing runs placeable anywhere in the room, with rotation. Front and back faces (the back can be cabinets, a finished panel, or a seating overhang with configurable depth). Peninsulas attach to a wall at one end. Waterfall countertop option.
- Done when: an island with a sink on the front and a seating overhang on the back renders correctly in all views and quotes correctly.

**4.3 Connected multi-room floor plan**
- Requirements: multiple rooms on one canvas (kitchen, pantry, laundry, mudroom, baths) with doorways between them. Room tabs remain for focused editing. The quote shows subtotals by room plus a job total. The floor plan PDF can print the whole job or a single room.
- Done when: a "kitchen + 2 vanities + laundry" job can be designed and quoted as one project.

**4.4 Room templates**
- Requirements: a new-room picker with templates: Galley, L, U, L + Island, Single Wall, Vanity Wall (single and double sink), and Laundry. Templates place walls and a starter cabinet layout sized to the entered dimensions.
- Done when: a rep can go from blank to an 80%-complete layout in under a minute.

**4.5 Migration verification**
- Requirements: load every existing project shape through `migrateProject()`. Use real anonymized samples from Supabase if Dan approves, or synthetic fixtures otherwise. Compare quote totals before and after.
- Done when: 100% of fixtures migrate with identical quote totals and visually equivalent layouts.

### Phase 5 — Professional tools free planners won't build

This phase is the moat. See 4.0 for where these tasks slot into the build order.

**5.1 Clearance and design-rule checker**
- Requirements: a non-blocking "Design Check" panel that lists issues and highlights them on the canvas:
  - Aisle between opposite runs or island < 42" (< 48" warning for two-cook).
  - Dishwasher or oven door swing hitting an opposite run or island.
  - Missing landing space: < 12"/15" beside the cooktop, < 15" on the fridge handle side, < 24" beside the sink (one side).
  - Uppers < 18" above the countertop.
  - Door/drawer collisions in inside corners; blind corner without pull clearance.
  - Seating overhang < 12" (counter height).
  - Cabinet overlapping a window or door opening.
- Rules live in one config object so values can be tuned later. Rules that need islands or aisles activate after Phase 4. Ship the wall-run rules first.
- Done when: the sample kitchen passes, and a deliberately bad layout lists every violation with click-to-locate.

**5.2 Run auto-fill**
- Requirements: on any wall run with a gap, "Fill this gap" proposes 1–3 combinations of standard widths + fillers that close it exactly (prefer fewer, larger boxes; fillers ≤ 3" at ends against walls). The user picks one. Only propose widths that exist in the account's own catalog.
- Done when: a 105" gap produces valid combinations like 36 + 36 + 30 + 3" filler.

**5.3 Corner logic**
- Requirements: when two runs meet in a corner, detect it and offer blind corner (with pull distance), lazy susan, or diagonal. Auto-place the fillers needed for door/handle clearance. Warn if the choice won't fit.
- Done when: every L and U corner in the templates resolves correctly with no manual filler math.

**5.4 Reference image import (manual trace)**
- Requirements: upload a photo, sketch, or PDF page as a background layer on the floor plan. The user sets scale by clicking two points and entering a known distance. Adjustable opacity, lockable. Trace walls over it.
- Security: private Storage bucket, RLS by `user_id`, 10 MB limit, image/PDF MIME whitelist, strip EXIF metadata on upload.
- Later (not this task): AI-assisted wall detection.
- Done when: a builder's PDF floor plan can be imported, scaled, and traced accurately.

**5.5 Pro export package**
- Requirements: a one-click PDF with a cover page (company logo, customer, address, date, quote version), floor plan, every wall elevation, 3D snapshots, itemized quote, terms (company profile terms only), and a signature line. Page size selectable (Letter / Tabloid).
- Done when: the package prints cleanly and matches on-screen data exactly.

**5.6 Customer share link**
- Requirements: generate a view-only link for the homeowner with 3D (orbit + camera presets), elevations, and the quote. An "Approve" button records name, timestamp, and quote version, and logs to the activity log.
- Security: unguessable token (≥ 128-bit), revocable, optional expiry, read-only access enforced server-side (a Netlify function or a Supabase RPC; don't open `projects` RLS to anon), no exposure of pricing-sheet internals, cost data (job costs), or other projects, and a rate-limited approve endpoint. Flag the e-signature legal question to Dan (what the approval legally represents) before shipping. It's a good question for the StartUp Academy legal contact.
- Done when: a homeowner on a phone can open the link, spin the kitchen, and approve, and revoking the link kills access immediately.

**5.7 Order-ready SKU export**
- Requirements: export a CSV (and a printable list) of every cabinet/panel/filler with SKU code, width/height/depth, door style, finish, hinge side, room, and quantity, grouped by room. SKU codes and style names come from the account's own catalog/price sheet (see the brand-sensitivity rule in Section 2).
- Done when: the CSV could be pasted into a supplier order form with minimal edits.

### Phase 6 — Protect the lead funnel

**6.1 Homeowner mode**
- Requirements: a simplified planner path for homeowners (templates, drag-to-place, door style + countertop picker, 3D). No pricing and no job tracking. It ends with "Get a quote from a local pro," which routes to the existing Connect with a Pro / Leads flow (`submitProLead` → `leads` table, `company_id` routing) with the design attached.
- Security: anti-spam on lead submission (rate limit + honeypot or CAPTCHA), ZIP validation, no PII in URLs.
- Done when: a homeowner can design and submit a lead that lands in a pro's Leads tab with the layout attached.

**6.2 Kitchen SEO pages**
- Requirements: static pages on `mycabinetplanner.com` for cabinet-specific searches (e.g., galley kitchen cabinet layout, L-shaped kitchen with island, kitchen cabinet sizes chart, how much do kitchen cabinets cost). Each page has genuinely useful content and a "Design yours free" button that opens homeowner mode with the matching template. Proper titles, meta, canonical, and sitemap entries (`sitemap.xml` exists).
- Done when: Dan approves copy for the first 5 pages and they're live and indexed.

---

## 5. Testing checklist (run at the end of every task)

- [ ] Existing saved projects load and look the same (or better, if the task was visual).
- [ ] Save → reload round trip is lossless for everything touched (Supabase and localStorage paths).
- [ ] Quote total on the reference test project is unchanged (unless the task intentionally changes pricing).
- [ ] Demo / Silver / Gold gating still correct.
- [ ] Floor plan, elevation, and 3D stay in sync.
- [ ] No console errors, including with the Termly cookie banner **declined**.
- [ ] Works at 1280px and 1440px widths. Note anything broken on tablet/phone.
- [ ] New UI passes WCAG AA contrast.
- [ ] Security notes written for any new upload, link, endpoint, or storage.

## 6. How to report back after each task

1. What changed (files, functions, short line-level summary).
2. Which lens (Faster / Convincing / Accurate) it served, and whether the success metrics moved.
3. How to test it manually (click path).
4. Anything flagged: risks, security notes, decisions Dan needs to make.
5. Reminder: "Commit and push via GitHub Desktop, then check mycabinetplanner.com in ~1 minute."
6. The next task ID, waiting for Dan's go-ahead.

## 7. Staying on track

Before any detour, ask: **does this move us toward paying cabinet customers?** Run it through the decision filter in 1.1. If a request pulls toward general home design (furniture, electrical, outdoor), point back to Section 1 and ask Dan to confirm before building. If a trial company asks for something, that counts as strong evidence. If an Instagram competitor has it, that's weak evidence.
