# Room Model v2: rooms of any shape (Phase 4 design doc)

Status: **draft for Dan's approval** (2026-10-20). No Phase 4 code starts until this is approved.

## What Dan asked for

1. **Cut and bend walls:** start from the usual four walls and cut a corner at an angle (a 45° wall), or bend a wall, instead of being stuck with 90° corners.
2. **Draw walls directly:** set a mark, drag to make a wall, and set its length, then the next wall, and so on.
3. **Open floor plans:** a room can have only 1, 2 or 3 real walls, and the rest is open to the house.
4. From the first reference (docs/room-references/01): a run that turns 45° (sink on the angle) and then becomes a **peninsula** that ends in the room with a dishwasher end panel.

## Where the code stands today (why this is not a full rewrite)

- Every cabinet already says which wall it is on plus how far along it sits (`wall` + `offset`). Since Phase 0, every view finds a wall through one function: `wallFrame(r, wall)` (start point, direction, which way is into the room, length). Floor plan, 3D, elevations, countertops, gaps, snapping, Design Check, the quote and the order list all go through it.
- Island sides (built 2026-10-20) proved the approach: they are walls with their own ids (`isl:<id>:s`), and everything worked once `wallFrame` knew about them.
- **The real work:** several places assume a cabinet's footprint is a box lined up with the room (`itemRect` returns x/y/width/height). On an angled wall the footprint is a rotated box. That assumption has to be replaced first, everywhere, before any angled wall can exist.

## The new room data

```
room.outline = {
  corners: [ { id, x, y }, … ]          // in order around the room, inches
  walls:   [ { id, from, to,              // corner ids; the wall runs from → to
               kind: 'full' | 'half' | 'open',
               height?,                   // half walls (pony walls, a counter-height wall)
               name? } ]                  // Dan's/the user's own name, optional
}
```

- A wall's id never changes, so cabinets stay on it when corners move.
- `kind: 'open'` is the open floor plan: no wall drawn in the plan, 3D or elevation background; the edge shows as a dashed line marked "Open". Cabinets can still run along an open edge (that is how a kitchen faces a living room).
- `kind: 'half'`: a short wall with its own height (a breakfast-bar wall, a half wall with a column). Uppers aren't allowed on it.
- The room's outline is always closed (it may be all open on one side), so "inside the room" stays well defined for clearances and 3D.

**Free runs (peninsulas and bent runs):** `room.runs = [ { id, points: [[x,y], …], attachedTo?: wallId } ]`. Each straight piece of a free run is a wall-like segment with its own id (`run:<id>:<n>`) and a front side; a peninsula can take cabinets on both sides like an island. Islands get a `rotation` (0° today) so they can sit at an angle too.

## How a room gets its shape (the editor)

All of these work on one room in the Floor Plan with a "Edit room shape" mode:

1. **Start from a shape:** rectangle, L, U, or "draw it" (same new-room picker as today, plus "Draw your own").
2. **Draw mode:** click to set a corner, drag to stretch the next wall (live length shown), click to place the next corner. Lengths snap to whole inches; angles snap to 90° and 45° (hold a key to turn snapping off). Type a length to set it exactly. Click the first corner to close the room.
3. **Cut a corner:** pick a corner and choose "Cut corner": enter how far back on each wall (for example 24" and 24" for a 45° wall). The corner becomes a short angled wall.
4. **Bend or split a wall:** add a corner in the middle of a wall and drag it out.
5. **Drag a corner** to move it; the two walls on either side follow and keep their cabinets (pieces that no longer fit get the red outline, never deleted, same as today).
6. **Wall type:** click a wall and set Full wall / Half wall (height) / Open.
7. **Lengths and angles are editable as numbers** in a small panel for whichever wall is selected.

## Names and elevations

- Each real wall (and each free-run piece with cabinets) gets its own elevation tab.
- Default names come from which way the wall faces, so they stay familiar: North, East, South, West; angled walls get "Northeast", "Southwest" and so on; duplicates get numbers ("North 2"). The user can rename any wall ("Range wall", "Window wall").
- Open edges get an elevation only when cabinets are on them.

## Drawing and math on angled walls

- **Footprints:** `itemRect` is replaced by `itemQuad` (the four corners of the rotated footprint). A bounding-box helper stays for the cases that only need a rough box. Overlap checks use rotated-box overlap.
- **Floor plan:** cabinets on an angled wall are drawn rotated; labels stay upright.
- **3D:** already rotates fronts by the wall direction; boxes become rotated boxes.
- **Elevation:** each wall is drawn flat, as if you stand facing it; nothing changes for the user.
- **Countertops:** each run's top is a strip along its wall; where two strips meet at an angle they are mitered (cut on the angle) so the top follows the turn. Square footage uses the real polygon area.
- **Where an angled run meets a straight one** (the SB36 in the reference): the planner adds the wedge filler on each side automatically, like it handles corner cabinets today, and they go on the order list.
- **Design Check:** aisle and clearance measurements are made along the real directions; the rules stay the same.

## Turning existing projects into the new model (no data loss)

- Projects get `schemaVersion: 3` (today's projects are 2).
- `migrateProject()` turns every rectangle and L-shaped room into an outline whose wall ids are the old names (`north`, `east`, `south`, `west`, `step1`, `step2`). Cabinets, openings and islands don't move or change; island sides keep their `isl:` ids.
- The original room data is kept on the project (`room._v2backup`) until Dan says it can go, so any project can be put back exactly as it was.
- A check runs on every migrated project: the floor plan, quote total, order list and cut list must come out identical before and after. If anything differs, that project stays on the old model and is reported.

## Build order (each step is pushed and tested before the next)

| Step | What | What you see |
|---|---|---|
| 4.1a | Replace the box-shaped footprints with rotated ones everywhere | Nothing changes; every view and the quote must match exactly |
| 4.1b | New room data + migration, on your account only (a switch) | Your projects look the same |
| 4.1c | Room editor: cut corner, split/drag corners, wall types (full, half, open), numeric lengths | Odd-shaped and open rooms |
| 4.1d | Cabinets on angled walls: plan, 3D, elevation, mitered tops, wedge fillers, Design Check | The reference kitchen's 45° sink |
| 4.1e | Draw mode (click and drag walls from scratch) | "Draw your own" room |
| 4.2 | Peninsulas and bent free runs; rotated islands | The reference's peninsula with the DWP panel |
| 4.3 | Several rooms on one connected floor plan (later) | Kitchen + open living room as one plan |

## Risks and how they're handled

- **The box assumption is spread across about a dozen files** (plan drawing, overlap, gaps, counters, Design Check, 3D). Step 4.1a does only this, with no new features, and is checked by comparing the demo kitchen and your saved projects before and after (floor plan image, quote total, order list, Design Check results).
- **Existing customers' projects:** nothing changes for anyone else until step 4.1d is tested on your account. The switch can be turned off at any time, and the backups make every migrated project reversible.
- **The phone layout:** drawing on a phone is hard; on phones the editor offers the shape picker, cut corner and numeric lengths, and full draw mode stays desktop and tablet.

## Questions for Dan

1. Roll it out behind a switch on your account first, then Sam's, then everyone? (Recommended.)
2. Wall names: facing-direction names (North, Northeast…) that can be renamed, or letters (Wall A, B, C)?
3. Is the build order right, or should the peninsula (4.2) come before draw mode (4.1e), since the reference kitchen needs it?
