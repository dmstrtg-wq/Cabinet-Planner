// My Cabinet Planner — js/counters.js
// Countertops, toe kicks, finished end panels, crown and light rail (Build Plan 3.2).
// Everything here is worked out from the cabinets — nothing to place by hand:
//   • a countertop over every base run (1.5" thick, 1" front overhang), continuous across
//     the run, stopping at the range, cut for the sink, trimmed where two runs meet in a
//     corner, with 1" side overhang past an exposed end; islands get one too
//   • finished end panels wherever a run ends in open space
//   • optional crown molding and light rail along the upper runs
// Countertop material + trim choices live on the project (p.countertop), along with the
// linear/square footage so it can become a quote line later (no pricing yet).
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// SETTINGS
// ════════════════════════════
const COUNTER_MATERIALS = {
  quartz:   { label: 'Quartz',        base: '#ece9e3', specks: ['#d6d0c6', '#ffffff', '#c4bdb1'], density: 0.12 },
  granite:  { label: 'Granite',       base: '#6a645d', specks: ['#2f2b28', '#958c81', '#c2b9ad', '#1f1c1a'], density: 0.55 },
  butcher:  { label: 'Butcher block', base: '#b98a55', strips: true },
  laminate: { label: 'Laminate',      base: '#d6d2ca' },
};
const COUNTER_T = 1.5, COUNTER_FRONT = 1, COUNTER_SIDE = 1, END_PANEL_T = 0.75, TOE_RECESS = 3;
const CROWN_H = 3, CROWN_PROJ = 2, LIGHT_RAIL_H = 1.5;

function projectCounter(p) {
  return { material: 'quartz', crown: false, lightRail: false, backsplash: 'none', ...((p && p.countertop) || {}) };
}

// ════════════════════════════
// WHAT GETS A COUNTERTOP / TOE KICK
// ════════════════════════════
const COUNTER_CAB_TYPES = ['base', 'sink', 'drawerBase', 'mwDrawerBase', 'cornerBase', 'lazysusan', 'vanity'];
const UNDER_COUNTER_APPS = ['dishwasher', 'beverageCooler', 'cooktop'];   // the range breaks the counter instead
function isFloorFiller(i) { if (!isFiller(i.type)) return false; const [b, t] = itemVerticalRange(i); return b < 0.01 && t <= 37; }
function coversCounter(i) {
  if (CATALOG[i.type]) return COUNTER_CAB_TYPES.includes(i.type) || isFloorFiller(i);
  return UNDER_COUNTER_APPS.includes(i.type);
}
const TALL_TYPES = ['tall', 'ovenTall', 'linenTall'];
// Vanity tops get their bowls (7.4): one centred, or two for a double vanity — as sink-sized spots
function vanityBowls(v) {
  const a = v.offset || 0, w = v.width;
  if (v.sinks === 2 && w >= 47.9) { const half = w / 2; return [{ offset: a + half / 2 - 11, width: 22 }, { offset: a + half + half / 2 - 11, width: 22 }]; }
  return [{ offset: a + w / 2 - 11, width: 22 }];
}
function hasToeKick(cab) { return COUNTER_CAB_TYPES.includes(cab.type) || TALL_TYPES.includes(cab.type) || isFloorFiller(cab); }
function roomWalls(r) { return ['north', 'south', 'east', 'west', ...(getLShapeData(r) ? ['step1', 'step2'] : [])]; }

// ════════════════════════════
// RUNS
// ════════════════════════════
// Contiguous stretches on a wall (pieces closer than 1/4" count as touching)
function groupRuns(items) {
  const runs = []; let cur = null;
  items.slice().sort((a, b) => (a.offset || 0) - (b.offset || 0)).forEach(i => {
    const a = i.offset || 0, b = a + i.width;
    if (cur && a <= cur.b + 0.25) { cur.b = Math.max(cur.b, b); cur.items.push(i); }
    else { cur = { a, b, items: [i] }; runs.push(cur); }
  });
  return runs;
}
// Is each end of [a,b] out in the open? Not if it's within 2" of the wall's end, or of
// anything else at that height (a cabinet, tall, appliance, door, or the next wall's run).
function runEndsFree(r, wall, band, a, b, ownIds) {
  const len = wallLength(r, wall);
  const obs = wallObstacles(r, wall, band).filter(([x, y]) => !(x >= a - 0.01 && y <= b + 0.01));
  const startFree = a > 2 && !obs.some(([x, y]) => y > a - 2 && x < a + 0.01);
  const endFree = b < len - 2 && !obs.some(([x, y]) => x < b + 2 && y > b - 0.01);
  return { startFree, endFree };
}
// Plan-view rectangle (room inches) for a stretch [a,b] along a wall, `depth` deep
function wallStripRect(r, wall, a, b, depth) {
  const f = wallFrame(r, wall); if (!f) return null;
  const P = (t, d) => [f.start[0] + f.dir[0] * t + f.inward[0] * d, f.start[1] + f.dir[1] * t + f.inward[1] * d];
  const pts = [P(a, 0), P(b, 0), P(a, depth), P(b, depth)];
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// Countertop runs for a room → [{ wall, a, b, depth, top, sinks, startFree, endFree, rect }]
function counterRuns(r) {
  const out = [];
  roomWalls(r).forEach(wall => {
    groupRuns(wallItemsWithReturns(r, wall).filter(coversCounter)).forEach(run => {   // incl. a corner LS's other leg
      const cabs = run.items.filter(i => CATALOG[i.type]);
      const depth = Math.max(...run.items.map(i => (CATALOG[i.type] ? (i.depth || CATALOG[i.type].depth) : 24) + (i.wallOffset || 0)));   // a bumped-out base pushes the top out too
      const top = cabs.length ? Math.max(...cabs.map(i => itemVerticalRange(i)[1])) : 34.5;
      const ends = runEndsFree(r, wall, [0, top], run.a, run.b);
      const a = run.a - (ends.startFree ? END_PANEL_T + COUNTER_SIDE : 0), b = run.b + (ends.endFree ? END_PANEL_T + COUNTER_SIDE : 0);
      out.push({ wall, a, b, fullA: a, fullB: b,   // fullA/B: before corner trimming (elevations see the corner piece end-on)
        depth: depth + COUNTER_FRONT, top, sinks: run.items.filter(i => i.type === 'sink').concat(run.items.filter(i => i.type === 'vanity').flatMap(vanityBowls)), ...ends, cabA: run.a, cabB: run.b });
    });
  });
  // Corners: two runs overlap where they meet. The longer run keeps the corner; the
  // shorter one is trimmed back to the longer one's front edge.
  out.sort((x, y) => (y.b - y.a) - (x.b - x.a));
  const kept = [];
  out.forEach(run => {
    kept.forEach(k => {
      const A = wallStripRect(r, run.wall, run.a, run.b, run.depth), K = k.rect;
      if (!A || !K || !(A.x < K.x + K.w - 0.01 && K.x < A.x + A.w - 0.01 && A.y < K.y + K.h - 0.01 && K.y < A.y + A.h - 0.01)) return;
      const f = wallFrame(r, run.wall);
      const along = [[K.x, K.y], [K.x + K.w, K.y + K.h]].map(([x, y]) => (x - f.start[0]) * f.dir[0] + (y - f.start[1]) * f.dir[1]);
      const oa = Math.min(...along), ob = Math.max(...along);
      if (oa <= run.a + 0.01) run.a = Math.max(run.a, ob); else if (ob >= run.b - 0.01) run.b = Math.min(run.b, oa);
    });
    if (run.b - run.a > 0.5) { run.rect = wallStripRect(r, run.wall, run.a, run.b, run.depth); kept.push(run); }
  });
  return kept;
}
function islandCounterRects(r) {
  return (r.islands || []).map(i => ({ x: i.x - COUNTER_SIDE, y: i.y - COUNTER_SIDE, w: i.width + 2 * COUNTER_SIDE, h: i.depth + 2 * COUNTER_SIDE, top: 34.5 }));
}

// Upper runs (wall cabinets + upper fillers, same top height) for end panels and trim
function upperRuns(r) {
  const out = [];
  roomWalls(r).forEach(wall => {
    const uppers = wallItemsWithReturns(r, wall).filter(i => CATALOG[i.type] && itemLevel(i) === 'upper' && i.type !== 'fridgePanel');
    // grouped by top height and by how far the fronts stand out (a bumped-out upper gets its own crown run)
    const byTop = new Map();
    uppers.forEach(i => { const k = itemVerticalRange(i)[1] + '|' + ((i.depth || 12) + (i.wallOffset || 0)); (byTop.get(k) || byTop.set(k, []).get(k)).push(i); });
    byTop.forEach((items, key) => groupRuns(items).forEach(run => {
      const top = parseFloat(key);
      const bottom = Math.min(...run.items.map(i => itemVerticalRange(i)[0]));
      const depth = Math.max(...run.items.map(i => (i.depth || 12) + (i.wallOffset || 0)));
      out.push({ wall, a: run.a, b: run.b, top, bottom, depth, ...runEndsFree(r, wall, [bottom, top], run.a, run.b) });
    }));
  });
  return out;
}
// Base-height runs that aren't countertop runs' business (tall cabinets) also get end panels
function tallRuns(r) {
  const out = [];
  roomWalls(r).forEach(wall => groupRuns(wallItems(r, wall).filter(i => TALL_TYPES.includes(i.type))).forEach(run => {
    const top = Math.max(...run.items.map(i => i.height));
    out.push({ wall, a: run.a, b: run.b, top, bottom: 0, depth: Math.max(...run.items.map(i => (i.depth || 24) + (i.wallOffset || 0))), ...runEndsFree(r, wall, [0, top], run.a, run.b) });
  }));
  return out;
}
// Every finished end panel in the room → [{ wall, a, b, bottom, top, depth }]
function endPanels(r) {
  const panels = [];
  const add = (run, bottom, top, depth) => {
    if (run.startFree) panels.push({ wall: run.wall, a: (run.cabA ?? run.a) - END_PANEL_T, b: run.cabA ?? run.a, bottom, top, depth });
    if (run.endFree)   panels.push({ wall: run.wall, a: run.cabB ?? run.b, b: (run.cabB ?? run.b) + END_PANEL_T, bottom, top, depth });
  };
  counterRuns(r).forEach(run => add(run, 0, run.top, run.depth - COUNTER_FRONT + FRONT_T));
  upperRuns(r).forEach(run => add(run, run.bottom, run.top, run.depth + FRONT_T));
  tallRuns(r).forEach(run => add(run, 0, run.top, run.depth + FRONT_T));
  return panels;
}

// Linear and square footage, saved on the project for a future quote line
function updateCountertopStats(p) {
  if (!p || !Array.isArray(p.rooms)) return;
  let inches = 0, sqIn = 0;
  p.rooms.forEach(r => {
    counterRuns(r).forEach(run => { inches += run.b - run.a; sqIn += (run.b - run.a) * run.depth; });
    islandCounterRects(r).forEach(c => { inches += c.w; sqIn += c.w * c.h; });
  });
  p.countertop = { ...projectCounter(p), linearFt: Math.round(inches / 12 * 10) / 10, sqFt: Math.round(sqIn / 144 * 10) / 10 };
}

// ════════════════════════════
// BACKSPLASH (Build Plan 3.5)
// ════════════════════════════
// 4": a strip of the countertop material. Full: tile from the counter up to the underside
// of the uppers (18" where there are none), stopping at a window sill.
const BACKSPLASH_4 = 4, BACKSPLASH_FULL = 18;
// → [{ a, b, y0, y1 }] pieces along `wall` for one countertop run, in inches
function backsplashPieces(r, p, run) {
  const kind = projectCounter(p).backsplash;
  if (kind !== '4in' && kind !== 'full') return [];
  const y0 = run.top + COUNTER_T;
  const a = run.cabA ?? run.a, b = run.cabB ?? run.b;   // along the cabinets (not the countertop's end overhang)
  if (kind === '4in') return [{ a, b, y0, y1: y0 + BACKSPLASH_4 }];
  // Things that cap the tile: the bottom of an upper (or hood/microwave) above, a window sill
  const caps = [];
  wallItems(r, run.wall).forEach(i => {
    const [bot] = itemVerticalRange(i);
    if (bot > y0 + 0.5 && bot < y0 + BACKSPLASH_FULL + 30 && (itemLevel(i) === 'upper' || i.type === 'tall' || i.type === 'ovenTall'))
      caps.push({ a: i.offset || 0, b: (i.offset || 0) + i.width, top: bot });
  });
  (r.openings || []).filter(o => o.wall === run.wall && o.type === 'window').forEach(o => {
    caps.push({ a: o.offset, b: o.offset + o.width, top: Math.max(y0, o.sillHeight ?? 36) });
  });
  const cuts = [...new Set([a, b, ...caps.flatMap(c => [c.a, c.b])].filter(t => t >= a && t <= b))].sort((m, n) => m - n);
  const out = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const m = (cuts[k] + cuts[k + 1]) / 2;
    const over = caps.filter(c => c.a < m && m < c.b).map(c => c.top);
    const top = over.length ? Math.min(...over) : y0 + BACKSPLASH_FULL;
    if (top - y0 > 0.25) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.y1 - top) < 0.01 && Math.abs(last.b - cuts[k]) < 0.01) last.b = cuts[k + 1];
      else out.push({ a: cuts[k], b: cuts[k + 1], y0, y1: top });
    }
  }
  return out;
}
let _tileTex = null;
function tileTexture() {
  if (_tileTex && _tileTex.image) return _tileTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;   // 2 rows of 3×6 subway tile, 6"×3"
  const x = c.getContext('2d');
  x.fillStyle = '#c9c5bd'; x.fillRect(0, 0, 128, 64);                         // grout
  x.fillStyle = '#f3f1ec';
  for (let row = 0; row < 2; row++) for (let col = -1; col < 3; col++) {
    const ox = col * 64 + (row % 2 ? 32 : 0);
    x.fillRect(ox + 1.5, row * 32 + 1.5, 61, 29);
  }
  _tileTex = new THREE.CanvasTexture(c); _tileTex.wrapS = _tileTex.wrapT = THREE.RepeatWrapping;
  return _tileTex;
}

// ════════════════════════════
// 3D
// ════════════════════════════
const _counterTex = {};
function counterTexture(key) {
  if (_counterTex[key] && _counterTex[key].image) return _counterTex[key];
  const m = COUNTER_MATERIALS[key] || COUNTER_MATERIALS.quartz;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = m.base; x.fillRect(0, 0, 128, 128);
  if (m.specks) {
    for (let i = 0; i < 128 * 128 * m.density / 6; i++) {
      x.fillStyle = m.specks[i % m.specks.length]; x.globalAlpha = 0.35 + Math.random() * 0.5;
      x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6);
    }
    x.globalAlpha = 1;
  }
  if (m.strips) {
    for (let s = 0; s < 128; s += 16) {          // glued-up strips, alternating tone, with grain
      x.fillStyle = `rgba(${s % 32 ? '120,80,40' : '255,235,200'},0.12)`; x.fillRect(0, s, 128, 16);
      x.fillStyle = 'rgba(80,50,20,0.25)'; x.fillRect(0, s, 128, 0.7);
      for (let g = 0; g < 6; g++) { x.fillStyle = 'rgba(90,60,30,0.08)'; x.fillRect(0, s + 2 + g * 2.3, 128, 0.6); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (_counterTex[key] = t);
}
function _box3D(group, mat, x, y, z, w, h, d, opts = {}) {
  if (w <= 0.01 || h <= 0.01 || d <= 0.01) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x + w / 2, y + h / 2, z + d / 2);
  m.castShadow = opts.cast !== false; m.receiveShadow = true;
  group.add(m); return m;
}
// Countertops, sink bowls, end panels, crown and light rail for a room
function buildCountersAndTrim3D(r, p) {
  const g = new THREE.Group();
  const ct = projectCounter(p);
  const tex = counterTexture(ct.material);
  const counterMat = (w, d) => {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, w / 24), Math.max(1, d / 24));
    return new THREE.MeshStandardMaterial({ map: t, roughness: ct.material === 'butcher' ? 0.75 : ct.material === 'laminate' ? 0.6 : 0.3, metalness: 0.02 });
  };
  const show = layers.bases;
  if (show) {
    counterRuns(r).forEach(run => {
      const R = run.rect; if (!R) return;
      _box3D(g, counterMat(R.w, R.h), R.x, run.top, R.y, R.w, COUNTER_T, R.h);
      // Sink: an undermount bowl cut into the top
      run.sinks.forEach(s => {
        const bw = Math.min(30, s.width - 6); if (bw < 8) return;
        // bowl sits 4"–20" out from the wall
        const f = wallFrame(r, run.wall); if (!f) return;
        const P = (t, d) => [f.start[0] + f.dir[0] * t + f.inward[0] * d, f.start[1] + f.dir[1] * t + f.inward[1] * d];
        const a = (s.offset || 0) + (s.width - bw) / 2, b = a + bw;
        const pts = [P(a, 4), P(b, 4), P(a, 20), P(b, 20)];
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        _box3D(g, new THREE.MeshStandardMaterial({ color: 0x8e979f, roughness: 0.35, metalness: 0.35 }),
          Math.min(...xs), run.top + COUNTER_T - 0.05, Math.min(...ys), Math.max(...xs) - Math.min(...xs), 0.12, Math.max(...ys) - Math.min(...ys), { cast: false });
      });
    });
    islandCounterRects(r).forEach(c => _box3D(g, counterMat(c.w, c.h), c.x, c.top, c.y, c.w, COUNTER_T, c.h));
    // Backsplash: a thin layer on the wall above each run
    counterRuns(r).forEach(run => backsplashPieces(r, p, run).forEach(pc => {
      const R = wallStripRect(r, run.wall, pc.a, pc.b, 0.4); if (!R) return;
      let mat;
      if (ct.backsplash === 'full') {
        const t = tileTexture().clone(); t.needsUpdate = true;
        t.repeat.set(Math.max(R.w, R.h) / 12, (pc.y1 - pc.y0) / 6);   // 12" texture = two 6" tiles across, 6" = two 3" rows
        mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.25, metalness: 0.02 });
      } else mat = counterMat(Math.max(R.w, R.h), pc.y1 - pc.y0);
      _box3D(g, mat, R.x, pc.y0, R.y, R.w, pc.y1 - pc.y0, R.h, { cast: false });
    }));
  }
  // Finished end panels (in the door style's finish)
  endPanels(r).forEach(pn => {
    const isUpper = pn.bottom >= 40; if (isUpper ? !layers.uppers : !layers.bases) return;
    const R = wallStripRect(r, pn.wall, pn.a, pn.b, pn.depth); if (!R) return;
    const info = doorStyleInfo(p.style);
    _box3D(g, new THREE.MeshStandardMaterial({ color: shade3D(info.swatch, -4), roughness: 0.5 }), R.x, pn.bottom, R.y, R.w, pn.top - pn.bottom, R.h);
  });
  // Crown molding / light rail along the upper runs
  if (layers.uppers && (ct.crown || ct.lightRail)) {
    const mat = new THREE.MeshStandardMaterial({ color: shade3D(doorStyleInfo(p.style).swatch, -6), roughness: 0.5 });
    upperRuns(r).forEach(run => {
      const a = run.a - (run.startFree ? END_PANEL_T + (ct.crown ? CROWN_PROJ : 0) : 0), b = run.b + (run.endFree ? END_PANEL_T + (ct.crown ? CROWN_PROJ : 0) : 0);
      if (ct.crown) {
        const R = wallStripRect(r, run.wall, a, b, run.depth + FRONT_T + CROWN_PROJ);
        _box3D(g, mat, R.x, run.top, R.y, R.w, CROWN_H, R.h);
      }
      if (ct.lightRail) {
        const R = wallStripRect(r, run.wall, run.a, run.b, run.depth + FRONT_T + 0.5);
        _box3D(g, mat, R.x, run.bottom - LIGHT_RAIL_H, R.y, R.w, LIGHT_RAIL_H, R.h, { cast: false });
      }
    });
  }
  return g;
}

// ════════════════════════════
// ELEVATION
// ════════════════════════════
function drawElevCountersAndTrim(ctx, r, p, wall, scale, floorY, eX, PDF) {
  const ct = projectCounter(p), mat = COUNTER_MATERIALS[ct.material] || COUNTER_MATERIALS.quartz;
  const band = (a, b, bottom, top, fill, stroke) => {
    const x = eX(a, b - a), y = floorY - top * scale;
    ctx.fillStyle = fill; ctx.fillRect(x, y, (b - a) * scale, (top - bottom) * scale);
    ctx.strokeStyle = stroke; ctx.lineWidth = PDF ? 1.2 : 1; ctx.strokeRect(x, y, (b - a) * scale, (top - bottom) * scale);
  };
  const finish = PDF ? '#FFFFFF' : doorStyleInfo(p.style).swatch;
  if (layers.bases) {
    endPanels(r).filter(pn => pn.wall === wall && pn.bottom < 40).forEach(pn => band(pn.a, pn.b, pn.bottom, pn.top, finish, PDF ? '#1a1a1a' : '#64748B'));
    counterRuns(r).filter(run => run.wall === wall).forEach(run => {
      band(run.fullA, run.fullB, run.top, run.top + COUNTER_T, PDF ? '#E5E5E5' : mat.base, PDF ? '#1a1a1a' : '#475569');
      // Backsplash: 4" in the counter color, or tile (light, with a subway-tile pattern)
      backsplashPieces(r, p, run).forEach(pc => {
        const full = ct.backsplash === 'full';
        band(pc.a, pc.b, pc.y0, pc.y1, PDF ? (full ? '#F7F7F7' : '#EFEFEF') : (full ? '#F3F1EC' : mat.base), PDF ? '#555555' : '#94A3B8');
        if (full) {
          const x0 = eX(pc.a, pc.b - pc.a), x1 = x0 + (pc.b - pc.a) * scale, yb = floorY - pc.y0 * scale, yt = floorY - pc.y1 * scale;
          ctx.save(); ctx.beginPath(); ctx.rect(x0, yt, x1 - x0, yb - yt); ctx.clip();
          ctx.strokeStyle = PDF ? '#CCCCCC' : 'rgba(148,163,184,0.45)'; ctx.lineWidth = 0.6;
          for (let row = 0, yy = yb; yy > yt; row++, yy -= 3 * scale) {
            ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
            for (let xx = x0 + (row % 2 ? 3 : 0) * scale; xx < x1; xx += 6 * scale) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy - 3 * scale); ctx.stroke(); }
          }
          ctx.restore();
        }
      });
    });
  }
  if (layers.uppers) {
    endPanels(r).filter(pn => pn.wall === wall && pn.bottom >= 40).forEach(pn => band(pn.a, pn.b, pn.bottom, pn.top, finish, PDF ? '#1a1a1a' : '#64748B'));
    upperRuns(r).filter(run => run.wall === wall).forEach(run => {
      const ext = ct.crown ? CROWN_PROJ : 0;
      const a = run.a - (run.startFree ? END_PANEL_T + ext : 0), b = run.b + (run.endFree ? END_PANEL_T + ext : 0);
      if (ct.crown) band(a, b, run.top, run.top + CROWN_H, finish, PDF ? '#1a1a1a' : '#64748B');
      if (ct.lightRail) band(run.a, run.b, run.bottom - LIGHT_RAIL_H, run.bottom, finish, PDF ? '#1a1a1a' : '#64748B');
    });
  }
}

// ════════════════════════════
// PANEL: Countertop & Trim
// ════════════════════════════
function setCountertop(key, value) {
  const p = activeProj(); if (!p) return;
  p.countertop = { ...projectCounter(p), [key]: value };
  persist(); syncCountertopPanel();
  renderAll(); if (state.viewMode === '3d') renderIsometric();
}
function syncCountertopPanel() {
  const p = activeProj(); if (!p) return;
  const ct = projectCounter(p);
  const sel = document.getElementById('ct-material'); if (sel) sel.value = ct.material;
  const bs = document.getElementById('ct-backsplash'); if (bs) bs.value = ct.backsplash || 'none';
  const cr = document.getElementById('ct-crown'); if (cr) cr.checked = !!ct.crown;
  const lr = document.getElementById('ct-lightrail'); if (lr) lr.checked = !!ct.lightRail;
  const st = document.getElementById('ct-stats');
  if (st) st.textContent = ct.linearFt ? `≈ ${ct.linearFt} linear ft · ${ct.sqFt} sq ft of countertop (all rooms)` : 'No base cabinets yet.';
}
