// My Cabinet Planner — js/shortcuts.js
// Keyboard shortcuts + the "?" shortcut sheet (Build Plan 2.5). Arrow-key nudging lives in
// palette.js and Esc-to-deselect in selection.js; this file handles the rest.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// SHORTCUTS
// ════════════════════════════
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const PALETTE_KEYS = { b: 'base', w: 'wall', t: 'tall', c: 'corner', f: 'fill', a: 'app' };

const SHORTCUTS = [
  ['B', 'Catalog: base cabinets'], ['W', 'Catalog: wall cabinets'], ['T', 'Catalog: tall cabinets'],
  ['C', 'Catalog: corner cabinets'], ['F', 'Catalog: fillers & panels'], ['A', 'Catalog: appliances'],
  ['Delete', 'Delete the selected item'], [`${MOD} D`, 'Duplicate the selected item'],
  [`${MOD} Z`, 'Undo'], [`Shift ${MOD} Z`, 'Redo'],
  ['← → ↑ ↓', 'Nudge the selected item 1"'], ['Shift + arrow', 'Nudge 1/8"'], [(IS_MAC ? 'Option' : 'Alt') + ' + arrow', 'Nudge 3"'],
  ['Double-click', 'Quick edit (type, size, door style, notes)'],
  ['Esc', 'Clear the selection / cancel a drag'], ['?', 'Show this list'],
];

// Open the catalog on a category and put the cursor in its search box, so "B" then "36"
// lands on the 36" base cabinets.
function openPaletteCategory(cat) {
  if (document.body.classList.contains('panel-collapsed') && typeof togglePanel === 'function') togglePanel();
  setPaletteCategory(cat);
  const search = document.getElementById('palette-search');
  if (search) { search.value = ''; renderPalette(); search.focus(); }
  document.getElementById('palette-section')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function showShortcutSheet() {
  let ov = document.getElementById('modal-shortcuts');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'modal-shortcuts'; ov.className = 'modal-overlay hidden';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Keyboard shortcuts');
    ov.innerHTML = `<div class="modal" style="max-width:440px;">
        <h3>Keyboard shortcuts</h3>
        <table class="shortcut-table">${SHORTCUTS.map(([k, d]) => `<tr><td><kbd>${escHtml(k)}</kbd></td><td>${escHtml(d)}</td></tr>`).join('')}</table>
        <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal('modal-shortcuts')">Got it</button></div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); });
    document.body.appendChild(ov);
  }
  openModal('modal-shortcuts');
}

document.addEventListener('keydown', e => {
  if (!activeProj() || document.getElementById('project-view')?.classList.contains('hidden')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  const modalOpen = !!document.querySelector('.modal-overlay:not(.hidden)');
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  const key = e.key.toLowerCase();

  // Undo / redo work anywhere except inside a text box (where the browser's own text undo applies)
  if (mod && !e.altKey && (key === 'z' || key === 'y') && !typing && !modalOpen) {
    e.preventDefault();
    if (key === 'y' || e.shiftKey) redoDesign(); else undoDesign();
    return;
  }
  if (typing || modalOpen || document.getElementById('item-popover')) return;

  if (mod && key === 'd') {                                        // duplicate (and stop the bookmark dialog)
    e.preventDefault();
    const it = getSelectedItem();
    if (it && it.wall) duplicateItem(it);
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (key === 'delete' || key === 'backspace') {
    const it = getSelectedItem(); if (!it) return;
    e.preventDefault();
    if (it.wall) deleteItem(it);
    else { removeIsland(it.id); selectItem(null); if (state.viewMode === '3d') renderIsometric(); }
    return;
  }
  if (e.key === '?') { e.preventDefault(); showShortcutSheet(); return; }
  if (PALETTE_KEYS[key] && !e.shiftKey) { e.preventDefault(); openPaletteCategory(PALETTE_KEYS[key]); }
});
