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

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const root = new THREE.Group();
  scene.add(root);

  iso3D = { renderer, scene, camera, controls, root, sun, initedCamera: false };

  controls.addEventListener('change', () => renderer.render(scene, camera));

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

// Position camera/sun for a good default view of the room
function setIso3DCamera({roomW, roomD, ceiling}) {
  const target = new THREE.Vector3(roomW/2, ceiling*0.3, roomD/2);
  const dist = Math.max(roomW, roomD, ceiling) * 1.3 + 80;
  iso3D.camera.position.set(target.x - dist*0.62, target.y + dist*0.55, target.z + dist*0.62);
  iso3D.camera.near = Math.max(1, dist*0.01);
  iso3D.camera.far  = dist*10;
  iso3D.camera.updateProjectionMatrix();
  iso3D.controls.target.copy(target);
  iso3D.controls.update();

  const sun = iso3D.sun;
  sun.position.set(target.x + dist*0.5, target.y + dist*1.1, target.z - dist*0.4);
  sun.target.position.copy(target);
  sun.target.updateMatrixWorld();
  const shadowSize = Math.max(roomW, roomD)*0.8 + 40;
  sun.shadow.camera.left   = -shadowSize;
  sun.shadow.camera.right  =  shadowSize;
  sun.shadow.camera.top    =  shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = dist*6;
  sun.shadow.camera.updateProjectionMatrix();
}

// "Reset View" button handler
function resetIso3DView() {
  if (!iso3D || !iso3D._roomDims) return;
  setIso3DCamera(iso3D._roomDims);
  iso3D.renderer.render(iso3D.scene, iso3D.camera);
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

  // ── Auto-pick which wall to omit (open) for camera visibility ──
  // Camera sits at SW corner looking NE, so south+west walls block the view most.
  const allWallItems = [...r.cabinets, ...(r.appliances||[])];
  const wallEmpty = name => !allWallItems.some(c => c.wall === name);
  // The camera sits south-west of the room, so an empty south or west wall only blocks
  // the view — hide all of those. If both have cabinets, fall back to hiding one empty wall.
  const camSideEmpty = ['south','west'].filter(w => wallEmpty(w));
  const openWalls = new Set(camSideEmpty.length ? camSideEmpty : [['east','north'].find(w => wallEmpty(w))].filter(Boolean));

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
    const floorL = new THREE.Mesh(new THREE.ShapeGeometry(fShape), new THREE.MeshStandardMaterial({ color:0xE8EDF2, roughness:0.95 }));
    floorL.rotation.x = -Math.PI/2;
    floorL.position.y = 1; // lift off wall-base plane to prevent z-fighting
    floorL.receiveShadow = true;
    root.add(floorL);
  } else {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), new THREE.MeshStandardMaterial({ color:0xE8EDF2, roughness:0.95 }));
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
    if (openWalls.has(wallName)) return;
    const mesh = buildWall3D(wallName, length, ceiling, openings, wallColors[wallName] || 0xF4F6F8);
    if (rotY) mesh.rotation.y = rotY;
    mesh.position.set(posX, 0, posZ);
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
      if (openWalls.has(wallName)) continue;
      const mesh = buildWall3D(wallName, length, ceiling, openings, wallColors[wallName]||0xF4F6F8);
      if (horiz) {
        // Natural position: interior face sits exactly at the polygon edge z-value.
        // ExtrudeGeometry extrudes outward (away from interior) — no corner gaps.
        mesh.position.set(Math.min(ax,bx), 0, az);
      } else {
        mesh.rotation.y = -Math.PI/2;
        // Natural position: interior face at the polygon edge x-value.
        mesh.position.set(ax, 0, Math.min(az,bz));
      }
      root.add(mesh);
    }
  } else {
    // Natural positions: interior face sits at the room boundary.
    // ExtrudeGeometry gives each wall 3D thickness so perpendicular walls can't z-fight at corners.
    // polygonOffset on the material handles any remaining wall/cabinet coplanarity.
    addWall3D('north', roomW, 0,     0,     0);           // interior face at z=0
    addWall3D('south', roomW, 0,     roomD, 0);           // interior face at z=roomD
    addWall3D('west',  roomD, 0,     0,     -Math.PI/2);  // interior face at x=0
    addWall3D('east',  roomD, roomW, 0,     -Math.PI/2);  // interior face at x=roomW
  }

  // Convert wall+offset to 3D x,z position (x=width axis, z=depth axis)
  function cabPos(wall, offset, width, depth) {
    const rc = itemRect(r, { wall, offset, width }, depth);
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

  // Inset door/drawer front panel overlay on the room-facing side of a cabinet
  function addFrontPanel(pos, baseY, h, wall, color, glass) {
    const inset = 1.5, thk = 0.5;
    const hh = h - inset*2;
    if (hh<=0) return;
    let geoArgs, cx, cz;
    const cy = baseY + h/2;
    switch(wall) {
      case 'north': {
        const ww = pos.w - inset*2; if (ww<=0) return;
        geoArgs = [ww,hh,thk]; cx = pos.x0+pos.w/2; cz = pos.z0+pos.d+thk/2; break;
      }
      case 'south': {
        const ww = pos.w - inset*2; if (ww<=0) return;
        geoArgs = [ww,hh,thk]; cx = pos.x0+pos.w/2; cz = pos.z0-thk/2; break;
      }
      case 'west': {
        const dd = pos.d - inset*2; if (dd<=0) return;
        geoArgs = [thk,hh,dd]; cx = pos.x0+pos.w+thk/2; cz = pos.z0+pos.d/2; break;
      }
      case 'east': {
        const dd = pos.d - inset*2; if (dd<=0) return;
        geoArgs = [thk,hh,dd]; cx = pos.x0-thk/2; cz = pos.z0+pos.d/2; break;
      }
      case 'step1': case 'step2': {
        // Map step wall to the face that looks into the main room
        const sw = ld && ld[wall];
        if (!sw) return;
        const effectiveDir = sw.isVertical
          ? (sw.depthRight ? 'east' : 'west')   // east = panel on left face; west = panel on right face
          : (sw.depthDown  ? 'south' : 'north');
        addFrontPanel(pos, baseY, h, effectiveDir, color, glass);
        return;
      }
      default: return;
    }
    const mat = new THREE.MeshStandardMaterial({
      color: shade3D(color, glass ? 50 : -10),
      roughness: glass ? 0.15 : 0.5,
      metalness: glass ? 0.1 : 0.05,
      transparent: !!glass,
      opacity: glass ? 0.45 : 1
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...geoArgs), mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  }

  // ── Style colour (use project door-style swatch for all cabinets) ──
  const _p3d = activeProj();
  const _styleHex = (getStyles().find(s => s.code === (_p3d?.style || getStyles()[0]?.code)) || getStyles()[0])?.swatch || '#F2F1EE';

  // ── Cabinets ──
  r.cabinets.filter(layerShowsItem).forEach(cab => {
    const cat = CATALOG[cab.type]; if (!cat) return;
    const off = cab.offset || 0;
    const h   = cab.height || cat.heights?.[0] || 30;
    const dep = cab.depth  || cat.depth || 24;
    const baseY = itemVerticalRange(cab)[0];   // uppers at their bottom, fillers wherever they sit, bases on the floor
    const pos = cabPos(cab.wall, off, cab.width, dep);
    const baseCol = _styleHex;

    const _m = addBox(pos.x0, baseY, pos.z0, pos.w, h, pos.d, baseCol);
    if (_m) _m.userData.itemId = cab.id; // for selection highlight
    if (cab.type !== 'cornerBase' && !isFiller(cab.type)) {   // fillers are plain boards, no door
      addFrontPanel(pos, baseY, h, cab.wall, baseCol, cab.glassDoors);
    }
    if (cab.width >= 6) addLabel(fmtFrac(cab.width), pos.x0+pos.w/2, baseY+h+3, pos.z0+pos.d/2, { fontSize:24, scale:0.045 });
  });

  // ── Appliances ──
  (r.appliances||[]).filter(layerShowsItem).forEach(app => {
    const acat = APPLIANCES[app.type]; if (!acat) return;
    const off  = app.offset || 0;
    const h    = app.height || acat.height || 30;
    const dep  = acat.depth || 24;
    const baseY = app.customElevBottom != null ? app.customElevBottom : (acat.elevBottom || 0);
    const pos  = cabPos(app.wall, off, app.width, dep);

    // A cooktop's burners sit on its top surface; every other appliance shows its face front-on
    const mats = app.type === 'cooktop'
      ? applianceMaterials(app, acat, app.width, dep, app.wall, { top: true })
      : applianceMaterials(app, acat, app.width, h,   app.wall);
    const _m = addBox(pos.x0, baseY, pos.z0, pos.w, h, pos.d, acat.color || '#9CA3AF', { materials: mats });
    if (_m) _m.userData.itemId = app.id;
    addLabel(acat.abbr || '', pos.x0+pos.w/2, baseY+h+3, pos.z0+pos.d/2, { fontSize:24, scale:0.045 });
  });

  // Six materials for an appliance box — flat colour all round, except the room-facing
  // side, which gets the same front-face drawing the elevation view uses (knobs, oven
  // window, fridge handle, …) painted on as a texture.
  function applianceMaterials(app, acat, faceW, faceH, wall, opts = {}) {
    const PX = 8; // texture px per inch
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(faceW*PX)); c.height = Math.max(2, Math.round(faceH*PX));
    drawApplianceFace(c.getContext('2d'), app, acat, 0, 0, c.width, c.height, PX, { label:false });
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const flat = () => new THREE.MeshStandardMaterial({ color: acat.color || '#9CA3AF', metalness:0.3, roughness:0.4 });
    const mats = [flat(), flat(), flat(), flat(), flat(), flat()]; // BoxGeometry order: +x, -x, +y, -y, +z, -z
    // Which side faces into the room (step walls map to whichever main direction they face)
    let dir = wall;
    if (wall === 'step1' || wall === 'step2') {
      const sw = ld && ld[wall];
      dir = !sw ? 'north' : sw.isVertical ? (sw.depthRight ? 'east' : 'west') : (sw.depthDown ? 'south' : 'north');
    }
    const idx = opts.top ? 2 : { west:0, east:1, north:4, south:5 }[dir];
    if (idx != null) { mats[idx].dispose(); mats[idx] = new THREE.MeshStandardMaterial({ map: tex, metalness:0.3, roughness:0.4 }); }
    return mats;
  }

  // ── Islands ──
  (r.islands||[]).forEach(isl => {
    const h = 34.5; // standard counter height
    const _m = addBox(isl.x, 0, isl.y, isl.width, h, isl.depth, _styleHex);
    if (_m) _m.userData.itemId = isl.id;
    addLabel(isl.label||'Island', isl.x+isl.width/2, h+3, isl.y+isl.depth/2, { fontSize:26, scale:0.05 });
  });

  // ── Room dimension labels ──
  addLabel(fmtIn(roomW), roomW/2, 1, roomD+8, { fontSize:24, scale:0.05, bg:'transparent', color:'#475569' });
  addLabel(fmtIn(roomD), -8, 1, roomD/2, { fontSize:24, scale:0.05, bg:'transparent', color:'#475569' });

  iso3D._roomDims = { roomW, roomD, ceiling };
  if (!iso3D.initedCamera) {
    setIso3DCamera(iso3D._roomDims);
    iso3D.initedCamera = true;
  }
  resizeIso3D();
  highlight3DSelection();
}

// Appliance front face. Shared by the elevation view and the 3D view (which paints this
// same drawing onto the room-facing side of the appliance box), so the two always match.
// `scale` is px per inch; fixed pixel insets are scaled relative to the elevation's
// resolution so the proportions hold at any texture size.
function drawApplianceFace(ctx, app, acat, x, y, aW, aH, scale, opts = {}) {
  const k = scale / ELEV_SCALE;
  const botY = y + aH;
  ctx.fillStyle = acat.color;
  ctx.fillRect(x, y, aW, aH);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5*k; ctx.strokeRect(x, y, aW, aH);

  if (app.type === 'refrigerator') {
    // Freezer / fridge split at 60% up from bottom
    const splitY = botY - aH * 0.6;
    ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 1*k;
    ctx.beginPath(); ctx.moveTo(x, splitY); ctx.lineTo(x+aW, splitY); ctx.stroke();
    // Handle (vertical bar near right edge)
    ctx.fillStyle = '#D1D5DB'; ctx.fillRect(x+aW*0.82, y+aH*0.15, aW*0.05, aH*0.3);
    ctx.fillRect(x+aW*0.82, botY-aH*0.45, aW*0.05, aH*0.25);
  } else if (app.type === 'range') {
    // Oven door panel
    ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 1*k;
    ctx.strokeRect(x+4*k, y+aH*0.25, aW-8*k, aH*0.65);
    // Window in door
    ctx.fillStyle = '#1F2937'; ctx.fillRect(x+8*k, y+aH*0.3, aW-16*k, aH*0.25);
    // Knobs row at top
    const knobY = y + aH*0.1;
    [0.2,0.4,0.6,0.8].forEach(fx => {
      ctx.beginPath(); ctx.arc(x+aW*fx, knobY, aW*0.04, 0, Math.PI*2);
      ctx.fillStyle='#9CA3AF'; ctx.fill(); ctx.strokeStyle='#6B7280'; ctx.lineWidth=0.5*k; ctx.stroke();
    });
  } else if (app.type === 'dishwasher') {
    // Control panel strip at top
    ctx.fillStyle = '#4B5563'; ctx.fillRect(x+2*k, y+2*k, aW-4*k, aH*0.15);
    // Inner door panel
    ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 0.8*k;
    ctx.strokeRect(x+5*k, y+aH*0.2, aW-10*k, aH*0.72);
  } else if (app.type === 'microwave') {
    // Vent grille lines on left
    for (let i=1; i<=3; i++) {
      ctx.strokeStyle='#6B7280'; ctx.lineWidth=0.8*k;
      ctx.beginPath(); ctx.moveTo(x+2*k, y+aH*(i/4)); ctx.lineTo(x+aW*0.35, y+aH*(i/4)); ctx.stroke();
    }
    // Control panel on right
    ctx.fillStyle='#374151'; ctx.fillRect(x+aW*0.6, y+2*k, aW*0.35, aH-4*k);
  } else if (app.type === 'cooktop') {
    // 4 burner circles across the thin rect
    [0.15,0.38,0.62,0.85].forEach(fx => {
      ctx.beginPath(); ctx.arc(x+aW*fx, y+aH/2, Math.min(aH*0.35, aW*0.1), 0, Math.PI*2);
      ctx.fillStyle='#374151'; ctx.fill(); ctx.strokeStyle='#6B7280'; ctx.lineWidth=0.6*k; ctx.stroke();
    });
  } else if (app.type === 'hood') {
    // Tapered trapezoid shape (wider at bottom)
    const taper = aW * 0.12;
    ctx.fillStyle = acat.color;
    ctx.beginPath();
    ctx.moveTo(x,        y+aH);
    ctx.lineTo(x+aW,     y+aH);
    ctx.lineTo(x+aW-taper, y);
    ctx.lineTo(x+taper,  y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1*k; ctx.stroke();
    // Vent slots
    ctx.strokeStyle='#6B7280'; ctx.lineWidth=0.8*k;
    [0.3,0.5,0.7].forEach(fy => {
      ctx.beginPath(); ctx.moveTo(x+aW*0.2, y+aH*fy); ctx.lineTo(x+aW*0.8, y+aH*fy); ctx.stroke();
    });
  }

  if (opts.label !== false) {
    ctx.fillStyle='#F9FAFB'; ctx.font=`bold ${Math.max(7,Math.min(scale*1.6,10))}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(acat.abbr, x+aW/2, y+aH/2);
  }
}

