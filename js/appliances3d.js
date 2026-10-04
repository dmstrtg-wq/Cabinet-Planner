// My Cabinet Planner — js/appliances3d.js
// 3D appliance models (Build Plan 3.3): low-poly but recognizable — French-door /
// side-by-side / top-freezer fridges, a range with grates, knobs and backguard, cooktop,
// dishwasher, OTR microwave, microwave drawer, single/double wall oven, chimney and
// under-cabinet hoods, beverage cooler. Finishes: stainless, black stainless, white, and
// panel-ready (fridge, dishwasher, beverage cooler — fronts in the cabinet door style).
// Looks only: appliances keep their own price field on the quote, as before.
// Each model is built in a local frame — x across the face (+x = your right as you face
// it), y up from the floor, z out from the wall (the face is at z = depth) — then turned to
// face into the room using the wall's inward direction, like the cabinet fronts.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// MATERIALS (one kit per render)
// ════════════════════════════
let _brushedTex = null;
function brushedTexture() {
  if (_brushedTex && _brushedTex.image) return _brushedTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 64; i++) {              // fine horizontal brushing, tinted by the finish color
    const v = 240 + Math.round((Math.random() - 0.5) * 9);
    x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, i, 256, 1);
  }
  _brushedTex = new THREE.CanvasTexture(c);
  _brushedTex.wrapS = _brushedTex.wrapT = THREE.RepeatWrapping;
  _brushedTex.repeat.set(1, 6);
  return _brushedTex;
}
function makeApplianceKit() {
  const mats = new Map();
  const mat = (key, make) => { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); };
  const std = (color, roughness, metalness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return {
    finish: f => mat('f:' + f, () => f === 'stainless'
      ? std(APPLIANCE_FINISHES.stainless.color, 0.32, 0.3, { map: brushedTexture() })
      : f === 'black' ? std(APPLIANCE_FINISHES.black.color, 0.3, 0.25, { map: brushedTexture() })
      : std(APPLIANCE_FINISHES.white.color, 0.35, 0.05)),
    dark:   mat('dark',   () => std(0x1d1f23, 0.45, 0.1)),
    glass:  mat('glass',  () => std(0x0d1013, 0.12, 0.2)),
    tint:   mat('tint',   () => std(0x2a3540, 0.08, 0.1, { transparent: true, opacity: 0.55 })),
    steel:  mat('steel',  () => std(0xdfe2e6, 0.3, 0.35)),
    iron:   mat('iron',   () => std(0x232427, 0.7, 0.2)),
    burner: mat('burner', () => std(0x50545a, 0.5, 0.2)),
    light:  mat('light',  () => std(0xcfd6dc, 0.4, 0.1)),
    grille: mat('grille', () => std(0x2c2f33, 0.8, 0.1)),
    wood:   mat('wood',   () => std(0xb07a45, 0.7, 0.02, { map: woodGrainTexture() })),
    geos: new Map(),
  };
}

// ════════════════════════════
// SHAPE HELPERS (local frame)
// ════════════════════════════
function _abox(g, kit, m, x0, x1, y0, y1, z0, z1, shadow = true) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0; if (w <= 0.01 || h <= 0.01 || d <= 0.005) return null;
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  if (!kit.geos.has(k)) kit.geos.set(k, new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(kit.geos.get(k), m);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
// Bar handle standing off a face at z = face (vertical or horizontal), with two posts
function _ahandle(g, kit, cx, cy, face, len, vertical) {
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, len, 12), kit.steel);
  rod.position.set(cx, cy, face + 1.3); if (!vertical) rod.rotation.z = Math.PI / 2;
  rod.castShadow = true; g.add(rod);
  [-1, 1].forEach(s => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.3, 10), kit.steel);
    post.rotation.x = Math.PI / 2;
    post.position.set(cx + (vertical ? 0 : s * (len / 2 - 0.8)), cy + (vertical ? s * (len / 2 - 0.8) : 0), face + 0.65);
    g.add(post);
  });
}
function _aknob(g, kit, cx, cy, face) {
  const k = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 1.0, 16), kit.dark);
  k.rotation.x = Math.PI / 2; k.position.set(cx, cy, face + 0.5); k.castShadow = true; g.add(k);
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.1), kit.light);
  tick.position.set(cx, cy + 0.35, face + 1.02); g.add(tick);
}
// A solid whose bottom and top are different rectangles (hood canopy): {x0,x1,z0,z1,y}
function _aprism(g, m, A, B) {
  const p = [[A.x0, A.y, A.z0], [A.x1, A.y, A.z0], [A.x1, A.y, A.z1], [A.x0, A.y, A.z1],
             [B.x0, B.y, B.z0], [B.x1, B.y, B.z0], [B.x1, B.y, B.z1], [B.x0, B.y, B.z1]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const pos = [];
  faces.forEach(f => f.forEach(i => pos.push(...p[i])));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh); return mesh;
}
// Glass window in a door: dark pane slightly proud of the face
function _awindow(g, kit, x0, x1, y0, y1, face) { _abox(g, kit, kit.glass, x0, x1, y0, y1, face, face + 0.06, false); }

// ════════════════════════════
// MODELS
// ════════════════════════════
// → THREE.Group placed in the room, or null
function buildAppliance3D(r, app, kit, frontKit, p) {
  const acat = APPLIANCES[app.type]; if (!acat) return null;
  const f = wallFrame(r, app.wall); if (!f) return null;
  const w = app.width, h = app.height || acat.height, D = itemDepth(app);
  const [b, top] = itemVerticalRange(app);
  const finish = applianceFinish(app);
  const panel = finish === 'panel';
  const style = doorStyleInfo(p && p.style);
  // Panel-ready: the visible box takes the cabinet finish too (it's built in like a cabinet)
  const fin = panel ? frontKit.paint(style, -6) : kit.finish(finish);
  const g = new THREE.Group();
  const L = -w / 2, R = w / 2;
  // The main body gets its own material copy so the selection glow only lights this item
  const body = (m, x0, x1, y0, y1, z0, z1) => {
    const mesh = _abox(g, kit, m.clone(), x0, x1, y0, y1, z0, z1);
    if (mesh) mesh.userData.itemId = app.id;
    return mesh;
  };
  // A panel-ready front in the cabinet door style, its face at z = face
  const panelFront = (x0, x1, y0, y1, face, kind = 'door', glass = false) => {
    const sub = new THREE.Group(); sub.position.z = face - FRONT_T;
    addFront(sub, frontKit, style, { x0, x1, y0, y1, kind, glass });
    g.add(sub);
  };

  switch (app.type) {
    case 'refrigerator': {
      const v = applianceVariant(app), F = D - 1.25;   // door faces at z = D
      body(fin, L + 0.1, R - 0.1, 0, h, 0, F);
      _abox(g, kit, kit.grille, L + 1, R - 1, 0.6, 2.6, F - 0.4, F + 0.05);    // toe grille
      const door = (x0, x1, y0, y1) => panel ? panelFront(x0, x1, y0, y1, D) : _abox(g, kit, fin, x0, x1, y0, y1, F, D);
      if (v === 'sxs') {
        const split = L + w * 0.42;
        door(L + 0.1, split - 0.1, 3, h - 0.2); door(split + 0.1, R - 0.1, 3, h - 0.2);
        _ahandle(g, kit, split - 1.4, h * 0.55, D, h * 0.42, true);
        _ahandle(g, kit, split + 1.4, h * 0.55, D, h * 0.42, true);
        const dx = (L + split) / 2, dw = Math.min(8, (split - L) * 0.5);   // ice/water dispenser
        _abox(g, kit, kit.dark, dx - dw / 2, dx + dw / 2, h * 0.5, h * 0.68, D - 0.2, D + 0.04, false);
      } else if (v === 'top') {
        const split = 3 + (h - 3) * 0.7;
        door(L + 0.1, R - 0.1, split + 0.15, h - 0.2); door(L + 0.1, R - 0.1, 3, split - 0.15);
        _ahandle(g, kit, R - 2.2, split + 6, D, 9, true);
        _ahandle(g, kit, R - 2.2, split - 10, D, 16, true);
      } else {                                            // French door over a freezer drawer
        const split = 3 + (h - 3) * 0.36;
        door(L + 0.1, R - 0.1, 3, split - 0.15);
        door(L + 0.1, -0.08, split + 0.15, h - 0.2); door(0.08, R - 0.1, split + 0.15, h - 0.2);
        const hl = (h - split) * 0.55, hy = split + (h - split) * 0.5;
        _ahandle(g, kit, -1.6, hy, D, hl, true); _ahandle(g, kit, 1.6, hy, D, hl, true);
        _ahandle(g, kit, 0, split - 2.6, D, Math.min(w * 0.6, 22), false);
      }
      break;
    }
    case 'range': {
      const F = D - 0.5, burners = w >= 35.9 ? 6 : 4;
      _abox(g, kit, kit.dark, L + 0.5, R - 0.5, 0, 1.2, 0, F - 2);                 // toe
      body(fin, L, R, 1.2, h - 0.8, 0, F);
      _abox(g, kit, kit.dark, L, R, h - 0.8, h - 0.2, 1.5, D);                      // enamel cooktop
      _abox(g, kit, fin, L, R, h - 0.8, h + 4.5, 0, 1.6);                           // backguard
      _abox(g, kit, kit.dark, L + 0.5, R - 0.5, h + 1.5, h + 4, 1.6, 1.7, false);  // backguard display strip
      // grates + burners: two rows
      const cols = burners / 2;
      for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++) {
        const cx = L + (w / cols) * (i + 0.5), cz = 1.5 + (D - 1.5) * (j === 0 ? 0.3 : 0.72);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.6, 18), kit.burner);
        cap.position.set(cx, h - 0.1, cz); g.add(cap);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(3.6, w / cols * 0.36), 0.28, 6, 20), kit.iron);
        ring.rotation.x = Math.PI / 2; ring.position.set(cx, h + 0.55, cz); ring.castShadow = true; g.add(ring);
        [0, Math.PI / 2].forEach(rot => {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.min(8.4, w / cols * 0.84), 0.4, 0.45), kit.iron);
          bar.rotation.y = rot; bar.position.set(cx, h + 0.55, cz); g.add(bar);
        });
      }
      // front controls
      for (let i = 0; i < burners; i++) _aknob(g, kit, L + (w / (burners + 1)) * (i + 1), h - 3.2, F);
      // oven door with window and bar handle, storage drawer under it
      _abox(g, kit, fin, L + 0.3, R - 0.3, 6, h - 5.5, F, D + 0.3);
      _awindow(g, kit, L + 4, R - 4, 11, h - 12, D + 0.3);
      _ahandle(g, kit, 0, h - 7.5, D + 0.3, w - 6, false);
      _abox(g, kit, fin, L + 0.3, R - 0.3, 1.4, 5.6, F, D + 0.1);
      _ahandle(g, kit, 0, 4.4, D + 0.1, Math.min(10, w * 0.35), false);
      break;
    }
    case 'cooktop': {
      // Glass top resting on the countertop (counters are 34.5" boxes + 1.5" top)
      const y0 = 36, z0 = 2.5, z1 = Math.min(25, z0 + D);
      body(kit.glass, L, R, y0, y0 + 0.3, z0, z1);
      const n = w >= 35.9 ? 5 : 4;
      const spots = n === 5 ? [[-0.33, 0.28], [-0.33, 0.72], [0, 0.5], [0.33, 0.28], [0.33, 0.72]] : [[-0.25, 0.28], [-0.25, 0.72], [0.25, 0.28], [0.25, 0.72]];
      spots.forEach(([fx, fz], k) => {
        const rad = k % 2 ? 3.2 : 4.2;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.12, 4, 28), kit.burner);
        ring.rotation.x = Math.PI / 2; ring.position.set(fx * w, y0 + 0.32, z0 + (z1 - z0) * fz); g.add(ring);
      });
      _abox(g, kit, kit.light, -w * 0.18, w * 0.18, y0 + 0.3, y0 + 0.34, z1 - 2.2, z1 - 1.2, false);   // touch controls
      break;
    }
    case 'dishwasher': {
      const F = D - 0.75;
      _abox(g, kit, kit.dark, L + 0.3, R - 0.3, 0, TOE_KICK_H, 0, D - 3);          // recessed kick
      body(kit.dark, L + 0.2, R - 0.2, TOE_KICK_H, h - 0.2, 0, F);
      if (panel) {
        panelFront(L + REVEAL / 2, R - REVEAL / 2, TOE_KICK_H + REVEAL / 2, h - REVEAL / 2, D, 'door');
        _ahandle(g, kit, 0, h - 4, D, Math.min(12, w * 0.45), false);
      } else {
        _abox(g, kit, fin, L + 0.1, R - 0.1, TOE_KICK_H + 0.1, h - 0.2, F, D);
        _abox(g, kit, kit.dark, L + 1, R - 1, h - 2.4, h - 0.6, D, D + 0.04, false);   // control strip
        _ahandle(g, kit, 0, h - 4.6, D, w - 6, false);
      }
      break;
    }
    case 'microwave': {                                   // over-the-range
      body(fin, L, R, b, top, 0, D - 0.5);
      const doorR = L + w * 0.72;
      _abox(g, kit, fin, L + 0.2, doorR - 0.1, b + 0.4, top - 2.4, D - 0.5, D);
      _awindow(g, kit, L + 2, doorR - 3.5, b + 2.4, top - 4.6, D);
      _ahandle(g, kit, doorR - 1.6, (b + top - 2) / 2, D, (h - 2.4) * 0.7, true);
      _abox(g, kit, kit.glass, doorR + 0.1, R - 0.2, b + 0.4, top - 2.4, D - 0.5, D);   // control panel
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++)
        _abox(g, kit, kit.light, doorR + 1.2 + j * ((R - doorR - 2.4) / 3), doorR + 1.2 + j * ((R - doorR - 2.4) / 3) + 1.1, top - 5 - i * 1.8, top - 4.3 - i * 1.8, D, D + 0.05, false);
      _abox(g, kit, kit.grille, L + 1, R - 1, top - 2, top - 0.6, D - 0.45, D + 0.02, false);   // vent grille
      _abox(g, kit, kit.dark, L + 1, R - 1, b, b + 0.1, 2, D - 2, false);                       // underside / light
      break;
    }
    case 'microwaveDrawer': {
      body(fin, L + 0.2, R - 0.2, b, top, 1, D);                                   // trim face
      _abox(g, kit, fin, L + 0.3, R - 0.3, b + 0.3, top - 2.6, D, D + 0.75);       // drawer front
      _awindow(g, kit, L + 3, R - 3, b + 2.2, top - 5, D + 0.75);
      _abox(g, kit, kit.glass, L + 0.3, R - 0.3, top - 2.4, top - 0.3, D, D + 0.6);   // angled control lip
      _abox(g, kit, kit.light, -2.5, 2.5, top - 1.6, top - 1.1, D + 0.6, D + 0.64, false);
      break;
    }
    case 'wallOven': {
      body(fin, L + 0.2, R - 0.2, b, top, 1, D + 0.1);                             // trim face
      const ctrl = 4, doors = h >= 50 ? 2 : 1, each = (h - ctrl) / doors;
      _abox(g, kit, kit.glass, L + 0.4, R - 0.4, top - ctrl + 0.2, top - 0.3, D + 0.1, D + 0.7);   // control panel
      _abox(g, kit, kit.light, -3, 3, top - ctrl / 2 - 0.5, top - ctrl / 2 + 0.5, D + 0.7, D + 0.74, false);
      for (let k = 0; k < doors; k++) {
        const y1 = top - ctrl - k * each - 0.2, y0 = y1 - each + 0.4;
        _abox(g, kit, fin, L + 0.4, R - 0.4, y0, y1, D + 0.1, D + 0.95);
        _awindow(g, kit, L + 3.5, R - 3.5, y0 + 3, y1 - 6, D + 0.95);
        _ahandle(g, kit, 0, y1 - 2.8, D + 0.95, w - 7, false);
      }
      break;
    }
    case 'hood': {
      const v = applianceVariant(app);
      const under = v === 'under' || (v === 'auto' && hoodHasCabinetAbove(r, app));
      if (under) {
        body(fin, L, R, b, b + 6, 0, D);
        _abox(g, kit, kit.grille, L + 1.5, R - 1.5, b - 0.05, b + 0.05, 2, D - 3, false);   // filters
        _abox(g, kit, kit.light, -w * 0.2, w * 0.2, b - 0.06, b + 0.04, D - 2.6, D - 1.6, false);
      } else {
        const ceiling = r.ceilingHeight || 96;
        const band = 3, slopeTop = b + Math.max(8, Math.min(h - 4, 12));
        const fw = Math.min(12, w * 0.4), fd = Math.min(10, D * 0.55);
        const m = body(fin, L, R, b, b + band, 0, D);
        _aprism(g, m ? m.material : fin, { x0: L, x1: R, z0: 0, z1: D, y: b + band }, { x0: -fw / 2, x1: fw / 2, z0: 0, z1: fd, y: slopeTop });
        _abox(g, kit, fin, -fw / 2, fw / 2, slopeTop, ceiling, 0, fd);              // chimney flue to the ceiling
        _abox(g, kit, kit.grille, L + 1.5, R - 1.5, b - 0.05, b + 0.05, 2, D - 3, false);
        _abox(g, kit, kit.light, -w * 0.2, w * 0.2, b + 0.8, b + 1.6, D, D + 0.05, false);   // controls on the band
      }
      break;
    }
    case 'beverageCooler': {
      const F = D - 0.75;
      _abox(g, kit, kit.grille, L + 0.3, R - 0.3, 0, TOE_KICK_H, 0, D - 1.5);
      body(kit.dark, L + 0.2, R - 0.2, TOE_KICK_H, h - 0.2, 0, F - 0.05);
      // what you see through the glass: three wire shelves
      for (let i = 1; i <= 3; i++) _abox(g, kit, kit.light, L + 1.5, R - 1.5, TOE_KICK_H + (h - TOE_KICK_H) * i / 4, TOE_KICK_H + (h - TOE_KICK_H) * i / 4 + 0.3, 3, F - 0.5, false);
      if (panel) {
        panelFront(L + REVEAL / 2, R - REVEAL / 2, TOE_KICK_H + REVEAL / 2, h - REVEAL / 2, D, 'door', true);
      } else {
        const T = 2.2, y0 = TOE_KICK_H + 0.1, y1 = h - 0.2;
        _abox(g, kit, fin, L + 0.1, L + T, y0, y1, F, D); _abox(g, kit, fin, R - T, R - 0.1, y0, y1, F, D);
        _abox(g, kit, fin, L + T, R - T, y1 - T, y1, F, D); _abox(g, kit, fin, L + T, R - T, y0, y0 + T, F, D);
        _abox(g, kit, kit.tint, L + T, R - T, y0 + T, y1 - T, F + 0.2, F + 0.4, false);
      }
      _ahandle(g, kit, R - 1.6, h * 0.6, D, Math.min(14, h * 0.4), true);
      break;
    }
    // ── Bathroom fixtures (7.4) ──
    case 'toilet': {
      const china = kit.china || (kit.china = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.22, metalness: 0.02 }));
      body(china, L + 1, R - 1, 15, 30, 0, 8);                                    // tank
      _abox(g, kit, china, L + 0.5, R - 0.5, 29.5, 31, -0.2, 8.6);               // tank lid
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 5.5, 15, 24), china);   // bowl, oval
      bowl.scale.set(1, 1, 1.35); bowl.position.set(0, 7.5, 8 + 10); bowl.castShadow = true; g.add(bowl);
      const seat = new THREE.Mesh(new THREE.TorusGeometry(6.6, 1.1, 8, 24), new THREE.MeshStandardMaterial({ color: 0xd6d2ca, roughness: 0.35 }));
      seat.rotation.x = Math.PI / 2; seat.scale.set(1, 1.35, 1); seat.position.set(0, 15.4, 18); g.add(seat);
      _abox(g, kit, kit.steel, R - 4, R - 2, 26, 26.6, 8.6, 9.6, false);          // flush lever
      break;
    }
    case 'tub': {
      const china = kit.china || (kit.china = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.22, metalness: 0.02 }));
      body(china, L, R, 0, h, 0, D);                                              // tub body + apron
      _abox(g, kit, kit.water || (kit.water = new THREE.MeshStandardMaterial({ color: 0xdfe9ee, roughness: 0.15, metalness: 0.05 })), L + 3, R - 3, h - 0.05, h + 0.02, 3, D - 3, false);   // basin
      _abox(g, kit, kit.steel, L + 4, L + 7, h + 12, h + 13, 0, 4);               // spout
      break;
    }
    case 'shower': {
      const tray = kit.china || (kit.china = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.22, metalness: 0.02 }));
      const glass = kit.showerGlass || (kit.showerGlass = new THREE.MeshStandardMaterial({ color: 0xd8ecf3, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28 }));
      body(tray, L, R, 0, 4, 0, D);                                               // base / curb
      _abox(g, kit, glass, L, R, 4, h, D - 0.4, D, false);                        // glass front
      _abox(g, kit, kit.steel, L, R, h - 0.6, h, D - 0.6, D, false);              // header
      _abox(g, kit, kit.steel, -1, 1, 62, 64, 0, 6);                              // shower arm + head
      _abox(g, kit, kit.steel, -3, 3, 60.5, 61.5, 4, 7, false);
      _ahandle(g, kit, R - 3, 40, D, 12, true);                                   // door pull
      break;
    }
    case 'mirror': {                                    // (no reflections in this scene: a light, slightly lit glass reads as mirror)
      const silver = kit.mirrorGlass || (kit.mirrorGlass = new THREE.MeshStandardMaterial({ color: 0xe3ebf1, roughness: 0.04, metalness: 0.15, emissive: 0x9fb3c2, emissiveIntensity: 0.25 }));
      body(kit.dark, L, R, b, top, 0, 0.75);                                      // frame
      _abox(g, kit, silver, L + 1, R - 1, b + 1, top - 1, 0.75, 1, false);
      break;
    }
    case 'medicineCabinet': {
      const silver = kit.mirrorGlass || (kit.mirrorGlass = new THREE.MeshStandardMaterial({ color: 0xe3ebf1, roughness: 0.04, metalness: 0.15, emissive: 0x9fb3c2, emissiveIntensity: 0.25 }));
      body(kit.finish('white'), L, R, b, top, 0, D - 0.4);
      _abox(g, kit, silver, L + 0.4, R - 0.4, b + 0.4, top - 0.4, D - 0.4, D, false);   // mirrored door
      break;
    }
    case 'sconce': {
      const shade = kit.shade || (kit.shade = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a0, emissiveIntensity: 0.6, roughness: 0.6 }));
      body(kit.steel, -2, 2, b + 3, b + 7, 0, 0.6);                               // backplate
      _abox(g, kit, kit.steel, -0.4, 0.4, b + 4.6, b + 5.4, 0.6, 3.5, false);    // arm
      const glassShade = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 6, 16), shade);
      glassShade.position.set(0, b + 7, 3.5); g.add(glassShade);
      break;
    }
    case 'floatingShelf': {                              // a stack of shelves (7.3), in the chosen finish
      const s = shelfStack(app), fk = shelfFinish(app), F = SHELF_FINISHES[fk];
      const m = fk === 'cabinet' ? frontKit.paint(style, -4)
        : new THREE.MeshStandardMaterial({ color: F.color, roughness: F.grain ? 0.7 : 0.45, metalness: 0.02, map: F.grain ? woodGrainTexture() : null });
      for (let k = 0; k < s.n; k++) body(m, L, R, b + k * s.spacing, b + k * s.spacing + s.t, 0, D);
      break;
    }
    default:
      body(kit.finish('stainless'), L, R, b, top, 0, D);
  }

  const t = (app.offset || 0) + w / 2;
  g.position.set(f.start[0] + f.dir[0] * t, 0, f.start[1] + f.dir[1] * t);
  g.rotation.y = Math.atan2(f.inward[0], f.inward[1]);    // local +z → into the room
  return g;
}

// A hood with a wall cabinet right above it is an under-cabinet insert (Auto)
function hoodHasCabinetAbove(r, hood) {
  const top = itemVerticalRange(hood)[0];
  return r.cabinets.some(c => c.wall === hood.wall && itemLevel(c) === 'upper' && itemVerticalRange(c)[0] >= top - 0.01
    && (c.offset || 0) < (hood.offset || 0) + hood.width - 0.01 && (hood.offset || 0) < (c.offset || 0) + c.width - 0.01);
}
