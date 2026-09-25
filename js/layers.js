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
];
const LAYER_DEFAULTS = { dims: false, itemNums: true, bases: true, uppers: true, appliances: true, openings: true, grid: true };
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
  const hidden = LAYER_DEFS.filter(([k]) => k !== 'dims' && !layers[k]).length;
  document.querySelectorAll('.layers-btn-count').forEach(el => { el.textContent = hidden ? `(${hidden} off)` : ''; });
}

function toggleLayersMenu(btn) {
  const menu = btn.parentElement.querySelector('.layers-menu');
  const open = menu.classList.contains('hidden');
  document.querySelectorAll('.layers-menu').forEach(m => m.classList.add('hidden'));
  if (open) { menu.classList.remove('hidden'); syncLayerControls(); }
}
function buildLayersMenus() {
  document.querySelectorAll('.layers-menu').forEach(menu => {
    menu.innerHTML = LAYER_DEFS.map(([k, label]) =>
      `<label class="layers-row"><input type="checkbox" data-layer="${k}" onchange="setLayer('${k}', this.checked)"> ${label}</label>`).join('') +
      '<div class="layers-note">Also applies to Print Plans and PDF export (printed drawings always keep their dimensions).</div>';
  });
  syncLayerControls();
}
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.layers-wrap')) document.querySelectorAll('.layers-menu').forEach(m => m.classList.add('hidden'));
});
buildLayersMenus();
