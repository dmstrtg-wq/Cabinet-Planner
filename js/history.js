// My Cabinet Planner — js/history.js
// Undo / redo for design edits (Build Plan 2.5).
// Every edit already ends in persist(), which tells us "something may have changed". We
// keep a snapshot of the project's DESIGN (its rooms + door style) and, once edits settle
// for a moment, push the previous snapshot onto the undo stack. So a whole drag or a
// burst of arrow-key nudges is one undo step, and every kind of edit is covered —
// cabinets, appliances, islands, openings, room sizes, room shape, door style — without
// wiring each one up. Job status, quotes/revisions and the activity log are business
// records, not design, and are never touched by undo.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// UNDO / REDO
// ════════════════════════════
const HISTORY_LIMIT = 100;      // steps kept (Build Plan asks for at least 50)
const HISTORY_SETTLE_MS = 450;  // edits closer together than this become one step
// last = the design as of the most recent edit; lastTime = when that edit happened.
// Grouping uses timestamps, not timers, so it behaves the same in a background tab
// (browsers slow timers down there).
const hist = { projectId: null, last: null, lastTime: 0, undo: [], redo: [] };

function designSnapshot(p) { return JSON.stringify({ rooms: p.rooms, style: p.style, hardware: p.hardware || 'pulls' }); }

// Called from persist() after every edit
function historyNoteChange() {
  const p = activeProj(); if (!p) return;
  if (hist.projectId !== p.id) { historyReset(p); return; }   // opened another project
  const cur = designSnapshot(p);
  if (cur === hist.last) return;                               // nothing design-related changed
  const now = Date.now();
  if (now - hist.lastTime > HISTORY_SETTLE_MS) {               // a new step: remember the "before"
    hist.undo.push(hist.last);
    if (hist.undo.length > HISTORY_LIMIT) hist.undo.shift();
    hist.redo = [];
  }                                                            // else: same drag/burst, same step
  hist.last = cur; hist.lastTime = now;
  updateUndoButtons();
}
function historyReset(p) {
  Object.assign(hist, { projectId: p ? p.id : null, last: p ? designSnapshot(p) : null, lastTime: 0, undo: [], redo: [] });
  updateUndoButtons();
}

function undoDesign() { historyStep(hist.undo, hist.redo, 'Undo'); }
function redoDesign() { historyStep(hist.redo, hist.undo, 'Redo'); }
function historyStep(from, to, label) {
  const p = activeProj(); if (!p || p.id !== hist.projectId || !from.length) return;
  to.push(designSnapshot(p));
  const snap = from.pop();
  const d = JSON.parse(snap);
  p.rooms = d.rooms; p.style = d.style; p.hardware = d.hardware;
  hist.last = snap; hist.lastTime = 0;               // the save below isn't a new edit; next edit starts a fresh step
  if (!p.rooms.some(r => r.id === state.activeRoomId)) state.activeRoomId = p.rooms[0]?.id;
  if (typeof getSelectedItem === 'function' && selectedItemId && !getSelectedItem()) selectedItemId = null;
  if (typeof closeItemPopover === 'function') closeItemPopover();
  persist();
  syncStylePanel(); renderProjectMeta(p); renderRoomTabs(); renderWallButtons(); refreshPlacementOffsets();
  renderAll();
  if (state.viewMode === '3d') renderIsometric();
  updateUndoButtons();
  if (typeof showMoveTip === 'function') showMoveTip(label);
}
function updateUndoButtons() {
  const u = document.getElementById('undo-btn'), r = document.getElementById('redo-btn');
  if (u) u.disabled = !hist.undo.length;
  if (r) r.disabled = !hist.redo.length;
}
