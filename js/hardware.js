// My Cabinet Planner — js/hardware.js
// Hardware & accessories on the quote (Build Plan 7.2, from Dan's family in the trade).
// The planner counts what the design needs — pulls/knobs per door and drawer (from the
// same front layout as the 3D and elevations), drawer slides (only if the company's
// cabinets don't include them), trash pull-out kits — and the rep types an each-price.
// Hinges come with the cabinets. Extra accessories (roll-out trays, LED, …) are added
// by hand from a preset list. Everything lives on the project (p.hardwareQuote) and goes
// into the printed quote, the PDF, the quote total and the Gold revision fingerprint.
// Also: one totals helper (quoteTotals) used by the printed quote, the PDF and the
// Quote window, so the three can't disagree.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// WHAT CAN BE COUNTED
// ════════════════════════════
const HARDWARE_AUTO = [
  { key: 'pull',        label: 'Cabinet pulls' },
  { key: 'knob',        label: 'Cabinet knobs' },
  { key: 'slidePair',   label: 'Drawer slides (pair)' },
  { key: 'trashSingle', label: 'Trash pull-out kit — single' },
  { key: 'trashDouble', label: 'Trash pull-out kit — double (trash + recycle)' },
];
const ACCESSORY_PRESETS = [
  'Roll-out tray', 'Spice pull-out', 'Tray divider', 'Cutlery / utensil insert', 'Under-cabinet LED (per ft)',
  'Soft-close hinge upgrade', 'Soft-close slide upgrade (pair)', 'Extra adjustable shelf', 'Lazy susan hardware',
  'Pull-out pantry kit', 'Touch-up kit',
];
const HARDWARE_STYLES = { pulls: 'Pulls on doors & drawers', knobs: 'Knobs on doors, pulls on drawers', allKnobs: 'Knobs on doors & drawers' };
function projectHardware(p) { return (p && HARDWARE_STYLES[p.hardware]) ? p.hardware : 'pulls'; }
function slidesIncluded() { const qs = (typeof companyProfile !== 'undefined' && companyProfile.quote_settings) || {}; return qs.slidesIncluded !== false; }

// → { pull, knob, slidePair, trashSingle, trashDouble, doors, drawers }
function hardwareCounts(p) {
  const n = { pull: 0, knob: 0, slidePair: 0, trashSingle: 0, trashDouble: 0, doors: 0, drawers: 0 };
  if (!p) return n;
  const style = projectHardware(p), countSlides = !slidesIncluded();
  const onDoor = () => { n.doors++; if (style === 'pulls') n.pull++; else n.knob++; };
  const onDrawer = (withSlides) => { n.drawers++; if (style === 'allKnobs') n.knob++; else n.pull++; if (withSlides && countSlides) n.slidePair++; };
  p.rooms.forEach(r => r.cabinets.forEach(c => {
    if (!CATALOG[c.type] || isFiller(c.type)) return;
    if (cornerInfo(r, c)) { onDoor(); return; }          // lazy susan (one handle on the bifold) / diagonal corner wall
    frontLayout(c, r).forEach(f => {
      if (f.kind === 'door') onDoor();
      else if (f.kind === 'drawer') onDrawer(!f.trash);   // a trash pull-out's kit includes its slides
    });
    if (c.trash === 'single') n.trashSingle++;
    if (c.trash === 'double') n.trashDouble++;
  }));
  return n;
}

// ════════════════════════════
// QUOTE LINES
// ════════════════════════════
function hwq(p) {
  if (!p.hardwareQuote) p.hardwareQuote = { lines: {}, extras: [] };
  if (!p.hardwareQuote.lines) p.hardwareQuote.lines = {};
  if (!p.hardwareQuote.extras) p.hardwareQuote.extras = [];
  return p.hardwareQuote;
}
const _hwNum = v => { const x = parseFloat(v); return isNaN(x) ? null : x; };
// → [{ key, label, qty, auto, each, total, extra }] — only lines that are on and have a quantity
function hardwareQuoteLines(p) {
  if (!p) return [];
  const counts = hardwareCounts(p), q = p.hardwareQuote || {}, saved = q.lines || {};
  const out = [];
  HARDWARE_AUTO.forEach(h => {
    const s = saved[h.key] || {};
    if (s.off) return;
    const qty = s.qty != null && s.qty !== '' ? _hwNum(s.qty) : counts[h.key];
    if (!qty) return;
    const each = _hwNum(s.each);
    out.push({ key: h.key, label: h.label, qty, auto: counts[h.key], each, total: each != null ? each * qty : null });
  });
  (q.extras || []).forEach((x, i) => {
    const qty = _hwNum(x.qty) || 0; if (!x.label && !qty) return;
    const each = _hwNum(x.each);
    out.push({ key: 'x' + i, label: x.label || 'Accessory', qty, each, total: each != null ? each * qty : null, extra: true });
  });
  return out;
}
function hardwareTotal(p) { return hardwareQuoteLines(p).reduce((s, l) => s + (l.total || 0), 0); }

// One place for the money, so the printed quote, the PDF and the Quote window agree
function quoteTotals(p) {
  let cab = 0, cabBase = 0, unpriced = 0, app = 0;
  p.rooms.forEach(r => {
    quoteCabinets(r).forEach(c => { const pr = cabinetPrice(c); if (pr != null) { cab += pr; cabBase += cabinetPrice(c, { noMarkup: true }); } else unpriced++; });
    (r.appliances || []).forEach(a => { if (a.price != null && a.price > 0 && !(APPLIANCES[a.type] || {}).decor) app += a.price; });
  });
  const jc = (p.jobCosts || []).filter(x => x.label || x.amount).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  const trim = (p.trimItems || []).filter(t => t.label || t.unitPrice).reduce((s, t) => s + (parseFloat(t.qty) || 0) * (parseFloat(t.unitPrice) || 0), 0);
  const hw = hardwareTotal(p);
  const beforeTax = cab + app + jc + trim + hw, tax = beforeTax * getTax();
  // cab includes the markup (cabinets only); cabBase/markup split it for the Quote window
  return { cab, cabBase, markup: cab - cabBase, unpriced, app, jc, trim, hw, beforeTax, tax, total: beforeTax + tax };
}

// ════════════════════════════
// QUOTE WINDOW
// ════════════════════════════
function renderHardwareRows() {
  const box = document.getElementById('hardware-rows'); if (!box) return;
  const p = activeProj(); if (!p) return;
  const q = hwq(p), counts = hardwareCounts(p);
  const style = projectHardware(p);
  const head = `<div class="form-hint" style="margin-bottom:6px;">Counted from the plan: ${counts.doors} door${counts.doors === 1 ? '' : 's'}, ${counts.drawers} drawer${counts.drawers === 1 ? '' : 's'} · ${escHtml(HARDWARE_STYLES[style])} (Door Style panel) · slides ${slidesIncluded() ? 'included with cabinets' : 'counted per drawer'} (Profile). Hinges come with the cabinets.</div>`;
  const autoRows = HARDWARE_AUTO.map(h => {
    const s = q.lines[h.key] || {}, n = counts[h.key];
    if (!n && (s.qty == null || s.qty === '')) return '';
    return `<div class="jc-row hw-row">
      <label class="hw-on"><input type="checkbox" ${s.off ? '' : 'checked'} onchange="setHardwareLine('${h.key}','off',!this.checked)" aria-label="Include ${escHtml(h.label)}"></label>
      <span class="hw-label">${escHtml(h.label)}</span>
      <input class="jc-amount" type="number" min="0" step="1" style="width:64px;" value="${s.qty != null && s.qty !== '' ? escHtml(String(s.qty)) : ''}" placeholder="${n}" title="Counted: ${n}. Type a number to change it." onchange="setHardwareLine('${h.key}','qty',this.value)" aria-label="Quantity">
      <input class="jc-amount" type="number" min="0" step="0.01" value="${s.each != null ? escHtml(String(s.each)) : ''}" placeholder="$/ea" onchange="setHardwareLine('${h.key}','each',this.value)" aria-label="Price each">
    </div>`;
  }).join('');
  const extraRows = q.extras.map((x, i) => `<div class="jc-row hw-row">
      <span class="hw-on"></span>
      <input class="jc-label" type="text" value="${escHtml(x.label || '')}" placeholder="Accessory" list="hw-presets" onchange="setHardwareExtra(${i},'label',this.value)">
      <input class="jc-amount" type="number" min="0" step="1" style="width:64px;" value="${escHtml(String(x.qty ?? ''))}" placeholder="Qty" onchange="setHardwareExtra(${i},'qty',this.value)">
      <input class="jc-amount" type="number" min="0" step="0.01" value="${escHtml(String(x.each ?? ''))}" placeholder="$/ea" onchange="setHardwareExtra(${i},'each',this.value)">
      <button class="jc-del" onclick="removeHardwareExtra(${i})" aria-label="Remove">×</button>
    </div>`).join('');
  box.innerHTML = head + (autoRows || '<div class="form-hint">No doors or drawers yet.</div>') + extraRows +
    `<datalist id="hw-presets">${ACCESSORY_PRESETS.map(x => `<option value="${escHtml(x)}">`).join('')}</datalist>`;
}
function setHardwareLine(key, field, value) {
  const p = activeProj(); if (!p) return;
  const q = hwq(p), s = q.lines[key] || (q.lines[key] = {});
  if (field === 'off') s.off = !!value;
  else if (field === 'qty') s.qty = value === '' ? null : Math.max(0, Math.round(parseFloat(value) || 0));
  else if (field === 'each') s.each = value === '' ? null : Math.max(0, parseFloat(value) || 0);
  persist(); renderHardwareRows(); refreshQuoteTotals();
}
function addHardwareExtra() {
  const p = activeProj(); if (!p) return;
  hwq(p).extras.push({ label: '', qty: 1, each: null });
  persist(); renderHardwareRows();
}
function setHardwareExtra(i, field, value) {
  const p = activeProj(); if (!p) return;
  const x = hwq(p).extras[i]; if (!x) return;
  if (field === 'label') x.label = value.trim();
  else if (field === 'qty') x.qty = value === '' ? null : Math.max(0, parseFloat(value) || 0);
  else if (field === 'each') x.each = value === '' ? null : Math.max(0, parseFloat(value) || 0);
  persist(); refreshQuoteTotals();
}
function removeHardwareExtra(i) {
  const p = activeProj(); if (!p) return;
  hwq(p).extras.splice(i, 1);
  persist(); renderHardwareRows(); refreshQuoteTotals();
}

// ════════════════════════════
// PRINTED QUOTE / PDF
// ════════════════════════════
function hardwareQuoteHTML(p) {
  const lines = hardwareQuoteLines(p); if (!lines.length) return '';
  const rows = lines.map(l => `<tr><td colspan="2">${escHtml(l.label)}</td><td>Qty: ${l.qty}</td><td>${l.each != null ? fmtMoney(l.each) + ' ea' : '<span style="color:#64748b;font-style:italic;">N/A</span>'}</td><td class="amt">${l.total != null ? fmtMoney(l.total) : '<span style="color:#64748b;font-style:italic;">N/A</span>'}</td></tr>`).join('');
  return `<div class="sec">Hardware &amp; Accessories</div><table><thead><tr><th colspan="2">Item</th><th>Qty</th><th>Each</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>`;
}
// jsPDF + autotable; returns the new y
function addHardwareToPdf(doc, p, MAR, qy) {
  const lines = hardwareQuoteLines(p); if (!lines.length) return qy;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 75, 42);
  doc.text('HARDWARE & ACCESSORIES', MAR, qy); qy += 3;
  doc.autoTable({ startY: qy, margin: { left: MAR, right: MAR },
    head: [['Item', 'Qty', 'Each', 'Total']],
    body: lines.map(l => [l.label, l.qty, l.each != null ? '$' + l.each.toFixed(2) : 'N/A',
      { content: l.total != null ? '$' + l.total.toFixed(2) : 'N/A', styles: { halign: 'right' } }]),
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [44, 31, 20], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    theme: 'grid', columnStyles: { 3: { cellWidth: 35 } },
  });
  return doc.lastAutoTable.finalY + 4;
}
// For the Gold revision fingerprint: only present when there are hardware lines, so
// fingerprints of quotes made before 7.2 don't change
function hardwareSignature(p) { return hardwareQuoteLines(p).map(l => [l.label, l.qty, l.each]); }
