// My Cabinet Planner — js/fronts3d.js
// 3D doors, drawer fronts and hardware (Build Plan 3.1).
// Each cabinet's fronts are built in a local frame — x across the face (+x = your right
// as you face the cabinet), y up from the floor, z out of the face — then turned to face
// into the room using the wall's inward direction (wallFrame), so every wall, including
// L-room inner walls, works the same way.
// Door construction follows the style: Shaker (5-piece frame, recessed panel), Slab,
// Raised panel, Glass (frame + pane). Materials and shapes are shared within a render.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// STYLE → DOOR CONSTRUCTION
// ════════════════════════════
// A style can say its door type outright (style.door = 'shaker'|'slab'|'raised'); otherwise
// it's read from the known door profiles or the style's name. Default: Shaker.
function doorStyleInfo(code) {
  const s = getStyles().find(x => x.code === code) || getStyles()[0] || { code: '', name: '', swatch: '#F2F1EE' };
  const name = (s.name || '').toLowerCase();
  const prof = DOOR_PROFILE[s.code];
  let door = s.door
    || (/slab|flat panel|modern|euro|gloss|contemporary/.test(name) ? 'slab'
      : /raised/.test(name) ? 'raised'
      : prof ? (prof.panel === 'raised' ? 'raised' : 'shaker')
      : 'shaker');
  const grain = /wood|oak|walnut|cherry|maple|hickory|birch|alder|pine|natural|homestead/.test(name);
  return { door, frame: prof && prof.frame === 'narrow' ? 1.25 : 2.25, grain, swatch: s.swatch || '#F2F1EE', code: s.code };
}

// ════════════════════════════
// FRONT LAYOUT (what goes on the face of each cabinet type)
// ════════════════════════════
const TOE_KICK_H = 4.5, REVEAL = 0.125, TOP_DRAWER_H = 6;
// → [{ x0,x1,y0,y1, kind:'door'|'drawer'|'false'|'panel', hinge:'L'|'R', glass }]
function frontLayout(cab, r) {
  const w = cab.width, [bot, top] = itemVerticalRange(cab);
  const L = -w / 2, R = w / 2, g = REVEAL;
  const out = [];
  const doorsAcross = (x0, x1, y0, y1, forceSingle, extra = {}) => {
    const single = forceSingle || (x1 - x0) <= 21.01;
    if (single) out.push({ x0: x0 + g / 2, x1: x1 - g / 2, y0, y1, kind: 'door', hinge: cab.hinge || 'L', ...extra });
    else {
      const mid = (x0 + x1) / 2;
      out.push({ x0: x0 + g / 2, x1: mid - g / 2, y0, y1, kind: 'door', hinge: 'L', ...extra });
      out.push({ x0: mid + g / 2, x1: x1 - g / 2, y0, y1, kind: 'door', hinge: 'R', ...extra });
    }
  };
  switch (cab.type) {
    case 'base': case 'vanity': case 'sink': {
      const y0 = TOE_KICK_H, dTop = top - TOP_DRAWER_H;
      out.push({ x0: L + g / 2, x1: R - g / 2, y0: dTop + g / 2, y1: top - g / 2, kind: cab.type === 'base' ? 'drawer' : 'false' });
      doorsAcross(L, R, y0 + g / 2, dTop - g / 2, false);
      break;
    }
    case 'drawerBase': {
      const y0 = TOE_KICK_H, rest = (top - TOP_DRAWER_H - y0) / 2;
      [[top - TOP_DRAWER_H, top], [y0 + rest, top - TOP_DRAWER_H], [y0, y0 + rest]].forEach(([a, b]) =>
        out.push({ x0: L + g / 2, x1: R - g / 2, y0: a + g / 2, y1: b - g / 2, kind: 'drawer' }));
      break;
    }
    case 'cornerBase': {
      // Blind corner: the end nearest the wall corner is blind (a filler-look panel), the
      // other end gets a drawer over a door.
      const len = wallLength(r, cab.wall), blindAtStart = (cab.offset || 0) < len / 2;
      const doorW = Math.min(w, Math.max(12, w - 21));
      // Is the start of the wall ("from left" 0) on the viewer's left? Not on every wall —
      // facing the south or west wall, 0 is on your right (why those elevations are mirrored).
      const fr = wallFrame(r, cab.wall), th = Math.atan2(fr.inward[0], fr.inward[1]);
      const startOnLeft = fr.dir[0] * Math.cos(th) - fr.dir[1] * Math.sin(th) > 0;
      const blindLeft = blindAtStart === startOnLeft;
      const [ox0, ox1] = blindLeft ? [R - doorW, R] : [L, L + doorW];
      const [bx0, bx1] = blindLeft ? [L, R - doorW] : [L + doorW, R];
      out.push({ x0: bx0 + g / 2, x1: bx1 - g / 2, y0: TOE_KICK_H + g / 2, y1: top - g / 2, kind: 'panel' });
      out.push({ x0: ox0 + g / 2, x1: ox1 - g / 2, y0: top - TOP_DRAWER_H + g / 2, y1: top - g / 2, kind: 'drawer' });
      out.push({ x0: ox0 + g / 2, x1: ox1 - g / 2, y0: TOE_KICK_H + g / 2, y1: top - TOP_DRAWER_H - g / 2, kind: 'door', hinge: blindLeft ? 'R' : 'L' });
      break;
    }
    case 'lazysusan':
      doorsAcross(L, R, TOE_KICK_H + g / 2, top - g / 2, false);
      break;
    case 'wall': case 'diagWall':
      doorsAcross(L, R, bot + g / 2, top - g / 2, cab.type === 'diagWall', { glass: !!cab.glassDoors });
      break;
    case 'tall': {
      const split = TOE_KICK_H + (top - TOE_KICK_H) * 0.56;
      doorsAcross(L, R, TOE_KICK_H + g / 2, split - g / 2, w <= 18.01);
      doorsAcross(L, R, split + g / 2, top - g / 2, w <= 18.01);
      break;
    }
    default: break;   // fillers, fridge panels: plain board, no fronts
  }
  return out;
}

// ════════════════════════════
// BUILDING THE MESHES
// ════════════════════════════
// One kit per render: shared materials (by style) and box shapes (by size)
function makeFrontKit(hardware) {
  const geos = new Map(), mats = new Map();
  const box = (w, h, d) => {
    const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
    if (!geos.has(k)) geos.set(k, new THREE.BoxGeometry(w, h, d));
    return geos.get(k);
  };
  const paint = (info, shade) => {
    const k = info.code + '|' + shade + '|' + info.grain;
    if (!mats.has(k)) {
      const m = new THREE.MeshStandardMaterial({ color: shade3D(info.swatch, shade), roughness: info.grain ? 0.7 : 0.5, metalness: 0.02 });
      if (info.grain) m.map = woodGrainTexture();
      mats.set(k, m);
    }
    return mats.get(k);
  };
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 });
  // Brushed nickel. (High metalness renders near-black here — there's no environment to reflect.)
  const metal = new THREE.MeshStandardMaterial({ color: 0xc6cad0, roughness: 0.38, metalness: 0.3 });
  const cyl = (rad, len) => { const k = `c${rad}|${len}`; if (!geos.has(k)) geos.set(k, new THREE.CylinderGeometry(rad, rad, len, 12)); return geos.get(k); };
  const sphere = rad => { const k = `s${rad}`; if (!geos.has(k)) geos.set(k, new THREE.SphereGeometry(rad, 14, 10)); return geos.get(k); };
  return { box, paint, glass, metal, cyl, sphere, hardware: hardware === 'knobs' ? 'knobs' : 'pulls' };
}

let _grainTex = null;
function woodGrainTexture() {
  if (_grainTex && _grainTex.image) return _grainTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 64; i++) {               // soft vertical grain lines (the texture is tinted by the finish color)
    const shade = 225 + Math.round(Math.sin(i * 1.7) * 12 + (Math.random() - 0.5) * 18);
    x.fillStyle = `rgb(${shade},${shade},${shade})`;
    x.fillRect(i, 0, 1, 256);
  }
  _grainTex = new THREE.CanvasTexture(c);
  _grainTex.wrapS = _grainTex.wrapT = THREE.RepeatWrapping;
  return _grainTex;
}

const FRONT_T = 0.75;   // door/drawer thickness
function addPiece(group, kit, mat, x0, x1, y0, y1, z0, z1) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0; if (w <= 0.01 || h <= 0.01 || d <= 0.001) return;
  const m = new THREE.Mesh(kit.box(w, h, d), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.receiveShadow = true;
  group.add(m);
}
// One door or drawer front in the style's construction
function addFront(group, kit, info, f) {
  const T = FRONT_T, W = f.x1 - f.x0, H = f.y1 - f.y0;
  const frameMat = kit.paint(info, 0), panelMat = kit.paint(info, -14);
  const plain = f.kind === 'panel' || f.kind === 'false' && info.door !== 'shaker';
  // Short drawer fronts and plain panels are slabs in every style (as on real Shaker kitchens)
  const slab = info.door === 'slab' || plain || (f.kind !== 'door' && H < 8);
  if (slab && !f.glass) { addPiece(group, kit, frameMat, f.x0, f.x1, f.y0, f.y1, 0, T); return; }
  const F = Math.min(info.frame, W * 0.3, H * 0.3);
  // frame: two stiles full height, two rails between them
  addPiece(group, kit, frameMat, f.x0, f.x0 + F, f.y0, f.y1, 0, T);
  addPiece(group, kit, frameMat, f.x1 - F, f.x1, f.y0, f.y1, 0, T);
  addPiece(group, kit, frameMat, f.x0 + F, f.x1 - F, f.y1 - F, f.y1, 0, T);
  addPiece(group, kit, frameMat, f.x0 + F, f.x1 - F, f.y0, f.y0 + F, 0, T);
  const px0 = f.x0 + F, px1 = f.x1 - F, py0 = f.y0 + F, py1 = f.y1 - F;
  if (f.glass) {
    addPiece(group, kit, kit.glass, px0, px1, py0, py1, T * 0.4, T * 0.55);
  } else if (info.door === 'raised') {
    addPiece(group, kit, panelMat, px0, px1, py0, py1, 0.1, T * 0.6);                 // field
    const b = Math.min(1.5, (px1 - px0) * 0.2, (py1 - py0) * 0.2);
    addPiece(group, kit, frameMat, px0 + b, px1 - b, py0 + b, py1 - b, T * 0.6, T + 0.1); // raised center
  } else {
    addPiece(group, kit, panelMat, px0, px1, py0, py1, 0.1, T * 0.4);                 // recessed Shaker panel
  }
}
// Pull or knob for one front
function addHardware(group, kit, f, cabIsUpper) {
  if (f.kind === 'false' || f.kind === 'panel') return;
  const T = FRONT_T, standoff = 1.1, W = f.x1 - f.x0, H = f.y1 - f.y0;
  const bar = (cx, cy, len, vertical) => {
    const rod = new THREE.Mesh(kit.cyl(0.22, len), kit.metal);
    rod.position.set(cx, cy, T + standoff);
    if (!vertical) rod.rotation.z = Math.PI / 2;
    group.add(rod);
    [-1, 1].forEach(s => {
      const post = new THREE.Mesh(kit.cyl(0.18, standoff), kit.metal);
      post.rotation.x = Math.PI / 2;
      post.position.set(cx + (vertical ? 0 : s * (len / 2 - 0.4)), cy + (vertical ? s * (len / 2 - 0.4) : 0), T + standoff / 2);
      group.add(post);
    });
  };
  if (f.kind === 'drawer') { bar((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, W >= 24 ? 8 : 5, false); return; }
  // Doors: handle on the side away from the hinge, near the top (bases/talls' lower doors)
  // or near the bottom (uppers)
  const hx = f.hinge === 'R' ? f.x0 + 1.75 : f.x1 - 1.75;
  const hy = cabIsUpper ? f.y0 + 3 : f.y1 - 3.5;
  if (kit.hardware === 'knobs') {
    const k = new THREE.Mesh(kit.sphere(0.65), kit.metal);
    k.position.set(hx, hy, T + 0.8); group.add(k);
  } else {
    const len = Math.min(4, H * 0.4);
    bar(hx, hy + (cabIsUpper ? len / 2 : -len / 2), len, true);
  }
}

// All fronts + hardware for one cabinet, positioned on its wall facing into the room
function buildCabinetFronts3D(cab, r, kit, p) {
  const layout = frontLayout(cab, r); if (!layout.length) return null;
  const f = wallFrame(r, cab.wall); if (!f) return null;
  const info = doorStyleInfo(cab.styleOverride || p.style);
  const group = new THREE.Group();
  const upper = itemLevel(cab) === 'upper';
  layout.forEach(fr => { addFront(group, kit, info, fr); addHardware(group, kit, fr, upper || (cab.type === 'tall' && fr.y0 > 40)); });
  const t = (cab.offset || 0) + cab.width / 2, d = cab.depth || CATALOG[cab.type].depth;
  group.position.set(f.start[0] + f.dir[0] * t + f.inward[0] * d, 0, f.start[1] + f.dir[1] * t + f.inward[1] * d);
  group.rotation.y = Math.atan2(f.inward[0], f.inward[1]);   // local +z → into the room
  return group;
}
