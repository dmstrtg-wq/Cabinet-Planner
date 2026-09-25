// My Cabinet Planner — js/orderlist.js
// Order-ready list (Build Plan 5.7): every cabinet, panel and filler with SKU, size, door
// style/finish, hinge side, room and quantity — as a CSV to paste into a supplier order
// form, or a printable list. Appliances aren't ordered from the cabinet supplier, so
// they're left out. Style names/codes come only from the account's own styles
// (getStyles), never a built-in supplier catalog.
// Loaded by app.html as a classic script (shared global scope). Load order matters —
// see the <script> list at the bottom of app.html.

// ════════════════════════════
// HINGE SIDE
// ════════════════════════════
// Only single-door boxes need a hinge side on the order; doubles, drawers, lazy susans,
// fillers and panels don't.
function needsHinge(cab) {
  const w = cab.width;
  if (cab.type === 'base' || cab.type === 'wall') return w <= 21;
  if (cab.type === 'tall') return w <= 18;
  return cab.type === 'cornerBase' || cab.type === 'diagWall';
}
const HINGE_LABEL = { L: 'Left', R: 'Right' };

// ════════════════════════════
// BUILDING THE LIST
// ════════════════════════════
const _num = v => String(Math.round(v * 10000) / 10000);         // 1.375, 34.5, 36
const _whole = v => fmtFrac(v).replace('"', '').replace(' ', '-');  // 1-3/8 for codes
function orderSku(cab) {
  const cat = CATALOG[cab.type];
  if (isFiller(cab.type)) return 'FL' + fillerPriceParts(cab.width).stock;
  if (cab.type === 'fridgePanel') return 'FEP' + _whole(cab.height);
  if (cat.heights.length > 1) return cat.abbr + _whole(cab.width) + _whole(cab.height);   // W3030, WP1884
  return cat.abbr + _whole(cab.width);                                                      // B36, SB33
}
function orderStyle(p, cab) {
  const code = cab.styleOverride || p.style;
  const s = getStyles().find(x => x.code === code);
  return { code: code || '', name: s ? s.name : (code || '') };
}
// → [{ room, rows:[{ qty, sku, desc, w, h, d, styleName, styleCode, hinge, items, notes }] }]
function buildOrderList(p) {
  return p.rooms.map(r => {
    const groups = new Map();
    r.cabinets.slice().sort((a, b) => (a.itemNum || 0) - (b.itemNum || 0)).forEach(cab => {
      if (!CATALOG[cab.type]) return;
      const st = orderStyle(p, cab);
      const filler = isFiller(cab.type);
      const fp = filler ? fillerPriceParts(cab.width) : null;
      const hinge = needsHinge(cab) ? (HINGE_LABEL[cab.hinge] || 'SPECIFY') : '';
      const desc = filler
        ? `Filler, ${fp.stock}" stock — rip to ${fmtFrac(cab.width)} × ${fmtFrac(cab.height)}`
        : CATALOG[cab.type].label + (cab.glassDoors ? ', glass doors' : '');
      const key = [orderSku(cab), st.code, hinge, cab.glassDoors ? 'G' : '', filler ? cab.width + 'x' + cab.height : ''].join('|');
      if (!groups.has(key)) groups.set(key, {
        qty: 0, sku: orderSku(cab), desc,
        w: filler ? fp.stock : cab.width, h: cab.height, d: cab.depth || CATALOG[cab.type].depth,
        styleName: st.name, styleCode: st.code, hinge, items: [], notes: [],
      });
      const g = groups.get(key);
      g.qty += filler ? fp.count : 1;          // fillers: order the stock pieces it takes
      if (cab.itemNum) g.items.push(cab.itemNum);
      if (cab.note) g.notes.push(cab.note);
    });
    return { room: r.name, rows: [...groups.values()] };
  }).filter(x => x.rows.length);
}

// ════════════════════════════
// OUTPUT
// ════════════════════════════
function orderGate() {
  if (!demoGate('order')) return false;
  if (!canAccess('silver')) { showTierUpgradePrompt('silver', 'Order List export'); return false; }
  return true;
}
function _orderFileName(p, ext) { return `${(p.customer || 'project').replace(/[^\w\-]+/g, '_')}_order_list.${ext}`; }
function orderMissingHinges(list) { return list.reduce((n, g) => n + g.rows.filter(r => r.hinge === 'SPECIFY').reduce((m, r) => m + r.qty, 0), 0); }

function downloadOrderCSV() {
  if (!orderGate()) return;
  const p = activeProj(); if (!p) return;
  const list = buildOrderList(p);
  if (!list.length) { alert('There are no cabinets on this project yet.'); return; }
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['Room', 'Qty', 'SKU', 'Description', 'Width (in)', 'Height (in)', 'Depth (in)', 'Door Style / Finish', 'Finish Code', 'Hinge', 'Item #s', 'Notes']];
  list.forEach(g => g.rows.forEach(r => rows.push([g.room, r.qty, r.sku, r.desc, _num(r.w), _num(r.h), _num(r.d), r.styleName, r.styleCode, r.hinge, r.items.join(' '), r.notes.join('; ')])));
  const csv = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');   // BOM so Excel reads the inch marks right
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = _orderFileName(p, 'csv');
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  const missing = orderMissingHinges(list);
  if (missing) alert(`Downloaded. Heads up: ${missing} single-door cabinet${missing === 1 ? ' has' : 's have'} no hinge side set — marked SPECIFY. Double-click a cabinet to set Left/Right.`);
}

function printOrderList() {
  if (!orderGate()) return;
  const p = activeProj(); if (!p) return;
  const list = buildOrderList(p);
  if (!list.length) { alert('There are no cabinets on this project yet.'); return; }
  const company = companyProfile.company_name || p.company || '';
  const missing = orderMissingHinges(list);
  const total = list.reduce((n, g) => n + g.rows.reduce((m, r) => m + r.qty, 0), 0);
  const body = list.map(g => `
    <h2>${escHtml(g.room)}</h2>
    <table><thead><tr><th>Qty</th><th>SKU</th><th>Description</th><th>W × H × D</th><th>Door style / finish</th><th>Hinge</th><th>Item #</th><th>Notes</th></tr></thead><tbody>
    ${g.rows.map(r => `<tr><td class="c">${r.qty}</td><td class="sku">${escHtml(r.sku)}</td><td>${escHtml(r.desc)}</td>
      <td>${fmtFrac(r.w)} × ${fmtFrac(r.h)} × ${fmtFrac(r.d)}</td><td>${escHtml(r.styleName)}${r.styleCode ? ` <span class="code">(${escHtml(r.styleCode)})</span>` : ''}</td>
      <td class="${r.hinge === 'SPECIFY' ? 'warn' : ''}">${escHtml(r.hinge || '—')}</td><td>${r.items.join(', ')}</td><td>${escHtml(r.notes.join('; '))}</td></tr>`).join('')}
    </tbody></table>`).join('');
  const win = window.open('', '_blank', 'width=1000,height=750');
  win.document.write(`<!DOCTYPE html><html><head><title>Order List — ${escHtml(p.customer || '')}</title><style>
    body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#1e293b;margin:28px;font-size:12px}
    h1{font-size:20px;margin:0 0 2px} .meta{color:#64748b;margin-bottom:14px}
    h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #0f766e;padding-bottom:3px}
    table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e2e8f0;padding:5px 6px;text-align:left;vertical-align:top}
    th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
    .c{text-align:center;font-weight:700} .sku{font-weight:700;white-space:nowrap} .code{color:#64748b}
    .warn{color:#b91c1c;font-weight:700} .note{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 10px;border-radius:6px;margin-bottom:10px}
    @media print{body{margin:12mm}}
  </style></head><body>
    <h1>Order List</h1>
    <div class="meta">${escHtml(company)}${company ? ' · ' : ''}${escHtml(p.customer || '')}${p.address ? ' · ' + escHtml(p.address) : ''} · ${new Date().toLocaleDateString()} · ${total} piece${total === 1 ? '' : 's'}</div>
    ${missing ? `<div class="note">${missing} single-door cabinet${missing === 1 ? '' : 's'} marked <b>SPECIFY</b> — set the hinge side before ordering.</div>` : ''}
    ${body}
    <p class="meta" style="margin-top:16px">Fillers are listed as the stock pieces to order, with the size to rip them to. Appliances are not included.</p>
  </body></html>`);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch (e) {} }, 300);
}

function toggleOrderMenu(btn) {
  const m = btn.parentElement.querySelector('.order-menu');
  m.classList.toggle('hidden');
}
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.order-wrap')) document.querySelectorAll('.order-menu').forEach(m => m.classList.add('hidden'));
});
