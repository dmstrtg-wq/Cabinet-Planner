// My Cabinet Planner — js/view3d.js
// 3D view (Three.js r128).
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// RENDER: 3D VIEW (Three.js / WebGL)
// ════════════════════════════
let iso3D = null;

// Lighten/darken a hex color, returns a numeric color for THREE
function shade3D(hex, amt) {
  const n = parseInt(String(hex).replace('#',''), 16);
  const r = Math.min(255, Math.max(0, ((n>>16)&0xff) + amt));
  const g = Math.min(255, Math.max(0, ((n>>8)&0xff) + amt));
  const b = Math.min(255, Math.max(0, (n&0xff) + amt));
  return (r<<16) | (g<<8) | b;
}

// Free GPU resources for a subtree before discarding it
function disposeObject3D(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

// Build a billboard text label (canvas texture sprite)
function makeLabelSprite3D(text, opts={}) {
  const c = document.createElement('canvas');
  const ctx2 = c.getContext('2d');
  const fontSize = opts.fontSize || 28;
  ctx2.font = `700 ${fontSize}px Inter, sans-serif`;
  const padX = 10, padY = 6;
  const textW = Math.max(1, Math.ceil(ctx2.measureText(text).width));
  c.width  = textW + padX*2;
  c.height = fontSize + padY*2;
  ctx2.font = `700 ${fontSize}px Inter, sans-serif`;
  if (opts.bg !== 'transparent') {
    ctx2.fillStyle = opts.bg || 'rgba(15,23,42,0.55)';
    ctx2.fillRect(0,0,c.width,c.height);
  }
  ctx2.fillStyle = opts.color || '#fff';
  ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
  ctx2.fillText(text, c.width/2, c.height/2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const px2in = opts.scale || 0.05;
  sprite.scale.set(c.width*px2in, c.height*px2in, 1);
  return sprite;
}

// Build a wall mesh (with door/window openings cut as holes) in its local
// XY plane: shape-x runs along the wall (matches cabinet `offset`), shape-y
// is vertical (0..ceiling). Caller positions/rotates the mesh into the room.
function buildWall3D(wallName, lengthAxisSize, ceiling, openings, color) {
  const WALL_THICK = 3.5; // standard stud-wall thickness — gives real depth, eliminates z-fighting
  const shape = new THREE.Shape();
  shape.moveTo(0,0);
  shape.lineTo(lengthAxisSize,0);
  shape.lineTo(lengthAxisSize,ceiling);
  shape.lineTo(0,ceiling);
  shape.lineTo(0,0);

  openings.filter(o => o.wall===wallName && o.type!=='sink-loc').forEach(o => {
    const w = Math.max(1, o.width || 24);
    const h = Math.max(1, o.height || (o.type==='window' ? 36 : 80));
    const sill = o.type==='window' ? (o.sillHeight!=null ? o.sillHeight : 36) : 0;
    const x0 = Math.min(Math.max(0.5, o.offset||0), lengthAxisSize-0.5);
    const x1 = Math.min(lengthAxisSize-0.5, x0+w);
    const y0 = Math.min(Math.max(0.5, sill), ceiling-0.5);
    const y1 = Math.min(ceiling-0.5, y0+h);
    if (x1<=x0 || y1<=y0) return;
    const hole = new THREE.Path();
    hole.moveTo(x0,y0); hole.lineTo(x1,y0); hole.lineTo(x1,y1); hole.lineTo(x0,y1); hole.lineTo(x0,y0);
    shape.holes.push(hole);
  });

  // ExtrudeGeometry gives walls real 3D depth, eliminating coplanar-edge z-fighting at corners.
  // polygonOffset pushes walls slightly back in the depth buffer so cabinet faces win cleanly.
  const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_THICK, bevelEnabled: false });
  const mat = new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: 4,
    polygonOffsetUnits: 4
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// Ray-cast point-in-polygon (polygon = [[x,z],…]) — which side of an L-room edge is the room
function _pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > pt[1]) !== (zj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Floor reference grid (12" squares)
function buildFloorGrid3D(roomW, roomD) {
  const pts = [];
  for (let x = 0; x <= roomW + 0.01; x += 12) { pts.push(x,1.5,0, x,1.5,roomD); }
  for (let z = 0; z <= roomD + 0.01; z += 12) { pts.push(0,1.5,z, roomW,1.5,z); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xD7DEE6 }));
}

// One-time scene/camera/renderer/controls setup
function initIso3D() {
  const canvas = document.getElementById('iso-plan');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f6);

  const camera = new THREE.PerspectiveCamera(40, 1, 1, 10000);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.zoomSpeed = 0.6;   // default 1.0 felt too fast
  controls.maxPolarAngle = Math.PI/2 - 0.04; // don't dip below the floor
  controls.minDistance = 30;
  controls.maxDistance = 3000;
  controls.target.set(0,0,0);

  // Brighter, softer fill so light finishes read true (a white cabinet should look white,
  // not grey). Lighting presets come in Build Plan 3.4.
  const ambient = new THREE.AmbientLight(0xffffff, 0.72);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d4ca, 0.38);   // values set by the lighting preset (camera3d.js)
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);   // finer shadows — 1024 looked blocky on textured floors
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const root = new THREE.Group();
  scene.add(root);

  iso3D = { renderer, scene, camera, controls, root, sun, ambient, hemi, initedCamera: false };

  // Re-check which walls to fade every time the camera moves (camera3d.js)
  controls.addEventListener('change', () => { updateCutaway(); renderer.render(scene, camera); });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => resizeIso3D()).observe(canvas);
  }
  window.addEventListener('resize', resizeIso3D);

  return iso3D;
}

// Match renderer/camera to the canvas's current CSS size
function resizeIso3D() {
  if (!iso3D) return;
  const canvas = document.getElementById('iso-plan');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  iso3D.renderer.setSize(w, h, false);
  iso3D.camera.aspect = w/h;
  iso3D.camera.updateProjectionMatrix();
  iso3D.renderer.render(iso3D.scene, iso3D.camera);
}

// "Reset View" / opening 3D: jump to the 3/4 hero view for this room (camera3d.js)
function resetIso3DView(animate) {
  if (!iso3D || !activeRoom()) return;
  setCameraPreset('hero', !animate);
}

function renderIsometric() {
  if (typeof THREE === 'undefined') return; // CDN not loaded yet
  const canvas = document.getElementById('iso-plan');
  if (!canvas) return;
  if (!iso3D) initIso3D();
  const { root } = iso3D;
  const r = activeRoom();

  // Clear previous scene contents
  while (root.children.length) {
    disposeObject3D(root.children[0]);
    root.remove(root.children[0]);
  }

  if (!r) { resizeIso3D(); return; }

  const roomW   = Math.max(r.walls.north, r.walls.south, 48);
  const roomD   = Math.max(r.walls.east,  r.walls.west,  48);
  const ceiling = r.ceilingHeight || 96;
  const openings = r.openings || [];
  const ld = getLShapeData(r); // null for rectangular rooms

  // Every wall knows which way is into the room, so it can fade when the camera is behind it
  function tagCutaway(mesh, wallName) {
    const f = wallFrame(r, wallName); if (!f) return;
    mesh.userData.cutaway = { nx: f.inward[0], nz: f.inward[1], px: f.start[0], pz: f.start[1] };
  }

  // ── Wall color map ──
  const wallColors = { north:0xF8FAFC, south:0xF1F5F9, east:0xEFF3F7, west:0xF0F4F8, step1:0xF4F6F8, step2:0xF4F6F8 };

  // ── Floor ──
  if (ld) {
    // L-shaped floor via ShapeGeometry
    // THREE.Shape is in XY; after rotation.x = -PI/2: (sx, sy) → 3D (sx, 0, -sy)
    // So use (x, -z) to map to correct 3D (x, 0, z)
    const fShape = new THREE.Shape();
    fShape.moveTo(ld.polygon[0][0], -ld.polygon[0][1]);
    for (let i=1; i<ld.polygon.length; i++) fShape.lineTo(ld.polygon[i][0], -ld.polygon[i][1]);
    const floorL = new THREE.Mesh(new THREE.ShapeGeometry(fShape), floorMaterial(activeProj()));
    floorL.rotation.x = -Math.PI/2;
    floorL.position.y = 1; // lift off wall-base plane to prevent z-fighting
    floorL.receiveShadow = true;
    root.add(floorL);
  } else {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), floorMaterial(activeProj(), roomW, roomD));
    floor.rotation.x = -Math.PI/2;
    floor.position.set(roomW/2, 1, roomD/2); // y=1 lifts floor off wall-base plane → no z-fighting
    floor.receiveShadow = true;
    root.add(floor);
    if (layers.grid) root.add(buildFloorGrid3D(roomW, roomD));
  }

  // ── Walls ──
  // Each wall sits at its natural interior boundary (z=0, z=roomD, x=0, x=roomW).
  // ExtrudeGeometry gives each wall 3.5" of physical depth so perpendicular corner walls
  // cannot z-fight (they're never coplanar). polygonOffset on the wall material handles
  // any remaining coplanarity with cabinet back-faces at the same plane.
  const WT = 3.5;

  function addWall3D(wallName, length, posX, posZ, rotY) {
    const mesh = buildWall3D(wallName, length, ceiling, openings, wallColors[wallName] || 0xF4F6F8);
    if (rotY) mesh.rotation.y = rotY;
    mesh.position.set(posX, 0, posZ);
    tagCutaway(mesh, wallName);
    root.add(mesh);
  }

  if (ld) {
    // Trace each polygon edge and build the matching wall panel
    const poly = ld.polygon, n = poly.length;
    for (let i=0; i<n; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i+1)%n];
      const horiz = Math.abs(az-bz) < 0.1;
      const length = horiz ? Math.abs(bx-ax) : Math.abs(bz-az);
      const wallName = horiz
        ? (az < 0.1 ? 'north' : Math.abs(az-roomD)<0.1 ? 'south' : 'step2')
        : (ax < 0.1 ? 'west'  : Math.abs(ax-roomW)<0.1 ? 'east'  : 'step1');
      const mesh = buildWall3D(wallName, length, ceiling, openings, wallColors[wallName]||0xF4F6F8);
      tagCutaway(mesh, wallName);
      // The extrusion runs +z (horizontal edges) or −x (vertical edges). Shift a wall back by
      // its thickness when the room is on that side, so it always stands OUTSIDE the room —
      // otherwise it covered the first 3.5" in front of the north/east walls and hid mirrors,
      // sconces and anything else shallow mounted on them.
      if (horiz) {
        const roomBelow = _pointInPoly([(ax + bx) / 2, az + 1], poly);
        mesh.position.set(Math.min(ax,bx), 0, roomBelow ? az - WT : az);
      } else {
        mesh.rotation.y = -Math.PI/2;
        const roomLeft = _pointInPoly([ax - 1, (az + bz) / 2], poly);
        mesh.position.set(roomLeft ? ax + WT : ax, 0, Math.min(az,bz));
      }
      root.add(mesh);
    }
  } else {
    // Natural positions: interior face sits at the room boundary.
    // ExtrudeGeometry gives each wall 3D thickness so perpendicular walls can't z-fight at corners.
    // polygonOffset on the material handles any remaining wall/cabinet coplanarity.
    // (the extrusion runs +z / −x, so north and east are shifted back by their thickness —
    // they used to stand 3.5" INSIDE the room and hid anything shallow mounted on them)
    addWall3D('north', roomW, 0,          -WT,   0);           // interior face at z=0
    addWall3D('south', roomW, 0,          roomD, 0);           // interior face at z=roomD
    addWall3D('west',  roomD, 0,          0,     -Math.PI/2);  // interior face at x=0
    addWall3D('east',  roomD, roomW + WT, 0,     -Math.PI/2);  // interior face at x=roomW
  }

  // Convert wall+offset to 3D x,z position (x=width axis, z=depth axis)
  function cabPos(wall, offset, width, depth, wallOffset = 0) {
    const rc = itemRect(r, { wall, offset, width, wallOffset }, depth);
    if (!rc) return { x0: offset, z0: 0, w: width, d: depth };
    return { x0: rc.x, z0: rc.y, w: rc.w, d: rc.h };
  }

  function addBox(x0, y0, z0, w, h, d, color, opts={}) {
    if (w<=0 || h<=0 || d<=0) return null;
    const mat = opts.materials || new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.65,
      metalness: opts.metalness ?? 0.05
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    mesh.position.set(x0+w/2, y0+h/2, z0+d/2);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }

  function addLabel(text, x, y, z, opts) {
    if (!text) return;
    const sprite = makeLabelSprite3D(text, opts);
    sprite.position.set(x,y,z);
    root.add(sprite);
  }

  // ── Style colour (use project door-style swatch for all cabinets) ──
  const _p3d = activeProj();
  const _styleHex = (getStyles().find(s => s.code === (_p3d?.style || getStyles()[0]?.code)) || getStyles()[0])?.swatch || '#F2F1EE';

  // ── Cabinets ──
  const _frontKit = makeFrontKit(_p3d?.hardware);   // shared door/drawer materials + shapes for this render
  r.cabinets.filter(layerShowsItem).forEach(cab => {
    const cat = CATALOG[cab.type]; if (!cat) return;
    // Corner cabinets on two walls: L-shaped lazy susan, five-sided diagonal upper (corners.js)
    const _ci = cornerInfo(r, cab);
    if (_ci) { root.add(buildCorner3D(r, cab, _ci, _frontKit, _p3d)); return; }
    const off = cab.offset || 0;
    const h   = cab.height || cat.heights?.[0] || 30;
    const dep = cab.depth  || cat.depth || 24;
    const baseY = itemVerticalRange(cab)[0];   // uppers at their bottom, fillers wherever they sit, bases on the floor
    const pos = cabPos(cab.wall, off, cab.width, dep, cab.wallOffset || 0);
    const baseCol = doorStyleInfo(cab.styleOverride || _p3d?.style).swatch;   // per-cabinet style wins

    let _m;
    if (hasToeKick(cab)) {
      // Recessed toe kick: the box starts 4.5" up, with a darker kick board set back 3"
      _m = addBox(pos.x0, TOE_KICK_H, pos.z0, pos.w, h - TOE_KICK_H, pos.d, baseCol);
      const kick = cabPos(cab.wall, off, cab.width, dep - TOE_RECESS, cab.wallOffset || 0);
      addBox(kick.x0, 0, kick.z0, kick.w, TOE_KICK_H, kick.d, '#' + shade3D(baseCol, -70).toString(16).padStart(6, '0'));
    } else {
      _m = addBox(pos.x0, baseY, pos.z0, pos.w, h, pos.d, baseCol);
    }
    if (_m) _m.userData.itemId = cab.id; // for selection highlight
    // Bumped out from the wall (7.1): filler casing on its open sides, in the cabinet's finish
    casingPieces(r, cab).forEach(pc => {
      const cr = casingRect(r, pc); if (!cr) return;
      addBox(cr.x, pc.bottom, cr.y, cr.w, pc.height, cr.h, '#' + shade3D(baseCol, -6).toString(16).padStart(6, '0'));
    });
    // Doors, drawer fronts and hardware in the cabinet's door style (fronts3d.js)
    const fronts = buildCabinetFronts3D(cab, r, _frontKit, _p3d);
    if (fronts) root.add(fronts);
    if (cab.width >= 6) addLabel(fmtFrac(cab.width), pos.x0+pos.w/2, baseY+h+3, pos.z0+pos.d/2, { fontSize:24, scale:0.045 });
  });

  // ── Appliances (appliances3d.js: modelled fridges, ranges, hoods, …) ──
  const _appKit = makeApplianceKit();
  (r.appliances||[]).filter(layerShowsItem).forEach(app => {
    const acat = APPLIANCES[app.type]; if (!acat) return;
    const g = buildAppliance3D(r, app, _appKit, _frontKit, _p3d); if (!g) return;
    root.add(g);
    const pos = cabPos(app.wall, app.offset || 0, app.width, itemDepth(app));
    addLabel(acat.abbr || '', pos.x0+pos.w/2, itemVerticalRange(app)[1]+3, pos.z0+pos.d/2, { fontSize:24, scale:0.045 });
  });

  // ── Islands ──
  (r.islands||[]).forEach(isl => {
    const h = 34.5; // standard counter height
    const _m = addBox(isl.x, 0, isl.y, isl.width, h, isl.depth, _styleHex);
    if (_m) _m.userData.itemId = isl.id;
    addLabel(isl.label||'Island', isl.x+isl.width/2, h+3, isl.y+isl.depth/2, { fontSize:26, scale:0.05 });
  });

  // ── Countertops, end panels, crown / light rail (counters.js) ──
  root.add(buildCountersAndTrim3D(r, _p3d));

  // ── Room dimension labels ──
  addLabel(fmtIn(roomW), roomW/2, 1, roomD+8, { fontSize:24, scale:0.05, bg:'transparent', color:'#475569' });
  addLabel(fmtIn(roomD), -8, 1, roomD/2, { fontSize:24, scale:0.05, bg:'transparent', color:'#475569' });

  iso3D._roomDims = { roomW, roomD, ceiling };
  setupSun(r); applyLighting(); syncScenePanel();
  resizeIso3D();                    // first, so the camera fit uses the canvas's real shape
  if (!iso3D.initedCamera) { setCameraPreset('hero', true); iso3D.initedCamera = true; }
  render3DNow();
  highlight3DSelection();
}

// Appliance front face for the elevation (and printed plans). Matches the 3D models in
// appliances3d.js: same variants (French door / side-by-side / top freezer, chimney or
// under-cabinet hood, single/double oven) and finish (stainless, black, white, panel-ready).
// `scale` is px per inch. opts: { PDF, styleCode (door style for panel-ready),
// ceilY (screen y of the ceiling, for a chimney hood's flue), r (room) }.
function drawApplianceFace(ctx, app, acat, x, y, aW, aH, scale, opts = {}) {
  const k = scale / ELEV_SCALE, PDF = !!opts.PDF, s = scale;   // s: px per inch
  const botY = y + aH;
  const finish = applianceFinish(app);
  const FIN = { stainless: '#C5C9CE', black: '#3B3D41', white: '#F1F1EF' };
  const body = PDF ? '#FFFFFF' : finish === 'panel' ? (getStyles().find(st => st.code === opts.styleCode) || {}).swatch || '#F2F1EE'
    : FIN[finish] || acat.color;
  const DARK = PDF ? '#555555' : '#1F2328', LINE = PDF ? '#1a1a1a' : 'rgba(0,0,0,0.45)', GLASS = PDF ? '#BBBBBB' : '#14181C', STEEL = PDF ? '#777777' : '#9AA0A8';
  const rect = (fill, X, Y, W, H, stroke) => { if (fill) { ctx.fillStyle = fill; ctx.fillRect(X, Y, W, H); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1 * k; ctx.strokeRect(X, Y, W, H); } };
  const bar = (X, Y, len, vertical) => { ctx.fillStyle = STEEL; vertical ? ctx.fillRect(X - 1.2 * k, Y - len / 2, 2.4 * k, len) : ctx.fillRect(X - len / 2, Y - 1.2 * k, len, 2.4 * k); };
  const door = (X, Y, W, H) => {               // one door/front in the appliance finish (or door style)
    rect(body, X, Y, W, H, LINE);
    if (finish === 'panel') drawDoorPanel(ctx, X, Y, W, H, opts.styleCode, s, PDF);
  };
  const isHood = app.type === 'hood';
  const FIXTURE_FACE = ['toilet', 'tub', 'shower', 'mirror', 'medicineCabinet', 'sconce', 'tv'];   // drawn below, shape by shape
  if (!isHood && app.type !== 'floatingShelf' && !FIXTURE_FACE.includes(app.type)) rect(body, x, y, aW, aH, LINE);   // (shelves: only the boards, wall between)

  if (app.type === 'refrigerator') {
    const v = applianceVariant(app), kick = 3 * s;
    rect(DARK, x + s, botY - kick + 0.6 * s, aW - 2 * s, 2 * s);   // toe grille
    if (v === 'sxs') {
      const sx = x + aW * 0.42;
      door(x, y, sx - x, aH - kick); door(sx, y, x + aW - sx, aH - kick);
      bar(sx - 1.4 * s, y + aH * 0.45, aH * 0.42, true); bar(sx + 1.4 * s, y + aH * 0.45, aH * 0.42, true);
      const dw = Math.min(8 * s, (sx - x) * 0.5); rect(DARK, (x + sx) / 2 - dw / 2, y + aH * 0.32, dw, aH * 0.18);
    } else if (v === 'top') {
      const sy = y + (aH - kick) * 0.3;
      door(x, y, aW, sy - y); door(x, sy, aW, botY - kick - sy);
      bar(x + aW - 2.2 * s, sy - 6 * s, 9 * s, true); bar(x + aW - 2.2 * s, sy + 10 * s, 16 * s, true);
    } else {
      const sy = botY - kick - (aH - kick) * 0.36;
      door(x, y, aW / 2, sy - y); door(x + aW / 2, y, aW / 2, sy - y); door(x, sy, aW, botY - kick - sy);
      bar(x + aW / 2 - 1.6 * s, y + (sy - y) * 0.5, (sy - y) * 0.55, true); bar(x + aW / 2 + 1.6 * s, y + (sy - y) * 0.5, (sy - y) * 0.55, true);
      bar(x + aW / 2, sy + 2.6 * s, Math.min(aW * 0.6, 22 * s), false);
    }
  } else if (app.type === 'range') {
    rect(body, x, y - 4.5 * s, aW, 4.5 * s, LINE);                                    // backguard
    rect(DARK, x, y, aW, 0.8 * s);                                                       // cooktop edge
    const n = app.width >= 35.9 ? 6 : 4;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x + aW * (i + 1) / (n + 1), y + 3.2 * s, 0.95 * s, 0, Math.PI * 2); ctx.fillStyle = DARK; ctx.fill(); }
    rect(body, x + 0.3 * s, y + 5.5 * s, aW - 0.6 * s, aH - 11.5 * s, LINE);              // oven door
    rect(GLASS, x + 4 * s, y + 12 * s, aW - 8 * s, aH - 23 * s);
    bar(x + aW / 2, y + 7.5 * s, aW - 6 * s, false);
    rect(body, x + 0.3 * s, botY - 5.6 * s, aW - 0.6 * s, 4.2 * s, LINE);                // drawer
    bar(x + aW / 2, botY - 4.4 * s, Math.min(10 * s, aW * 0.35), false);
  } else if (app.type === 'dishwasher') {
    rect(DARK, x, botY - TOE_KICK_H * s, aW, TOE_KICK_H * s);
    door(x, y, aW, aH - TOE_KICK_H * s);
    if (finish !== 'panel') rect(DARK, x + s, y + 0.6 * s, aW - 2 * s, 1.8 * s);
    bar(x + aW / 2, y + 4.4 * s, finish === 'panel' ? Math.min(12 * s, aW * 0.45) : aW - 6 * s, false);
  } else if (app.type === 'microwave') {
    const dr = x + aW * 0.72;
    rect(DARK, x + s, y + 0.6 * s, aW - 2 * s, 1.4 * s);                                 // vent grille
    rect(GLASS, x + 2 * s, y + 4.6 * s, dr - x - 5.5 * s, aH - 7 * s);
    bar(dr - 1.6 * s, y + aH / 2 + s, (aH - 2.4 * s) * 0.7, true);
    rect(GLASS, dr + 0.1 * s, y + 2.4 * s, x + aW - dr - 0.3 * s, aH - 2.8 * s);
  } else if (app.type === 'microwaveDrawer') {
    rect(GLASS, x + 0.3 * s, y + 0.3 * s, aW - 0.6 * s, 2.1 * s);
    rect(GLASS, x + 3 * s, y + 5 * s, aW - 6 * s, aH - 7.2 * s);
  } else if (app.type === 'wallOven') {
    const ctrl = 4 * s, doors = (app.height || 29) >= 50 ? 2 : 1, each = (aH - ctrl) / doors;
    rect(GLASS, x + 0.4 * s, y + 0.3 * s, aW - 0.8 * s, ctrl - 0.5 * s);
    for (let i = 0; i < doors; i++) {
      const dy = y + ctrl + i * each;
      rect(body, x + 0.4 * s, dy + 0.2 * s, aW - 0.8 * s, each - 0.4 * s, LINE);
      rect(GLASS, x + 3.5 * s, dy + 6 * s, aW - 7 * s, each - 9.4 * s);
      bar(x + aW / 2, dy + 3 * s, aW - 7 * s, false);
    }
  } else if (app.type === 'cooktop') {
    // Seen from the front, a cooktop is just the thin glass edge on the counter
    rect(GLASS, x, botY - 0.4 * s, aW, 0.4 * s);
  } else if (isHood) {
    const v = applianceVariant(app);
    const under = v === 'under' || (v === 'auto' && opts.r && hoodHasCabinetAbove(opts.r, app));
    if (under) {
      rect(body, x, botY - 6 * s, aW, 6 * s, LINE);
      rect(DARK, x + aW * 0.3, botY - 2 * s, aW * 0.4, 0.8 * s);
    } else {
      const band = 3 * s, slopeTop = botY - Math.max(8, Math.min(aH / s - 4, 12)) * s, fw = Math.min(12 * s, aW * 0.4);
      const cx = x + aW / 2;
      if (opts.ceilY != null) rect(body, cx - fw / 2, opts.ceilY, fw, slopeTop - opts.ceilY, LINE);   // flue
      ctx.beginPath(); ctx.moveTo(x, botY - band); ctx.lineTo(cx - fw / 2, slopeTop); ctx.lineTo(cx + fw / 2, slopeTop); ctx.lineTo(x + aW, botY - band); ctx.closePath();
      ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1 * k; ctx.stroke();
      rect(body, x, botY - band, aW, band, LINE);
      rect(PDF ? '#999' : '#CFD6DC', cx - aW * 0.2, botY - band + 0.8 * s, aW * 0.4, 0.8 * s);
    }
  } else if (app.type === 'beverageCooler') {
    rect(DARK, x, botY - TOE_KICK_H * s, aW, TOE_KICK_H * s);
    if (finish === 'panel') {
      door(x, y, aW, aH - TOE_KICK_H * s);
      const f = 2.2 * s; rect(PDF ? '#DDDDDD' : '#2A3540', x + f, y + f, aW - 2 * f, aH - TOE_KICK_H * s - 2 * f, LINE);
    } else {
      const f = 2.2 * s; rect(PDF ? '#DDDDDD' : '#2A3540', x + f, y + f, aW - 2 * f, aH - TOE_KICK_H * s - 2 * f, LINE);
      ctx.strokeStyle = PDF ? '#999' : '#8C97A1'; ctx.lineWidth = 1 * k;
      for (let i = 1; i <= 3; i++) { const ly = y + f + (aH - TOE_KICK_H * s - 2 * f) * i / 4; ctx.beginPath(); ctx.moveTo(x + f, ly); ctx.lineTo(x + aW - f, ly); ctx.stroke(); }
    }
    bar(x + aW - 1.6 * s, y + aH * 0.4, Math.min(14 * s, aH * 0.4), true);
  } else if (app.type === 'toilet') {                 // bathroom fixtures (7.4)
    const CH = PDF ? '#FFFFFF' : '#F7F7F5';
    rect(CH, x + 1 * s, y, aW - 2 * s, 15 * s, LINE);                                   // tank
    ctx.beginPath(); ctx.ellipse(x + aW / 2, botY - 11 * s, aW / 2 - 1 * s, 4.5 * s, 0, 0, Math.PI * 2);   // bowl rim
    ctx.fillStyle = CH; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1 * k; ctx.stroke();
    rect(CH, x + aW * 0.28, botY - 9 * s, aW * 0.44, 9 * s, LINE);                      // pedestal
  } else if (app.type === 'tub') {
    const CH = PDF ? '#FFFFFF' : '#F7F7F5';
    rect(CH, x, y, aW, aH, LINE); rect(null, x + 1.5 * s, y + 1.5 * s, aW - 3 * s, 2 * s, LINE);   // apron + rim
    rect(STEEL, x + 4 * s, y - 13 * s, 3 * s, 1 * s);                                     // spout
  } else if (app.type === 'shower') {
    rect(PDF ? '#FFFFFF' : '#F7F7F5', x, botY - 4 * s, aW, 4 * s, LINE);                 // curb
    rect(PDF ? '#F5F9FB' : 'rgba(186,230,253,0.35)', x, y, aW, aH - 4 * s, LINE);        // glass
    ctx.strokeStyle = PDF ? '#999' : 'rgba(3,105,161,0.35)'; ctx.lineWidth = 1 * k;
    ctx.beginPath(); ctx.moveTo(x + aW * 0.5, y); ctx.lineTo(x + aW * 0.5, botY - 4 * s); ctx.stroke();   // door seam
    rect(STEEL, x + aW / 2 - 3 * s, botY - 62 * s, 6 * s, 1.2 * s);                      // head
    bar(x + aW * 0.5 + 2.5 * s, botY - 40 * s, 12 * s, true);
  } else if (app.type === 'mirror' || app.type === 'medicineCabinet') {
    rect(app.type === 'mirror' ? DARK : (PDF ? '#FFFFFF' : '#F1F1EF'), x, y, aW, aH, LINE);
    rect(PDF ? '#EEF3F6' : '#C8D3DC', x + 1 * s, y + 1 * s, aW - 2 * s, aH - 2 * s, LINE);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1 * k;                    // a glint
    ctx.beginPath(); ctx.moveTo(x + aW * 0.2, y + aH * 0.75); ctx.lineTo(x + aW * 0.45, y + aH * 0.25); ctx.stroke();
  } else if (app.type === 'tv') {                     // 7.4b
    rect(PDF ? '#FFFFFF' : '#111827', x, y, aW, aH, LINE);
    rect(PDF ? '#EEEEEE' : '#1F2937', x + 0.6 * s, y + 0.6 * s, aW - 1.2 * s, aH - 1.2 * s);
  } else if (app.type === 'sconce') {
    rect(STEEL, x + aW / 2 - 2 * s, y + 3 * s, 4 * s, 4 * s);
    ctx.beginPath(); ctx.moveTo(x + aW / 2 - 2.2 * s, y + 4 * s); ctx.lineTo(x + aW / 2 + 2.2 * s, y + 4 * s); ctx.lineTo(x + aW / 2 + 2.6 * s, y + 10 * s); ctx.lineTo(x + aW / 2 - 2.6 * s, y + 10 * s); ctx.closePath();
    ctx.fillStyle = PDF ? '#FFFFFF' : '#FFF4D6'; ctx.fill(); ctx.strokeStyle = LINE; ctx.stroke();
  } else if (app.type === 'floatingShelf') {           // each shelf in the stack (7.3)
    const st = shelfStack(app), fk = shelfFinish(app);
    const col = PDF ? '#FFFFFF' : fk === 'cabinet' ? ((getStyles().find(x => x.code === opts.styleCode) || {}).swatch || '#F2F1EE') : SHELF_FINISHES[fk].color;
    for (let k = 0; k < st.n; k++) rect(col, x, botY - (k * st.spacing + st.t) * s, aW, st.t * s, LINE);
  }

  if (opts.label !== false) {
    // Label on a small tag so it reads on any finish
    ctx.font=`bold ${Math.max(7,Math.min(scale*1.6,10))}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const ly = app.type === 'cooktop' ? y - 6 : y + aH / 2, tw = ctx.measureText(acat.abbr).width + 8;
    ctx.fillStyle = PDF ? '#FFFFFF' : 'rgba(15,23,42,0.72)'; ctx.fillRect(x + aW / 2 - tw / 2, ly - 7, tw, 14);
    ctx.fillStyle = PDF ? '#1a1a1a' : '#F9FAFB'; ctx.fillText(acat.abbr, x+aW/2, ly);
  }
}

