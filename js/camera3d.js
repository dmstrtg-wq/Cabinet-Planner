// My Cabinet Planner — js/camera3d.js
// 3D lighting + camera (Build Plan 3.4):
//   • the view always opens on a good angle — worked out from where the cabinets are
//   • walls between you and the room fade out as you orbit (cutaway), so the camera can
//     never be stuck behind a wall
//   • camera presets: 3/4 Hero, Doorway (eye height), face any wall, Overhead
//   • lighting presets: Daylight, Warm interior, Studio (neutral, white — good for PDFs)
//   • floor finish: Plain, Wood, Tile, LVP (looks only)
// Lighting/floor choices are saved on the project (p.scene).
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// SCENE SETTINGS
// ════════════════════════════
const LIGHTING_PRESETS = {
  daylight: { label: 'Daylight',      bg: 0xeef2f6, amb: [0xffffff, 0.72], hemi: [0xffffff, 0xd9d4ca, 0.38], sun: [0xffffff, 1.0] },
  warm:     { label: 'Warm interior', bg: 0xf2ece3, amb: [0xfff0dc, 0.7], hemi: [0xffe6c7, 0xc9b597, 0.42], sun: [0xffd49e, 0.62] },
  // Studio: white backdrop, so it needs more directional light (edges/shadows) and less
  // ambient, or white cabinets vanish into the background
  studio:   { label: 'Studio',        bg: 0xffffff, amb: [0xffffff, 0.5], hemi: [0xffffff, 0xd8d8d8, 0.4], sun: [0xffffff, 0.95] },
};
const FLOOR_FINISHES = { plain: 'Plain', wood: 'Wood', tile: 'Tile', lvp: 'LVP' };
const EYE_HEIGHT = 64;

function projectScene(p) { return { lighting: 'daylight', floor: 'plain', ...((p && p.scene) || {}) }; }
function setScene(key, value) {
  const p = activeProj(); if (!p) return;
  p.scene = { ...projectScene(p), [key]: value };
  persist(); syncScenePanel();
  if (key === 'lighting') { applyLighting(); render3DNow(); } else renderIsometric();
}
function syncScenePanel() {
  const sc = projectScene(activeProj());
  const l = document.getElementById('light-sel'); if (l) l.value = sc.lighting;
  const f = document.getElementById('floor-sel'); if (f) f.value = sc.floor;
  const w = document.getElementById('cam-wall'), r = activeRoom();
  if (w && r) w.innerHTML = '<option value="">Face a wall…</option>' + roomWalls(r)
    .filter(x => wallLength(r, x) > 0).map(x => `<option value="${x}">${escHtml(wallName(r, x))}</option>`).join('');
}
function applyLighting() {
  if (!iso3D || !iso3D.ambient) return;
  const L = LIGHTING_PRESETS[projectScene(activeProj()).lighting] || LIGHTING_PRESETS.daylight;
  iso3D.scene.background.setHex(L.bg);
  iso3D.ambient.color.setHex(L.amb[0]); iso3D.ambient.intensity = L.amb[1];
  iso3D.hemi.color.setHex(L.hemi[0]); iso3D.hemi.groundColor.setHex(L.hemi[1]); iso3D.hemi.intensity = L.hemi[2];
  iso3D.sun.color.setHex(L.sun[0]); iso3D.sun.intensity = L.sun[1];
}
function render3DNow() { if (iso3D) { updateCutaway(); iso3D.renderer.render(iso3D.scene, iso3D.camera); } }

// ════════════════════════════
// FLOOR FINISHES
// ════════════════════════════
// Each texture covers 48" × 48" of floor; the floor mesh repeats it to scale.
const FLOOR_TILE_IN = 48;
const _floorTex = {};
function floorTexture(kind) {
  if (_floorTex[kind] && _floorTex[kind].image) return _floorTex[kind];
  const S = 256, px = S / FLOOR_TILE_IN;     // pixels per inch
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const planks = (width, tones, seam) => {
    x.fillStyle = tones[0]; x.fillRect(0, 0, S, S);          // base color under everything
    const tone = n => tones[((n % tones.length) + tones.length) % tones.length];   // n can be negative
    for (let row = 0; row * width * px < S; row++) {
      let pos = -((row * 37) % 48) * px;     // stagger the end joints
      while (pos < S) {
        const k = row * 17 + Math.round(pos / px) * 3;
      const len = (40 + (((k % 44) + 44) % 44)) * px;         // 40–84" boards (always positive — pos starts negative)
        x.fillStyle = tone(row + Math.round(pos / px));
        x.fillRect(pos, row * width * px, len, width * px);
        for (let gr = 0; gr < 5; gr++) { x.fillStyle = 'rgba(70,45,20,0.06)'; x.fillRect(pos, row * width * px + (gr + 0.5) * width * px / 5, len, 1); }
        x.fillStyle = seam; x.fillRect(pos, row * width * px, 1, width * px);
        pos += len;
      }
      x.fillStyle = seam; x.fillRect(0, row * width * px, S, 1);
    }
  };
  // Board tones stay close together — real floors read as one color with subtle variation
  if (kind === 'wood') planks(5, ['#b08860', '#aa835b', '#b48c64', '#a8815a'], 'rgba(70,45,20,0.28)');
  else if (kind === 'lvp') planks(7, ['#b8aa95', '#b3a590', '#bdaf9b', '#b0a28c'], 'rgba(80,70,55,0.25)');
  else if (kind === 'tile') {
    x.fillStyle = '#b9b6b0'; x.fillRect(0, 0, S, S);            // grout
    const t = 12 * px, g = 0.25 * px;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      x.fillStyle = ['#e9e6e0', '#e3e0d9', '#edeae4'][(i * 3 + j) % 3];
      x.fillRect(i * t + g, j * t + g, t - 2 * g, t - 2 * g);
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return (_floorTex[kind] = tex);
}
// Material for the floor. `planeW/planeD` given → PlaneGeometry (UVs 0..1); otherwise
// ShapeGeometry (UVs are inches).
function floorMaterial(p, planeW, planeD) {
  const kind = projectScene(p).floor;
  if (kind === 'plain' || !FLOOR_FINISHES[kind]) return new THREE.MeshStandardMaterial({ color: 0xE8EDF2, roughness: 0.95 });
  const t = floorTexture(kind).clone(); t.needsUpdate = true;
  if (planeW) t.repeat.set(planeW / FLOOR_TILE_IN, planeD / FLOOR_TILE_IN); else t.repeat.set(1 / FLOOR_TILE_IN, 1 / FLOOR_TILE_IN);
  return new THREE.MeshStandardMaterial({ map: t, roughness: kind === 'tile' ? 0.45 : 0.7 });
}

// ════════════════════════════
// CUTAWAY: fade walls that stand between the camera and the room
// ════════════════════════════
// Walls are tagged in renderIsometric with their inward direction and a point on their
// room-side face. If the camera is on the far (outside) side of a wall, it's in the way.
function updateCutaway() {
  if (!iso3D) return;
  const cam = iso3D.camera.position;
  iso3D.root.children.forEach(m => {
    const cw = m.userData && m.userData.cutaway; if (!cw) return;
    const outside = (cam.x - cw.px) * cw.nx + (cam.z - cw.pz) * cw.nz < -1;
    const mat = m.material;
    if (mat.userData.faded === outside) return;
    mat.userData.faded = outside;
    mat.transparent = outside; mat.opacity = outside ? 0.1 : 1; mat.depthWrite = !outside;
    mat.needsUpdate = true;
  });
}

// ════════════════════════════
// CAMERA PRESETS
// ════════════════════════════
function roomBounds(r) {
  const { w, h } = roomSize(r);
  return { w, h, cx: w / 2, cz: h / 2, ceiling: r.ceilingHeight || 96 };
}
// Horizontal direction (unit x,z from the room's center toward the camera) that shows the
// most cabinet fronts: each wall's run counts by its length, toward views that face it,
// and a run that would sit between the camera and the room counts against.
function heroDirection(r) {
  const weight = {};
  [...r.cabinets, ...(r.appliances || [])].forEach(i => { weight[i.wall] = (weight[i.wall] || 0) + i.width; });
  const walls = Object.keys(weight).filter(w => wallFrame(r, w));
  if (!walls.length) return [-0.7071, 0.7071];          // empty room: classic south-west 3/4 view
  const total = walls.reduce((s, w) => s + weight[w], 0);
  let best = null;
  for (let k = 0; k < 16; k++) {
    const th = k * Math.PI / 8, d = [Math.cos(th), Math.sin(th)];
    let score = 0;
    walls.forEach(w => {
      const f = wallFrame(r, w), t = f.inward[0] * d[0] + f.inward[1] * d[1];
      score += weight[w] * (t > 0 ? t : t < -0.35 ? 2.2 * t : 0);
    });
    score += total * 0.04 * Math.abs(Math.sin(2 * th));   // tie-break toward 3/4 angles
    if (!best || score > best.score + 1e-6) best = { score, d };
  }
  return best.d;
}
function cameraPresetPose(r, preset) {
  const B = roomBounds(r);
  const cam = iso3D.camera, aspect = cam.aspect || 1.6;
  const vHalf = (cam.fov / 2) * Math.PI / 180, hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const fit = (halfW, halfH) => Math.max(halfW / Math.tan(hHalf), halfH / Math.tan(vHalf));
  if (preset === 'overhead') {
    const H = fit(B.w / 2 * 1.12, B.h / 2 * 1.12) + B.ceiling;
    return { pos: [B.cx, H, B.cz + 0.5], target: [B.cx, 0, B.cz] };
  }
  if (preset === 'doorway') {
    const door = (r.openings || []).find(o => (o.type === 'door' || o.type === 'arch') && wallFrame(r, o.wall));
    if (door) {
      const f = wallFrame(r, door.wall), t = door.offset + door.width / 2;
      const px = f.start[0] + f.dir[0] * t + f.inward[0] * 10, pz = f.start[1] + f.dir[1] * t + f.inward[1] * 10;
      return { pos: [px, EYE_HEIGHT, pz], target: [B.cx, 40, B.cz] };
    }
    // No door drawn: stand inside the room on the side facing the cabinets
    const d = heroDirection(r);
    const reach = Math.min(B.w, B.h) / 2 - 14;
    return { pos: [B.cx + d[0] * reach, EYE_HEIGHT, B.cz + d[1] * reach], target: [B.cx - d[0] * 30, 40, B.cz - d[1] * 30] };
  }
  if (preset.startsWith('wall:')) {
    const w = preset.slice(5), f = wallFrame(r, w); if (!f) return cameraPresetPose(r, 'hero');
    const len = wallLength(r, w), t = len / 2;
    const tx = f.start[0] + f.dir[0] * t, tz = f.start[1] + f.dir[1] * t;
    const dist = fit(len / 2 * 1.08, B.ceiling / 2 * 1.1) + 12;
    // A little above head height, looking slightly down — sees over an island to the base run
    return { pos: [tx + f.inward[0] * dist, Math.min(B.ceiling * 0.72, 70), tz + f.inward[1] * dist], target: [tx + f.inward[0] * 12, 44, tz + f.inward[1] * 12] };
  }
  // hero: 3/4 view from the best side, looking slightly down into the room
  const d = heroDirection(r);
  const dist = fit(Math.max(B.w, B.h) / 2 * 1.05, B.ceiling / 2) * 1.05 + 40;
  return { pos: [B.cx + d[0] * dist * 0.82, B.ceiling * 0.55 + dist * 0.5, B.cz + d[1] * dist * 0.82], target: [B.cx, 34, B.cz] };
}
let _camAnim = null;
function setCameraPreset(preset, instant) {
  const r = activeRoom(); if (!r || !iso3D) return;
  const pose = cameraPresetPose(r, preset);
  const cam = iso3D.camera, ctl = iso3D.controls;
  const B = roomBounds(r), span = Math.max(B.w, B.h, B.ceiling);
  cam.near = Math.max(1, span * 0.005); cam.far = span * 40; cam.updateProjectionMatrix();
  const finish = () => {
    cam.position.set(...pose.pos); ctl.target.set(...pose.target); ctl.update(); render3DNow(); _camAnim = null;
  };
  if (_camAnim) { cancelAnimationFrame(_camAnim.raf); clearTimeout(_camAnim.timer); }
  if (instant || typeof requestAnimationFrame === 'undefined') { finish(); return; }
  const from = { pos: cam.position.clone(), target: ctl.target.clone() }, to = { pos: new THREE.Vector3(...pose.pos), target: new THREE.Vector3(...pose.target) };
  const t0 = performance.now(), ms = 650, ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = ease(k);
    cam.position.lerpVectors(from.pos, to.pos, e); ctl.target.lerpVectors(from.target, to.target, e); ctl.update(); render3DNow();
    if (k < 1) _camAnim.raf = requestAnimationFrame(step); else finish();
  };
  _camAnim = { raf: requestAnimationFrame(step), timer: setTimeout(finish, ms + 120) };   // the timer guarantees we land even if frames are paused
}
// Sun + shadow box sized to the room (independent of where the camera is)
function setupSun(r) {
  const B = roomBounds(r), span = Math.max(B.w, B.h, B.ceiling);
  const sun = iso3D.sun;
  sun.position.set(B.cx + span * 0.6, span * 1.6, B.cz - span * 0.5);
  sun.target.position.set(B.cx, 0, B.cz); sun.target.updateMatrixWorld();
  const s = Math.max(B.w, B.h) * 0.9 + 40;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: span * 5 });
  sun.shadow.camera.updateProjectionMatrix();
}
