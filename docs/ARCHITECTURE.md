# My Cabinet Planner — Architecture Map

*Written 2026-09-24 for Build Plan task 0.1. Line numbers refer to `app.html` at commit `9b82dce`, and they drift as the file changes. Search for the function name if a line number is off.*

---

## 1. The big picture

MCP is a set of static HTML files served by Netlify. There's no build step: every page carries its own HTML, CSS and JavaScript inline.

| File | What it is |
|---|---|
| `index.html` | Marketing / landing page (`/`) |
| `app.html` | The planner (`/app`), ~7,500 lines. **This doc is mostly about this file.** |
| `profile.html` | Company Settings, price sheets, team, billing, Calendar, Leads, Find a Pro listing |
| `project.html` | Single-project detail page |
| `terms/privacy/cookie/refund/accessibility/contact*.html` | Legal and contact pages |
| `netlify/functions/*.js` | Server-side code: Stripe checkout/portal/invoices/webhook, team invite/accept/remove |
| `supabase-*.sql` | SQL that was run by hand in Supabase (leads, pro listings, calendar, team). **There's no SQL in the repo for `projects` or `company_profiles`.** Those were created before the repo tracked schema. |

External libraries (all in `<head>` of `app.html`, lines 30–32): supabase-js v2, Three.js r128, OrbitControls. All three carry `data-categories="essential"` so the Termly cookie blocker leaves them alone.

### How the planner is laid out (split into files 2026-09-24, Build Plan option b)

`app.html` is now just the page: the `<head>` (Termly, analytics, libraries), the HTML for the sidebar, toolbar, viewports, panels and ~20 modals, and at the bottom a list of `<script>` tags. The code lives in:

| File | What's in it |
|---|---|
| `css/app.css` | All planner styles (was the inline `<style>` block) |
| `js/core.js` | Supabase client, zoom/pan + rulers, demo mode + sample kitchen, auth, `CATALOG`/styles/tax, `state`, saving/loading (`projectToRow`, `rowToProject`, `migrateProject`), helpers, modals, `setViewMode` |
| `js/rooms.js` | Projects, rooms, L-shapes, **wall geometry (`wallFrame`, `itemRect`)**, openings, cabinet/appliance/island forms, placement (`nextFreeOffset`, overlap checks), room fit checks, style panel |
| `js/sidebar.js` | Sidebar, project header, room tabs, cabinet list |
| `js/floorplan.js` | Floor plan drawing (`renderCanvas`), print ruler, measure tool, island clearance |
| `js/view3d.js` | 3D view (`renderIsometric`, camera, walls) |
| `js/elevation.js` | Wall elevations (`renderElevation`) |
| `js/quote.js` | Summary table, quote modal, job costs/trim, `printQuote` + revisions |
| `js/tools.js` | Dimension callouts, item tags, work triangle, cut list, room templates |
| `js/pdf.js` | Floor plan print + `exportPDF` |
| `js/drag-floor.js` | Floor plan mouse/touch (drag, pan, double-click edit) |
| `js/account.js` | Job status + activity log, team context, company profile + tier gating (`canAccess`), invite/recovery |
| `js/drag-elevation.js` | Elevation mouse/touch |
| `js/shell.js` | Phone mode, **boot sequence**, tour, contact, FAQ, Connect with a Pro |

**How the files work together:** they are *classic* scripts (not ES modules), so they share one global scope exactly like the old single `<script>`. Inline `onclick="…"` handlers and cross-file function calls work unchanged. Two rules:
1. **Load order matters.** Code that runs *while a file loads* (top-level statements, IIFEs) can only use things from files above it in the list. Code inside functions/event handlers can use anything, because it runs after everything has loaded. Boot lives in the last file for this reason.
2. **Every `<script>` tag needs `data-categories="essential"`,** or Termly's cookie auto-blocker may block it when a visitor declines cookies (this happened to 3D before).

Line numbers elsewhere in this doc refer to the old single-file `app.html`. Search by function name instead.

---|---|
| 1–32 | `<head>`: Termly, Google Analytics, libraries |
| 33–686 | CSS (sidebar, toolbar, modals, phone/tablet breakpoints, demo-mode hiding rules) |
| 687–1712 | HTML: login screen, demo banner (788), sidebar, main toolbar, the three viewports, side panel forms, ~20 modals |
| 1713–7419 | **Main script** (everything below) |
| 5362–5397 | A `<style>` block *inside a JS template string*: the printable quote's own CSS, not page CSS |
| 7488–7522 | Small accessibility-preferences script |

---

## 2. The data model (what gets saved)

### 2.1 Shape of a project in memory

```text
project
├─ id            UUID (crypto.randomUUID)
├─ customer, phone, company, address, city, state, type, notes
├─ style         door-style code for the whole project, default 'AW'
├─ createdAt     ms timestamp
├─ status        'Lead' | 'Quoted' | 'Ordered' | 'Installing' | 'Complete'
├─ activityLog[] { id, type, text, createdAt, user }
├─ jobCosts[]    { label, amount }            e.g. Labor, Demo/Removal, Incidentals
├─ trimItems[]   { label, qty, unitPrice }
├─ quoteLocked   bool, set once a quote is "sent"
├─ lockedQuote   { revision, quoteNum, date, total, breakdown }
├─ quoteHistory[] { revision, quoteNum, date, total, breakdown }   (Gold versioning)
└─ rooms[]
   └─ room
      ├─ id (short uid), name
      ├─ shape       'rect' | 'L'   (missing = rect)
      ├─ walls       { north, south, east, west }   lengths in inches
      ├─ lCut        { corner:'NE'|'NW'|'SE'|'SW', width, depth }  (L rooms only)
      ├─ ceilingHeight   inches (default 96)
      ├─ cabinets[]  { id, type, wall, width, height, depth, offset, wallBottom,
      │                glassDoors, styleOverride, note, itemNum }
      ├─ appliances[] { id, type, wall, width, height, offset, customElevBottom,
      │                 price, note, itemNum }
      ├─ openings[]  { id, type:'door'|'window'|'sink-loc'|'arch', wall, width,
      │                height, offset, sillHeight }
      └─ islands[]   { id, width, depth, x, y, label }
```

Key points:
- **Position is `wall` + `offset`.** `wall` is one of `north / south / east / west`, or `step1 / step2` for the two inner walls of an L room. `offset` is inches from the wall's start: north/south walls measure from the west end, and east/west walls measure from the north end. `wallBottom` is the height from the floor for uppers (default 54). Bases sit on the floor.
- **There's no "level" field.** Base vs. upper is implied by `type` (`wall`/`diagWall` are uppers).
- **Islands are plain rectangles** with x/y from the NW corner. They hold no cabinets and **aren't priced**.
- **`itemNum`** is the number in the hexagon tag. It's assigned once and never reused, and `ensureItemNumbers()` (4676) backfills old projects.
- **Versioning (added 0.4):** every project carries `schemaVersion` (currently 2). `migrateProject()` runs on every load, cloud and browser. It only fills in missing lists and defaults and never changes entered numbers, so it's safe to run repeatedly. A project with a *higher* version than the running code is flagged `_newerSchema` and refused for cloud saving, so older code can't strip fields a newer version added.

### 2.2 Where it's stored

The same project object goes to one of two places, depending on the account (`syncActiveProject`, 2301):

| Who | Saved to | Loaded from |
|---|---|---|
| Demo (`?demo=1`) | `localStorage.cp_demo_projects` (whole array) | `loadProjectsFromLocal()` (2328) |
| Logged-in **Free** | `localStorage.cp_projects_<userId>` | Same key, merged with any cloud rows from when they were paid (fixed 0.2, see §8.1) |
| Silver / Gold | Supabase `projects` row | `loadProjects()` (2342) |

**Supabase `projects` row:** `id`, `user_id` (= `effectiveOwnerId`, the team owner), `customer`, `type`, `notes`, `style`, `data` (JSON), `created_at`, `updated_at`. Everything else lives in `data`: `rooms, status, activityLog, phone, company, address, city, state, jobCosts, trimItems, quoteLocked, lockedQuote, quoteHistory`.

**One serializer (added 0.4):** `projectToRow()` / `rowToProject()` are the only code that knows the column/`data` split. Every field other than the columns goes into `data` automatically, and fields starting with `_` are never saved. The old hand-written field lists (and the class of bug that lost `jobCosts`/`trimItems`) are gone.

**Save timing:** every edit calls `persist()` (2288). It writes UI state (`cp_ui`: active project/room/wall/view) to localStorage right away and debounces the project save by 1 second. Only the *active* project is upserted. Deleting a project calls Supabase directly (2541).

**Not saved anywhere:** the **markup %** and **tax %** inputs (1038–1040). They're page inputs read at quote time (`getMarkup`/`getTax`, 2402). Tax is re-filled from the project's state when a project opens, but markup resets to 0 on every reload. See §8.3.

### 2.3 Company data (`company_profiles`, keyed by `user_id`)

`app.html` reads only four fields: `subscription_tier`, `custom_styles`, `price_overrides`, `company_name`. `profile.html` edits the rest (logo, terms, contact info, price sheet).

---

## 3. Catalog, styles, pricing inputs

| What | Where | Notes |
|---|---|---|
| `CATALOG` | 2120 | 12 cabinet types: base, wall, tall, sink, vanity, drawerBase, cornerBase, lazysusan, filler3, filler6, fridgePanel, diagWall. Widths, heights, default depth, color, abbreviation. `basePrice` is **legacy and unused** (pricing comes only from the price sheet). |
| `APPLIANCES` | 2247 | 8 types: refrigerator, range, dishwasher, microwave (OTR), cooktop, hood, beverageCooler, floatingShelf. Priced per item by the user (`price` field). |
| `STYLES` | 2134 | **Owner-only Forevermark catalog, visible in page source.** |
| `DEFAULT_STYLES` | 2158 | White Shaker (WS), Grey Shaker (GS), Espresso (ES), Natural Wood (NW) |
| `OWNER_USER_IDS` / `getStyles()` | 2167–2175 | Company's `custom_styles` → else owners get `STYLES` → everyone else gets `DEFAULT_STYLES` |
| `DOOR_PROFILE` / `drawDoorPanel()` | 2186–2222 | Flat vs. raised panel and narrow vs. standard frame, **keyed by Forevermark codes**. Any other code draws as flat/standard. Used by the elevation only. |
| `STATE_TAX` | 2227 | Base state sales-tax rates, auto-filled into the tax box |

---

## 4. The three views

All three redraw completely from the data every time (nothing is cached). `renderAll()` (3169) redraws the floor plan, side list, cut list, and whichever of elevation/3D is showing. `setViewMode()` (2445) switches tabs and re-fits the view.

### 4.1 Floor plan: `renderCanvas()` (3640–4117)

- 2D `<canvas id="floor-plan">` at a fixed 6 px/inch (`CANVAS_SCALE`), with 68px padding. Zoom/pan is a CSS transform on the viewport (`vpState`, `applyVpTransform`, `fitView`, `zoomAt`: 1726–1976). Screen-pinned rulers: `drawViewportRulers()` (1823).
- The room is `max(north, south, 48)` wide and `max(east, west, 48)` deep. **Rooms are always drawn as a rectangle sized by the longer wall of each pair.** L rooms draw their polygon from `getLShapeData()` (2645) and hatch the cut corner.
- Each cabinet's rectangle is computed from `wall` + `offset` + depth by an `if north / south / west / east / step` block. **That same block is copy-pasted in at least four places:** `drawCabOnFloor`, `drawAppOnFloor`, the floor-plan hit test (6386), and 3D `cabPos` (4416). Plus mirrored logic in the elevation. This is what task 0.4 / Phase 2 has to consolidate.
- The toolbar "view" dropdown (`#view-sel`: all / base / wall) already filters layers.
- Extras drawn here: dimensions (`drawDimensions`, 5547), item hexagons (5502), measure tool (3473–3582), work triangle (5735), island clearance (3586).
- PDF capture re-renders with `window._pdfMode = true` and uses the old in-canvas `drawRuler()` (3415).

### 4.2 Elevation: `renderElevation()` (4685–5077)

- One wall at a time (`state.elevWall`), 5 px/inch (`ELEV_SCALE`). The wall length comes from `r.walls[wall]`, or 120 if missing.
- Draws cabinets with door/drawer panels via `drawDoorPanel`, appliances via the shared `drawApplianceFace()` (4598), openings, and corner cabinets from the adjacent wall "crossing over" at the edges (4901). East/west walls are mirrored so you're looking at them from inside the room.
- Dimension strings: `drawElevationDimensions()` (5590).

### 4.3 3D: `renderIsometric()` (4314–4597)

- Three.js scene created once (`initIso3D`, 4226). One ambient + one directional light, PCF soft shadows. Everything is rebuilt from scratch on each render (`disposeObject3D` cleans up).
- Walls: `buildWall3D()` (4175) extrudes each wall 3.5" thick, cutting openings as holes.
- **Which wall is hidden:** the first *empty* wall in the order south → west → east → north (4336). If every wall has something on it, **no wall is hidden**.
- **Camera** (`setIso3DCamera`, 4283): always placed at the room's south-west, up high, looking north-east. It doesn't look at where the walls are.
- **Cabinets:** one plain box per cabinet plus one flat inset "front panel" slab (`addFrontPanel`, 4466). Color = the project style's `swatch`. There are no rails/stiles, drawer fronts, hardware, countertop or toe kick, and **`styleOverride` is ignored in 3D.**
- **Appliances:** boxes with the elevation's front face painted on as a texture (`applianceMaterials`, 4555).
- **Islands:** plain boxes.

### 4.4 Interaction that already exists

The Build Plan assumed some of this was missing:

| Feature | Where | State today |
|---|---|---|
| Drag a cabinet/appliance along its wall (floor plan) | IIFE at 6377–6653 | Works, snaps to **3"**, shows "N" from left". **No collision check, no stop at the wall end**, no snap to neighbors. |
| Drag in elevation | IIFE at 6895–7099 | Same idea on the elevation canvas |
| Drag islands with live clearance readout | 6528–6541 | Green ≥ 36", amber ≥ 24", red below |
| Double-click to edit (cabinet / appliance / island modals) | 6479, 3047, 2988, 2956 | Works in floor plan |
| Touch: pan, drag, double-tap | 6566+, 7027+ | Phone/tablet |
| Room templates | `ROOM_TEMPLATES` 5822 | 6 templates, but they **only prefill room dimensions**. No starter cabinets. |
| L-shaped rooms | `getLShapeData` 2645, room-shape modal 2707 | One notched corner, adds two inner walls (`step1`/`step2`) |
| Layer filter, dimensions toggle, item numbers toggle, measure, work triangle, cut list | toolbar | Present |
| Guided tour, FAQ | 7238, 7315 | Present |
| Phone mode (bottom nav, phone quote panel) | 7103–7183 | Present |

---

## 5. How the quote is computed

**Per cabinet: `cabinetPrice(cab)` (2409).**
1. Look up `companyProfile.price_overrides[cab.type]`.
2. If it's a price-sheet table, find the size key (`"36"`, or `"30x42"` for wall/tall) and then the finish code (`cab.styleOverride` or the project's `style`).
3. If it's a plain number (legacy), price = number × width.
4. **No match → `null` = "No price set".** There's never a guessed price.
5. Glass doors on wall cabinets add 58%.
6. Multiply by `(1 + markup%)`.

**Totals.** There are three places that add things up, and they **don't agree**:

| Function | Cabinets | Appliances | Job costs | Trim | Tax |
|---|---|---|---|---|---|
| `renderSummary(r)` (5081), the side-panel summary for **one room** | ✓ | listed, **not priced** | — | — | ✓ |
| `refreshQuoteTotals()` (5232), the quote-modal preview, all rooms | ✓ | **✗ missing** | ✓ | ✓ | ✓ |
| `printQuote()` (5266), the printed quote | ✓ | ✓ (`appSubtotal`, 5305) | ✓ | ✓ | ✓ |

Tax applies to everything before tax (cabinets + appliances + job costs + trim). `exportPDF()` (6046) has its own quote page (6232+), which is a fourth copy of the math to keep in sync.

**Quote locking and revisions** (`printQuote`, 5326–5470):
- **Gold only:** the first print asks "Mark this quote as sent?". If yes, it sets `quoteLocked` and `lockedQuote` (revision 1). Silver accounts never lock a quote, so the "no quote sent yet" warning in `setProjectStatus()` (6681) **appears for every Silver job** moved to Ordered/Installing/Complete, even ones with a printed quote.
- On Gold, once locked, **every later print adds a `quoteHistory` entry and an activity-log line, even if nothing changed** (Build Plan 0.2 #2).
- Quote number is `CD-` + time-based code, regenerated on every print.

---

## 6. Tier gating and accounts

| Mechanism | Where | What it does |
|---|---|---|
| `IS_DEMO` / `demoGate()` | 1980–1986 | `?demo=1` → no login, browser-only saving. `demoGate()` blocks quote/PDF actions with an upgrade modal. |
| `body.demo-mode` CSS | 332–339, 684 | Hides pricing, PDF, print buttons in demo |
| `currentTier()` / `canAccess(tier)` | 6813–6816 | Reads `companyProfile.subscription_tier` (free < silver < gold) |
| `applyTierGates()` | 6826 | Free: adds `free-tier` + `pricing-locked` body classes, dims the PDF button, **hides the status pill** |
| Inline checks | `printQuote` (Silver), quote versioning (Gold), `syncActiveProject` (Silver for cloud) | 12 `canAccess` calls total |
| Team context | `resolveTeamContext()` 6776 | Team members act as the owner (`effectiveOwnerId`), and their projects/profile/pricing belong to the owner |
| Owner accounts | `OWNER_USER_IDS` 2167 and `stripe-webhook.js` | Dan + sister: permanent Gold, see real `STYLES` |

Where the tier comes from: `stripe-webhook.js` writes `subscription_tier` using the server key. **But all gating in `app.html` is enforced in the browser**, and `profile.html` also upserts the user's own `company_profiles` row (1878, 2204). See §8.2.

**Boot sequence** (7204–7229): demo → `showApp` + `loadProjectsFromLocal`. Otherwise it gets the Supabase session, then `showApp` → `resolveTeamContext` → `loadProjects` + `loadCompanyProfile` → `openProjectFromUrl` → `maybeStartTour`. No session → login screen.

---

## 7. Global state and major functions (index)

**Global state**

| Name | Line | Holds |
|---|---|---|
| `db`, `currentUser`, `pendingAuthType` | 1719–1721 | Supabase client, signed-in user, invite/recovery flag |
| `vpState`, `vpGeom`, `vpCursor` | 1729–1738 | Zoom/pan per viewport |
| `IS_DEMO` | 1980 | Demo flag |
| `state` | 2267 | `projects[]`, `activeProjectId`, `activeRoomId`, `activeWall`, `elevWall`, `viewMode`, `activeOpeningType` |
| `showDimensions`, `showItemNumbers`, `showWorkTriangle` | 2263–2265 | Toggles (not saved) |
| `saveTimer` | 2280 | Save debounce |
| `measureState` | 3473 | Measure tool |
| `iso3D` | 4121 | Three.js renderer/scene/camera/controls |
| `effectiveOwnerId`, `myTeamRole` | 6774–6775 | Team context |
| `companyProfile` | 6808 | Company row incl. tier and price sheet |

**Functions by area**

| Area | Lines | Main functions |
|---|---|---|
| Zoom / pan / rulers | 1742–1976 | `fitView`, `zoomAt`, `stepZoom`, `wheelZoomFactor`, `drawViewportRulers` |
| Auth | 1991–2116 | `handleSignIn`, `handleForgotPassword`, `handleSignOut`, `showApp`, `showLogin` |
| Persistence | 2280–2376 | `persist`, `syncActiveProject`, `loadProjectsFromLocal`, `loadProjects` |
| Helpers / pricing | 2393–2431 | `activeProj`, `activeRoom`, `fmtIn`, `fmtMoney`, `getMarkup`, `getTax`, `cabinetPrice` |
| Projects | 2463–2583 | `createProject`, `saveEditProject`, `deleteProject`, `renameProject` |
| Rooms / L-shape | 2588–2740 | `addRoom`, `deleteRoom`, `switchRoom`, `getLShapeData`, `saveRoomShape`, `renderWallButtons` |
| Openings | 2773–2792 | `addOpening`, `removeOpening` |
| Cabinets / appliances / islands | 2797–3150 | `onTypeChange`, `addCabinet`, `addAppliance`, `addIsland`, edit modals (`openEditModal` 3047, `saveEditModal` 3114, …) |
| Style panel | 3174–3228 | `buildStylePanel`, `selectStyle` |
| Sidebar / project view | 3232–3411 | `renderSidebar`, `openProject`, `renderProjectView`, `renderRoomTabs`, `renderCabinetList` |
| Floor plan | 3415–4117 | `renderCanvas`, `drawMeasurements`, `calcIslandClearance` |
| 3D | 4121–4669 | `initIso3D`, `setIso3DCamera`, `renderIsometric`, `buildWall3D`, `drawApplianceFace` |
| Elevation | 4676–5077 | `ensureItemNumbers`, `renderElevation` |
| Summary / quote | 5081–5483 | `renderSummary`, `openQuoteModal`, job-cost/trim rows, `refreshQuoteTotals`, `printQuote` |
| Dimensions / item tags | 5487–5640 | `drawItemHexagon`, `drawDimensions`, `drawElevationDimensions` |
| Cut list / work triangle | 5661–5818 | `renderCutList`, `drawWorkTriangle` |
| Templates | 5822–5873 | `openRoomTemplates`, `applyTemplate` |
| PDF | 5877–6373 | `printFloorPlan`, `exportPDF` (jsPDF loaded on demand) |
| Floor-plan mouse/touch | 6377–6653 | Drag, dblclick edit, pan (self-contained IIFE) |
| Project management | 6657–6765 | `setProjectStatus`, `openActivityLog`, `addActivityNote` |
| Team / tiers | 6776–6850 | `resolveTeamContext`, `canAccess`, `loadCompanyProfile`, `applyTierGates` |
| Elevation mouse/touch | 6895–7099 | Drag, edit, pan (IIFE) |
| Phone mode | 7103–7183 | `phoneTab`, `renderPhoneQuote` |
| Boot / tour / contact / leads | 7186–7419 | Boot IIFE, `startTour`, `submitContact`, `submitProLead` |

---

## 8. Things found while mapping (not fixed, need Dan's call)

These go beyond the Build Plan's lists. The first two matter most.

### 8.1 ✅ FIXED in 0.2: Logged-in Free users lost their projects on reload
Free accounts **save** to browser storage (2305), but at login the app **loads** from Supabase (7220 → `loadProjects`), which has nothing for them. The projects are still in the browser, but the app never reads them back. A free signup who designs a kitchen, closes the tab, and logs in again would see an empty sidebar. This hurts the funnel exactly where it matters. **Needs a live test with a free test account to confirm** before fixing. The likely fix is a one-line load choice matching the save choice, plus a one-time "copy to cloud" when a user upgrades.

### 8.2 ⚠ Can a user make themselves Gold? (guard written in 0.2: `supabase-protect-billing-columns.sql`, Dan to run)
All paid features are checked in the browser against `company_profiles.subscription_tier`, and users can write their own `company_profiles` row (profile.html 1878). If the Supabase policy on that table lets users update *any* column of their own row, someone could set `subscription_tier = 'gold'` from the browser console. **Check in the Supabase dashboard:** column-level protection or a trigger that blocks client changes to `subscription_tier` (the webhook uses the server key, so it's unaffected). The SQL for this table isn't in the repo.

### 8.3 Quote numbers can disagree
- The quote-modal preview leaves out appliances, but the printed quote includes them (§5).
- Markup % isn't saved, so it resets to 0 after reload. A reprinted quote can come out at a different total from the one the customer saw.
- There are four copies of the totals math (summary, preview, print, PDF).

### 8.4 New projects default to style code `'AW'` (a Forevermark code) for every account
`createProject` (2499) and the Supabase save (2316) default `style` to `'AW'`. For non-owner accounts `'AW'` isn't in their styles, so the UI falls back to the first style for display, but **price lookups still use `'AW'`**. A company with its own price sheet may see "No price set" everywhere until they pick a style. It's also a Forevermark code stored on their data.

### 8.5 Build Plan 0.3: demo issues, reproduced locally 2026-09-24 (demo mode, 1280px)
| # | Issue | Reproduced? | Cause |
|---|---|---|---|
| 1 | Blank East/West → 48"-deep room | ✅ Fields are empty with grey placeholders "120/120/96/96". Saved walls `east:0, west:0`, drawn as 120" × **48"** | Blank → `0` (`createProject`), and every renderer uses `max(east, west, 48)` |
| 2 | Can't edit room size after creation | ✅ Edit Project modal has no dimension or ceiling fields | Room-shape modal only edits the L cut |
| 3 | "From left" doesn't advance | ✅ Stays at 0 after adding. **Worse:** B36 then B24 both saved at offset 0, **stacked on top of each other with no warning** | `addCabinet` resets the box to `0`, and there's no overlap check |
| 4 | Upper with no height ≈ 12" | ✅ Height select is blank, saved height **12** | Falls back to `CATALOG.wall.heights[0]` = 12 |
| 5 | "Shared demo account" | ❌ Not shared. Browser-local storage (see Build Plan 0.3 #5) | — |
| 6 | Banner overlaps header | ✅ At 1280px the 34px banner covers Floor Plan / Elevation / 3D View tabs, Lead pill, Log, Edit, Tips | `position:fixed` banner, nothing pushes the layout down |
| 7a | 3D camera behind a wall | ✅ by code: camera always at the SW corner; only an *empty* wall is hidden, so a job with cabinets on all four walls hides nothing | `setIso3DCamera`, open-wall pick in `renderIsometric` |
| 7b | Door style not visible in 3D | ✅ by code: one flat slab per cabinet in the style's color; no rails/stiles, drawers or hardware | `addFrontPanel` |

### 8.6 What this means for the Build Plan
- **Phase 2** starts from working drag + snap. It needs selection, collision, wall-end limits and neighbor snapping, not drag from scratch.
- **4.4 Room templates** already exist in name. What's missing is the starter cabinet layout.
- **4.2 Islands** exist as plain boxes. What's missing is cabinets on them, pricing, and seating overhangs.
- ✅ **0.4:** the copied `if north/south/east/west` blocks for floor plan drawing, click targeting, 3D placement and the work triangle now all go through `wallFrame(r, wall)` / `itemRect(r, item)`, next to `getLShapeData`. Still separate: elevation mirroring (`eX`), the 3D front-panel facing, and dimension-line placement.
- **The two-place save list (§2.2)** should become one serializer inside `migrateProject()` in 0.4.
