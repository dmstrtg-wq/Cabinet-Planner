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

/* ── PRINT FLOOR PLAN (Silver+) ──────────────────────────────────
   Clean layout drawing: floor plan + wall elevations.
   No pricing, no company branding, no quote lines.
   ──────────────────────────────────────────────────────────────── */
async function printFloorPlan(btn) {
  if (!canAccess('silver')) { showTierUpgradePrompt('silver', 'Print Floor Plan'); return; }
  const p = activeProj();
  if (!p || !p.rooms.length) { alert('Open a project with at least one room first.'); return; }
  const origText = btn.textContent;
  btn.textContent = '⏳ Generating…'; btn.disabled = true;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    // The cut-list page uses tables — without this, Print Plans failed unless Export PDF had run first
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  } catch(e) {
    alert('Could not load PDF library. Check your internet connection.');
    btn.textContent = origText; btn.disabled = false; return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const PW=215.9, PH=279.4, MAR=16, CW=PW-MAR*2;
  const today = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  const r = activeRoom();

  function pxToMm(px) { return px * 0.264583; }
  function fitImg(iw, ih, maxW, maxH) {
    let w=pxToMm(iw), h=pxToMm(ih);
    if (h>maxH){const ratio=maxH/h; h=maxH; w*=ratio;}
    if (w>maxW){const ratio=maxW/w; w=maxW; h*=ratio;}
    return {w,h};
  }
  function titleBlock(subTitle, pageLabel, pg) {
    doc.setFillColor(28,16,8); doc.rect(0,0,PW,8,'F');
    doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
    doc.text('MY CABINET PLANNER', MAR, 5.5);
    doc.text(pageLabel.toUpperCase(), PW/2, 5.5, {align:'center'});
    doc.text(`Page ${pg}`, PW-MAR, 5.5, {align:'right'});
    doc.setTextColor(30,30,30);
    let y=14;
    doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
    doc.text(p.customer||'Untitled Project', MAR, y);
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
    doc.text(today, PW-MAR, y, {align:'right'}); y+=3;
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(120,90,60);
    doc.text(subTitle, MAR, y); y+=2;
    doc.setDrawColor(180,83,9); doc.setLineWidth(0.4); doc.line(MAR,y,PW-MAR,y);
    return y+5;
  }

  let pg=1;

  // ── Page 1: Floor Plan ─────────────────────────────────────────
  const roomLabel = r ? (r.name||'Room') : 'Floor Plan';
  let y = titleBlock(roomLabel + ' — Floor Plan', 'Floor Plan', pg);

  const fpCv = document.getElementById('floor-plan');
  window._pdfMode = true; renderCanvas(); // bake rulers into the canvas for print
  if (fpCv && fpCv.width>0) {
    const {w,h} = fitImg(fpCv.width, fpCv.height, CW, PH-y-MAR-12);
    doc.addImage(fpCv.toDataURL('image/png'), 'PNG', MAR+(CW-w)/2, y, w, h);
  }
  window._pdfMode = false; renderCanvas();

  // Room dimensions at page bottom
  if (r) {
    const walls = r.walls||{};
    const dimParts=[];
    if (walls.north) { const ft=Math.floor(walls.north/12),ins=walls.north%12; dimParts.push(`N/S: ${ft>0?ft+"'−":''}${ins}"`); }
    if (walls.east)  { const ft=Math.floor(walls.east/12),ins=walls.east%12;  dimParts.push(`E/W: ${ft>0?ft+"'−":''}${ins}"`); }
    if (r.ceilingHeight) dimParts.push(`Ceiling: ${r.ceilingHeight}"`);
    if (dimParts.length) {
      doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120);
      doc.text(dimParts.join('   ·   '), PW/2, PH-MAR+2, {align:'center'});
    }
  }

  // ── Pages 2-N: Wall Elevations ─────────────────────────────────
  if (r) {
    const savedWall = state.elevWall;
    const ld = getLShapeData(r);
    const allWalls = ld ? ['north','south','east','west','step1','step2'] : ['north','south','east','west'];
    const wallLabel = {north:'North Wall',south:'South Wall',east:'East Wall',west:'West Wall',
                       step1:'Inner Wall 1',step2:'Inner Wall 2'};

    window._pdfMode = true;
    for (const wall of allWalls) {
      let wallLen;
      if (wall==='step1'&&ld) wallLen=ld.step1.length;
      else if (wall==='step2'&&ld) wallLen=ld.step2.length;
      else wallLen=(r.walls||{})[wall]||0;
      if (!wallLen) continue;
      if ((wall==='step1'||wall==='step2') &&
          !r.cabinets.some(c=>c.wall===wall) &&
          !(r.openings||[]).some(o=>o.wall===wall)) continue;

      doc.addPage(); pg++;
      const wl = wallLabel[wall]||wall;
      const ft=Math.floor(wallLen/12), ins=wallLen%12;
      const lenStr = ft>0 ? `${ft}'−${ins}"` : `${ins}"`;
      const cabCount = r.cabinets.filter(c=>c.wall===wall).length;
      y = titleBlock(`${roomLabel} — ${wl}`, 'Elevation', pg);

      doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
      doc.text(`Length: ${lenStr}   ·   Cabinets: ${cabCount}   ·   Ceiling: ${r.ceilingHeight||96}"`, MAR, y-1);

      state.elevWall = wall;
      renderElevation();
      await new Promise(res=>setTimeout(res,60));

      const evCv = document.getElementById('elevation-plan');
      if (evCv && evCv.width>0) {
        const {w,h} = fitImg(evCv.width, evCv.height, CW, PH-y-MAR-6);
        doc.addImage(evCv.toDataURL('image/png'), 'PNG', MAR+(CW-w)/2, y+2, w, h);
      }
    }
    window._pdfMode = false;
    state.elevWall = savedWall;
    renderElevation();
  }

  // ── Last page: Cut List — every numbered item, matching the hexagon tags
  // on the elevation drawings, grouped by room ─────────────────────────
  const roomsWithItems = p.rooms.filter(room => {
    ensureItemNumbers(room);
    return room.cabinets.length || (room.appliances||[]).length;
  });
  if (roomsWithItems.length) {
    doc.addPage(); pg++;
    let cy = titleBlock('Cut List', 'Cut List', pg);
    roomsWithItems.forEach(room => {
      const items = [
        ...room.cabinets.map(c => ({ ...c, kind: 'cabinet' })),
        ...(room.appliances||[]).map(a => ({ ...a, kind: 'appliance' })),
      ].filter(i => i.itemNum).sort((a,b) => a.itemNum - b.itemNum);
      if (!items.length) return;
      if (cy > PH - 40) { doc.addPage(); pg++; cy = titleBlock('Cut List', 'Cut List', pg); }
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
      doc.text(room.name, MAR, cy); cy += 3;
      const rows = items.map(item => {
        const cat = item.kind === 'cabinet' ? CATALOG[item.type] : APPLIANCES[item.type];
        const label = cat ? cat.label : item.type;
        const depth = item.depth || (cat && cat.depth) || '—';
        return [String(item.itemNum), label, `${item.width}"W × ${item.height}"H × ${depth}"D`, item.wall.charAt(0).toUpperCase()+item.wall.slice(1)];
      });
      doc.autoTable({ startY: cy, margin:{left:MAR,right:MAR},
        head:[['#','Item','Size','Wall']],
        body: rows,
        styles:{fontSize:7.5,cellPadding:2},
        headStyles:{fillColor:[44,31,20],textColor:255,fontStyle:'bold',fontSize:7.5},
        columnStyles:{0:{cellWidth:14,halign:'center',fontStyle:'bold'}},
        theme:'grid',
      });
      cy = doc.lastAutoTable.finalY + 8;
    });
  }

  const filename = `${(p.customer||'floor-plan').replace(/[^a-z0-9]/gi,'_').toLowerCase()}_plans.pdf`;
  doc.save(filename);
  btn.textContent = origText; btn.disabled = false;
}

async function exportPDF(btn) {
  if (!demoGate('export')) return;
  if (!canAccess('silver')) { showTierUpgradePrompt('silver', 'PDF Quote Export'); return; }
  if (!checkCompanyProfile()) return;
  const p = activeProj();
  if (!p || !p.rooms.length) { alert('Add at least one room before exporting.'); return; }
  const unpricedCabs = p.rooms.reduce((n, room) => n + room.cabinets.filter(c => cabinetPrice(c) == null).length, 0);
  if (unpricedCabs > 0) {
    const proceed = confirm(
      `${unpricedCabs} cabinet${unpricedCabs === 1 ? '' : 's'} on this floor plan ${unpricedCabs === 1 ? "doesn't" : "don't"} have a price set for ` +
      `${unpricedCabs === 1 ? 'its' : 'their'} finish.\n\nThey'll show as "N/A" on the export and won't be included in the total. ` +
      `Continue anyway, or cancel to go set their pricing first?`
    );
    if (!proceed) return;
  }
  const origText = btn.textContent;
  btn.textContent = '⏳ Generating…'; btn.disabled = true;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  } catch(e) {
    alert('Could not load PDF library. Check internet connection.');
    btn.textContent = origText; btn.disabled = false; return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'letter' });
  const PW=215.9, PH=279.4, MAR=16, CW=PW-MAR*2;
  const cp = companyProfile;
  const coName = p.company || cp.company_name || 'My Cabinet Planner';
  const today = new Date().toLocaleDateString();
  const validThru = new Date(Date.now()+30*24*60*60*1000).toLocaleDateString();
  const quoteNum = 'Q-' + Date.now().toString(36).toUpperCase().slice(-6);
  let logoDataUrl = null;
  if (cp.logo_url) {
    logoDataUrl = await new Promise(res => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img,0,0); res(c.toDataURL('image/png')); };
      img.onerror = () => res(null);
      img.src = cp.logo_url;
    });
  }

  function hdr(title, pg) {
    doc.setFillColor(44,31,20); doc.rect(0,0,PW,9,'F');
    doc.setFontSize(7); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold');
    doc.text(coName.toUpperCase(), MAR, 6);
    doc.text(title, PW/2, 6, {align:'center'});
    doc.text('Page '+pg, PW-MAR, 6, {align:'right'});
    doc.setTextColor(30,30,30);
  }
  function ftr() {
    doc.setFontSize(7); doc.setTextColor(150,150,150); doc.setFont('helvetica','normal');
    doc.text(`${coName}  ·  Quote #${quoteNum}  ·  Generated ${today}`, PW/2, PH-5, {align:'center'});
    doc.setTextColor(30,30,30);
  }
  function pxToMm(px) { return px * 0.264583; }
  function fitImg(iw, ih, maxW, maxH) {
    let w=pxToMm(iw), h=pxToMm(ih);
    if (h>maxH){const r=maxH/h;h=maxH;w*=r;}
    if (w>maxW){const r=maxW/w;w=maxW;h*=r;}
    return {w,h};
  }

  let pg = 1;

  // ── Page 1: Company header + floor plan ──────────────────────
  hdr('Floor Plan', pg); ftr();
  let y = 14;
  // Logo (left) if available
  if (logoDataUrl) {
    const lh=14, lw=Math.min(lh*4, 60);
    doc.addImage(logoDataUrl,'PNG',MAR,y,lw,lh); y+=lh+3;
  }
  // Company name left, QUOTE label right
  doc.setFontSize(18); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
  doc.text(coName, MAR, y);
  doc.setFontSize(18); doc.setFont('helvetica','bold'); doc.setTextColor(180,83,9);
  doc.text('QUOTE', PW-MAR, y, {align:'right'}); y+=5;
  // Tagline left, quote # right
  if (cp.tagline) { doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(120,97,79); doc.text(cp.tagline.toUpperCase(), MAR, y); }
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
  doc.text(`#${quoteNum}`, PW-MAR, y, {align:'right'}); y+=4;
  // Contact line left, dates right
  const coLine = [cp.address, cp.phone, cp.email, cp.website].filter(Boolean).join('  ·  ');
  if (coLine) doc.text(coLine, MAR, y);
  doc.text(`Date: ${today}   Valid through: ${validThru}`, PW-MAR, y, {align:'right'}); y+=4;
  doc.setDrawColor(180,83,9); doc.setLineWidth(0.6); doc.line(MAR,y,PW-MAR,y); y+=4;
  // Customer / project bar
  doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(100,75,42);
  doc.text('CUSTOMER', MAR, y); doc.text('PROJECT', PW/2, y); y+=4;
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
  doc.text(p.customer||'—', MAR, y); doc.text(`${p.type||'—'}  ·  Style: ${p.style||'—'}`, PW/2, y); y+=5;
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3); doc.line(MAR,y,PW-MAR,y); y+=4;
  const fpCv = document.getElementById('floor-plan');
  window._pdfMode = true; renderCanvas(); // bake rulers into the canvas for print
  if (fpCv && fpCv.width) {
    const {w,h} = fitImg(fpCv.width, fpCv.height, CW, PH-y-MAR-8);
    doc.addImage(fpCv.toDataURL('image/png'),'PNG', MAR+(CW-w)/2, y, w, h);
  }
  window._pdfMode = false; renderCanvas();

  // ── Pages 2-N: Wall elevations ─────────────────────────────────
  const r = activeRoom();
  if (r) {
    const savedWall  = state.elevWall;
    // scale is now fixed (ELEV_SCALE), no need to temporarily override

    const ld = getLShapeData(r);
    const allWalls = ld ? ['north','south','east','west','step1','step2'] : ['north','south','east','west'];
    const wallLabel = {north:'North Wall',south:'South Wall',east:'East Wall',west:'West Wall',
                       step1:'Inner Wall 1',step2:'Inner Wall 2'};

    window._pdfMode = true;
    for (const wall of allWalls) {
      let wallLen;
      if (wall==='step1'&&ld) wallLen=ld.step1.length;
      else if (wall==='step2'&&ld) wallLen=ld.step2.length;
      else wallLen=r.walls[wall]||0;
      if (!wallLen) continue;
      if ((wall==='step1'||wall==='step2') &&
          !r.cabinets.some(c=>c.wall===wall) &&
          !(r.openings||[]).some(o=>o.wall===wall)) continue;

      doc.addPage(); pg++;
      const wl = wallLabel[wall]||wall;
      hdr(`${r.name} — ${wl}`, pg); ftr();
      let ey=14;
      doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
      doc.text(`${wl}`, MAR, ey); ey+=4;
      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
      const ft=Math.floor(wallLen/12), ins=wallLen%12;
      const lenStr = ft>0 ? `${ft}'-${ins}"` : `${ins}"`;
      doc.text(`Length: ${lenStr}  ·  Cabinets: ${r.cabinets.filter(c=>c.wall===wall).length}  ·  Ceiling: ${r.ceilingHeight||96}"`, MAR, ey); ey+=4;

      state.elevWall = wall;
      renderElevation();
      await new Promise(res=>setTimeout(res,60));
      const evCv = document.getElementById('elevation-plan');
      if (evCv && evCv.width) {
        const {w,h} = fitImg(evCv.width, evCv.height, CW, PH-ey-MAR-8);
        doc.addImage(evCv.toDataURL('image/png'),'PNG', MAR+(CW-w)/2, ey, w, h);
      }
    }
    window._pdfMode = false;
    state.elevWall = savedWall;
    renderElevation();
  }

  // ── Cut List — every numbered item, matching the hexagon tags on the
  // elevation drawings, grouped by room ─────────────────────────────
  const roomsWithItems = p.rooms.filter(room => {
    ensureItemNumbers(room);
    return room.cabinets.length || (room.appliances||[]).length;
  });
  if (roomsWithItems.length) {
    doc.addPage(); pg++;
    hdr('Cut List', pg); ftr();
    let cy = 14;
    roomsWithItems.forEach(room => {
      const items = [
        ...room.cabinets.map(c => ({ ...c, kind: 'cabinet' })),
        ...(room.appliances||[]).map(a => ({ ...a, kind: 'appliance' })),
      ].filter(i => i.itemNum).sort((a,b) => a.itemNum - b.itemNum);
      if (!items.length) return;
      if (cy > PH - 40) { doc.addPage(); pg++; hdr('Cut List', pg); ftr(); cy = 14; }
      doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
      doc.text(room.name, MAR, cy); cy += 3;
      const rows = items.map(item => {
        const cat = item.kind === 'cabinet' ? CATALOG[item.type] : APPLIANCES[item.type];
        const label = cat ? cat.label : item.type;
        const depth = item.depth || (cat && cat.depth) || '—';
        return [String(item.itemNum), label, `${item.width}"W × ${item.height}"H × ${depth}"D`, item.wall.charAt(0).toUpperCase()+item.wall.slice(1)];
      });
      doc.autoTable({ startY: cy, margin:{left:MAR,right:MAR},
        head:[['#','Item','Size','Wall']],
        body: rows,
        styles:{fontSize:7.5,cellPadding:2},
        headStyles:{fillColor:[44,31,20],textColor:255,fontStyle:'bold',fontSize:7.5},
        columnStyles:{0:{cellWidth:14,halign:'center',fontStyle:'bold'}},
        theme:'grid',
      });
      cy = doc.lastAutoTable.finalY + 8;
    });
  }

  // ── Last page: Quote ─────────────────────────────────────────────
  doc.addPage(); pg++;
  hdr('Cabinet Quote', pg); ftr();
  let qy=14;
  doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(28,16,8);
  doc.text('QUOTE', MAR, qy);
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(180,83,9);
  doc.text('#'+quoteNum, PW-MAR, qy, {align:'right'}); qy+=5;
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
  doc.text(`Customer: ${p.customer||'—'}   ·   Project: ${p.type||'—'}   ·   Style: ${p.style||'—'}   ·   Date: ${today}   ·   Valid: ${validThru}`, MAR, qy); qy+=5;

  const tax=getTax(); let cabSub=0;

  // Cabinet line items
  const cabRows=[];
  p.rooms.forEach(room => {
    if (!room.cabinets.length) return;
    cabRows.push([{content:room.name,colSpan:4,styles:{fillColor:[240,232,224],fontStyle:'bold',fontSize:8,textColor:[100,75,42]}}]);
    room.cabinets.forEach(c => {
      const pr=cabinetPrice(c); if (pr!=null) cabSub+=pr;
      const cat=CATALOG[c.type];
      cabRows.push([
        (cat?cat.label:c.type)+(c.styleOverride?` [${c.styleOverride}]`:'')+(c.glassDoors?' +Glass':''),
        `${c.width}"W × ${c.height}"H × ${c.depth}"D`,
        c.wall.charAt(0).toUpperCase()+c.wall.slice(1),
        pr!=null ? {content:'$'+pr.toFixed(2),styles:{halign:'right',fontStyle:'bold'}}
                 : {content:'N/A',styles:{halign:'right',fontStyle:'italic',textColor:[148,163,184]}}
      ]);
    });
  });
  doc.autoTable({ startY:qy, margin:{left:MAR,right:MAR},
    head:[['Cabinet','Dimensions','Wall','Price']],
    body:cabRows,
    styles:{fontSize:7.5,cellPadding:2},
    headStyles:{fillColor:[44,31,20],textColor:255,fontStyle:'bold',fontSize:7.5},
    theme:'grid',
  });
  qy=doc.lastAutoTable.finalY+4;

  // Appliances
  const appRows=[];
  p.rooms.forEach(room => {
    (room.appliances||[]).forEach(a => {
      const ac=APPLIANCES[a.type]||{};
      appRows.push([ac.label||a.type, a.width+'"', a.wall.charAt(0).toUpperCase()+a.wall.slice(1), a.note||'—']);
    });
  });
  if (appRows.length) {
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,75,42);
    doc.text('APPLIANCES', MAR, qy); qy+=3;
    doc.autoTable({ startY:qy, margin:{left:MAR,right:MAR},
      head:[['Appliance','Width','Wall','Notes']],
      body:appRows,
      styles:{fontSize:7.5,cellPadding:2},
      headStyles:{fillColor:[44,31,20],textColor:255,fontStyle:'bold',fontSize:7.5},
      theme:'grid',
    });
    qy=doc.lastAutoTable.finalY+4;
  }

  // Job costs
  const jcItems=(p.jobCosts||[]).filter(jc=>jc.label||jc.amount);
  const jcTotal=jcItems.reduce((s,jc)=>s+(parseFloat(jc.amount)||0),0);
  if (jcItems.length) {
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,75,42);
    doc.text('ADDITIONAL JOB COSTS', MAR, qy); qy+=3;
    doc.autoTable({ startY:qy, margin:{left:MAR,right:MAR},
      head:[['Description','Amount']],
      body:jcItems.map(jc=>[jc.label||'Additional Cost',{content:'$'+(parseFloat(jc.amount)||0).toFixed(2),styles:{halign:'right'}}]),
      styles:{fontSize:7.5,cellPadding:2},
      headStyles:{fillColor:[44,31,20],textColor:255,fontStyle:'bold',fontSize:7.5},
      theme:'grid', columnStyles:{1:{cellWidth:35}},
    });
    qy=doc.lastAutoTable.finalY+4;
  }

  // Trim items
  const trimItems=(p.trimItems||[]).filter(t=>t.label||t.unitPrice);
  const trimTotal=trimItems.reduce((s,t)=>s+(parseFloat(t.qty)||0)*(parseFloat(t.unitPrice)||0),0);
  if (trimItems.length) {
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,75,42);
    doc.text('TRIM & MATERIALS', MAR, qy); qy+=3;
    doc.autoTable({ startY:qy, margin:{left:MAR,right:MAR},
      head:[['Item','Qty','Unit Price','Total']],
      body:trimItems.map(t=>[t.label||'Trim Item',t.qty||1,'$'+(parseFloat(t.unitPrice)||0).toFixed(2),{content:'$'+((parseFloat(t.qty)||0)*(parseFloat(t.unitPrice)||0)).toFixed(2),styles:{halign:'right'}}]),
      styles:{fontSize:7.5,cellPadding:2},
      headStyles:{fillColor:[44,31,20],textColor:255,fontStyle:'bold',fontSize:7.5},
      theme:'grid', columnStyles:{3:{cellWidth:35}},
    });
    qy=doc.lastAutoTable.finalY+4;
  }

  // Totals
  const beforeTax=cabSub+jcTotal+trimTotal;
  const taxAmt=beforeTax*tax;
  const total=beforeTax+taxAmt;
  const totX=PW-MAR-70;
  doc.setDrawColor(220,220,220); doc.setLineWidth(0.3); doc.line(totX,qy,PW-MAR,qy); qy+=5;
  [
    ['Cabinet Subtotal', cabSub],
    ...(jcTotal>0?[['Additional Costs',jcTotal]]:[]),
    ...(trimTotal>0?[['Trim & Materials',trimTotal]]:[]),
    ...(tax>0?[[`Tax (${(tax*100).toFixed(1)}%)`,taxAmt]]:[]),
  ].forEach(([lbl,amt])=>{
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100);
    doc.text(lbl, totX, qy);
    doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
    doc.text('$'+amt.toFixed(2), PW-MAR, qy, {align:'right'}); qy+=5;
  });
  doc.setDrawColor(22,163,74); doc.setLineWidth(0.5); doc.line(totX,qy,PW-MAR,qy); qy+=5;
  doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(22,163,74);
  doc.text('TOTAL', totX, qy);
  doc.text('$'+total.toFixed(2), PW-MAR, qy, {align:'right'}); qy+=14;

  // Signature lines (add new page if insufficient space)
  if (qy > PH-75) { doc.addPage(); pg++; hdr('Authorization & Terms', pg); ftr(); qy=18; }
  doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
  doc.text('AUTHORIZATION', MAR, qy); qy+=6;
  const sigY=qy;
  doc.setDrawColor(55,65,81); doc.setLineWidth(0.4);
  const col2=PW/2+4;
  [[MAR,'Customer Signature'],[col2,`${coName} Representative`]].forEach(([x,lbl])=>{
    doc.line(x,sigY+14,x+82,sigY+14); doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100); doc.text(lbl,x,sigY+18);
    doc.line(x,sigY+30,x+82,sigY+30); doc.text('Print Name / Title',x,sigY+34);
    doc.line(x,sigY+46,x+82,sigY+46); doc.text('Date',x,sigY+50);
  });
  qy=sigY+60;

  // Terms & Conditions — the company's own profile terms, same as Print Quote. No text is shown if they haven't set any; we don't impose a default legal policy on their customers.
  if (cp.terms_and_conditions) {
    doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,75,42);
    doc.text('TERMS & CONDITIONS', MAR, qy); qy+=4;
    doc.setFont('helvetica','normal'); doc.setTextColor(110,110,110); doc.setFontSize(7.5);
    const lines = doc.splitTextToSize(cp.terms_and_conditions, CW-6);
    doc.text(lines, MAR+3, qy); qy += lines.length*3.8+2;
  }

  const fname=(p.customer||'quote').replace(/[^a-z0-9]/gi,'_')+'_cabinet_plan.pdf';
  doc.save(fname);
  p.lastQuotedAt = new Date().toISOString(); // counts as "quoted" for the status warning
  persist();
  btn.textContent = origText; btn.disabled = false;
}

