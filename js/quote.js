// My Cabinet Planner — js/quote.js
// Summary table, quote modal, job costs/trim, quote versions (recordQuoteVersion).
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// RENDER: SUMMARY TABLE
// ════════════════════════════
function renderSummary(r) {
  const el = document.getElementById('summary-table');
  if (!r || !r.cabinets.length) { el.innerHTML = ''; return; }
  const groups = {};
  quoteCabinets(r).forEach(c => {          // incl. bump-out casing filler (7.1)
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
  banner.innerHTML = `🔒 <strong>Sent to customer on ${sentDate}</strong> — further edits will be tracked as <strong>Revision ${nextRev}</strong> when you export the quote.`;
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
  renderHardwareRows();
  refreshQuoteTotals();
  refreshQuoteLockBanner();
  renderQuoteSnapshotList();
  openModal('modal-quote');
  if (typeof maybeTips === 'function') maybeTips('quote');
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

function setQuoteMarkup(v) {
  const p = activeProj(); if (!p) return;
  const n = parseFloat(v);
  p.markupPct = isFinite(n) ? Math.max(0, Math.min(500, n)) : 0;
  persist(); refreshQuoteTotals(); renderAll();
}
// Does this project use any finish priced from MSRP (no markup on those)?
function usesMsrp(p) {
  const codes = new Set([p.style, ...p.rooms.flatMap(r => r.cabinets.map(c => c.styleOverride).filter(Boolean))]);
  return [...codes].some(c => { const b = priceBasis(c); return b && b.kind === 'msrp'; });
}
function refreshQuoteTotals() {
  const p = activeProj(); if (!p) return;
  const tax = getTax();
  // (quoteTotals — hardware.js — is shared with the printed quote and PDF. This preview
  // used to leave out appliance prices, so it could disagree with the printed total.)
  const T = quoteTotals(p);
  const cabSubtotal = T.cab, unpricedCount = T.unpriced, jcTotal = T.jc, trimTotal = T.trim, taxAmt = T.tax, total = T.total;
  const cabCount  = p.rooms.reduce((n,r) => n + quoteCabinets(r).length, 0);
  const el = document.getElementById('quote-totals-preview'); if (!el) return;
  el.innerHTML = `
    <div class="qtp-row"><span>Cabinets (${cabCount} items)</span><span>${fmtMoney(T.cabBase)}</span></div>
    <div class="qtp-row"><span><label for="quote-markup">Markup</label> <input type="number" id="quote-markup" min="0" max="500" step="1" value="${escHtml(String(p.markupPct || 0))}" onchange="setQuoteMarkup(this.value)" style="width:64px;padding:2px 6px;font-size:13px;"> %
      <span style="display:block;font-size:10px;color:var(--text-muted);font-weight:400;">Cabinets only. Built into the cabinet prices on your customer's quote — it isn't shown to them as a line.${usesMsrp(p) ? ' Finishes priced from MSRP use their MSRP % instead.' : ''}</span></span><span>${fmtMoney(T.markup)}</span></div>
    ${T.app>0?`<div class="qtp-row"><span>Appliances</span><span>${fmtMoney(T.app)}</span></div>`:''}
    ${T.hw>0?`<div class="qtp-row"><span>Hardware &amp; Accessories</span><span>${fmtMoney(T.hw)}</span></div>`:''}
    ${jcTotal>0?`<div class="qtp-row"><span>Additional Costs</span><span>${fmtMoney(jcTotal)}</span></div>`:''}
    ${trimTotal>0?`<div class="qtp-row"><span>Trim &amp; Materials</span><span>${fmtMoney(trimTotal)}</span></div>`:''}
    <div class="qtp-row"><span><label for="quote-tax">Sales tax</label> <input type="number" id="quote-tax" min="0" max="30" step="0.01" value="${escHtml(String(projectTaxPct(p)))}" onchange="setProjectTax(this.value)" style="width:64px;padding:2px 6px;font-size:13px;"> %
      <span style="display:block;font-size:10px;color:var(--text-muted);font-weight:400;">This job's rate. New projects start from your default in Company Settings.</span></span><span>${fmtMoney(taxAmt)}</span></div>
    <div class="qtp-row"><span>Total</span><span style="color:var(--success);">${fmtMoney(total)}</span></div>
    ${unpricedCount ? `<div style="font-size:11px;color:#b45309;margin-top:6px;">⚠ ${unpricedCount} cabinet${unpricedCount===1?'':'s'} with no price set for their finish — not included above. ${typeof myTeamRole === 'undefined' || myTeamRole === 'owner' ? 'Add prices in <a href="/profile#files">My Pricing</a>.' : 'Ask the account owner to add them in My Pricing.'}</div>` : ''}
    ${glassUpchargePct() == null && p.rooms.some(r => r.cabinets.some(c => c.type === 'wall' && c.glassDoors)) ? `<div style="font-size:11px;color:#b45309;margin-top:4px;">⚠ Glass doors have no price until you set your glass upcharge % in <a href="/profile#company">Company Settings</a>.</div>` : ''}`;
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
    r.cabinets.map(c => [c.type, c.width, c.height, c.depth, c.styleOverride || '', !!c.glassDoors, c.note || ''].concat(c.wallOffset ? [c.wallOffset] : [])),   // (offset only when set, so older fingerprints don't change)
    (r.appliances || []).map(a => [a.type, a.width, a.price ?? null, a.note || '']),
  ]);
  const parts = [p.style, items, p.jobCosts || [], p.trimItems || [], Math.round(total * 100)];
  // Hardware lines (7.2) — only when there are any, so older fingerprints don't change
  const hwSig = typeof hardwareSignature === 'function' ? hardwareSignature(p) : [];
  if (hwSig.length) parts.push(['hw', hwSig]);
  // The 3D views are part of what the customer sees, so changing them is a new version.
  // (Only added when there are any, so fingerprints of quotes saved before 3.6 don't change.)
  const snaps = typeof currentSnapshotPaths === 'function' ? currentSnapshotPaths(p) : [];
  if (snaps.length) parts.push(snaps);
  const str = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36); // short hash — kept on every history entry, so don't store the full string
}
// Gold quote versions — moved here from the old Print Quote (Dan, 2026-10-08: one PDF button).
// Export PDF calls this when the file includes the quote:
//   • sent and unchanged → the same number again (a reprint isn't a revision)
//   • sent and changed   → the next revision, logged with the change in total
//   • not sent yet       → markSent locks it as version 1 ("Quote sent" in the activity log)
// Silver (and Gold quotes not marked as sent) get a fresh quote number each time, untracked.
function recordQuoteVersion(p, T, snapPaths, markSent) {
  const isGold = canAccess('gold'), total = T.total;
  if (!p.quoteHistory) p.quoteHistory = [];
  const hist = p.quoteHistory, last = hist[hist.length - 1];
  const sig = quoteSignature(p, total);
  const isReprint = !!last && Math.abs((last.total || 0) - total) < 0.005 && (!last.sig || last.sig === sig);
  const breakdown = { cabSubtotal: T.cab, appSubtotal: T.app, jcTotal: T.jc, trimTotal: T.trim, hwTotal: T.hw, taxAmt: T.tax };
  const newNum = () => 'CD-' + Date.now().toString(36).toUpperCase().slice(-6);
  const log = text => { if (!p.activityLog) p.activityLog = []; p.activityLog.unshift({ id: uid(), type: 'quote', text, createdAt: new Date().toISOString(), user: currentUser ? currentUser.email : 'You' }); };
  let out;
  if (isGold && p.quoteLocked && isReprint) {
    const prior = hist[hist.length - 2];
    out = { num: last.quoteNum, revision: last.revision || hist.length, prevTotal: prior ? prior.total : null, snaps: Array.isArray(last.snapshots) ? last.snapshots : null };
  } else if (isGold && p.quoteLocked) {
    const revision = hist.length + 1, quoteNum = newNum(), delta = last ? total - last.total : 0;
    hist.push({ revision, quoteNum, date: new Date().toISOString(), total, sig, snapshots: snapPaths, breakdown });
    log(`Revision ${revision} generated · ${delta >= 0 ? '+' : '-'}${fmtMoney(Math.abs(delta))} from v${revision - 1} · New total: ${fmtMoney(total)} · Quote #${quoteNum}`);
    out = { num: quoteNum, revision, prevTotal: last ? last.total : null, snaps: null };
  } else if (isGold && markSent) {
    const quoteNum = newNum();
    p.quoteLocked = true;
    p.lockedQuote = { revision: 1, quoteNum, date: new Date().toISOString(), total, sig, snapshots: snapPaths, breakdown };
    hist.push(p.lockedQuote);
    log(`Quote sent — ${fmtMoney(total)} · Quote #${quoteNum}`);
    out = { num: quoteNum, revision: 1, prevTotal: null, snaps: null };
  } else {
    out = { num: newNum(), revision: 0, prevTotal: null, snaps: null };
  }
  p.lastQuotedAt = new Date().toISOString();   // counts as "quoted" for the status warning
  persist();
  if (typeof refreshQuoteLockBanner === 'function') refreshQuoteLockBanner();
  return out;
}
