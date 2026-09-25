// My Cabinet Planner — js/quote.js
// Summary table, quote modal, job costs/trim, printQuote + revisions.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// RENDER: SUMMARY TABLE
// ════════════════════════════
function renderSummary(r) {
  const el = document.getElementById('summary-table');
  if (!r || !r.cabinets.length) { el.innerHTML = ''; return; }
  const groups = {};
  r.cabinets.forEach(c => {
    const k = `${c.type}|${c.width}|${c.height}`;
    if (!groups[k]) groups[k] = { type:c.type, width:c.width, height:c.height, count:0, totalPrice:0, unpriced:false };
    groups[k].count++;
    const pr = cabinetPrice(c);
    if (pr != null) groups[k].totalPrice += pr; else groups[k].unpriced = true;
  });
  const showPrice = pricingOn(); let subtotal = 0; let anyUnpriced = false;
  const rows = Object.values(groups).map(g => {
    const cat = CATALOG[g.type]; subtotal += g.totalPrice;
    if (g.unpriced) anyUnpriced = true;
    const priceDisplay = g.unpriced
      ? `<span style="color:#64748b;font-style:italic;">${g.totalPrice > 0 ? fmtMoney(g.totalPrice) + '*' : 'No price set'}</span>`
      : fmtMoney(g.totalPrice);
    return `<div class="summary-row">
      <div class="summary-dot" style="background:${cat.color}"></div>
      <div class="summary-name">${cat.label} — ${fmtFrac(g.width)}W × ${fmtFrac(g.height)}H</div>
      ${showPrice ? `<div class="summary-price">${priceDisplay}</div>` : ''}
      <div class="summary-count">×${g.count}</div>
    </div>`;
  }).join('');
  const tax = subtotal*getTax(), total = subtotal+tax;
  const appRows = (r.appliances||[]).map(a => {
    const acat = APPLIANCES[a.type];
    return `<div class="summary-row">
      <div class="summary-dot" style="background:${acat.color}"></div>
      <div class="summary-name">${acat.label} — ${a.width}"W</div>
      <div class="summary-count">×1</div>
    </div>`;
  }).join('');
  const totalCount = r.cabinets.length + (r.appliances||[]).length;
  el.innerHTML = `<h4>Summary (${totalCount} items)</h4>${rows}${appRows}
    ${showPrice ? `<div class="summary-total-row"><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>` : ''}
    ${showPrice && getTax()>0 ? `<div class="summary-total-row" style="font-size:12px;font-weight:600"><span>Tax (${(getTax()*100).toFixed(1)}%)</span><span>${fmtMoney(tax)}</span></div>` : ''}
    ${showPrice ? `<div class="summary-total-row" style="font-size:15px"><span>Total</span><span style="color:var(--success)">${fmtMoney(total)}</span></div>` : ''}
    ${showPrice && anyUnpriced ? `<div style="font-size:11px;color:#b45309;margin-top:6px;">⚠ Some cabinets have no price set for their finish — the subtotal above doesn't include them.</div>` : ''}`;
}

// ════════════════════════════
// QUOTE MODAL
// ════════════════════════════
function refreshQuoteLockBanner() {
  const banner = document.getElementById('quote-lock-banner');
  if (!banner) return;
  const p = activeProj();
  if (!p || !canAccess('gold') || !p.quoteLocked || !p.lockedQuote) {
    banner.style.display = 'none';
    return;
  }
  const sentDate = new Date(p.lockedQuote.date).toLocaleDateString();
  const nextRev  = (p.quoteHistory || []).length + 1;
  banner.style.display = 'block';
  banner.innerHTML = `🔒 <strong>Sent to customer on ${sentDate}</strong> — further edits will be tracked as <strong>Revision ${nextRev}</strong> when printed.`;
}

function openQuoteModal() {
  if (!demoGate('quote')) return;
  const p = activeProj();
  if (!p) { alert('Open a project first.'); return; }
  if (!p.jobCosts) p.jobCosts = [
    { label:'Labor', amount:'' },
    { label:'Demo / Removal', amount:'' },
    { label:'Incidentals', amount:'' },
  ];
  if (!p.trimItems) p.trimItems = [];
  document.getElementById('quote-company-input').value = p.company || '';
  renderJobCostRows();
  renderTrimRows();
  refreshQuoteTotals();
  refreshQuoteLockBanner();
  openModal('modal-quote');
}

function updateQuoteCompany(val) {
  const p = activeProj(); if (!p) return;
  p.company = val; persist();
}

function renderJobCostRows() {
  const p = activeProj(); if (!p) return;
  document.getElementById('job-cost-rows').innerHTML = (p.jobCosts||[]).map((jc, i) => `
    <div class="jc-row">
      <input class="jc-label" type="text" value="${escHtml(jc.label)}" placeholder="Description"
        onchange="updateJobCost(${i},'label',this.value)">
      <input class="jc-amount" type="number" value="${jc.amount||''}" placeholder="0.00" min="0" step="0.01"
        onchange="updateJobCost(${i},'amount',this.value)">
      <button class="jc-del" onclick="removeJobCostRow(${i})" title="Remove">×</button>
    </div>`).join('');
}

function updateJobCost(i, field, val) {
  const p = activeProj(); if (!p || !p.jobCosts[i]) return;
  p.jobCosts[i][field] = field === 'amount' ? (parseFloat(val)||'') : val;
  persist(); refreshQuoteTotals();
}

function addJobCostRow() {
  const p = activeProj(); if (!p) return;
  if (!p.jobCosts) p.jobCosts = [];
  p.jobCosts.push({ label:'', amount:'' });
  persist(); renderJobCostRows(); refreshQuoteTotals();
}

function removeJobCostRow(i) {
  const p = activeProj(); if (!p) return;
  p.jobCosts.splice(i, 1);
  persist(); renderJobCostRows(); refreshQuoteTotals();
}

// Trim & Materials rows
const TRIM_PRESETS = [
  'Crown Molding (96" piece)','Wall Filler 3"x30"','Wall Filler 3"x36"','Wall Filler 3"x42"',
  'Base Filler 3"x34.5"','Base Filler 6"x34.5"','Toe Kick (96")','Light Rail Molding (96")',
  'Scribe Molding (96")','Dishwasher Panel','Refrigerator End Panel 84"','Refrigerator End Panel 96"'
];
function renderTrimRows() {
  const p = activeProj(); if (!p) return;
  if (!p.trimItems) p.trimItems = [];
  document.getElementById('trim-item-rows').innerHTML = p.trimItems.map((t,i) => `
    <div class="jc-row">
      <input class="jc-label" type="text" value="${escHtml(t.label)}" placeholder="Item description" list="trim-presets"
        onchange="updateTrimItem(${i},'label',this.value)">
      <input class="jc-amount" type="number" value="${t.qty||''}" placeholder="Qty" min="1" step="1" style="width:60px;"
        onchange="updateTrimItem(${i},'qty',this.value)">
      <input class="jc-amount" type="number" value="${t.unitPrice||''}" placeholder="$/ea" min="0" step="0.01"
        onchange="updateTrimItem(${i},'unitPrice',this.value)">
      <button class="jc-del" onclick="removeTrimRow(${i})">×</button>
    </div>`).join('') +
    `<datalist id="trim-presets">${TRIM_PRESETS.map(p=>`<option value="${p}">`).join('')}</datalist>`;
}
function updateTrimItem(i, field, val) {
  const p = activeProj(); if (!p || !p.trimItems[i]) return;
  p.trimItems[i][field] = (field === 'qty' || field === 'unitPrice') ? (parseFloat(val)||'') : val;
  persist(); refreshQuoteTotals();
}
function addTrimRow() {
  const p = activeProj(); if (!p) return;
  if (!p.trimItems) p.trimItems = [];
  p.trimItems.push({ label:'', qty:'', unitPrice:'' });
  persist(); renderTrimRows(); refreshQuoteTotals();
}
function removeTrimRow(i) {
  const p = activeProj(); if (!p) return;
  p.trimItems.splice(i, 1);
  persist(); renderTrimRows(); refreshQuoteTotals();
}

function refreshQuoteTotals() {
  const p = activeProj(); if (!p) return;
  const tax = getTax();
  let cabSubtotal = 0, unpricedCount = 0;
  p.rooms.forEach(r => r.cabinets.forEach(c => {
    const pr = cabinetPrice(c);
    if (pr != null) cabSubtotal += pr; else unpricedCount++;
  }));
  const jcTotal    = (p.jobCosts||[]).reduce((s,jc) => s + (parseFloat(jc.amount)||0), 0);
  const trimTotal  = (p.trimItems||[]).reduce((s,t) => s + (parseFloat(t.qty)||0)*(parseFloat(t.unitPrice)||0), 0);
  const beforeTax  = cabSubtotal + jcTotal + trimTotal;
  const taxAmt    = beforeTax * tax;
  const total     = beforeTax + taxAmt;
  const cabCount  = p.rooms.reduce((n,r) => n + r.cabinets.length, 0);
  const el = document.getElementById('quote-totals-preview'); if (!el) return;
  el.innerHTML = `
    <div class="qtp-row"><span>Cabinets (${cabCount} items)</span><span>${fmtMoney(cabSubtotal)}</span></div>
    ${jcTotal>0?`<div class="qtp-row"><span>Additional Costs</span><span>${fmtMoney(jcTotal)}</span></div>`:''}
    ${trimTotal>0?`<div class="qtp-row"><span>Trim &amp; Materials</span><span>${fmtMoney(trimTotal)}</span></div>`:''}
    ${tax>0?`<div class="qtp-row"><span>Tax (${(tax*100).toFixed(1)}%)</span><span>${fmtMoney(taxAmt)}</span></div>`:''}
    <div class="qtp-row"><span>Total</span><span style="color:var(--success);">${fmtMoney(total)}</span></div>
    ${unpricedCount ? `<div style="font-size:11px;color:#b45309;margin-top:6px;">⚠ ${unpricedCount} cabinet${unpricedCount===1?'':'s'} with no price set for their finish — not included above.</div>` : ''}`;
}

function checkCompanyProfile() {
  if (companyProfile.company_name) return true;
  return confirm(
    'Your company profile is not set up.\n\n' +
    'The exported document will show "My Cabinet Planner" as the business name — ' +
    'which looks unprofessional on a customer quote.\n\n' +
    'Click OK to export anyway, or Cancel to go update your Company Settings first.'
  );
}

// Fingerprint of everything that shows on a quote, so a reprint with no changes can be
// told apart from a real revision even when two edits happen to cancel out in the total.
function quoteSignature(p, total) {
  const items = p.rooms.map(r => [
    r.name,
    r.cabinets.map(c => [c.type, c.width, c.height, c.depth, c.styleOverride || '', !!c.glassDoors, c.note || '']),
    (r.appliances || []).map(a => [a.type, a.width, a.price ?? null, a.note || '']),
  ]);
  const str = JSON.stringify([p.style, items, p.jobCosts || [], p.trimItems || [], Math.round(total * 100)]);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36); // short hash — kept on every history entry, so don't store the full string
}
function printQuote() {
  if (!demoGate('quote')) return;
  if (!canAccess('silver')) { showTierUpgradePrompt('silver', 'PDF Quote Export'); return; }
  if (!checkCompanyProfile()) return;
  const p = activeProj(); if (!p) return;
  const unpricedCabs = p.rooms.reduce((n, room) => n + room.cabinets.filter(c => cabinetPrice(c) == null).length, 0);
  if (unpricedCabs > 0) {
    const proceed = confirm(
      `${unpricedCabs} cabinet${unpricedCabs === 1 ? '' : 's'} on this floor plan ${unpricedCabs === 1 ? "doesn't" : "don't"} have a price set for ` +
      `${unpricedCabs === 1 ? 'its' : 'their'} finish.\n\nThey'll show as "N/A" on the quote and won't be included in the total. ` +
      `Continue anyway, or cancel to go set their pricing first?`
    );
    if (!proceed) return;
  }
  // Company name: quote modal field → project field → company profile → default
  const companyField = document.getElementById('quote-company-input');
  const companyName = (companyField?.value.trim()) || p.company || companyProfile.company_name || 'My Cabinet Planner';
  const cp = companyProfile;
  const today     = new Date().toLocaleDateString();
  const validThru = new Date(Date.now()+30*24*60*60*1000).toLocaleDateString();
  let   quoteNum  = 'CD-' + Date.now().toString(36).toUpperCase().slice(-6);
  const tax       = getTax();
  let cabSubtotal = 0;

  let cabRows = '';
  p.rooms.forEach(room => {
    if (!room.cabinets.length) return;
    cabRows += `<tr class="room-hdr"><td colspan="5">${escHtml(room.name)}</td></tr>`;
    room.cabinets.forEach(c => {
      const price = cabinetPrice(c);
      if (price != null) cabSubtotal += price;
      const styleLabel = c.styleOverride ? ` [${c.styleOverride}]` : '';
      const cabLabel = CATALOG[c.type].label + styleLabel + (c.glassDoors ? ' + Glass Doors' : '');
      const priceCell = price != null ? fmtMoney(price) : '<span style="color:#64748b;font-style:italic;">N/A</span>';
      cabRows += `<tr><td>${cabLabel}</td><td>${fmtFrac(c.width)}W × ${fmtFrac(c.height)}H × ${c.depth}"D</td><td>${c.wall.charAt(0).toUpperCase()+c.wall.slice(1)}</td><td>${escHtml(c.note||'—')}</td><td class="amt">${priceCell}</td></tr>`;
    });
  });

  let appRows = '';
  let appSubtotal = 0;
  p.rooms.forEach(room => {
    (room.appliances||[]).forEach(a => {
      const ac = APPLIANCES[a.type];
      const hasPrice = a.price != null && a.price > 0;
      if (hasPrice) appSubtotal += a.price;
      appRows += `<tr><td>${ac.label}</td><td>${a.width}"</td><td>${a.wall.charAt(0).toUpperCase()+a.wall.slice(1)}</td><td>${escHtml(a.note||'—')}</td><td class="amt">${hasPrice ? fmtMoney(a.price) : '<span style="color:#64748b;font-style:italic;">N/A</span>'}</td></tr>`;
    });
  });

  const jcItems   = (p.jobCosts||[]).filter(jc => jc.label || jc.amount);
  const jcTotal   = jcItems.reduce((s,jc) => s+(parseFloat(jc.amount)||0), 0);
  const jcRows    = jcItems.map(jc => `<tr><td colspan="4">${escHtml(jc.label||'Additional Cost')}</td><td class="amt">${fmtMoney(parseFloat(jc.amount)||0)}</td></tr>`).join('');
  const trimItems = (p.trimItems||[]).filter(t => t.label || t.unitPrice);
  const trimTotal = trimItems.reduce((s,t) => s+(parseFloat(t.qty)||0)*(parseFloat(t.unitPrice)||0), 0);
  const trimRows  = trimItems.map(t => `<tr><td colspan="2">${escHtml(t.label||'Trim Item')}</td><td>Qty: ${t.qty||1}</td><td>${fmtMoney(parseFloat(t.unitPrice)||0)} ea</td><td class="amt">${fmtMoney((parseFloat(t.qty)||0)*(parseFloat(t.unitPrice)||0))}</td></tr>`).join('');
  const beforeTax = cabSubtotal + appSubtotal + jcTotal + trimTotal;
  const taxAmt    = beforeTax * tax;
  const total     = beforeTax + taxAmt;
  const styleName = getStyles().find(s=>s.code===p.style)?.name || p.style;

  // ── Quote versioning (Gold tier) ──────────────────────────────────
  if (!p.quoteHistory) p.quoteHistory = [];
  const isGold = canAccess('gold');
  let revision = 1;
  let prevTotal = null;
  let delta = null;

  const sig = quoteSignature(p, total);
  const last = p.quoteHistory[p.quoteHistory.length - 1];
  // Same line items and total as the last recorded version → it's a reprint, not a revision.
  const isReprint = !!last && Math.abs((last.total || 0) - total) < 0.005 && (!last.sig || last.sig === sig);

  if (isGold && p.quoteLocked && isReprint) {
    // Case C: nothing changed since the last version — reprint it under the same number
    revision = last.revision || p.quoteHistory.length;
    quoteNum = last.quoteNum || quoteNum;
    const prior = p.quoteHistory[p.quoteHistory.length - 2];
    if (prior) { prevTotal = prior.total; delta = total - prevTotal; }
  } else if (isGold && p.quoteLocked) {
    // Case B: already sent to customer and something changed — record a tracked revision
    if (last) { prevTotal = last.total; delta = total - prevTotal; }
    revision = p.quoteHistory.length + 1;
    p.quoteHistory.push({
      revision, quoteNum,
      date: new Date().toISOString(),
      total, sig,
      breakdown: { cabSubtotal, appSubtotal, jcTotal, trimTotal, taxAmt }
    });
    if (!p.activityLog) p.activityLog = [];
    p.activityLog.unshift({
      id: uid(), type: 'quote',
      text: `Revision ${revision} generated · ${delta >= 0 ? '+' : '-'}${fmtMoney(Math.abs(delta))} from v${revision - 1} · New total: ${fmtMoney(total)} · Quote #${quoteNum}`,
      createdAt: new Date().toISOString(),
      user: currentUser ? currentUser.email : 'You'
    });
    persist();
  }
  // Case A (isGold && !p.quoteLocked): draft print — no versioning yet;
  // after window opens we prompt to mark as sent (see below after win.document.close())

  const deltaStr   = delta != null ? `${delta >= 0 ? '+' : '-'}${fmtMoney(Math.abs(delta))}` : '';
  const deltaColor = delta != null ? (delta >= 0 ? '#16a34a' : '#dc2626') : '';

  // Any printed quote counts as "quoted" for the status warning — Silver never locks quotes.
  p.lastQuotedAt = new Date().toISOString();
  persist();

  const win = window.open('', '_blank', 'width=920,height=750');
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"><title>Quote — ${escHtml(p.customer)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,'Helvetica Neue',sans-serif;color:#1a1a1a;padding:48px;max-width:860px;margin:0 auto;font-size:12px;}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #0f766e;}
.co-name{font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-.5px;}
.co-sub{font-size:11px;color:#64748b;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
.co-info{font-size:11px;color:#6b7280;margin-top:6px;line-height:1.6;}
.q-title{font-size:22px;font-weight:800;color:#0f766e;text-align:right;}
.q-meta{font-size:11px;color:#6b7280;text-align:right;margin-top:6px;line-height:1.8;}
.cust-bar{display:flex;gap:28px;flex-wrap:wrap;background:#f8fafc;padding:14px 18px;border-radius:8px;border-left:4px solid #0f766e;margin-bottom:22px;}
.ci label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;display:block;margin-bottom:2px;}
.ci span{font-size:13px;font-weight:700;color:#1e293b;}
.ci small{font-size:10px;color:#6b7280;display:block;margin-top:2px;}
.sec{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:20px 0 6px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;}
table{width:100%;border-collapse:collapse;margin-bottom:4px;font-size:11px;}
th{background:#1e293b;color:#fff;text-align:left;padding:7px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;}
td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top;}
tr:nth-child(even) td{background:#faf9f7;}
tr.room-hdr td{background:#f1f5f9!important;font-weight:700;font-size:10px;color:#0f766e;padding:4px 10px;}
.amt{text-align:right;font-weight:600;white-space:nowrap;}
.totals{margin-top:12px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;}
.tr{display:flex;justify-content:space-between;padding:6px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;}
.tr:last-child{border-bottom:none;font-size:16px;font-weight:800;background:#f0fdf4;padding:10px 14px;}
.tl{color:#6b7280;}.ta{font-weight:600;}
.terms{margin-top:28px;padding:18px 20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;page-break-inside:avoid;}
.terms h4{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:10px;}
.terms p{font-size:10px;color:#6b7280;line-height:1.7;margin-bottom:5px;}
.terms strong{color:#0f4038;}
.sigs{margin-top:36px;page-break-inside:avoid;}
.sr{display:flex;gap:60px;margin-top:28px;}
.sb{flex:1;}
.sl{border-bottom:1px solid #374151;height:36px;margin-bottom:5px;}
.slb{font-size:10px;color:#6b7280;font-weight:600;}
.foot{margin-top:24px;text-align:center;font-size:9px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px;}
@media print{body{padding:24px;}@page{margin:.75in;size:letter;}}
</style></head>
<body onload="window.print()">
<div class="hdr">
  <div>
    ${cp.logo_url ? `<img src="${escHtml(cp.logo_url)}" style="height:48px;margin-bottom:8px;display:block;" alt="logo">` : ''}
    <div class="co-name">${escHtml(companyName)}</div>
    ${cp.tagline ? `<div class="co-sub">${escHtml(cp.tagline)}</div>` : '<div class="co-sub">Professional Cabinet Design &amp; Installation</div>'}
    <div class="co-info">
      ${cp.address ? escHtml(cp.address) + (cp.city ? ', '+escHtml(cp.city) : '') + (cp.state ? ' '+escHtml(cp.state) : '') + (cp.zip ? ' '+escHtml(cp.zip) : '') + '<br>' : ''}
      ${cp.phone ? escHtml(cp.phone) + '<br>' : ''}
      ${cp.email ? escHtml(cp.email) + '<br>' : ''}
      ${cp.website ? escHtml(cp.website) : 'mycabinetplanner.com'}
    </div>
  </div>
  <div>
    <div class="q-title" style="${revision > 1 ? 'color:#b45309;' : ''}">${revision > 1 ? `REVISION ${revision}` : 'QUOTE'}</div>
    <div class="q-meta">Quote #: ${quoteNum}<br>Date: ${today}<br>Valid Through: ${validThru}${revision > 1 ? `<br><span style="color:#b45309;font-weight:700;">Revised Quote</span>` : ''}</div>
  </div>
</div>
${revision > 1 ? `
<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:11px 16px;margin-bottom:18px;font-size:11px;display:flex;justify-content:space-between;align-items:center;gap:16px;">
  <span style="font-weight:800;color:#92400e;white-space:nowrap;">REVISED QUOTE — Version ${revision}</span>
  <span style="color:#78716c;">Prior total: <strong>${fmtMoney(prevTotal)}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Change: <strong style="color:${deltaColor}">${deltaStr}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;New total: <strong style="color:#1e293b;">${fmtMoney(total)}</strong></span>
</div>` : ''}
<div class="cust-bar">
  <div class="ci"><label>Customer</label><span>${escHtml(p.customer)}</span>${p.address?`<small>${escHtml(p.address)}${p.city?', '+escHtml(p.city):''}${p.state?' '+escHtml(p.state):''}</small>`:''}</div>
  <div class="ci"><label>Project</label><span>${escHtml(p.type)}</span>${p.notes?`<small>${escHtml(p.notes)}</small>`:''}</div>
  <div class="ci"><label>Door Style</label><span>${escHtml(p.style)}</span><small>${escHtml(styleName)}</small></div>
  <div class="ci"><label>Rooms</label><span>${p.rooms.length}</span></div>
</div>
<div class="sec">Cabinet Line Items</div>
<table><thead><tr><th>Cabinet</th><th>Dimensions</th><th>Wall</th><th>Notes</th><th style="text-align:right">Price</th></tr></thead>
<tbody>${cabRows||'<tr><td colspan="5" style="text-align:center;color:#6b7280;">No cabinets added.</td></tr>'}</tbody></table>
${appRows?`<div class="sec">Appliances</div><table><thead><tr><th>Appliance</th><th>Width</th><th>Wall</th><th>Notes</th><th style="text-align:right">Price</th></tr></thead><tbody>${appRows}</tbody></table>`:''}
${jcRows?`<div class="sec">Additional Job Costs</div><table><thead><tr><th colspan="4">Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>${jcRows}</tbody></table>`:''}
${trimRows?`<div class="sec">Trim &amp; Materials</div><table><thead><tr><th colspan="2">Item</th><th>Qty</th><th>Unit Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${trimRows}</tbody></table>`:''}
<div class="totals" style="margin-top:16px;">
  <div class="tr"><span class="tl">Cabinet Subtotal</span><span class="ta">${fmtMoney(cabSubtotal)}</span></div>
  ${appSubtotal>0?`<div class="tr"><span class="tl">Appliances</span><span class="ta">${fmtMoney(appSubtotal)}</span></div>`:''}
  ${jcTotal>0?`<div class="tr"><span class="tl">Additional Costs</span><span class="ta">${fmtMoney(jcTotal)}</span></div>`:''}
  ${trimTotal>0?`<div class="tr"><span class="tl">Trim &amp; Materials</span><span class="ta">${fmtMoney(trimTotal)}</span></div>`:''}
  ${tax>0?`<div class="tr"><span class="tl">Tax (${(tax*100).toFixed(1)}%)</span><span class="ta">${fmtMoney(taxAmt)}</span></div>`:''}
  <div class="tr"><span>TOTAL</span><span class="ta" style="color:#15803d;">${fmtMoney(total)}</span></div>
</div>
${cp.terms_and_conditions ? `<div class="terms"><h4>Terms &amp; Conditions</h4><p style="white-space:pre-wrap;">${escHtml(cp.terms_and_conditions)}</p></div>` : ''}
<div class="sigs">
  <div class="sr">
    <div class="sb"><div class="sl"></div><div class="slb">Customer Signature</div><div style="margin-top:20px;"><div class="sl"></div><div class="slb">Print Name</div></div></div>
    <div class="sb"><div class="sl"></div><div class="slb">${escHtml(companyName)} Representative</div><div style="margin-top:20px;"><div class="sl"></div><div class="slb">Print Name / Title</div></div></div>
  </div>
  <div class="sr" style="margin-top:20px;">
    <div class="sb"><div style="border-bottom:1px solid #374151;width:180px;height:36px;margin-bottom:5px;"></div><div class="slb">Date</div></div>
    <div class="sb"><div style="border-bottom:1px solid #374151;width:180px;height:36px;margin-bottom:5px;"></div><div class="slb">Date</div></div>
  </div>
</div>
<div class="foot">${escHtml(companyName)}${cp.website ? ' · '+escHtml(cp.website) : ''} · Quote #${quoteNum} · Generated ${today}</div>
</body></html>`);
  win.document.close();

  // Case A: Gold + not yet locked — prompt to mark as sent after PDF opens
  if (isGold && !p.quoteLocked) {
    setTimeout(() => {
      const doLock = confirm(
        `Mark this quote as sent to ${p.customer || 'the customer'}?\n\n` +
        `This locks it as the record of what they agreed to — ` +
        `any changes after this will be tracked as a revision.`
      );
      if (doLock) {
        p.quoteLocked  = true;
        p.lockedQuote  = { revision: 1, quoteNum, date: new Date().toISOString(), total, sig,
                           breakdown: { cabSubtotal, appSubtotal, jcTotal, trimTotal, taxAmt } };
        if (!p.quoteHistory) p.quoteHistory = [];
        p.quoteHistory.push(p.lockedQuote);
        if (!p.activityLog) p.activityLog = [];
        p.activityLog.unshift({
          id: uid(), type: 'quote',
          text: `Quote sent — ${fmtMoney(total)} · Quote #${quoteNum}`,
          createdAt: new Date().toISOString(),
          user: currentUser ? currentUser.email : 'You'
        });
        persist();
        refreshQuoteLockBanner();
      }
    }, 500);
  }
}

