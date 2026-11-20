# Phase 4 regression check

Proves a refactor changed nothing: a fingerprint of everything the planner computes or
draws for a fixed test project (5 rooms: the demo kitchen with island cabinets, seating,
bump-outs and end panels; an L-shaped kitchen with corner units and inner walls; the bath,
living and hall starter layouts).

Covers, per room: footprints, placement checks, gaps and open space, countertop/end panel/
crown runs, backsplash, Design Check, island clearance, casing, the floor plan (with and
without dimensions), every elevation (walls and island sides), and the 3D scene; plus the
quote totals (stand-in prices, in memory only), order list and cut list.

Run on the LOCAL preview only (`?demo=1`, never the live site), in the browser console:

```js
eval(await (await fetch('/tools/regression/harness.js', { cache: 'reload' })).text());
const base = await (await fetch('/tools/regression/baseline.json', { cache: 'reload' })).json();
await runRegression();                       // the first run after a page load warms up fonts; ignore it
const now = await runRegression();
Object.keys(base).filter(k => base[k] !== now[k]);   // [] = identical
```

`baseline.json` was recorded on 2026-10-22 from the code before step 4.1a (the cut-list entry re-recorded on 2026-11-20 from that same code, git 3297ae0, after the check was fixed to read the cut list itself). Keep the same
browser window size between runs (the canvases are sized to it). If a later step changes
output on purpose, record a new baseline and say why in the commit.
