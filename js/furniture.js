// My Cabinet Planner — js/furniture.js
// Kitchen extras (Build Plan 7.5, from Dan's family): dining tables, chairs and counter
// stools as free-standing scale references (room.furniture — placed anywhere, dragged
// like an island), plus countertop appliances (coffee maker, mixer, toaster, microwave)
// that sit on the counter like any wall item. Looks only: none of it goes on the quote.
// FURNITURE (sizes) and the countertop appliances are defined in core.js.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// DATA
// ════════════════════════════
const FACES = { n: 'Faces north', s: 'Faces south', e: 'Faces east', w: 'Faces west' };
function furnitureOf(r) { return (r && r.furniture) || []; }
function isFurniture(item) { return !!(item && FURNITURE[item.type]); }
function furnitureRect(f) { return { x: f.x, y: f.y, w: f.width, h: f.depth }; }
function makeFurniture(type, width, depth, x, y, face = 's') {
  return { id: uid(), type, x: Math.round(x), y: Math.round(y), width, depth, face: FURNITURE[type].faces ? face : null };
}
// Keep a piece inside the room
function clampFurniture(r, f) {
  const { w, h } = roomSize(r);
  f.x = Math.max(0, Math.min(w - f.width, f.x));
  f.y = Math.max(0, Math.min(h - f.depth, f.y));
}
function addFurnitureTo(r, f) { (r.furniture = r.furniture || []).push(f); clampFurniture(r, f); }

// Stools along one side of an island, one every 24" (island modal → "Add stools")
function addIslandStools(isl, side = 's') {
  const r = activeRoom(); if (!r || !isl) return 0;
  const along = side === 'n' || side === 's' ? isl.width : isl.depth;
  const n = Math.max(1, Math.floor(along / 24)), gap = along / n;
  const [sw, sd] = FURNITURE.stool.sizes[0];
  for (let k = 0; k < n; k++) {
    const c = gap * (k + 0.5) - sw / 2;
    const pos = side === 's' ? [isl.x + c, isl.y + isl.depth + 4] : side === 'n' ? [isl.x + c, isl.y - 4 - sd]
      : side === 'e' ? [isl.x + isl.width + 4, isl.y + c] : [isl.x - 4 - sw, isl.y + c];
    const face = { s: 'n', n: 's', e: 'w', w: 'e' }[side];          // facing the island
    addFurnitureTo(r, makeFurniture('stool', sw, sd, pos[0], pos[1], face));
  }
  return n;
}
// Four chairs round a table (two on each long side; round tables get four round it)
function addTableChairs(t) {
  const r = activeRoom(); if (!r || !t) return;
  const [cw, cd] = FURNITURE.chair.sizes[0];
  const cx = t.x + t.width / 2, cy = t.y + t.depth / 2;
  const wide = t.width >= t.depth;
  const spots = FURNITURE[t.type].round
    ? [[cx - cw / 2, t.y - cd + 2, 's'], [cx - cw / 2, t.y + t.depth - 2, 'n'], [t.x - cd + 2, cy - cw / 2, 'e'], [t.x + t.width - 2, cy - cw / 2, 'w']]
    : wide
      ? [[t.x + t.width * 0.25 - cw / 2, t.y - cd + 4, 's'], [t.x + t.width * 0.75 - cw / 2, t.y - cd + 4, 's'],
         [t.x + t.width * 0.25 - cw / 2, t.y + t.depth - 4, 'n'], [t.x + t.width * 0.75 - cw / 2, t.y + t.depth - 4, 'n']]
      : [[t.x - cd + 4, t.y + t.depth * 0.25 - cw / 2, 'e'], [t.x - cd + 4, t.y + t.depth * 0.75 - cw / 2, 'e'],
         [t.x + t.width - 4, t.y + t.depth * 0.25 - cw / 2, 'w'], [t.x + t.width - 4, t.y + t.depth * 0.75 - cw / 2, 'w']];
  spots.forEach(([x, y, face]) => {
    const side = face === 'e' || face === 'w';
    addFurnitureTo(r, makeFurniture('chair', side ? cd : cw, side ? cw : cd, x, y, face));
  });
}

// ════════════════════════════
// FLOOR PLAN
// ════════════════════════════
function drawFurnitureOnFloor(ctx, r, scale, RX, RY) {
  furnitureOf(r).forEach(f => {
    const def = FURNITURE[f.type]; if (!def) return;
    const x = RX + f.x * scale, y = RY + f.y * scale, w = f.width * scale, h = f.depth * scale;
    ctx.save();
    ctx.globalAlpha = 0.85; ctx.fillStyle = def.color; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (def.round) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); else ctx.rect(x, y, w, h);
    ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    if (f.type === 'chair') {                         // the back, on the side away from where it faces
      const t = 3 * scale; ctx.fillStyle = 'rgba(0,0,0,0.35)';
      if (f.face === 's') ctx.fillRect(x, y, w, t); else if (f.face === 'n') ctx.fillRect(x, y + h - t, w, t);
      else if (f.face === 'e') ctx.fillRect(x, y, t, h); else ctx.fillRect(x + w - t, y, t, h);
    }
    if (f.type.startsWith('table')) {
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(7, Math.min(scale * 1.6, 10))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${fmtFrac(f.width)}×${fmtFrac(f.depth)}`, x + w / 2, y + h / 2);
    }
    ctx.restore();
  });
}

// ════════════════════════════
// 3D
// ════════════════════════════
function buildFurniture3D(r, kit) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xa47148, roughness: 0.6, metalness: 0.02, map: woodGrainTexture() });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3f3a36, roughness: 0.5, metalness: 0.2 });
  const box = (m, x0, x1, y0, y1, z0, z1, id) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), id ? m.clone() : m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); mesh.castShadow = mesh.receiveShadow = true;
    if (id) mesh.userData.itemId = id;
    g.add(mesh); return mesh;
  };
  const cyl = (m, rTop, rBot, h, cx, cy, cz, id) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 24), id ? m.clone() : m);
    mesh.position.set(cx, cy, cz); mesh.castShadow = mesh.receiveShadow = true;
    if (id) mesh.userData.itemId = id;
    g.add(mesh); return mesh;
  };
  furnitureOf(r).forEach(f => {
    const x0 = f.x, x1 = f.x + f.width, z0 = f.y, z1 = f.y + f.depth, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (f.type === 'tableRect') {
      box(wood, x0, x1, 28.5, 30, z0, z1, f.id);
      [[x0 + 2, z0 + 2], [x1 - 4, z0 + 2], [x0 + 2, z1 - 4], [x1 - 4, z1 - 4]].forEach(([lx, lz]) => box(wood, lx, lx + 2, 0, 28.5, lz, lz + 2));
    } else if (f.type === 'tableRound') {
      const top = cyl(wood, f.width / 2, f.width / 2, 1.5, cx, 29.25, cz, f.id); top.scale.z = f.depth / f.width;
      cyl(wood, 2, 2, 27, cx, 15, cz); cyl(wood, 9, 10, 1.5, cx, 0.75, cz);
    } else if (f.type === 'chair') {
      box(wood, x0 + 1, x1 - 1, 17, 18.5, z0 + 1, z1 - 1, f.id);                       // seat
      [[x0 + 1, z0 + 1], [x1 - 2.5, z0 + 1], [x0 + 1, z1 - 2.5], [x1 - 2.5, z1 - 2.5]].forEach(([lx, lz]) => box(wood, lx, lx + 1.5, 0, 17, lz, lz + 1.5));
      const b = { s: [x0 + 1, x1 - 1, z0 + 1, z0 + 2.5], n: [x0 + 1, x1 - 1, z1 - 2.5, z1 - 1], e: [x0 + 1, x0 + 2.5, z0 + 1, z1 - 1], w: [x1 - 2.5, x1 - 1, z0 + 1, z1 - 1] }[f.face || 's'];
      box(wood, b[0], b[1], 18.5, 36, b[2], b[3]);                                    // back
    } else if (f.type === 'stool') {
      cyl(dark, f.width / 2, f.width / 2 - 0.5, 2, cx, 25, cz, f.id);                  // seat (counter height)
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const leg = cyl(dark, 0.45, 0.45, 24, cx + sx * (f.width / 2 - 2), 12, cz + sz * (f.depth / 2 - 2));
        leg.rotation.z = sx * 0.06; leg.rotation.x = -sz * 0.06;
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(f.width / 2 - 1.5, 0.3, 6, 24), dark);
      ring.rotation.x = Math.PI / 2; ring.position.set(cx, 9, cz); g.add(ring);
      const b = { s: [0, -1], n: [0, 1], e: [-1, 0], w: [1, 0] }[f.face || 's'];   // a low back
      box(dark, cx - 5 + b[0] * (f.width / 2 - 1), cx + 5 + b[0] * (f.width / 2 - 1), 26, 32, cz - 0.6 + b[1] * (f.depth / 2 - 1), cz + 0.6 + b[1] * (f.depth / 2 - 1));
    }
  });
  return g;
}

// ════════════════════════════
// PLACING FROM THE CATALOG
// ════════════════════════════
// Drop point (room inches) → a new piece centred there
function furnitureAt(entry, px, py) {
  const r = activeRoom(); if (!r) return null;
  const f = makeFurniture(entry.type, entry.width, entry.depth, px - entry.width / 2, py - entry.depth / 2);
  clampFurniture(r, f);
  return { item: f, issue: null };
}
// Click a tile: put it in the middle of the room's open floor
function furnitureQuickAdd(entry) {
  const r = activeRoom(); if (!r) return;
  const { w, h } = roomSize(r);
  const g = furnitureAt(entry, w / 2, h / 2);
  commitFurniture(g.item);
}
function commitFurniture(f) {
  const r = activeRoom(); if (!r) return;
  addFurnitureTo(r, f);
  persist(); renderAll();
  if (state.viewMode === '3d') renderIsometric();
  selectItem(f.id);
}
function removeFurniture(id) {
  const r = activeRoom(); if (!r) return;
  r.furniture = furnitureOf(r).filter(f => f.id !== id);
  persist(); renderAll();
}

function islandStoolsFromModal(side) {
  const r = activeRoom(); if (!r) return;
  const isl = (r.islands || []).find(i => i.id === document.getElementById('edit-isl-id').value); if (!isl) return;
  const n = addIslandStools(isl, side);
  closeModal('modal-edit-island'); persist(); renderAll();
  if (state.viewMode === '3d') renderIsometric();
  showMoveTip(`${n} stool${n === 1 ? '' : 's'} added — drag to adjust`);
}

// Double-click a piece: size, which way it faces, add chairs (tables), duplicate, delete
function openFurniturePopover(f, clientX, clientY) {
  if (READ_ONLY) return;
  closeItemPopover();
  const def = FURNITURE[f.type];
  const pop = document.createElement('div');
  pop.id = 'item-popover'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Edit ' + def.label);
  pop.style.cssText = 'position:fixed;z-index:9200;width:250px;background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.22);padding:12px;font-size:13px;';
  const opt = (v, l, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${escHtml(l)}</option>`;
  const row = (l, c) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;"><span style="color:var(--text-muted,#64748b);font-weight:600;font-size:12px;">${l}</span>${c}</label>`;
  const sel = 'style="width:140px;" class="cp-input"';
  const btn = 'style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border,#e2e8f0);background:#fff;cursor:pointer;font-weight:600;font-size:12px;"';
  const sizes = def.sizes.map(([w, d]) => [w + 'x' + d, `${w}" × ${d}"`]).concat(def.round ? [] : def.sizes.map(([w, d]) => [d + 'x' + w, `${d}" × ${w}" (turned)`]));
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><strong>${escHtml(def.label)}</strong>
      <button data-act="close" aria-label="Close" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-muted,#64748b);line-height:1;">×</button></div>
    <div class="form-hint" style="margin-bottom:4px;">For scale and looks — not on the quote.</div>`;
  if (sizes.length > 1) html += row('Size', `<select data-f="size" ${sel}>${sizes.map(([v, l]) => opt(v, l, v === f.width + 'x' + f.depth)).join('')}</select>`);
  if (def.faces) html += row('Facing', `<select data-f="face" ${sel}>${Object.entries(FACES).map(([k, l]) => opt(k, l, k === f.face)).join('')}</select>`);
  html += `<div style="display:flex;gap:6px;margin-top:10px;">${f.type.startsWith('table') ? `<button data-act="chairs" ${btn}>＋ 4 chairs</button>` : ''}
      <button data-act="dup" ${btn}>Duplicate</button>
      <button data-act="del" style="flex:1;padding:6px 8px;border-radius:6px;border:none;background:#dc2626;color:#fff;cursor:pointer;font-weight:600;font-size:12px;">Delete</button></div>`;
  pop.innerHTML = html;
  document.body.appendChild(pop);
  pop.style.left = Math.max(8, Math.min(clientX + 12, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = Math.max(8, Math.min(clientY + 12, window.innerHeight - pop.offsetHeight - 8)) + 'px';
  _popover = pop;
  setTimeout(() => document.addEventListener('mousedown', _popoverOutside, true), 0);
  const redraw = () => { persist(); renderAll(); if (state.viewMode === '3d') renderIsometric(); };
  pop.addEventListener('change', e => {
    const fld = e.target.dataset.f;
    if (fld === 'size') { const [w, d] = e.target.value.split('x').map(Number); f.width = w; f.depth = d; clampFurniture(activeRoom(), f); }
    else if (fld === 'face') {
      const was = f.face; f.face = e.target.value;
      const turned = (was === 'e' || was === 'w') !== (f.face === 'e' || f.face === 'w');   // a chair turned sideways swaps its footprint
      if (turned && !def.round) { const w = f.width; f.width = f.depth; f.depth = w; clampFurniture(activeRoom(), f); }
    }
    redraw();
  });
  pop.addEventListener('click', e => {
    const act = e.target.dataset.act; if (!act) return;
    if (act === 'close') closeItemPopover();
    else if (act === 'chairs') { closeItemPopover(); addTableChairs(f); redraw(); }
    else if (act === 'dup') { closeItemPopover(); duplicateItem(f); }
    else if (act === 'del') { closeItemPopover(); deleteItem(f); }
  });
  pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeItemPopover(); } });
}
