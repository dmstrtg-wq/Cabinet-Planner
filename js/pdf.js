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

/* ── EXPORT PDF (Silver+, Build Plan 5.5) — the one PDF button ──────
   Cover page, floor plan + every wall elevation for EVERY room, 3D views, cut list, itemized
   quote (same numbers as the Quote window), the company's own terms and signature lines.
   Letter or Tabloid (11×17). Each part can be left out: without the quote it's the plans-only
   set for installers (the old Print Plans); the old Print Quote is this with the quote ticked —
   on Gold, "Mark as sent" and revision tracking happen here (recordQuoteVersion, quote.js).
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
function exportPDF(btn) {
  if (!demoGate('export')) return;
  if (!canAccess('silver')) { showTierUpgradePrompt('silver', 'PDF Export Package'); return; }
  const p = activeProj();
  if (!p || !p.rooms.length) { alert('Add at least one room before exporting.'); return; }
  if (!checkCompanyProfile()) return;
  let el = document.getElementById('modal-export-pkg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modal-export-pkg'; el.className = 'modal-overlay hidden';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Export PDF package');
    document.body.appendChild(el);
  }
  let size = 'letter';
  try { if (localStorage.getItem('cp_pkg_size') === 'tabloid') size = 'tabloid'; } catch (e) {}
  let inc = { plans: true, views: true, cut: true, quote: true };
  try { inc = { ...inc, ...JSON.parse(localStorage.getItem('cp_pkg_parts') || '{}') }; } catch (e) {}
  const T = quoteTotals(p), qp = pkgQuotePreview(p, T);
  const rooms = p.rooms.length === 1 ? 'Floor plan and every wall elevation' : `Floor plans and wall elevations for all ${p.rooms.length} rooms`;
  const part = (k, label, hint) => `<label style="display:block;font-weight:400;font-size:13px;margin-bottom:6px;cursor:pointer;"><input type="checkbox" id="pkg-${k}" ${inc[k] ? 'checked' : ''} onchange="pkgSync()"> <b>${label}</b>${hint ? ` <span style="color:#64748b;">${hint}</span>` : ''}</label>`;
  el.innerHTML = `<div class="modal" style="width:500px;max-width:96vw;">
    <h3>Export PDF</h3>
    <p style="font-size:13px;color:#64748b;margin:0 0 10px;">One file with a cover page and the parts you choose. Leave the quote out for a plans-only set for installers.</p>
    <div style="font-size:13px;font-weight:600;margin:4px 0 6px;">Include</div>
    ${part('plans', rooms)}
    ${part('views', '3D views', '(the ones added to the quote)')}
    ${part('cut', 'Cut list')}
    ${part('quote', 'Quote', 'with your terms and signature lines')}
    <div id="pkg-quote-info" style="margin:2px 0 8px 22px;font-size:12px;color:#475569;">
      <div>Total ${fmtMoney(T.total)}. ${escHtml(qp.text)}</div>
      ${qp.canMark ? `<label style="display:block;font-weight:400;margin-top:4px;cursor:pointer;"><input type="checkbox" id="pkg-mark"> Mark as sent to the customer <span style="color:#64748b;">(locks this version; later changes print as tracked revisions)</span></label>` : ''}
      ${T.unpriced ? `<div style="color:#b45309;margin-top:4px;">⚠ ${T.unpriced} cabinet${T.unpriced === 1 ? '' : 's'} ${T.unpriced === 1 ? "doesn't" : "don't"} have a price for ${T.unpriced === 1 ? 'its' : 'their'} finish. ${T.unpriced === 1 ? 'It' : 'They'}'ll show as N/A and won't be in the total.</div>` : ''}
    </div>
    <div style="font-size:13px;font-weight:600;margin:8px 0 6px;">Page size</div>
    ${Object.entries(PKG_SIZES).map(([k, s]) => `<label style="display:block;font-weight:400;font-size:13px;margin-bottom:6px;cursor:pointer;"><input type="radio" name="pkg-size" value="${k}"${k === size ? ' checked' : ''}> ${s.label}</label>`).join('')}
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('modal-export-pkg')">Cancel</button>
      <button class="btn btn-primary" id="pkg-go">Create PDF</button>
    </div></div>`;
  pkgSync();
  el.querySelector('#pkg-go').onclick = () => {
    const pick = (el.querySelector('input[name="pkg-size"]:checked') || {}).value || 'letter';
    const parts = {}; ['plans', 'views', 'cut', 'quote'].forEach(k => { parts[k] = document.getElementById('pkg-' + k).checked; });
    if (!Object.values(parts).some(Boolean)) { alert('Pick at least one part to include.'); return; }
    try { localStorage.setItem('cp_pkg_size', pick); localStorage.setItem('cp_pkg_parts', JSON.stringify(parts)); } catch (e) {}
    const mark = document.getElementById('pkg-mark');
    closeModal('modal-export-pkg');
    buildExportPackage(btn, pick, { ...parts, markSent: !!(parts.quote && mark && mark.checked) });
  };
  openModal('modal-export-pkg');
}

function pkgSync() {
  const q = document.getElementById('pkg-quote'), info = document.getElementById('pkg-quote-info');
  if (q && info) info.style.display = q.checked ? '' : 'none';
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
  const len = n => { const ft = Math.floor(n/12), ins = n % 12; return ft > 0 ? `${ft}'-${fmtFrac(ins)}"` : `${fmtFrac(ins)}"`; };
  const wallName = w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '—';

  // ── Cover ─────────────────────────────────────────────────────────
  hdr('Design & Quote');
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
  doc.text(Q.label, MAR, y); y += 16;
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
  if (snapImgs.length) {
    y = newPage('3D Views', '3D views');
    y = heading('3D Views', null, y);
    const each = (PH - y - MAR - 6 - 6 * (snapImgs.length - 1)) / snapImgs.length;
    snapImgs.forEach(im => {
      const d = fit(im.w, im.h, CW, each);
      doc.addImage(im.url, 'JPEG', MAR + (CW-d.w)/2, y, d.w, d.h); y += d.h + 6;
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

  const fname = (p.customer || 'project').replace(/[^a-z0-9]/gi,'_') + (inc.quote ? '_design_package.pdf' : '_plans.pdf');
  doc.save(fname);
  done();
}
