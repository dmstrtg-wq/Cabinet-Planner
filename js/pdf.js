// My Cabinet Planner — js/pdf.js
// Floor plan print + PDF export.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// PDF EXPORT
// ════════════════════════════
// Loads a library once. Callers that arrive while it's still downloading wait for the same
// download (the old version resolved immediately if the <script> tag merely existed).
const _scriptLoads = {};
function loadScript(src) {
  if (!_scriptLoads[src]) {
    _scriptLoads[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = () => { delete _scriptLoads[src]; s.remove(); reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  return _scriptLoads[src];
}

/* ── PDF EXPORTS (Silver+, Build Plan 5.5) ─────────────────────────
   One builder (buildExportPackage) for both exports: Export Plans (cover + every room's floor
   plan, wall elevations and 3D views; no prices; optional watermark) and the Quote PDF (itemized
   quote, terms, signatures; Gold "Mark as sent" and revision tracking via recordQuoteVersion in
   quote.js; plans optional). Letter or Tabloid (11×17).
   ──────────────────────────────────────────────────────────────── */
const PKG_SIZES = { letter: { w: 215.9, h: 279.4, label: 'Letter (8.5 × 11)' }, tabloid: { w: 279.4, h: 431.8, label: 'Tabloid (11 × 17)' } };

// What exporting the quote will do on Gold, for the Export window
function pkgQuotePreview(p, T) {
  if (!canAccess('gold')) return { text: 'Gets a new quote number.', canMark: false };
  const hist = p.quoteHistory || [], last = hist[hist.length - 1];
  if (p.quoteLocked && last) {
    const same = Math.abs((last.total || 0) - T.total) < 0.005 && (!last.sig || last.sig === quoteSignature(p, T.total));
    const rev = last.revision || hist.length;
    return same ? { text: `Reprints Quote #${last.quoteNum}${rev > 1 ? ' (revision ' + rev + ')' : ''}. Nothing changed since you sent it.`, canMark: false }
      : { text: `Changed since you sent Quote #${last.quoteNum}, so this prints as revision ${hist.length + 1} and is logged on the job.`, canMark: false };
  }
  return { text: '', canMark: true };
}
// Two exports (Dan, 2026-10-08):
//   • Export Plans (header, next to Quote): cover with company info + every room's floor plan,
//     wall elevations and 3D views. No prices, no quote, no cut list. Optional watermark.
//   • Quote PDF (Quote window): the quote with terms and signatures (+ Gold versioning), and
//     optionally the plans in the same file.
function pkgCanExport() {
  if (!demoGate('export')) return null;
  if (!canAccess('silver')) { showTierUpgradePrompt('silver', 'PDF export'); return null; }
  const p = activeProj();
  if (!p || !p.rooms.length) { alert('Add at least one room before exporting.'); return null; }
  return p;
}
function pkgModal(html) {
  let el = document.getElementById('modal-export-pkg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modal-export-pkg'; el.className = 'modal-overlay hidden';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Export a PDF');
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="modal" style="width:500px;max-width:96vw;">${html}</div>`;
  openModal('modal-export-pkg');
  return el;
}
const pkgLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const pkgSave = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
function pkgSizeChoice() {
  const size = pkgLS('cp_pkg_size', 'letter') === 'tabloid' ? 'tabloid' : 'letter';
  return `<div style="font-size:13px;font-weight:600;margin:10px 0 6px;">Page size</div>
    ${Object.entries(PKG_SIZES).map(([k, s]) => `<label style="display:block;font-weight:400;font-size:13px;margin-bottom:6px;cursor:pointer;"><input type="radio" name="pkg-size" value="${k}"${k === size ? ' checked' : ''}> ${s.label}</label>`).join('')}`;
}
function pkgPickedSize(el) { const v = (el.querySelector('input[name="pkg-size"]:checked') || {}).value || 'letter'; pkgSave('cp_pkg_size', v); return v; }

function exportPlans(btn) {
  const p = pkgCanExport(); if (!p) return;
  const co = p.company || companyProfile.company_name || '';
  const wmOn = pkgLS('cp_wm_on', '1') === '1';
  const wmText = pkgLS('cp_wm_text', '') || (co ? `${co} — For review only` : 'For review only');
  const rooms = p.rooms.length === 1 ? 'the floor plan, every wall elevation' : `floor plans and wall elevations for all ${p.rooms.length} rooms`;
  const el = pkgModal(`<h3>Export plans</h3>
    <p style="font-size:13px;color:#64748b;margin:0 0 10px;">A PDF with your company info on the cover, ${rooms} and a 3D view of each room (the 3/4 view, or the views you added to the quote). It has no prices, quote or cut list, so you can leave it with a customer or send it to an installer.</p>
    <label style="display:block;font-weight:600;font-size:13px;margin:6px 0 4px;cursor:pointer;"><input type="checkbox" id="pkg-wm" ${wmOn ? 'checked' : ''} onchange="document.getElementById('pkg-wm-text').disabled = !this.checked"> Add a watermark</label>
    <input type="text" id="pkg-wm-text" class="cp-input" maxlength="60" value="${escHtml(wmText)}" ${wmOn ? '' : 'disabled'} style="width:100%;margin-left:0;" aria-label="Watermark text">
    <div class="form-hint" style="margin-top:4px;">Printed faintly across every page, so the drawings can't easily be passed around as someone else's work.</div>
    ${pkgSizeChoice()}
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('modal-export-pkg')">Cancel</button><button class="btn btn-primary" id="pkg-go">Create PDF</button></div>`);
  el.querySelector('#pkg-go').onclick = () => {
    const size = pkgPickedSize(el);
    const on = document.getElementById('pkg-wm').checked, text = document.getElementById('pkg-wm-text').value.trim();
    pkgSave('cp_wm_on', on ? '1' : '0'); if (text) pkgSave('cp_wm_text', text);
    closeModal('modal-export-pkg');
    buildExportPackage(btn, size, { plans: true, views: true, cut: false, quote: false, watermark: on && text ? text : '' });
  };
}

function exportQuote(btn) {
  const p = pkgCanExport(); if (!p) return;
  if (!checkCompanyProfile()) return;
  const T = quoteTotals(p), qp = pkgQuotePreview(p, T);
  const addPlans = pkgLS('cp_quote_plans', '0') === '1';
  const el = pkgModal(`<h3>Quote PDF</h3>
    <p style="font-size:13px;color:#64748b;margin:0 0 10px;">The itemized quote with the 3D views you added, your terms and signature lines. Total ${fmtMoney(T.total)}.</p>
    ${qp.text ? `<p style="font-size:13px;margin:0 0 8px;">${escHtml(qp.text)}</p>` : ''}
    ${qp.canMark ? `<label style="display:block;font-weight:400;font-size:13px;margin:0 0 8px;cursor:pointer;"><input type="checkbox" id="pkg-mark"> <b>Mark as sent to the customer</b> <span style="color:#64748b;">(locks this version; later changes print as tracked revisions)</span></label>` : ''}
    ${T.unpriced ? `<p style="font-size:13px;color:#b45309;margin:0 0 8px;">⚠ ${T.unpriced} cabinet${T.unpriced === 1 ? '' : 's'} ${T.unpriced === 1 ? "doesn't" : "don't"} have a price for ${T.unpriced === 1 ? 'its' : 'their'} finish. ${T.unpriced === 1 ? 'It' : 'They'}'ll show as N/A and won't be in the total.</p>` : ''}
    <label style="display:block;font-weight:400;font-size:13px;margin:4px 0 0;cursor:pointer;"><input type="checkbox" id="pkg-addplans" ${addPlans ? 'checked' : ''}> Add the plans (floor plans and wall elevations) to this file</label>
    ${pkgSizeChoice()}
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('modal-export-pkg')">Cancel</button><button class="btn btn-primary" id="pkg-go">Create PDF</button></div>`);
  el.querySelector('#pkg-go').onclick = () => {
    const size = pkgPickedSize(el), plans = document.getElementById('pkg-addplans').checked, mark = document.getElementById('pkg-mark');
    pkgSave('cp_quote_plans', plans ? '1' : '0');
    closeModal('modal-export-pkg');
    buildExportPackage(btn, size, { plans, views: true, cut: false, quote: true, markSent: !!(mark && mark.checked) });
  };
}

// A 3D shot trimmed to what's actually drawn (plus a small margin), so the room fills the picture
// and sits in its middle — the 3/4 camera frames the whole room box, empty floor and walls
// included (Dan, 2026-10-08: a bathroom came out small and off to one side)
function pkgTrimCanvas(src) {
  const w = src.width, h = src.height, g = src.getContext('2d');
  let data; try { data = g.getImageData(0, 0, w, h).data; } catch (e) { return { url: src.toDataURL('image/jpeg', 0.86), w, h }; }
  const at = (x, y) => (y * w + x) * 4;
  const bg = [0, 1, 2].map(k => data[k]);                 // the corner colour = the background
  const differs = i => Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 36;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (differs(at(x, y))) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { url: src.toDataURL('image/jpeg', 0.86), w, h };
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  const og = out.getContext('2d'); og.fillStyle = '#ffffff'; og.fillRect(0, 0, cw, ch);
  og.drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);
  return { url: out.toDataURL('image/jpeg', 0.88), w: cw, h: ch };
}

// Each room's 3/4 view (the "3/4 View" camera preset), captured like "Add to quote" does, for a
// plans PDF without added 3D views. Puts the screen back the way it was afterwards.
async function pkgAuto3D(p) {
  if (typeof capture3DImage !== 'function' || typeof THREE === 'undefined') return [];
  const rooms = p.rooms.filter(r => (r.cabinets || []).length || (r.appliances || []).length);
  if (!rooms.length) return [];
  const saved = { mode: state.viewMode || 'floor', room: state.activeRoomId,
    cam: iso3D ? { pos: iso3D.camera.position.clone(), target: iso3D.controls.target.clone() } : null };
  const out = [];
  window._pdfMode = true;   // (also keeps tips from popping up mid-export)
  try {
    setViewMode('3d');
    for (const r of rooms) {
      state.activeRoomId = r.id;
      renderIsometric();
      setCameraPreset('hero', true);
      await new Promise(res => requestAnimationFrame(() => setTimeout(res, 60)));
      const img = iso3D ? pkgTrimCanvas(_snapshotCanvas()) : null;
      if (img) out.push({ ...img, label: rooms.length > 1 ? r.name : '' });
    }
  } catch (e) { console.warn('3D views for the plans skipped:', e); }
  finally {
    window._pdfMode = false;
    state.activeRoomId = saved.room;
    setViewMode(saved.mode);
    if (saved.mode === '3d' && saved.cam && iso3D) { iso3D.camera.position.copy(saved.cam.pos); iso3D.controls.target.copy(saved.cam.target); iso3D.controls.update(); render3DNow(); }
  }
  return out;
}

async function buildExportPackage(btn, sizeKey, inc) {
  inc = inc || { plans: true, views: true, cut: true, quote: true };
  const p = activeProj(); if (!p) return;
  const origText = btn.textContent;
  btn.textContent = '⏳ Generating…'; btn.disabled = true;
  const done = () => { btn.textContent = origText; btn.disabled = false; };
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  } catch(e) {
    alert('Could not load PDF library. Check internet connection.');
    done(); return;
  }

  const SZ = PKG_SIZES[sizeKey] || PKG_SIZES.letter;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format: sizeKey === 'tabloid' ? 'tabloid' : 'letter' });
  const PW = SZ.w, PH = SZ.h, MAR = 16, CW = PW - MAR*2;
  const cp = companyProfile;
  const coName = p.company || cp.company_name || 'My Cabinet Planner';
  const T = quoteTotals(p);
  // The quote's number (and, on Gold, its version) — recorded only when the quote is in the file
  let Q = { num: null, label: 'Plans', snaps: null, revision: 0, prevTotal: null };
  if (inc.quote) {
    const v = recordQuoteVersion(p, T, currentSnapshotPaths(p), inc.markSent);
    Q = { ...v, label: `Quote #${v.num}${v.revision > 1 ? ' · Revision ' + v.revision : ''}` };
  }
  const today = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  const validThru = new Date(Date.now()+30*24*60*60*1000).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  const styleName = getStyles().find(s => s.code === p.style)?.name || p.style || '—';
  const snapImgs = inc.views ? await loadSnapshotImages(Q.snaps || currentSnapshotPaths(p)) : [];
  let logo = null;
  if (cp.logo_url) {
    logo = await new Promise(res => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img,0,0); res({ url: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = () => res(null);
      img.src = cp.logo_url;
    });
  }

  // Fit by shape (not by pixels), so drawings fill a Tabloid page too
  const fit = (iw, ih, maxW, maxH) => { const k = Math.min(maxW / iw, maxH / ih); return { w: iw * k, h: ih * k }; };
  const toc = [];     // [title, page] for the cover's contents list
  function hdr(title) {
    doc.setFillColor(44,31,20); doc.rect(0,0,PW,9,'F');
    doc.setFontSize(7); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold');
    doc.text(coName.toUpperCase(), MAR, 6);
    doc.text(title.toUpperCase(), PW/2, 6, {align:'center'});
    doc.setTextColor(30,30,30);
  }
  function newPage(title, tocTitle) {
    doc.addPage(); hdr(title);
    if (tocTitle) toc.push([tocTitle, doc.internal.getNumberOfPages()]);
    return 16;
  }
  function heading(text, sub, y) {
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
    doc.text(text, MAR, y); y += 4.5;
    if (sub) { doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100); doc.text(sub, MAR, y); y += 2; }
    doc.setDrawColor(180,83,9); doc.setLineWidth(0.4); doc.line(MAR, y, PW-MAR, y);
    return y + 5;
  }
  const len = n => { const ft = Math.floor(n/12), ins = n % 12; return ft > 0 ? `${ft}'-${fmtFrac(ins)}` : fmtFrac(ins); };   // (fmtFrac adds the ")
  const wallName = w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '—';

  // ── Cover ─────────────────────────────────────────────────────────
  hdr(inc.quote ? 'Design & Quote' : 'Plans');
  let y = 30;
  if (logo) {
    const d = fit(logo.w, logo.h, Math.min(90, CW), 30);
    doc.addImage(logo.url, 'PNG', MAR, y, d.w, d.h, undefined, 'FAST'); y += d.h + 8;
  }
  doc.setFontSize(22); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
  doc.text(coName, MAR, y); y += 6;
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(110,110,110);
  if (cp.tagline) { doc.text(cp.tagline.toUpperCase(), MAR, y); y += 5; }
  const coAddr = [cp.address, [cp.city, cp.state].filter(Boolean).join(' '), cp.zip].filter(Boolean).join(', ');
  [coAddr, [cp.phone, cp.email, cp.website].filter(Boolean).join('  ·  ')].filter(Boolean).forEach(l => { doc.text(l, MAR, y); y += 4.5; });
  y += 14;
  doc.setDrawColor(180,83,9); doc.setLineWidth(0.8); doc.line(MAR, y, PW-MAR, y); y += 14;
  doc.setFontSize(26); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
  doc.text(`${p.type || 'Cabinet'} ${inc.quote ? 'Design' : 'Plans'}`, MAR, y); y += 9;
  doc.setFontSize(12); doc.setFont('helvetica','normal'); doc.setTextColor(180,83,9);
  if (inc.quote) doc.text(Q.label, MAR, y);
  y += 16;
  const custAddr = [p.address, [p.city, p.state].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  [['Prepared for', p.customer || '—'], ...(custAddr ? [['Address', custAddr]] : []), ['Date', today],
   ['Door style', p.style ? `${styleName} (${p.style})` : '—'], ['Rooms', p.rooms.map(r => r.name).join(', ')],
   ...(inc.quote ? [['Quote total', fmtMoney(T.total) + (T.unpriced ? ` (${T.unpriced} item${T.unpriced === 1 ? '' : 's'} not priced)` : '')]] : [])
  ].forEach(([k, v]) => {
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(120,97,79);
    doc.text(k.toUpperCase(), MAR, y);
    doc.setFontSize(11); doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
    const lines = doc.splitTextToSize(String(v), CW - 40);
    doc.text(lines, MAR + 40, y); y += Math.max(1, lines.length) * 5 + 3;
  });
  const tocY = y + 10;     // contents are written here at the end, once page numbers are known

  // ── Each room: floor plan + every wall elevation ──────────────────
  const saved = { room: state.activeRoomId, wall: state.elevWall };
  const fpCv = document.getElementById('floor-plan'), evCv = document.getElementById('elevation-plan');
  const wallLabel = {north:'North Wall',south:'South Wall',east:'East Wall',west:'West Wall',step1:'Inner Wall 1',step2:'Inner Wall 2'};
  window._pdfMode = true;
  try {
    for (const r of (inc.plans ? p.rooms : [])) {
      state.activeRoomId = r.id;
      y = newPage(`${r.name} — Floor Plan`, `${r.name} — floor plan & elevations`);
      const dims = [];
      if (r.walls?.north) dims.push(`N/S ${len(r.walls.north)}`);
      if (r.walls?.east) dims.push(`E/W ${len(r.walls.east)}`);
      dims.push(`Ceiling ${r.ceilingHeight || 96}"`);
      y = heading(`${r.name} — Floor Plan`, dims.join('  ·  '), y);
      renderCanvas();
      if (fpCv && fpCv.width) {
        const d = fit(fpCv.width, fpCv.height, CW, PH - y - MAR - 6);
        doc.addImage(fpCv.toDataURL('image/png'), 'PNG', MAR + (CW-d.w)/2, y, d.w, d.h, undefined, 'FAST');
      }
      const ld = getLShapeData(r);
      for (const wall of (ld ? ['north','south','east','west','step1','step2'] : ['north','south','east','west'])) {
        const wallLen = wall === 'step1' && ld ? ld.step1.length : wall === 'step2' && ld ? ld.step2.length : (r.walls || {})[wall] || 0;
        if (!wallLen) continue;
        // Blank walls (no cabinets, appliances, doors or windows) don't get a page
        if (![...r.cabinets, ...(r.appliances||[]), ...(r.openings||[])].some(o => o.wall === wall)) continue;
        const wl = wallLabel[wall] || wall;
        y = newPage(`${r.name} — ${wl}`);
        y = heading(`${r.name} — ${wl}`, `Length ${len(wallLen)}  ·  Cabinets ${r.cabinets.filter(c => c.wall === wall).length}  ·  Ceiling ${r.ceilingHeight || 96}"`, y);
        state.elevWall = wall;
        renderElevation();
        await new Promise(res => setTimeout(res, 60));
        if (evCv && evCv.width) {
          const d = fit(evCv.width, evCv.height, CW, PH - y - MAR - 6);
          doc.addImage(evCv.toDataURL('image/png'), 'PNG', MAR + (CW-d.w)/2, y, d.w, d.h, undefined, 'FAST');
        }
      }
    }
  } finally {
    window._pdfMode = false;
    state.activeRoomId = saved.room; state.elevWall = saved.wall;
    refreshPlacementOffsets(); renderCanvas(); renderElevation();
  }

  // ── 3D views ──────────────────────────────────────────────────────
  // The views added to the quote; for the plans, when none were added, each room's 3/4 view
  // is captured automatically (Dan, 2026-10-08)
  let views = snapImgs.map(im => ({ ...im, label: '' }));
  if (!views.length && inc.views && inc.plans) views = await pkgAuto3D(p);
  const perPage = views.some(v => v.label) ? 2 : 3;
  for (let k = 0; k < views.length; k += perPage) {
    y = newPage('3D Views', k === 0 ? '3D views' : null);
    y = heading(k === 0 ? '3D Views' : '3D Views (continued)', null, y);
    const group = views.slice(k, k + perPage);
    // As big as the page allows, and centred top-to-bottom in the space under the heading
    const gap = 10, labelH = 7, area = PH - y - MAR - 8;
    const each = (area - gap * (group.length - 1) - group.filter(v => v.label).length * labelH) / group.length;
    const sizes = group.map(im => fit(im.w, im.h, CW, each));
    const used = sizes.reduce((s, d) => s + d.h, 0) + gap * (group.length - 1) + group.filter(v => v.label).length * labelH;
    y += Math.max(0, (area - used) / 2);
    group.forEach((im, n) => {
      const d = sizes[n];
      if (im.label) { doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8); doc.text(im.label, MAR + (CW - d.w) / 2, y + 4); y += labelH; }
      doc.addImage(im.url, 'JPEG', MAR + (CW - d.w) / 2, y, d.w, d.h);
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3); doc.rect(MAR + (CW - d.w) / 2, y, d.w, d.h);   // thin frame
      y += d.h + gap;
    });
  }

  // ── Cut list — every numbered item, matching the hexagon tags on the drawings ──
  const tableStyle = { styles:{fontSize:7.5,cellPadding:2}, headStyles:{fillColor:[44,31,20],textColor:255,fontStyle:'bold',fontSize:7.5}, theme:'grid', margin:{left:MAR,right:MAR, top:16} };
  const roomsWithItems = p.rooms.filter(room => { ensureItemNumbers(room); return room.cabinets.length || (room.appliances||[]).length; });
  if (inc.cut && roomsWithItems.length) {
    y = newPage('Cut List', 'Cut list');
    y = heading('Cut List', 'Numbers match the tags on the floor plans and elevations', y);
    roomsWithItems.forEach(room => {
      const items = [...room.cabinets.map(c => ({ ...c, kind:'cabinet' })), ...(room.appliances||[]).map(a => ({ ...a, kind:'appliance' }))]
        .filter(i => i.itemNum).sort((a,b) => a.itemNum - b.itemNum);
      if (!items.length) return;
      if (y > PH - 40) y = newPage('Cut List');
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
      doc.text(room.name, MAR, y); y += 3;
      doc.autoTable({ ...tableStyle, startY: y,
        head:[['#','Item','Size','Wall']],
        body: items.map(item => {
          const cat = item.kind === 'cabinet' ? CATALOG[item.type] : APPLIANCES[item.type];
          const depth = item.depth || (cat && cat.depth) || '—';
          return [String(item.itemNum), cat ? cat.label : item.type, `${fmtFrac(item.width)}W × ${fmtFrac(item.height)}H × ${depth}"D`, wallName(item.wall)];
        }),
        columnStyles:{0:{cellWidth:14,halign:'center',fontStyle:'bold'}},
        didDrawPage: () => hdr('Cut List'),
      });
      y = doc.lastAutoTable.finalY + 8;
    });
  }

  if (inc.quote) {   // quote, terms and signatures — left out of a plans-only set
    // ── Quote ─────────────────────────────────────────────────────────
    y = newPage('Quote', 'Itemized quote');
    y = heading(Q.label, `${p.customer || '—'}  ·  ${p.type || '—'}  ·  Door style: ${styleName}  ·  ${today}  ·  Valid through ${validThru}` +
      (Q.revision > 1 && Q.prevTotal != null ? `  ·  Revised: previous total ${fmtMoney(Q.prevTotal)}` : ''), y);
    const qTable = (title, head, body, colStyles) => {
      if (!body.length) return;
      if (title) { if (y > PH - 30) y = newPage('Quote'); doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,75,42); doc.text(title, MAR, y); y += 3; }
      doc.autoTable({ ...tableStyle, startY: y, head: [head], body, columnStyles: colStyles || {}, didDrawPage: () => hdr('Quote') });
      y = doc.lastAutoTable.finalY + 5;
    };
    const priceCell = pr => pr != null ? {content:'$'+pr.toFixed(2),styles:{halign:'right',fontStyle:'bold'}} : {content:'N/A',styles:{halign:'right',fontStyle:'italic',textColor:[148,163,184]}};
    const cabRows = [];
    p.rooms.forEach(room => {
      const cabs = quoteCabinets(room);          // incl. bump-out casing filler (7.1)
      if (!cabs.length) return;
      cabRows.push([{content:room.name,colSpan:5,styles:{fillColor:[240,232,224],fontStyle:'bold',fontSize:8,textColor:[100,75,42]}}]);
      cabs.forEach(c => {
        const cat = CATALOG[c.type];
        cabRows.push([String(c.itemNum || ''),
          (cat ? cat.label : c.type) + (c.styleOverride ? ` [${c.styleOverride}]` : '') + (c.glassDoors ? ' + Glass' : '')
            + (c.trash ? ` + trash pull-out (${c.trash === 'double' ? 'trash + recycle' : 'single'})` : '')
            + (c.wallOffset ? ` (out ${fmtFrac(c.wallOffset)} from wall)` : '') + (c._casingFor ? ` — ${c.note}` : ''),
          `${fmtFrac(c.width)}W × ${fmtFrac(c.height)}H × ${c.depth}"D`, wallName(c.wall), priceCell(cabinetPrice(c))]);
      });
    });
    qTable(null, ['#','Cabinet','Dimensions','Wall','Price'], cabRows, {0:{cellWidth:8,halign:'center',textColor:[100,116,139]}});
    const appRows = [];
    p.rooms.forEach(room => (room.appliances||[]).forEach(a => {
      const ac = APPLIANCES[a.type] || {};
      if (ac.fixture && !(a.price > 0)) return;     // bath fixtures only when priced (7.4)
      if (ac.decor) return;                         // countertop appliances: looks only (7.5)
      const shelfInfo = a.type === 'floatingShelf' ? ((n => (n > 1 ? ` x${n}` : '') + `, ${fmtFrac(itemDepth(a))} deep`)(shelfStack(a).n)) : '';
      appRows.push([String(a.itemNum || ''), (ac.label || a.type) + shelfInfo, fmtFrac(a.width), wallName(a.wall), a.note || '—', priceCell(a.price > 0 ? a.price : null)]);
    }));
    qTable('APPLIANCES', ['#','Appliance','Width','Wall','Notes','Price'], appRows, {0:{cellWidth:8,halign:'center',textColor:[100,116,139]}});
    if (hardwareQuoteLines(p).length) { if (y > PH - 30) y = newPage('Quote'); y = addHardwareToPdf(doc, p, MAR, y); }
    qTable('ADDITIONAL JOB COSTS', ['Description','Amount'],
      quoteJobCosts(p).map(jc => [jc.label || 'Additional Cost', {content:'$'+(parseFloat(jc.amount)||0).toFixed(2),styles:{halign:'right'}}]), {1:{cellWidth:35}});
    qTable('TRIM & MATERIALS', ['Item','Qty','Unit Price','Total'],
      quoteTrimItems(p).map(t => [t.label || 'Trim Item', t.qty || 1, '$'+(parseFloat(t.unitPrice)||0).toFixed(2),
        {content:'$'+((parseFloat(t.qty)||0)*(parseFloat(t.unitPrice)||0)).toFixed(2),styles:{halign:'right'}}]), {3:{cellWidth:35}});

    // Totals — the same quoteTotals() the Quote window shows (markup is built into cabinet prices)
    const totLines = [['Cabinets', T.cab], ...(T.app > 0 ? [['Appliances', T.app]] : []), ...(T.hw > 0 ? [['Hardware & Accessories', T.hw]] : []),
      ...(T.jc > 0 ? [['Additional Costs', T.jc]] : []), ...(T.trim > 0 ? [['Trim & Materials', T.trim]] : []),
      ...(T.tax > 0 ? [[`Tax (${(getTax()*100).toFixed(1)}%)`, T.tax]] : [])];
    if (y > PH - (totLines.length * 5 + 25)) y = newPage('Quote');
    const totX = PW - MAR - 70;
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.3); doc.line(totX, y, PW-MAR, y); y += 5;
    totLines.forEach(([lbl, amt]) => {
      doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100); doc.text(lbl, totX, y);
      doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30); doc.text('$'+amt.toFixed(2), PW-MAR, y, {align:'right'}); y += 5;
    });
    doc.setDrawColor(22,163,74); doc.setLineWidth(0.5); doc.line(totX, y, PW-MAR, y); y += 5;
    doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(22,163,74);
    doc.text('TOTAL', totX, y); doc.text('$'+T.total.toFixed(2), PW-MAR, y, {align:'right'}); y += 12;

    // ── Terms (the company's own profile terms only — none are imposed) + signatures ──
    if (cp.terms_and_conditions) {
      const lines = doc.splitTextToSize(cp.terms_and_conditions, CW - 6);
      if (y > PH - 40) y = newPage('Terms & Authorization', 'Terms & signatures');
      else toc.push(['Terms & signatures', doc.internal.getNumberOfPages()]);
      doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,75,42);
      doc.text('TERMS & CONDITIONS', MAR, y); y += 4;
      doc.setFont('helvetica','normal'); doc.setTextColor(110,110,110); doc.setFontSize(7.5);
      lines.forEach(l => { if (y > PH - MAR - 8) { y = newPage('Terms & Authorization'); doc.setFont('helvetica','normal'); doc.setTextColor(110,110,110); doc.setFontSize(7.5); } doc.text(l, MAR + 3, y); y += 3.8; });
      y += 8;
    }
    if (y > PH - 70) y = newPage('Authorization', cp.terms_and_conditions ? null : 'Signatures');
    else if (!cp.terms_and_conditions) toc.push(['Signatures', doc.internal.getNumberOfPages()]);
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
    doc.text('AUTHORIZATION', MAR, y); y += 6;
    doc.setDrawColor(55,65,81); doc.setLineWidth(0.4);
    const sigW = Math.min(82, CW/2 - 8);
    [[MAR, 'Customer Signature'], [PW/2 + 4, `${coName} Representative`]].forEach(([x, lbl]) => {
      doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
      doc.line(x, y+14, x+sigW, y+14); doc.text(lbl, x, y+18);
      doc.line(x, y+30, x+sigW, y+30); doc.text('Print Name / Title', x, y+34);
      doc.line(x, y+46, x+sigW, y+46); doc.text('Date', x, y+50);
    });
  }

  // ── Contents on the cover, then page numbers + footer on every page ──
  const nPages = doc.internal.getNumberOfPages();
  doc.setPage(1);
  let ty = Math.min(tocY, PH - MAR - 12 - toc.length * 5.5);
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(120,97,79);
  doc.text('CONTENTS', MAR, ty); ty += 5.5;
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
  toc.forEach(([t, pg]) => { doc.text(t, MAR, ty); doc.text(String(pg), MAR + 110, ty, {align:'right'}); ty += 5.5; });
  for (let i = 1; i <= nPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
    doc.text(`Page ${i} of ${nPages}`, PW-MAR, 6, {align:'right'});
    doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150);
    doc.text(`${coName}  ·  ${Q.num ? 'Quote #' + Q.num : 'Plans'}  ·  ${today}`, PW/2, PH-5, {align:'center'});
  }

  // Watermark (Export Plans): faint, diagonal, over every page
  if (inc.watermark) {
    const wm = String(inc.watermark).slice(0, 60);
    for (let i = 1; i <= nPages; i++) {
      doc.setPage(i);
      if (doc.GState) doc.setGState(new doc.GState({ opacity: 0.13 }));
      doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
      doc.setFontSize(Math.max(28, Math.min(64, (PW * 1.25) / Math.max(8, wm.length) * 2.2)));
      doc.text(wm, PW / 2, PH / 2, { align: 'center', angle: 45, baseline: 'middle' });
      if (doc.GState) doc.setGState(new doc.GState({ opacity: 1 }));
    }
  }
  const fname = (p.customer || 'project').replace(/[^a-z0-9]/gi,'_') + (inc.quote ? (inc.plans ? '_quote_and_plans.pdf' : '_quote.pdf') : '_plans.pdf');
  doc.save(fname);
  done();
}
