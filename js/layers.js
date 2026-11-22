// My Cabinet Planner — js/layers.js
// View layers (Build Plan 2.6): turn dimensions, item numbers, base cabinets, wall
// cabinets, appliances, doors & windows and the grid on or off. The same switches drive
// the floor plan, elevation, 3D (where it applies), what you can click, and PDFs.
// Remembered per browser. Hidden items still count for placement and gaps — they're
// only hidden from view, not from the room.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// LAYERS
// ════════════════════════════
const LAYER_DEFS = [
  ['dims',       'Dimensions'],
  ['itemNums',   'Item numbers'],
  ['bases',      'Base & tall cabinets'],
  ['uppers',     'Wall cabinets'],
  ['appliances', 'Appliances'],
  ['openings',   'Doors & windows'],
  ['grid',       'Grid'],
  ['checks',     'Design check marks'],
];
const LAYER_DEFAULTS = { dims: false, itemNums: true, bases: true, uppers: true, appliances: true, openings: true, grid: true, checks: true };
let layers = (() => {
  try { return { ...LAYER_DEFAULTS, ...JSON.parse(localStorage.getItem('cp_layers') || '{}') }; }
  catch (e) { return { ...LAYER_DEFAULTS }; }
})();
// The older Dims / Item #s toggles read these globals; keep them in step
showDimensions = layers.dims;
showItemNumbers = layers.itemNums;

function layerShowsItem(item) {
  if (APPLIANCES[item.type]) return layers.appliances;
  if (item.type === 'wall' || item.type === 'diagWall') return layers.uppers;
  return layers.bases;
}
function setLayer(key, on) {
  layers[key] = !!on;
  try { localStorage.setItem('cp_layers', JSON.stringify(layers)); } catch (e) {}
  showDimensions = layers.dims;
  showItemNumbers = layers.itemNums;
  syncLayerControls();
  const it = typeof getSelectedItem === 'function' ? getSelectedItem() : null;
  if (it && it.wall && !layerShowsItem(it)) selectItem(null);   // don't keep a hidden item selected
  renderAll();
  if (state.viewMode === '3d') renderIsometric();
}
function syncLayerControls() {
  document.querySelectorAll('.dims-btn').forEach(b => b.classList.toggle('active', layers.dims));
  document.querySelectorAll('.itemnum-btn').forEach(b => b.classList.toggle('active', layers.itemNums));
  document.querySelectorAll('[data-layer]').forEach(cb => { cb.checked = !!layers[cb.dataset.layer]; });
  document.querySelectorAll('[data-extra="tri"]').forEach(cb => { cb.checked = typeof showWorkTriangle !== 'undefined' && !!showWorkTriangle; });
  document.querySelectorAll('[data-extra="prices"]').forEach(cb => { cb.checked = typeof pricingOn === 'function' && pricingOn(); });
  const hidden = LAYER_DEFS.filter(([k]) => k !== 'dims' && !layers[k]).length;
  document.querySelectorAll('.layers-btn-count').forEach(el => { el.textContent = hidden ? `(${hidden} off)` : ''; });
}

// Prices on the drawing and side list (the old Pricing switch, now Show ▾ ▸ Prices; Silver+)
function setPricesShown(on) {
  const t = document.getElementById('pricing-toggle-2'); if (!t) return;
  t.checked = !!on; onPricingToggle(); syncLayerControls();
}
function toggleLayersMenu(btn) {
  const menu = btn.parentElement.querySelector('.layers-menu');
  const open = menu.classList.contains('hidden');
  if (typeof closeListsMenus === 'function') closeListsMenus();
  document.querySelectorAll('.layers-menu').forEach(m => m.classList.add('hidden'));
  if (open) { menu.classList.remove('hidden'); syncLayerControls(); }
}
// The Show ▾ menu (2026-11-22, toolbar clean-up): the drawing aids first (dimensions, item
// numbers, the work triangle on the floor plan, prices), then what's drawn (the layers)
function buildLayersMenus() {
  document.querySelectorAll('.layers-menu').forEach(menu => {
    const onFloor = !!menu.closest('#view-floor');
    const row = ([k, label]) => `<label class="layers-row"><input type="checkbox" data-layer="${k}" onchange="setLayer('${k}', this.checked)"> ${label}</label>`;
    menu.innerHTML = LAYER_DEFS.slice(0, 2).map(row).join('')
      + (onFloor ? `<label class="layers-row"><input type="checkbox" data-extra="tri" onchange="toggleWorkTriangle()"> Work triangle</label>` : '')
      + `<label class="layers-row prices-row"><input type="checkbox" data-extra="prices" onchange="setPricesShown(this.checked)"> Prices</label>`
      + `<div class="layers-head">On the drawing</div>` + LAYER_DEFS.slice(2).map(row).join('')
      + '<div class="layers-note">Also applies to Export Plans (printed drawings always keep their dimensions).</div>';
  });
  syncLayerControls();
}
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.layers-wrap')) document.querySelectorAll('.layers-menu').forEach(m => m.classList.add('hidden'));
});
buildLayersMenus();
