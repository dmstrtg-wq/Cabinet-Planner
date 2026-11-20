// 4.1a regression: a fingerprint of everything the planner computes or draws for the
// regression project. Run before and after a refactor; every section must match.
// Start from a freshly loaded page and don't zoom or pan the views first.
window.runRegression = async function (opts = {}) {
  eval(await (await fetch('/tools/regression/fixtures.js', { cache: 'reload' })).text());
  const fix = buildRegressionProject();
  const R3 = v => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
  const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'pts' || k === 'uuid' || k.startsWith('_') && k !== '_returnOf') ? undefined : R3(v)));
  const fnv = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const pix = cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let h = 2166136261; for (let i = 0; i < d.length; i += 3) { h ^= d[i]; h = Math.imul(h, 16777619); } return cv.width + 'x' + cv.height + ':' + (h >>> 0).toString(16); };
  // Put the fixture in as the open project (local demo storage only)
  if (location.hostname !== 'localhost') throw new Error('not local');
  state.projects = [JSON.parse(JSON.stringify(fix))];
  state.activeProjectId = fix.id;
  selectedItemId = null; placementGhost = null;   // nothing selected or being dragged
  // Stand-in prices for every catalog size (this test page only; never saved)
  const ov = {}; Object.entries(CATALOG).forEach(([t, c]) => { ov[t] = {}; c.widths.forEach(w => c.heights.forEach(h => {
    ov[t][PRICE_BY_HEIGHT.includes(t) ? `${w}x${h}` : `${w}`] = { [fix.style]: w * 10 + h }; })); });
  ['filler3', 'filler6'].forEach(t => { ov[t] = { [CATALOG[t].stock]: { [fix.style]: 20 } }; });
  companyProfile.price_overrides = ov; window.pricingAllowed = () => true;
  Object.keys(layers).forEach(k => { if (typeof layers[k] === 'boolean') layers[k] = true; });
  const out = {}, detail = {};
  const put = (key, val) => { const s = JSON.stringify(clean(val)); out[key] = fnv(s); detail[key] = s; };
  const p = activeProj();
  for (const r of p.rooms) {
    state.activeRoomId = r.id;
    const items = [...r.cabinets, ...(r.appliances || [])];
    put(r.name + '/rects', items.map(i => [i.id, itemRects(r, i), itemRect(r, i)]));
    put(r.name + '/place', items.map(i => [i.id, placementIssue(r, i)]));
    put(r.name + '/gaps', items.map(i => [i.id, itemSideGaps(r, i)]));
    put(r.name + '/open', cabinetWalls(r).map(w => [w, wallOpenSpans(r, w, LEVEL_BANDS.base), wallOpenSpans(r, w, LEVEL_BANDS.upper)]));
    put(r.name + '/counters', [counterRuns(r), endPanels(r), upperRuns(r), tallRuns(r), islandCounterRects(r)]);
    put(r.name + '/backsplash', counterRuns(r).map(run => backsplashPieces(r, { ...p, countertop: { backsplash: 'full' } }, run)));
    put(r.name + '/design', computeDesignIssues(r));
    put(r.name + '/clear', (r.islands || []).map(i => calcIslandClearance(i, r)));
    put(r.name + '/casing', r.cabinets.map(c => casingPieces(r, c).map(pc => casingRect(r, pc))));
    // Drawings
    setViewMode('floor'); showDimensions = false; renderCanvas(); out[r.name + '/plan.png'] = pix(document.getElementById('floor-plan'));
    showDimensions = true; renderCanvas(); out[r.name + '/plan-dims.png'] = pix(document.getElementById('floor-plan')); showDimensions = false;
    setViewMode('elevation');
    for (const w of cabinetWalls(r)) { state.elevWall = w; renderElevation(); out[r.name + '/elev-' + w.replace(/^isl:[^:]+/, 'isl') + '.png'] = pix(document.getElementById('elevation-plan')); }
    setViewMode('3d'); renderIsometric();
    const meshes = []; iso3D.root.updateMatrixWorld(true);
    iso3D.root.traverse(o => { if (o.isMesh) meshes.push([o.geometry.type, Object.values(o.geometry.parameters || {}).map(R3), o.matrixWorld.elements.map(v => Math.round(v * 100) / 100)]); });
    put(r.name + '/3d', meshes.map(m => JSON.stringify(clean(m))).sort());
  }
  put('quote', quoteTotals(p));
  put('order', buildOrderList(p));
  const cl = document.getElementById('cutlist-panel'), wasOpen = cl.classList.contains('cutlist-open');
  const cuts = [];   // the cut list draws only while its panel is open: open it, read each room, put it back
  if (!wasOpen) cl.classList.add('cutlist-open');
  for (const r of p.rooms) { state.activeRoomId = r.id; renderCutList(); cuts.push(cl.textContent); }
  if (!wasOpen) cl.classList.remove('cutlist-open');
  out['cutlist'] = fnv(cuts.join('\n')); detail['cutlist'] = cuts.join('\n');
  window._regDetail = detail;
  return opts.detail ? detail : out;
};
