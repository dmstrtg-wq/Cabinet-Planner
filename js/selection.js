// My Cabinet Planner — js/selection.js
// One selected item shared by the floor plan, elevation, 3D view and the side-panel list,
// plus the compact edit popover (double-click). Build Plan task 2.1.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// SELECTION
// ════════════════════════════
let selectedItemId = null;
const SELECT_COLOR = '#0f766e';

function roomItems(r) { return r ? [...r.cabinets, ...(r.appliances || []), ...(r.islands || [])] : []; }
function getSelectedItem() {
  if (!selectedItemId) return null;
  return roomItems(activeRoom()).find(i => i.id === selectedItemId) || null;
}

// Select an item (or pass null to clear). The side panel and elevation follow the
// item's wall, so whichever view you switch to shows the same thing highlighted.
function selectItem(id) {
  closeItemPopover();
  selectedItemId = id || null;
  const it = getSelectedItem();
  if (!it) selectedItemId = null;
  if (it && it.wall) {
    if (['north','south','east','west'].includes(it.wall) && state.elevWall !== it.wall) {
      state.elevWall = it.wall;
      document.querySelectorAll('.elev-wall-tab').forEach(b => b.classList.toggle('active', b.dataset.wall === it.wall));
    }
    if (it.wall !== state.activeWall) { selectWall(it.wall); }
  }
  refreshSelectionViews();
}
function refreshSelectionViews() {
  renderCanvas(); renderCabinetList();
  if (state.viewMode === 'elevation') renderElevation();
  if (state.viewMode === '3d') highlight3DSelection();
}

// ── Drawing the highlight in each view ──────────────────────────────────────
function drawSelectionBox(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = SELECT_COLOR; ctx.lineWidth = 2.5; ctx.setLineDash([]);
  ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
  const s = 7; // corner handles
  ctx.fillStyle = '#ffffff'; ctx.lineWidth = 1.5;
  [[x - 3, y - 3], [x + w + 3, y - 3], [x - 3, y + h + 3], [x + w + 3, y + h + 3]].forEach(([hx, hy]) => {
    ctx.fillRect(hx - s/2, hy - s/2, s, s); ctx.strokeRect(hx - s/2, hy - s/2, s, s);
  });
  ctx.restore();
}
// Floor plan (called from renderCanvas)
function drawFloorSelection(ctx, r, scale, RX, RY) {
  const it = getSelectedItem(); if (!it) return;
  let rc;
  if (r.islands && r.islands.includes(it)) rc = { x: it.x, y: it.y, w: it.width, h: it.depth };
  else { const rs = itemRects(r, it); rc = rs.length ? rectOfPts(rs.flatMap(b => [[b.x, b.y], [b.x + b.w, b.y + b.h]])) : null; }
  if (rc) drawSelectionBox(ctx, RX + rc.x * scale, RY + rc.y * scale, rc.w * scale, rc.h * scale);
}
// Elevation (called from renderElevation, only for items on the wall being shown)
function drawElevSelection(ctx, r, wall, scale, floorY, eX) {
  const it = getSelectedItem(); if (!it || it.wall !== wall) return;
  const [bottom, top] = itemVerticalRange(it);
  drawSelectionBox(ctx, eX(it.offset || 0, it.width), floorY - top * scale, it.width * scale, (top - bottom) * scale);
}
// 3D: tint the selected box and draw a teal outline around it
function highlight3DSelection() {
  if (!iso3D) return;
  const root = iso3D.root;
  root.children.filter(o => o.userData.selectionOutline).forEach(o => { root.remove(o); o.geometry.dispose(); o.material.dispose(); });
  root.traverse(o => {
    if (!o.isMesh || !o.userData.itemId) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const on = o.userData.itemId === selectedItemId;
    mats.forEach(m => { if (m.emissive) { m.emissive.set(on ? SELECT_COLOR : 0x000000); m.emissiveIntensity = on ? 0.35 : 1; } });
    if (on) {
      const box = new THREE.Box3().setFromObject(o).expandByScalar(0.6);
      const helper = new THREE.Box3Helper(box, new THREE.Color(SELECT_COLOR));
      helper.userData.selectionOutline = true;
      root.add(helper);
    }
  });
  iso3D.renderer.render(iso3D.scene, iso3D.camera);
}

// ── Compact edit popover (double-click) ─────────────────────────────────────
let _popover = null;
function closeItemPopover() {
  if (_popover) { _popover.remove(); _popover = null; }
  document.removeEventListener('mousedown', _popoverOutside, true);
}
function _popoverOutside(e) { if (_popover && !_popover.contains(e.target)) closeItemPopover(); }

function openItemPopover(item, clientX, clientY) {
  const r = activeRoom(); if (!r || !item) return;
  if (selectedItemId !== item.id) selectItem(item.id);
  closeItemPopover();
  const isCab = !!CATALOG[item.type];
  const pop = document.createElement('div');
  pop.id = 'item-popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Edit item');
  pop.style.cssText = 'position:fixed;z-index:9200;width:260px;background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.22);padding:12px;font-size:13px;';
  const opt = (v, label, sel) => `<option value="${escHtml(v)}"${sel ? ' selected' : ''}>${escHtml(label)}</option>`;
  const row = (label, control) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;"><span style="color:var(--text-muted,#64748b);font-weight:600;font-size:12px;">${label}</span>${control}</label>`;
  const selStyle = 'style="width:150px;" class="cp-input"';
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
      <strong>#${item.itemNum || '?'} ${escHtml(isCab ? CATALOG[item.type].label : APPLIANCES[item.type].label)}</strong>
      <button data-act="close" aria-label="Close" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-muted,#64748b);line-height:1;">×</button></div>`;
  const inch = (f, v) => `<input data-f="${f}" type="text" inputmode="decimal" ${selStyle} value="${escHtml(fmtFrac(v).replace('"', ''))}">`;
  if (isCab) {
    // (filler6 is folded into one "Filler" entry — every filler is any size)
    html += row('Type', `<select data-f="type" ${selStyle}>${Object.entries(CATALOG).filter(([k]) => k !== 'filler6' || item.type === 'filler6').map(([k, c]) => opt(k, c.label, k === item.type)).join('')}</select>`);
  }
  if (isCab && isFiller(item.type)) {
    html += row('Width (in)', inch('width', item.width));
    html += row('Height (in)', inch('height', item.height));
    html += row('Bottom from floor', inch('wallBottom', item.wallBottom ?? 0));
  } else if (isCab) {
    html += row('Width', `<select data-f="width" ${selStyle}>${CATALOG[item.type].widths.map(w => opt(w, w + '"', w === item.width)).join('')}</select>`);
    if (CATALOG[item.type].heights.length > 1)
      html += row('Height', `<select data-f="height" ${selStyle}>${CATALOG[item.type].heights.map(h => opt(h, h + '"', h === item.height)).join('')}</select>`);
    if (needsHinge(item))
      html += row('Hinge side', `<select data-f="hinge" ${selStyle}>${opt('', 'Specify…', !item.hinge)}${opt('L', 'Left', item.hinge === 'L')}${opt('R', 'Right', item.hinge === 'R')}</select>`);
    if (item.type === 'base')
      html += row('Trash pull-out', `<select data-f="trash" ${selStyle}>${opt('', 'None', !item.trash)}${opt('single', 'Single trash', item.trash === 'single')}${opt('double', 'Trash + recycle', item.trash === 'double')}</select>`);
    if (canBumpOut(item))
      html += row('Wall offset', inch('wallOffset', item.wallOffset || 0).replace('value=', 'title="How far it stands out from the wall (the gap is cased in with filler)" value='));
    html += row('Door style', `<select data-f="styleOverride" ${selStyle}>${opt('', 'Project default', !item.styleOverride)}${getStyles().map(s => opt(s.code, s.name, s.code === item.styleOverride)).join('')}</select>`);
  } else {
    const acat = APPLIANCES[item.type];
    if (item.type === 'floatingShelf') {                  // 7.3: any length, depth, thickness, a stack, a finish
      const st = shelfStack(item);
      html += row('Length (in)', inch('width', item.width));
      html += row('Depth', `<select data-f="depth" ${selStyle}>${acat.depths.map(d => opt(d, d + '"', d === itemDepth(item))).join('')}</select>`);
      html += row('Thickness', `<select data-f="height" ${selStyle}>${acat.thicknesses.map(t => opt(t, fmtFrac(t), t === st.t)).join('')}</select>`);
      html += row('Shelves', `<select data-f="stack" ${selStyle}>${[1, 2, 3, 4, 5, 6].map(n => opt(n, n === 1 ? '1 shelf' : n + ' shelves', n === st.n)).join('')}</select>`);
      if (st.n > 1) html += row('Spacing (in)', inch('spacing', st.spacing).replace('value=', 'title="Bottom of one shelf to the bottom of the next" value='));
      html += row('Bottom from floor', inch('customElevBottom', itemVerticalRange(item)[0]));
      html += row('Finish', `<select data-f="shelfFinish" ${selStyle}>${Object.entries(SHELF_FINISHES).map(([k, f]) => opt(k, f.label, k === shelfFinish(item))).join('')}</select>`);
    } else
    html += row('Width', `<select data-f="width" ${selStyle}>${acat.widths.map(w => opt(w, w + '"', w === item.width)).join('')}</select>`);
    if (acat.heights)
      html += row('Size', `<select data-f="height" ${selStyle}>${acat.heights.map(h => opt(h, applianceHeightLabel(item.type, h), h === (item.height || acat.height))).join('')}</select>`);
    if (APPLIANCE_VARIANTS[item.type])
      html += row('Style', `<select data-f="variant" ${selStyle}>${Object.entries(APPLIANCE_VARIANTS[item.type]).map(([k, l]) => opt(k, l, k === applianceVariant(item))).join('')}</select>`);
    const fin = applianceFinishOptions(item.type);
    if (fin.length)
      html += row('Finish', `<select data-f="finish" ${selStyle}>${fin.map(([k, l]) => opt(k, l, k === applianceFinish(item))).join('')}</select>`);
    if (item.type === 'refrigerator')
      html += `<button data-act="casefridge" style="width:100%;margin-top:6px;padding:6px 8px;border-radius:6px;border:1px solid var(--border,#e2e8f0);background:#fff;cursor:pointer;font-weight:600;font-size:12px;" title="End panels on both sides, and the upper above brought out flush with the 24&quot; run">Case in this fridge</button>`;
  }
  html += row('Notes', `<input data-f="note" type="text" ${selStyle} value="${escHtml(item.note || '')}" placeholder="Optional">`);
  const btn = 'style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border,#e2e8f0);background:#fff;cursor:pointer;font-weight:600;font-size:12px;"';
  html += `<div style="display:flex;gap:6px;margin-top:10px;">
      <button data-act="dup" ${btn}>Duplicate</button>
      <button data-act="more" ${btn}>More…</button>
      <button data-act="del" style="flex:1;padding:6px 8px;border-radius:6px;border:none;background:#dc2626;color:#fff;cursor:pointer;font-weight:600;font-size:12px;">Delete</button></div>`;
  pop.innerHTML = html;
  document.body.appendChild(pop);
  // Keep it on screen, next to the pointer
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(clientX + 12, window.innerWidth - w - 8)) + 'px';
  pop.style.top  = Math.max(8, Math.min(clientY + 12, window.innerHeight - h - 8)) + 'px';
  _popover = pop;
  setTimeout(() => document.addEventListener('mousedown', _popoverOutside, true), 0);

  pop.addEventListener('change', e => {
    const f = e.target.dataset.f; if (!f) return;
    applyItemEdit(item, f, e.target.value);
    // Type changes the valid widths/heights, so rebuild the popover in place
    if (f === 'type' || f === 'width' || f === 'stack') { const b = pop.getBoundingClientRect(); openItemPopover(item, b.left - 12, b.top - 12); }
  });
  pop.addEventListener('click', e => {
    const act = e.target.dataset.act; if (!act) return;
    if (act === 'close') closeItemPopover();
    else if (act === 'dup') duplicateItem(item);
    else if (act === 'casefridge') {
      const did = caseInFridge(activeRoom(), item);
      closeItemPopover(); persist(); renderAll(); renderCutList();
      if (state.viewMode === '3d') renderIsometric();
      showMoveTip(did.length ? 'Fridge cased in: ' + did.join(', ') : 'Already cased in (or no room for panels)');
    }
    else if (act === 'more') { closeItemPopover(); isCab ? openEditModal(item) : openEditApplianceModal(item); }
    else if (act === 'del') { closeItemPopover(); deleteItem(item); }
  });
  pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeItemPopover(); } });
  pop.querySelector('select, input')?.focus();
}

function applyItemEdit(item, field, value) {
  const filler = isFiller(item.type);
  if (field === 'note') item.note = value.trim();
  else if (field === 'styleOverride') item.styleOverride = value || null;
  else if (field === 'hinge') item.hinge = value || null;
  else if (field === 'variant') item.variant = value || null;
  else if (field === 'trash') item.trash = ['single', 'double'].includes(value) ? value : null;   // 7.2
  else if (field === 'wallOffset') item.wallOffset = Math.max(0, Math.min(36, parseInches(value) || 0)) || null;   // 7.1 bump-out
  else if (field === 'finish') item.finish = value || null;
  else if (item.type === 'floatingShelf' && ['width', 'depth', 'stack', 'spacing', 'customElevBottom', 'shelfFinish'].includes(field)) {   // 7.3
    if (field === 'width') item.width = Math.max(6, Math.min(240, parseInches(value) || item.width));
    else if (field === 'depth') item.depth = parseFloat(value) || 12;
    else if (field === 'stack') { item.stack = Math.max(1, Math.min(6, parseInt(value) || 1)); if (item.stack > 1 && !item.spacing) item.spacing = 12; }
    else if (field === 'spacing') item.spacing = Math.max(4, Math.min(36, parseInches(value) || 12));
    else if (field === 'customElevBottom') item.customElevBottom = Math.max(0, parseInches(value) || 0);
    else item.shelfFinish = SHELF_FINISHES[value] ? value : 'wood';
  }
  else if (field === 'height' && APPLIANCES[item.type]) {
    item.height = parseFloat(value);
    if (APPLIANCES[item.type].elevBottomFor) item.customElevBottom = null;   // single ↔ double oven: its own height from the floor
  }
  else if (field === 'width') item.width = filler ? cleanFillerDim(value, item.width) : parseFloat(value);
  else if (field === 'height') item.height = filler ? cleanFillerDim(value, item.height) : parseFloat(value);
  else if (field === 'wallBottom') { item.wallBottom = Math.max(0, parseInches(value) || 0); item.depth = item.wallBottom >= 48 ? 12 : 24; }
  else if (field === 'type' && isFiller(value)) {
    // → filler: keep the width it had (any width is fine), sit where the old piece sat
    const [bot, top] = itemVerticalRange(item);
    item.type = value; item.wallBottom = bot; item.height = top - bot; item.depth = bot >= 48 ? 12 : 24; item.glassDoors = false;
  }
  else if (field === 'type') {
    const cat = CATALOG[value]; if (!cat) return;
    item.type = value;
    // Keep the width if the new type offers it, otherwise take the closest one it does
    if (!cat.widths.includes(item.width)) item.width = cat.widths.reduce((a, b) => Math.abs(b - item.width) < Math.abs(a - item.width) ? b : a);
    item.height = defaultCabHeight(value, activeRoom());
    item.depth = value === 'diagWall' ? 12 : cat.depth;
    const upper = value === 'wall' || value === 'diagWall';
    item.wallBottom = upper ? (item.wallBottom ?? 54) : null;
    if (!upper) item.glassDoors = false;
  }
  persist();
  renderAll(); renderCutList();
  if (state.viewMode === '3d') renderIsometric();
}

function duplicateItem(item) {
  const r = activeRoom(); if (!r || !item.wall) return;
  const copy = JSON.parse(JSON.stringify(item));
  copy.id = uid();
  copy.itemNum = nextItemNum(r);
  copy.offset = freeSpotFor(r, copy, item);
  // A cabinet's built-ins (wall oven, microwave drawer) come along, priced as before
  const builtIns = CATALOG[item.type] ? hostedAppliances(r, item) : [];
  (CATALOG[item.type] ? r.cabinets : r.appliances).push(copy);
  builtIns.forEach(a => r.appliances.push({ ...JSON.parse(JSON.stringify(a)), id: uid(), itemNum: nextItemNum(r), offset: copy.offset + ((a.offset || 0) - (item.offset || 0)) }));
  persist(); renderCutList();
  if (state.viewMode === '3d') renderIsometric();
  selectItem(copy.id);
}

// Where a copy should go: right after the original if that's open, else the first gap
// on the wall it fits in, else the end of the run (it'll be flagged if that's past the wall).
function freeSpotFor(r, copy, original) {
  const vr = itemVerticalRange(copy);
  const fits = off => !placementIssue(r, { ...copy, offset: off });
  const after = (original.offset || 0) + original.width;
  if (fits(after)) return after;
  const candidates = [0, ...wallItems(r, copy.wall).filter(i => rangesOverlap(itemVerticalRange(i), vr)).map(i => (i.offset || 0) + i.width)].sort((a, b) => a - b);
  const spot = candidates.find(fits);
  return spot != null ? spot : nextFreeOffset(r, copy.wall, itemLevel(copy));
}

function deleteItem(item) {
  if (CATALOG[item.type]) removeCabinet(item.id);
  else if (APPLIANCES[item.type]) removeAppliance(item.id);
  if (state.viewMode === '3d') renderIsometric();
  selectItem(null);
}

// Esc clears the selection (and closes the popover) unless you're typing in a field
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (document.querySelector('.modal-overlay:not(.hidden)')) return;
  if (_popover || selectedItemId) selectItem(null);
});
