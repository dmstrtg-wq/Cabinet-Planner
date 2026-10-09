// My Cabinet Planner — js/snapshots.js
// 3D views on the quote (Build Plan 3.6): "Add to quote" in the 3D view captures the
// current view at high resolution (rendered at 2×, scaled down for a crisp image) and puts
// it on the printed quote and PDF, above the line items. Up to 3 per quote.
//
// Storage: a PRIVATE Supabase Storage bucket, `quote-snapshots`, one folder per account
// (see supabase-quote-snapshots-storage.sql). Only the file path is kept on the project
// (p.snapshots); images are fetched when a quote is printed. Silver/Gold only — the same
// tiers that can print quotes — and enforced by the bucket's rules, not just this page.
// Gold quote versions record which views they showed (entry.snapshots), and a view still
// referenced by a past version is never deleted from storage.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// SETTINGS + HELPERS
// ════════════════════════════
const SNAP_BUCKET = 'quote-snapshots', SNAP_MAX = 3, SNAP_OUT_W = 1400;
const _snapCache = new Map();   // path → { url, w, h } (data URL), so thumbnails/prints don't re-download

function snapshotsOf(p) { return Array.isArray(p && p.snapshots) ? p.snapshots : []; }
function snapGate(feature) {
  if (!demoGate('quote')) return false;
  if (!currentUser || !canAccess('silver')) { showTierUpgradePrompt('silver', feature); return false; }
  return true;
}
function updateSnapButton() {
  const b = document.getElementById('snap-add-btn'); if (!b) return;
  const n = snapshotsOf(activeProj()).length;
  b.textContent = `📷 Add to quote${n ? ` (${n}/${SNAP_MAX})` : ''}`;
}

// ════════════════════════════
// CAPTURE
// ════════════════════════════
// Render the current 3D view at 2× size with the width labels and selection outline
// hidden, then scale down to a JPEG.
// (shared by "Add to quote" and the automatic 3/4 views in Export Plans)
function _snapshotCanvas() {
  const R = iso3D.renderer, canvas = R.domElement;
  const cw = canvas.clientWidth || 800, ch = canvas.clientHeight || 500;
  const hidden = [];
  iso3D.root.traverse(o => { if ((o.isSprite || (o.userData && o.userData.selectionOutline)) && o.visible) { o.visible = false; hidden.push(o); } });
  const prevSel = selectedItemId; selectedItemId = null; highlight3DSelection();
  let big;
  try {
    R.setSize(cw * 2, ch * 2, false);
    updateCutaway(); R.render(iso3D.scene, iso3D.camera);
    const outW = Math.min(SNAP_OUT_W, cw * 2), outH = Math.round(outW * ch / cw);
    big = document.createElement('canvas'); big.width = outW; big.height = outH;
    const g = big.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, 0, 0, outW, outH);
  } finally {
    hidden.forEach(o => { o.visible = true; });
    selectedItemId = prevSel; highlight3DSelection();
    resizeIso3D();
  }
  return big;
}
// The current 3D view as a JPEG data URL (for PDFs that don't go through storage)
function capture3DImage() {
  if (!iso3D) return null;
  const big = _snapshotCanvas();
  return { url: big.toDataURL('image/jpeg', 0.86), w: big.width, h: big.height };
}
function captureSnapshotBlob() {
  return new Promise((resolve, reject) => {
    if (!iso3D) { reject(new Error('3D view not ready')); return; }
    const big = _snapshotCanvas();
    big.toBlob(b => b ? resolve(b) : reject(new Error('Could not make the image')), 'image/jpeg', 0.86);
  });
}

async function addQuoteSnapshot() {
  if (!snapGate('3D views on quotes')) return;
  const p = activeProj(); if (!p || state.viewMode !== '3d') return;
  if (snapshotsOf(p).length >= SNAP_MAX) {
    alert(`This quote already has ${SNAP_MAX} 3D views. Remove one in the Quote window (Quote → 3D views) to add another.`);
    return;
  }
  const btn = document.getElementById('snap-add-btn');
  if (btn) { btn.disabled = true; btn.textContent = '📷 Saving view…'; }
  try {
    const blob = await captureSnapshotBlob();
    const id = newId();
    const path = `${effectiveOwnerId}/${p.id}/${id}.jpg`;
    const { error } = await db.storage.from(SNAP_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    _snapCache.set(path, await blobToImage(blob));
    p.snapshots = [...snapshotsOf(p), { id, path, createdAt: new Date().toISOString() }];
    persist();
    if (typeof showMoveTip === 'function') showMoveTip(`Added to quote (${p.snapshots.length}/${SNAP_MAX}) — it will print above the line items`);
  } catch (e) {
    console.error('Snapshot upload failed:', e);
    alert("Couldn't save this view to your quote. Check your connection and try again." + (e && e.message ? `\n\n(${e.message})` : ''));
  } finally {
    if (btn) btn.disabled = false;
    updateSnapButton(); renderQuoteSnapshotList();
  }
}

// ════════════════════════════
// LOADING (for thumbnails and printing)
// ════════════════════════════
function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => resolve({ url: fr.result, w: img.naturalWidth, h: img.naturalHeight }); img.onerror = reject; img.src = fr.result; };
    fr.onerror = reject; fr.readAsDataURL(blob);
  });
}
async function loadSnapshotImage(path) {
  if (_snapCache.has(path)) return _snapCache.get(path);
  const { data, error } = await db.storage.from(SNAP_BUCKET).download(path);
  if (error || !data) throw error || new Error('missing');
  const img = await blobToImage(data);
  _snapCache.set(path, img);
  return img;
}
// → images in order; any that can't be loaded are skipped (the quote still prints)
async function loadSnapshotImages(paths) {
  const out = [];
  for (const path of paths) { try { out.push(await loadSnapshotImage(path)); } catch (e) { console.warn('Snapshot not loaded:', path, e); } }
  return out;
}

// ════════════════════════════
// MANAGING (Quote window)
// ════════════════════════════
function snapshotStillReferenced(p, path) {
  const inVersion = e => e && Array.isArray(e.snapshots) && e.snapshots.includes(path);
  return (p.quoteHistory || []).some(inVersion) || inVersion(p.lockedQuote);
}
async function removeQuoteSnapshot(id) {
  const p = activeProj(); if (!p) return;
  const s = snapshotsOf(p).find(x => x.id === id); if (!s) return;
  p.snapshots = snapshotsOf(p).filter(x => x.id !== id);
  persist(); updateSnapButton(); renderQuoteSnapshotList();
  // Keep the file if an earlier quote version showed it — that version's record needs it
  if (!snapshotStillReferenced(p, s.path) && currentUser) {
    const { error } = await db.storage.from(SNAP_BUCKET).remove([s.path]);
    if (error) console.warn('Snapshot file not removed:', error);
    _snapCache.delete(s.path);
  }
}
function renderQuoteSnapshotList() {
  const box = document.getElementById('quote-snapshots'); if (!box) return;
  const p = activeProj(); const snaps = snapshotsOf(p);
  if (!snaps.length) {
    box.innerHTML = `<div class="form-hint">No 3D views yet. Open the <b>3D View</b>, set up a nice angle, and click <b>📷 Add to quote</b> (up to ${SNAP_MAX}).</div>`;
    return;
  }
  box.innerHTML = `<div class="snap-row">${snaps.map(s => `
      <div class="snap-thumb" data-path="${escHtml(s.path)}"><div class="snap-img">Loading…</div>
        <button type="button" class="snap-remove" onclick="removeQuoteSnapshot('${s.id}')" aria-label="Remove this view from the quote">×</button></div>`).join('')}
    </div><div class="form-hint">${snaps.length}/${SNAP_MAX} views · printed above the line items</div>`;
  snaps.forEach(s => loadSnapshotImage(s.path).then(img => {
    const el = box.querySelector(`.snap-thumb[data-path="${CSS.escape(s.path)}"] .snap-img`);
    if (el) el.innerHTML = `<img src="${img.url}" alt="3D view on quote">`;
  }).catch(() => {
    const el = box.querySelector(`.snap-thumb[data-path="${CSS.escape(s.path)}"] .snap-img`);
    if (el) el.textContent = 'Not available';
  }));
}

// ════════════════════════════
// ON THE QUOTE
// ════════════════════════════
function currentSnapshotPaths(p) { return snapshotsOf(p).map(s => s.path); }
// PDF (jsPDF): a row of images; returns the new y position
function addSnapshotsToPdf(doc, imgs, x, y, width) {
  if (!imgs.length) return y;
  const gap = 3, maxH = imgs.length === 1 ? 95 : 60;
  const each = (width - gap * (imgs.length - 1)) / imgs.length;
  let rowH = 0;
  imgs.forEach((im, k) => {
    let w = each, h = w * im.h / im.w;
    if (h > maxH) { h = maxH; w = h * im.w / im.h; }
    const cx = x + k * (each + gap) + (each - w) / 2;
    doc.addImage(im.url, 'JPEG', cx, y, w, h);
    rowH = Math.max(rowH, h);
  });
  return y + rowH + 5;
}
