// My Cabinet Planner — js/priceimport.js
// AI price-list import (Build Plan 5.8). A company drops in its supplier's price list exactly
// as the supplier sent it (Excel/CSV). The AI (netlify/functions/price-import.js) only says
// which columns are what and what each item code is (type + width + height). Every price is
// read straight from the file here in the browser, so the AI can never make up a number —
// at worst it mis-files a row, and the review screen shows every row before anything saves.
//
// Built for dealers who buy from several suppliers, where each supplier's finishes (door
// styles / colors / price groups) have their own prices:
//   • every import is for one named supplier, and finishes it creates are tagged with it;
//   • a price column (or a "finish" column value) can feed one or several finishes — so a
//     "Price Group B" column can price every door style in that group;
//   • a list-price multiplier turns a supplier's list price into the dealer's cost;
//   • prices only merge in for the finishes the import touches — other suppliers' prices
//     stay exactly as they were.
// Saved into company_profiles: price_overrides (same shape the quote already reads),
// custom_styles (new finishes, with `supplier`) and supplier_skus (for the order list).
// Loaded by profile.html as a classic script after its inline script (shares its globals:
// db, companyProfile, effectiveOwnerId, myTeamRole, canAccess, currentUser, showToast, esc,
// CABINET_TYPES, CABINET_WIDTHS, CABINET_HEIGHTS, DEFAULT_STYLES, renderPfStyles).

const PI_FN = '/.netlify/functions/price-import';
const PI_BATCH = 25, PI_PARALLEL = 3, PI_SAMPLE_ROWS = 40, PI_MAX_ROWS = 6000;
const PI_ADMIN_ID = 'f464edfb-8f74-49b7-b366-79b89605bbb7';   // Dan — sees the AI cost per import
// Rough list prices per million tokens, for Dan's cost readout only (input, output)
const PI_RATES = { haiku: [1, 5], sonnet: [3, 15], opus: [5, 25] };

let PI = null;   // the import in progress

// ════════════════════════════
// FINISHES
// ════════════════════════════
// Same list the planner's style picker shows (getStyles in core.js): the company's own
// finishes; on an owner account the built-in catalog plus anything imported.
function companyFinishes() {
  const raw = companyProfile.custom_styles;
  const own = (raw && Array.isArray(raw)) ? raw : [];
  const isOwnerAcct = typeof OWNER_USER_IDS !== 'undefined' && OWNER_USER_IDS.includes(effectiveOwnerId);
  if (isOwnerAcct && typeof STYLES !== 'undefined') {
    if (!own.length) return STYLES;
    if (own.some(s => s.supplier)) { const codes = new Set(own.map(s => s.code)); return [...STYLES.filter(s => !codes.has(s.code)), ...own]; }
    return own;
  }
  return own.length ? own : DEFAULT_STYLES;
}
function piSuppliers() {
  return [...new Set((companyProfile.custom_styles || []).map(s => s.supplier).filter(Boolean))];
}
// A rough color from the finish name, so a new finish isn't blank in the planner. The
// company can pick the real color in Company Settings → Door Styles / Finishes.
function piGuessSwatch(name) {
  const n = name.toLowerCase();
  const table = [[/black|onyx|ebony|charcoal/, '#2B2926'], [/navy|blue|indigo/, '#2E4A6B'], [/green|sage|olive/, '#7D8B6A'],
    [/espresso|walnut|chocolate|mocha|java|dark/, '#3B2314'], [/oak|wood|natural|maple|hickory|birch|honey/, '#C9A96D'],
    [/cherry|cinnamon|toffee|brown|chestnut/, '#7A4A2A'], [/grey|gray|stone|slate|pebble|dove|ash/, '#9CA3AF'],
    [/cream|linen|ivory|antique|biscuit|vanilla|champagne/, '#EDE4D3'], [/white|snow|frost|ice|pearl|arctic/, '#F5F4F0']];
  const hit = table.find(([re]) => re.test(n));
  return hit ? hit[1] : '#E5E2DA';
}
function piNewCode(name, taken) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let base = words.map(w => w[0]).join('').slice(0, 3) || 'F';
  if (base.length < 2) base = (words[0] || 'FX').slice(0, 2);
  let code = base, n = 2;
  while (taken.has(code)) code = base + (n++);
  taken.add(code);
  return code;
}

// ════════════════════════════
// FILE → GRID
// ════════════════════════════
function piPrice(v) {
  if (typeof v === 'number') return (isFinite(v) && v > 0) ? v : null;
  const s = String(v ?? '').trim();
  if (!/\d/.test(s) || /[a-z]{2,}/i.test(s.replace(/usd|ea\b|each/ig, ''))) return null;   // "N/A", "Call", "2-3 wks"
  const n = parseFloat(s.replace(/[$,\s]/g, '').replace(/(ea|each|usd)$/i, ''));
  return (isFinite(n) && n > 0) ? n : null;
}
const piCell = (row, col) => (col == null || !row) ? '' : String(row[col] ?? '').trim();
// A value placed inside a '…' string in an onclick="" attribute
const piJs = v => esc(String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
const piRound = v => Math.round(v * 100) / 100;
const piMoney = v => '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function piSheetGrid(sheetName) {
  const grid = XLSX.utils.sheet_to_json(PI.wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
    .filter(r => r.some(c => String(c).trim() !== ''));
  return grid.slice(0, PI_MAX_ROWS);
}

// ════════════════════════════
// OPEN
// ════════════════════════════
function piOpen(file) {
  if (myTeamRole !== 'owner') { showToast('Only the account owner can manage pricing.'); return; }
  if (!canAccess('silver')) { alert('Supplier price-list import is available on the Silver and Gold plans.'); return; }
  PI = { step: 'file', importId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    supplier: '', multiplier: 1, usage: { input: 0, output: 0, calls: 0, model: '' }, tab: 'look', editing: null };
  piEnsureModal();
  document.getElementById('pi-overlay').classList.add('open');
  if (file) piLoadFile(file); else piRender();
}
function piClose() {
  if (PI && ['matching', 'saving'].includes(PI.step)) return;
  if (PI && PI.step === 'review' && !confirm('Close without saving? Nothing from this price list will be saved.')) return;
  document.getElementById('pi-overlay').classList.remove('open');
  PI = null;
}

async function piLoadFile(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { showToast('That file is over 8 MB — export just the price pages and try again.'); return; }
  if (!/\.(csv|xlsx?|xlsm)$/i.test(file.name)) { showToast('Excel or CSV only for now — PDF price lists come later.'); return; }
  try {
    const buf = await file.arrayBuffer();
    PI.wb = XLSX.read(buf, { type: 'array' });
  } catch (e) { showToast("Couldn't read that file."); return; }
  PI.fileName = file.name;
  // Start on the sheet with the most rows (price lists often have a cover/notes sheet first)
  const sizes = PI.wb.SheetNames.map(n => [n, (XLSX.utils.sheet_to_json(PI.wb.Sheets[n], { header: 1 }) || []).length]);
  PI.sheet = sizes.sort((a, b) => b[1] - a[1])[0][0];
  PI.grid = piSheetGrid(PI.sheet);
  if (!PI.supplier) PI.supplier = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/price\s*list|pricing|\b\d{4}\b/ig, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  PI.step = 'file';
  piRender();
}

// ════════════════════════════
// SERVER CALLS
// ════════════════════════════
async function piCall(body) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const r = await fetch(PI_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify({ importId: PI.importId, ...body }) });
  let out = {};
  try { out = await r.json(); } catch {}
  if (out.usage) { PI.usage.input += out.usage.input; PI.usage.output += out.usage.output; PI.usage.calls++; PI.usage.model = out.usage.model; }
  if (!r.ok) { const e = new Error(out.error || `Error ${r.status}`); e.status = r.status; throw e; }
  return out;
}

// Step 1 — ask the AI which columns are what (falls back to a simple guess if it can't)
async function piReadLayout() {
  PI.supplier = (document.getElementById('pi-supplier').value || '').trim();
  const mult = parseFloat(document.getElementById('pi-mult').value);
  if (!PI.supplier) { showToast('Name the supplier first — finishes and prices are kept per supplier.'); return; }
  if (!(mult > 0 && mult <= 5)) { showToast('The multiplier should be a number like 1 or 0.45.'); return; }
  PI.multiplier = mult;
  PI.step = 'reading'; piRender();
  let s;
  try {
    s = await piCall({ step: 'structure', rows: PI.grid.slice(0, PI_SAMPLE_ROWS).map(r => r.slice(0, 40).map(c => String(c))) });
    PI.layoutNote = s.notes || '';
  } catch (e) {
    if (e.status === 429 || e.status === 403 || e.status === 503) { showToast(e.message); PI.step = 'file'; piRender(); return; }
    s = piGuessLayout();
    PI.layoutNote = "The AI couldn't read the layout this time, so this is a best guess — check the columns below.";
  }
  PI.layout = {
    headerRow: s.headerRow, skuCol: s.skuCol, descCol: s.descCol, widthCol: s.widthCol, heightCol: s.heightCol,
    mode: s.layout === 'long' ? 'long' : 'wide',
    priceCols: (s.priceCols || []).map(p => p.col), finishCol: s.finishCol, priceCol: s.priceCol,
  };
  PI.colNames = {};
  (s.priceCols || []).forEach(p => { PI.colNames[p.col] = p.finish; });
  PI.targets = {};
  piDefaultTargets();
  PI.step = 'columns'; piRender();
}

function piGuessLayout() {
  const g = PI.grid.slice(0, PI_SAMPLE_ROWS);
  let headerRow = g.findIndex(r => r.filter(c => /sku|item|code|model|desc|price|part/i.test(String(c))).length >= 1 && r.filter(c => String(c).trim()).length >= 2);
  if (headerRow < 0) headerRow = null;
  const hdr = headerRow == null ? [] : g[headerRow].map(c => String(c));
  const find = re => { const i = hdr.findIndex(h => re.test(h)); return i < 0 ? null : i; };
  const body = g.slice(headerRow == null ? 0 : headerRow + 1);
  const ncols = Math.max(...g.map(r => r.length));
  const priceCols = [];
  for (let c = 0; c < ncols; c++) {
    const vals = body.map(r => r[c]).filter(v => String(v).trim() !== '');
    if (vals.length >= 3 && vals.filter(v => piPrice(v) != null).length / vals.length > 0.6 && !/width|height|depth|qty|^w$|^h$|^d$/i.test(hdr[c] || '')) priceCols.push({ col: c, finish: hdr[c] || `Column ${c + 1}` });
  }
  const skuCol = find(/sku|item|code|model|part/i) ?? 0;
  return { headerRow, skuCol, descCol: find(/desc/i), widthCol: find(/^w(idth)?\b/i), heightCol: find(/^h(eight)?\b/i), layout: 'wide',
    priceCols: priceCols.filter(p => p.col !== skuCol) };
}

// Price "sources": each wide price column, or each distinct value of the finish column.
function piSources() {
  const L = PI.layout;
  if (L.mode === 'wide') {
    const hdr = L.headerRow == null ? [] : PI.grid[L.headerRow];
    return L.priceCols.map(c => ({ id: 'c' + c, label: PI.colNames[c] || piCell(hdr, c) || `Column ${c + 1}` }));
  }
  if (L.finishCol == null) return [];
  const seen = new Map();
  piBodyRows().forEach(r => { const v = piCell(r, L.finishCol); if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v); });
  return [...seen.values()].slice(0, 80).map(v => ({ id: 'f:' + v.toLowerCase(), label: v }));
}
function piBodyRows() {
  const L = PI.layout;
  return PI.grid.slice(L.headerRow == null ? 0 : L.headerRow + 1);
}
// Default: a source whose name matches an existing finish feeds that finish; otherwise it
// becomes a new finish of the same name under this supplier.
function piDefaultTargets() {
  const fin = companyFinishes();
  const used = new Set();
  piSources().forEach(src => {
    if (PI.targets[src.id]) { PI.targets[src.id].forEach(t => used.add(t)); return; }
    const want = src.label.toLowerCase().trim();
    // Same supplier first, then a finish with no supplier set — never another supplier's
    // finish that happens to share the name (their prices must stay separate)
    const hit = fin.find(f => (f.supplier || '').toLowerCase() === PI.supplier.toLowerCase() && f.name.toLowerCase() === want)
      || fin.find(f => !f.supplier && f.name.toLowerCase() === want);
    const ref = hit ? hit.code : 'new:' + src.label.trim();
    PI.targets[src.id] = used.has(ref) ? [] : [ref];
    used.add(ref);
  });
}
function piRefLabel(ref) {
  if (ref.startsWith('new:')) return `${ref.slice(4)} (new · ${PI.supplier})`;
  const f = companyFinishes().find(x => x.code === ref);
  return f ? `${f.name} · ${f.code}${f.supplier ? ' · ' + f.supplier : ''}` : ref;
}
function piAddTarget(srcId, ref) {
  if (!ref) return;
  if (ref === '__new') {
    const name = (prompt('Name for the new finish:') || '').trim();
    if (!name) { piRender(); return; }
    ref = 'new:' + name;
  }
  Object.keys(PI.targets).forEach(k => {   // one finish can only take its price from one place
    if (k !== srcId && PI.targets[k].includes(ref)) { PI.targets[k] = PI.targets[k].filter(r => r !== ref); showToast(`Moved ${piRefLabel(ref)} to this column.`); }
  });
  if (!PI.targets[srcId].includes(ref)) PI.targets[srcId].push(ref);
  piRender();
}
function piRemoveTarget(srcId, ref) { PI.targets[srcId] = PI.targets[srcId].filter(r => r !== ref); piRender(); }
function piSetLayout(field, val) {
  const L = PI.layout;
  if (field === 'priceToggle') {
    const c = +val; L.priceCols = L.priceCols.includes(c) ? L.priceCols.filter(x => x !== c) : [...L.priceCols, c].sort((a, b) => a - b);
  } else if (field === 'mode') L.mode = val;
  else L[field] = val === '' ? null : +val;
  piDefaultTargets();
  piRender();
}

// ════════════════════════════
// ITEMS
// ════════════════════════════
function piBuildItems() {
  const L = PI.layout, byKey = new Map();
  const hdr = L.headerRow == null ? [] : PI.grid[L.headerRow];
  piBodyRows().forEach(r => {
    const sku = piCell(r, L.skuCol);
    if (!sku || sku.length > 60) return;
    const key = sku.toUpperCase().replace(/\s+/g, ' ');
    const prices = {};
    if (L.mode === 'wide') L.priceCols.forEach(c => { const p = piPrice(r[c]); if (p != null) prices['c' + c] = p; });
    else { const f = piCell(r, L.finishCol).toLowerCase(); const p = piPrice(r[L.priceCol]); if (f && p != null) prices['f:' + f] = p; }
    let it = byKey.get(key);
    if (!it) {
      const extra = [[L.widthCol, 'W'], [L.heightCol, 'H']].filter(([c]) => c != null && piCell(r, c)).map(([c, l]) => `${piCell(hdr, c) || l} ${piCell(r, c)}`).join(', ');
      it = { key, sku, desc: piCell(r, L.descCol), extra, prices: {}, t: null, w: null, h: null, v: '', c: 'low', confirmed: false, exclude: false, pick: false };
      byKey.set(key, it);
    }
    Object.entries(prices).forEach(([s, p]) => {
      if (it.prices[s] == null) { it.prices[s] = p; return; }
      if (Math.abs(it.prices[s] - p) > 0.004) {   // same code listed again at a different price
        it.dupPrice = true;
        it.alts = it.alts || {};
        const a = it.alts[s] = it.alts[s] || [it.prices[s]];
        if (!a.some(x => Math.abs(x - p) <= 0.004)) a.push(p);
      }
    });
  });
  // A section heading in the item-code column ("WALL CABINETS") has no prices — leave it out
  PI.items = [...byKey.values()].filter(it => Object.keys(it.prices).length);
  PI.items.forEach((it, i) => { it.i = i; });
}

// Step 2 — ask the AI what each item code is, a few at a time
async function piMatchItems() {
  const srcs = piSources();
  if (PI.layout.skuCol == null) { showToast('Pick the column with the item codes.'); return; }
  if (!srcs.some(s => (PI.targets[s.id] || []).length)) { showToast('Connect at least one price column to a finish.'); return; }
  piBuildItems();
  if (!PI.items.length) { showToast('No item codes with prices were found — check the columns.'); return; }
  PI.step = 'matching'; PI.done = 0; piRender();
  const hdr = PI.layout.headerRow == null ? [] : PI.grid[PI.layout.headerRow].map(c => String(c));
  const queue = [];
  for (let i = 0; i < PI.items.length; i += PI_BATCH) queue.push(PI.items.slice(i, i + PI_BATCH));
  let stop = null;
  const run = async batch => {
    if (stop) return;
    try {
      const out = await piCall({ step: 'map', header: hdr, items: batch.map(it => ({ i: it.i, sku: it.sku, desc: it.desc, extra: it.extra })) });
      (out.items || []).forEach(m => { const it = PI.items[m.i]; if (it) Object.assign(it, { t: m.t, w: m.w, h: m.h, v: m.v || '', c: m.c }); });
      batch.filter(it => !it.t).forEach(it => { it.aiError = "The AI didn't answer for this one — set it yourself."; });
    } catch (e) {
      if (e.status === 429 || e.status === 403 || e.status === 503) { stop = e.message; return; }
      if (batch.length > 5) { const h = Math.ceil(batch.length / 2); await run(batch.slice(0, h)); await run(batch.slice(h)); return; }
      batch.forEach(it => { it.aiError = "The AI couldn't read this one — set the type and size yourself."; });
    }
    PI.done += batch.length;
    const bar = document.getElementById('pi-progress');
    if (bar) { bar.style.width = Math.round(100 * PI.done / PI.items.length) + '%'; document.getElementById('pi-progress-n').textContent = `${Math.min(PI.done, PI.items.length)} of ${PI.items.length}`; }
  };
  const workers = Array.from({ length: PI_PARALLEL }, async () => { while (queue.length && !stop) await run(queue.shift()); });
  await Promise.all(workers);
  if (stop) showToast(stop);
  PI.items.filter(it => !it.t && !it.aiError).forEach(it => { it.aiError = 'Not read — set the type and size yourself.'; });
  PI.step = 'review'; PI.tab = 'look'; piRender();
}

// ════════════════════════════
// REVIEW RULES
// ════════════════════════════
const piSizeKey = it => CABINET_HEIGHTS[it.t] ? `${it.w}x${it.h}` : `${it.w}`;
function piSizeIssue(it) {
  const t = CABINET_TYPES.find(x => x.key === it.t);
  const widths = CABINET_WIDTHS[it.t] || [];
  if (!widths.includes(it.w)) return `${it.w ? it.w + '" wide' : 'No width'} isn't a ${t ? t.label : 'planner'} size the planner uses (${widths.join(', ')})`;
  const hs = CABINET_HEIGHTS[it.t];
  if (hs && !hs.includes(it.h)) return `${it.h ? it.h + '" high' : 'No height'} isn't a ${t.label} height the planner uses (${hs.join(', ')})`;
  return '';
}
// Finish code → price (cost after the multiplier), for this item
function piItemPrices(it) {
  const out = {};
  Object.entries(it.prices).forEach(([src, p]) => (PI.targets[src] || []).forEach(ref => { if (out[ref] == null) out[ref] = piRound(p * PI.multiplier); }));
  return out;
}
function piStatuses() {
  const st = new Map(), cand = [];
  PI.items.forEach(it => {
    if (it.exclude) return st.set(it, ['skip', 'Left out by you']);
    if (!it.t) return st.set(it, ['look', it.aiError || 'Not read yet', 'size']);
    if (it.t === 'skip') return st.set(it, ['skip', 'Not something the planner prices' + (it.v ? ` (${it.v})` : '')]);
    const sz = piSizeIssue(it); if (sz) return st.set(it, ['look', sz, 'size']);
    if (!Object.keys(piItemPrices(it)).length) return st.set(it, ['skip', 'No price in the columns you connected']);
    if (it.dupPrice && !it.confirmed) return st.set(it, ['look', 'This code is listed more than once with different prices — pick the right one', 'price']);
    cand.push(it);
  });
  // Two codes landing on the same cabinet + size + finish: the plain item wins over variants
  // (left/right, full-height door, deeper…). If that doesn't settle it, a person picks.
  const groups = new Map();
  cand.forEach(it => Object.keys(piItemPrices(it)).forEach(ref => {
    const k = `${it.t}|${piSizeKey(it)}|${ref}`; (groups.get(k) || groups.set(k, []).get(k)).push(it);
  }));
  const beaten = new Map(), unsettled = new Map();
  groups.forEach(list => {
    if (list.length < 2) return;
    const picked = list.filter(x => x.pick), plain = list.filter(x => !x.v);
    const win = picked.length === 1 ? picked[0] : (picked.length === 0 && plain.length === 1 ? plain[0] : null);
    list.forEach(x => {
      if (win && x !== win) beaten.set(x, win);
      else if (!win) unsettled.set(x, list);
    });
  });
  cand.forEach(it => {
    if (beaten.has(it)) return st.set(it, ['skip', `Same cabinet as ${beaten.get(it).sku} — the planner uses that one`, 'dup']);
    if (unsettled.has(it)) return st.set(it, ['look', `Same cabinet as ${unsettled.get(it).filter(x => x !== it).map(x => x.sku).join(', ')} — keep one`, 'dup']);
    if (it.c === 'low' && !it.confirmed) return st.set(it, ['look', "The AI wasn't sure — check the type and size", 'low']);
    st.set(it, ['ok', it.v ? `Variant: ${it.v}` : '']);
  });
  return st;
}
function piExisting(type, sizeKey, code) {
  const o = companyProfile.price_overrides && companyProfile.price_overrides[type];
  const v = o && typeof o === 'object' && o[sizeKey] && typeof o[sizeKey] === 'object' ? o[sizeKey][code] : null;
  return v == null ? null : parseFloat(v);
}
function piPlan(st) {
  const rows = [];
  PI.items.forEach(it => {
    if (st.get(it)[0] !== 'ok') return;
    Object.entries(piItemPrices(it)).forEach(([ref, price]) => {
      const was = ref.startsWith('new:') ? null : piExisting(it.t, piSizeKey(it), ref);
      rows.push({ it, ref, price, was });
    });
  });
  return {
    rows,
    fresh: rows.filter(r => r.was == null).length,
    changed: rows.filter(r => r.was != null && Math.abs(r.was - r.price) > 0.004),
    same: rows.filter(r => r.was != null && Math.abs(r.was - r.price) <= 0.004).length,
    newFinishes: [...new Set(rows.filter(r => r.ref.startsWith('new:')).map(r => r.ref))],
  };
}

// Row actions
function piEdit(i) { PI.editing = i; piRender(); }
function piSetItem(i, field, val) {
  const it = PI.items[i];
  if (field === 't') { it.t = val; if (!CABINET_HEIGHTS[val]) it.h = null; }
  else it[field] = val === '' ? null : parseFloat(val);
  it.confirmed = true; it.c = 'high'; it.aiError = '';
  piRender();
}
function piConfirm(i) { const it = PI.items[i]; it.confirmed = true; it.c = 'high'; PI.editing = null; piRender(); }
function piUseAlt(i, src, price) { const it = PI.items[i]; it.prices[src] = price; it.confirmed = true; piRender(); }
function piToggleExclude(i) { const it = PI.items[i]; it.exclude = !it.exclude; piRender(); }
function piKeep(i) {
  const it = PI.items[i];
  PI.items.forEach(x => { if (x !== it && x.t === it.t && piSizeKey(x) === piSizeKey(it)) x.pick = false; });
  it.pick = true; it.confirmed = true; piRender();
}
function piTab(t) { PI.tab = t; PI.editing = null; piRender(); }

// ════════════════════════════
// SAVE
// ════════════════════════════
async function piSave() {
  const st = piStatuses(), plan = piPlan(st);
  if (!plan.rows.length) { showToast('Nothing matched yet to save.'); return; }
  const lines = [`Save ${plan.rows.length} price${plan.rows.length === 1 ? '' : 's'} from ${PI.supplier}?`, '',
    `• ${plan.fresh} new`, `• ${plan.changed.length} changed from what you have now`, `• ${plan.same} the same as now`];
  if (plan.newFinishes.length) lines.push(`• New finishes: ${plan.newFinishes.map(r => r.slice(4)).join(', ')}`);
  if (plan.changed.length) {
    lines.push('', 'Biggest changes:');
    plan.changed.slice().sort((a, b) => Math.abs(b.price - b.was) - Math.abs(a.price - a.was)).slice(0, 8)
      .forEach(r => lines.push(`  ${r.it.sku} ${piRefLabel(r.ref)}: ${piMoney(r.was)} → ${piMoney(r.price)}`));
  }
  lines.push('', 'Items under "Needs a look" and "Skipped" are not saved.');
  if (!confirm(lines.join('\n'))) return;

  PI.step = 'saving'; piRender();
  let sel = await db.from('company_profiles').select('price_overrides, custom_styles, supplier_skus').eq('user_id', effectiveOwnerId).single();
  let skuColumn = true;
  if (sel.error && /supplier_skus/.test(sel.error.message || '')) {
    skuColumn = false;
    sel = await db.from('company_profiles').select('price_overrides, custom_styles').eq('user_id', effectiveOwnerId).single();
  }
  if (sel.error && sel.error.code !== 'PGRST116') { showToast('Could not load your pricing: ' + sel.error.message); PI.step = 'review'; piRender(); return; }
  const cur = sel.data || {};

  // Finishes: create the new ones this import actually prices. A company still on the generic
  // defaults keeps them (existing projects may use them) — owner accounts keep the built-in catalog.
  const isOwnerAcct = OWNER_USER_IDS.includes(effectiveOwnerId);
  let styles = Array.isArray(cur.custom_styles) && cur.custom_styles.length ? cur.custom_styles.map(s => ({ ...s }))
    : (isOwnerAcct ? [] : DEFAULT_STYLES.map(s => ({ swatch: (typeof piDefaultSwatch === 'function' ? piDefaultSwatch(s.code) : '#F5F4F0'), ...s })));
  const taken = new Set([...styles.map(s => s.code), ...(isOwnerAcct ? STYLES.map(s => s.code) : [])]);
  const names = new Set([...styles, ...(isOwnerAcct ? STYLES : [])].map(s => s.name.toLowerCase()));
  const refCode = {};
  plan.newFinishes.forEach(ref => {
    let name = ref.slice(4).trim();
    if (names.has(name.toLowerCase())) name = `${name} (${PI.supplier})`;   // names stay unique for the price sheet template
    names.add(name.toLowerCase());
    const code = piNewCode(name, taken);
    styles.push({ code, name, swatch: piGuessSwatch(name), supplier: PI.supplier });
    refCode[ref] = code;
  });

  const overrides = { ...(cur.price_overrides || {}) };
  const skus = { ...(cur.supplier_skus || {}) };
  plan.rows.forEach(({ it, ref, price }) => {
    const code = refCode[ref] || ref, sk = piSizeKey(it);
    const forType = (overrides[it.t] && typeof overrides[it.t] === 'object') ? { ...overrides[it.t] } : {};
    forType[sk] = { ...((forType[sk] && typeof forType[sk] === 'object') ? forType[sk] : {}), [code]: price };
    overrides[it.t] = forType;
    const skType = { ...(skus[it.t] || {}) };
    skType[sk] = { ...(skType[sk] || {}), [code]: it.sku };
    skus[it.t] = skType;
  });

  const row = { user_id: effectiveOwnerId, price_overrides: overrides, custom_styles: styles.length ? styles : null, updated_at: new Date().toISOString() };
  if (skuColumn) row.supplier_skus = skus;
  const { data, error } = await db.from('company_profiles').upsert(row, { onConflict: 'user_id' }).select().single();
  if (error) { showToast('Could not save pricing: ' + error.message); PI.step = 'review'; piRender(); return; }
  companyProfile = data;
  if (typeof renderPfStyles === 'function') renderPfStyles(data.custom_styles || []);   // keep Company Settings in step
  PI.saved = { count: plan.rows.length, finishes: plan.newFinishes.length, skuColumn };
  PI.step = 'done'; piRender();
}
function piDefaultSwatch(code) { return ({ WS: '#F5F4F0', GS: '#9CA3AF', ES: '#3B2314', NW: '#C9A96D' })[code] || '#F5F4F0'; }

// ════════════════════════════
// RENDER
// ════════════════════════════
function piEnsureModal() {
  if (document.getElementById('pi-overlay')) return;
  const css = document.createElement('style');
  css.textContent = `
  #pi-overlay .modal-box{max-width:1040px;width:100%;max-height:92vh;display:flex;flex-direction:column;padding:22px 24px}
  #pi-body{overflow:auto;flex:1;min-height:120px}
  .pi-steps{display:flex;gap:6px;margin-bottom:14px;font-size:11px;font-weight:700;color:var(--muted);flex-wrap:wrap}
  .pi-steps span{padding:4px 10px;border-radius:99px;background:var(--bg);border:1px solid var(--border)}
  .pi-steps span.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  .pi-grid{width:100%;border-collapse:collapse;font-size:12px}
  .pi-grid th,.pi-grid td{border-bottom:1px solid var(--border);padding:6px 8px;text-align:left;vertical-align:top}
  .pi-grid th{background:var(--bg);font-size:11px;color:var(--muted);position:sticky;top:0}
  .pi-prev td{white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
  .pi-prev tr.hdr td{font-weight:700;background:#f0fdfa}
  .pi-row{display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:center;margin-bottom:10px;font-size:13px}
  .pi-row label{font-weight:600}
  #pi-overlay select,#pi-overlay input[type=text],#pi-overlay input[type=number]{padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit;font-size:13px;background:var(--surface);color:var(--text)}
  .pi-chip{display:inline-flex;align-items:center;gap:6px;background:#f0fdfa;border:1px solid #99f6e4;color:#115e59;border-radius:99px;padding:3px 6px 3px 10px;margin:2px 4px 2px 0;font-size:12px;font-weight:600}
  .pi-chip.new{background:#fffbeb;border-color:#fcd34d;color:#92400e}
  .pi-chip button{border:none;background:none;cursor:pointer;color:inherit;font-size:13px;padding:0 2px}
  .pi-tabs{display:flex;gap:6px;margin:10px 0}
  .pi-tabs button{border:1px solid var(--border);background:var(--surface);border-radius:8px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;color:var(--text)}
  .pi-tabs button.on{border-color:var(--accent);color:var(--accent);background:#f0fdfa}
  .pi-why{font-size:11px;color:#92400e}
  .pi-price{display:inline-block;margin:1px 8px 1px 0;white-space:nowrap}
  .pi-up{color:#b91c1c;font-weight:700} .pi-down{color:#15803d;font-weight:700}
  .pi-note{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;font-size:12px;color:#78350f;margin-bottom:12px}
  .pi-bar{height:10px;background:var(--bg);border:1px solid var(--border);border-radius:99px;overflow:hidden;margin:14px 0 6px}
  .pi-bar div{height:100%;background:var(--accent);width:0;transition:width .3s}
  .pi-link{border:none;background:none;color:var(--accent);font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:0 4px}
  .pi-foot{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
  .pi-foot .sum{margin-right:auto;font-size:12px;color:var(--muted)}`;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.className = 'modal-overlay'; el.id = 'pi-overlay';
  el.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="pi-title">
    <h3 id="pi-title">Import a supplier price list</h3>
    <div class="pi-steps" id="pi-steps"></div>
    <div id="pi-body"></div>
    <div class="pi-foot" id="pi-foot"></div></div>`;
  document.body.appendChild(el);
}

function piRender() {
  if (!PI) return;
  const steps = [['file', '1 · Price list'], ['columns', '2 · Columns & finishes'], ['review', '3 · Review'], ['done', '4 · Saved']];
  const at = { file: 0, reading: 0, columns: 1, matching: 2, review: 2, saving: 2, done: 3 }[PI.step];
  document.getElementById('pi-steps').innerHTML = steps.map(([, l], i) => `<span class="${i === at ? 'on' : ''}">${l}</span>`).join('');
  const body = document.getElementById('pi-body'), foot = document.getElementById('pi-foot');
  const cost = (PI.usage.calls && currentUser && currentUser.id === PI_ADMIN_ID) ? piCostText() : '';
  const fn = { file: piViewFile, reading: piViewBusy, columns: piViewColumns, matching: piViewMatching, review: piViewReview, saving: piViewBusy, done: piViewDone }[PI.step];
  const [b, f] = fn();
  body.innerHTML = b;
  foot.innerHTML = (cost ? `<span class="sum">${cost}</span>` : '') + f;
}
function piCostText() {
  const m = PI.usage.model || '', r = PI_RATES[Object.keys(PI_RATES).find(k => m.includes(k)) || 'haiku'];
  const usd = (PI.usage.input * r[0] + PI.usage.output * r[1]) / 1e6;
  return `AI use: ${PI.usage.calls} calls, about $${usd.toFixed(3)} (admin only)`;
}

function piViewFile() {
  const sups = piSuppliers();
  const hasFile = !!PI.grid;
  const prev = hasFile ? `<div style="font-size:12px;color:var(--muted);margin:14px 0 6px;">First rows of <b>${esc(PI.fileName)}</b>${PI.wb.SheetNames.length > 1 ? ` — sheet <select onchange="PI.sheet=this.value;PI.grid=piSheetGrid(this.value);piRender()">${PI.wb.SheetNames.map(n => `<option ${n === PI.sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''} (${PI.grid.length} rows)</div>
    <div style="overflow:auto;max-height:240px;border:1px solid var(--border);border-radius:8px;"><table class="pi-grid pi-prev">${PI.grid.slice(0, 12).map(r => `<tr>${r.slice(0, 14).map(c => `<td title="${esc(c)}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>` : '';
  return [`
    <p style="margin-bottom:14px;">Drop in your supplier's price list exactly as they sent it (Excel or CSV). The AI works out which columns are which and what each item code is. <b>Prices are read straight from your file</b>, and nothing is saved until you've reviewed every match.</p>
    <div class="pi-row"><label for="pi-file">Price list file</label><div><input type="file" id="pi-file" accept=".csv,.xls,.xlsx,.xlsm" onchange="piLoadFile(this.files[0])"></div></div>
    <div class="pi-row"><label for="pi-supplier">Supplier</label><div><input type="text" id="pi-supplier" list="pi-sup-list" maxlength="40" value="${esc(PI.supplier)}" placeholder="e.g. Forevermark, Fabuwood" style="width:260px;">
      <datalist id="pi-sup-list">${sups.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Finishes and prices are kept per supplier — importing another supplier never touches these.</div></div></div>
    <div class="pi-row"><label for="pi-mult">List-price multiplier</label><div><input type="number" id="pi-mult" step="0.001" min="0.01" max="5" value="${PI.multiplier}" style="width:110px;">
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Leave at 1 if the list shows your cost. If it's a list/retail price and you pay, say, 42% of list, enter 0.42. Your markup is still added on quotes.</div></div></div>
    <div style="font-size:11px;color:var(--muted);">Privacy: the rows of this file are sent to our AI provider (Anthropic) to read them. They aren't used to train AI and we don't keep them after the import.</div>
    ${prev}`,
    `<button class="btn btn-ghost" onclick="piClose()">Cancel</button><button class="btn btn-primary" ${hasFile ? '' : 'disabled'} onclick="piReadLayout()">Read this price list →</button>`];
}
function piViewBusy() {
  const msg = PI.step === 'saving' ? 'Saving your prices…' : 'Reading the layout of your price list…';
  return [`<div style="padding:40px;text-align:center;color:var(--muted);font-size:14px;">${msg}</div>`, ''];
}
function piViewColumns() {
  const L = PI.layout;
  const ncols = Math.min(40, Math.max(...PI.grid.slice(0, PI_SAMPLE_ROWS).map(r => r.length)));
  const hdr = L.headerRow == null ? [] : PI.grid[L.headerRow];
  const colName = c => `${String.fromCharCode(65 + (c % 26))}${c >= 26 ? 2 : ''} · ${piCell(hdr, c) || '(no heading)'}`;
  const colSel = (field, allowNone) => `<select onchange="piSetLayout('${field}',this.value)">${allowNone ? `<option value="">— none —</option>` : ''}${Array.from({ length: ncols }, (_, c) => `<option value="${c}" ${L[field] === c ? 'selected' : ''}>${esc(colName(c))}</option>`).join('')}</select>`;
  const sample = piBodyRows().find(r => piCell(r, L.skuCol)) || [];
  const fin = companyFinishes();
  const finOpts = `<option value="">＋ Add finish…</option><optgroup label="Your finishes">${fin.map(f => `<option value="${esc(f.code)}">${esc(f.name)} · ${esc(f.code)}${f.supplier ? ' · ' + esc(f.supplier) : ''}</option>`).join('')}</optgroup><option value="__new">New finish…</option>`;
  const srcRows = piSources().map(src => {
    const ex = L.mode === 'wide' ? piPrice(sample[+src.id.slice(1)]) : null;
    return `<tr><td><b>${esc(src.label)}</b>${ex != null ? `<div style="font-size:11px;color:var(--muted);">e.g. ${piMoney(ex)}</div>` : ''}</td>
      <td>${(PI.targets[src.id] || []).map(ref => `<span class="pi-chip ${ref.startsWith('new:') ? 'new' : ''}">${esc(piRefLabel(ref))}<button title="Remove" aria-label="Remove" onclick="piRemoveTarget('${piJs(src.id)}','${piJs(ref)}')">×</button></span>`).join('') || '<span style="color:var(--muted);font-size:12px;">Not imported</span>'}
      <select onchange="piAddTarget('${piJs(src.id)}',this.value)" style="margin-left:4px;">${finOpts}</select></td></tr>`;
  }).join('');
  const priceToggles = L.mode === 'wide' ? `<div class="pi-row"><label>Price columns</label><div style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;">${Array.from({ length: ncols }, (_, c) => c).filter(c => c !== L.skuCol && c !== L.descCol).map(c => `<label style="font-weight:400;white-space:nowrap;"><input type="checkbox" ${L.priceCols.includes(c) ? 'checked' : ''} onchange="piSetLayout('priceToggle',${c})"> ${esc(colName(c))}</label>`).join('')}</div></div>` : '';
  return [`
    ${PI.layoutNote ? `<div class="pi-note">${esc(PI.layoutNote)}</div>` : ''}
    <div class="pi-row"><label>Heading row</label><div><select onchange="piSetLayout('headerRow',this.value)"><option value="">— no heading row —</option>${PI.grid.slice(0, PI_SAMPLE_ROWS).map((r, i) => `<option value="${i}" ${L.headerRow === i ? 'selected' : ''}>Row ${i + 1}: ${esc(r.slice(0, 5).join(' | ').slice(0, 70))}</option>`).join('')}</select></div></div>
    <div class="pi-row"><label>Item code (SKU) column</label><div>${colSel('skuCol', false)} <span style="font-size:12px;color:var(--muted);">e.g. ${esc(piCell(sample, L.skuCol))}</span></div></div>
    <div class="pi-row"><label>Description column</label><div>${colSel('descCol', true)}</div></div>
    <div class="pi-row"><label>Prices are laid out</label><div style="font-size:13px;">
      <label style="font-weight:400;margin-right:14px;"><input type="radio" name="pi-mode" ${L.mode === 'wide' ? 'checked' : ''} onchange="piSetLayout('mode','wide')"> One column per finish / price group</label>
      <label style="font-weight:400;"><input type="radio" name="pi-mode" ${L.mode === 'long' ? 'checked' : ''} onchange="piSetLayout('mode','long')"> One price column + a finish column</label></div></div>
    ${L.mode === 'long' ? `<div class="pi-row"><label>Finish column</label><div>${colSel('finishCol', true)}</div></div><div class="pi-row"><label>Price column</label><div>${colSel('priceCol', true)}</div></div>` : priceToggles}
    <h4 style="font-size:14px;margin:16px 0 6px;">Which finishes does each price go to?</h4>
    <p style="font-size:12px;margin-bottom:8px;">A price group (e.g. "Group B") can feed several door styles — add each one. Anything left as "Not imported" is ignored.</p>
    <table class="pi-grid"><thead><tr><th style="width:240px;">${L.mode === 'wide' ? 'Price column' : 'Finish in your file'}</th><th>Saves as finish</th></tr></thead><tbody>${srcRows || '<tr><td colspan="2" style="color:var(--muted);">Pick the price column(s) above.</td></tr>'}</tbody></table>`,
    `<button class="btn btn-ghost" onclick="PI.step='file';piRender()">← Back</button><button class="btn btn-primary" onclick="piMatchItems()">Match items →</button>`];
}
function piViewMatching() {
  return [`<div style="padding:30px 10px;"><div style="font-size:14px;font-weight:700;">Matching item codes to cabinet types and sizes…</div>
    <div class="pi-bar"><div id="pi-progress" style="width:${Math.round(100 * (PI.done || 0) / PI.items.length)}%"></div></div>
    <div style="font-size:12px;color:var(--muted);" id="pi-progress-n">${PI.done || 0} of ${PI.items.length}</div></div>`, ''];
}
function piViewReview() {
  const st = piStatuses(), plan = piPlan(st);
  const by = { ok: [], look: [], skip: [] };
  PI.items.forEach(it => by[st.get(it)[0]].push(it));
  const tabs = [['look', 'Needs a look'], ['ok', 'Matched'], ['skip', 'Skipped']];
  const typeLabel = k => k === 'skip' ? 'Skip (not a cabinet)' : (CABINET_TYPES.find(x => x.key === k) || {}).label || '—';
  const list = by[PI.tab];
  const LIMIT = 400;
  const rows = list.slice(0, LIMIT).map(it => {
    const [s, why, kind] = st.get(it);
    const editing = PI.editing === it.i || (s === 'look' && (kind === 'size' || kind === 'low'));
    const prices = piItemPrices(it);
    const priceHtml = Object.entries(prices).map(([ref, p]) => {
      const was = (it.t && it.t !== 'skip' && !ref.startsWith('new:')) ? piExisting(it.t, piSizeKey(it), ref) : null;
      const f = ref.startsWith('new:') ? ref.slice(4) : ((companyFinishes().find(x => x.code === ref) || {}).name || ref);
      const chg = was != null && Math.abs(was - p) > 0.004 ? ` <span class="${p > was ? 'pi-up' : 'pi-down'}">(was ${piMoney(was)})</span>` : '';
      return `<span class="pi-price">${esc(f)} ${piMoney(p)}${chg}</span>`;
    }).join('<br>');
    const altHtml = it.alts ? Object.entries(it.alts).map(([src, list]) => list.filter(x => Math.abs(x - it.prices[src]) > 0.004).map(x =>
      `<div class="pi-why">${esc((piSources().find(z => z.id === src) || {}).label || '')} also listed at ${piMoney(piRound(x * PI.multiplier))} <button class="pi-link" onclick="piUseAlt(${it.i},'${piJs(src)}',${x})">Use this</button></div>`).join('')).join('') : '';
    const ws = CABINET_WIDTHS[it.t] || [], hs = CABINET_HEIGHTS[it.t];
    const mapCell = editing
      ? `<select onchange="piSetItem(${it.i},'t',this.value)"><option value="">— type —</option>${CABINET_TYPES.map(t => `<option value="${t.key}" ${t.key === it.t ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}<option value="skip" ${it.t === 'skip' ? 'selected' : ''}>Skip (not a cabinet)</option></select>
         ${it.t && it.t !== 'skip' ? `<select onchange="piSetItem(${it.i},'w',this.value)"><option value="">W</option>${ws.map(w => `<option value="${w}" ${w === it.w ? 'selected' : ''}>${w}"</option>`).join('')}</select>` : ''}
         ${hs ? `<select onchange="piSetItem(${it.i},'h',this.value)"><option value="">H</option>${hs.map(h => `<option value="${h}" ${h === it.h ? 'selected' : ''}>${h}"</option>`).join('')}</select>` : ''}`
      : `${esc(typeLabel(it.t))}${it.t && it.t !== 'skip' ? ` · ${it.w}"${CABINET_HEIGHTS[it.t] ? ` × ${it.h}"` : ''}` : ''}`;
    const acts = [];
    if (s === 'look' && kind === 'dup') acts.push(`<button class="pi-link" onclick="piKeep(${it.i})">Keep this one</button>`);
    else if (s === 'look' && kind === 'low') acts.push(`<button class="pi-link" onclick="piConfirm(${it.i})">✓ Looks right</button>`);
    else if (s === 'look' && kind === 'price') acts.push(`<button class="pi-link" onclick="piConfirm(${it.i})">✓ First price is right</button>`);
    if (s !== 'look' && !editing && !it.exclude) acts.push(`<button class="pi-link" onclick="piEdit(${it.i})">Edit</button>`);
    if (PI.editing === it.i) acts.push(`<button class="pi-link" onclick="piConfirm(${it.i})">Done</button>`);
    acts.push(`<button class="pi-link" onclick="piToggleExclude(${it.i})">${it.exclude ? 'Include' : 'Leave out'}</button>`);
    return `<tr><td><b>${esc(it.sku)}</b><div style="font-size:11px;color:var(--muted);max-width:260px;">${esc(it.desc)}</div></td>
      <td>${mapCell}${why ? `<div class="pi-why">${esc(why)}</div>` : ''}</td><td>${priceHtml || '—'}${altHtml}</td><td style="white-space:nowrap;">${acts.join('')}</td></tr>`;
  }).join('');
  const sum = `<b>${plan.rows.length}</b> price${plan.rows.length === 1 ? '' : 's'} ready: ${plan.fresh} new, <span class="${plan.changed.length ? 'pi-up' : ''}">${plan.changed.length} changed</span>, ${plan.same} unchanged${plan.newFinishes.length ? ` · ${plan.newFinishes.length} new finish${plan.newFinishes.length === 1 ? '' : 'es'}` : ''}${PI.multiplier !== 1 ? ` · list × ${PI.multiplier}` : ''}`;
  return [`
    <div style="font-size:13px;">${sum}. Only <b>Matched</b> items are saved.</div>
    <div class="pi-tabs">${tabs.map(([k, l]) => `<button class="${PI.tab === k ? 'on' : ''}" onclick="piTab('${k}')">${l} (${by[k].length})</button>`).join('')}</div>
    <table class="pi-grid"><thead><tr><th>Item code</th><th>Planner cabinet</th><th>Price per finish (your cost)</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" style="color:var(--muted);padding:18px;">${PI.tab === 'look' ? 'Nothing needs a look. 👍' : 'None.'}</td></tr>`}</tbody></table>
    ${list.length > LIMIT ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">Showing the first ${LIMIT} of ${list.length}.</div>` : ''}`,
    `<button class="btn btn-ghost" onclick="PI.step='columns';piRender()">← Columns</button><button class="btn btn-primary" ${plan.rows.length ? '' : 'disabled'} onclick="piSave()">Save ${plan.rows.length} price${plan.rows.length === 1 ? '' : 's'}</button>`];
}
function piViewDone() {
  const s = PI.saved;
  return [`<div style="padding:24px 4px;font-size:14px;line-height:1.7;">
    ✅ Saved <b>${s.count}</b> price${s.count === 1 ? '' : 's'} from <b>${esc(PI.supplier)}</b>${s.finishes ? ` and added ${s.finishes} finish${s.finishes === 1 ? '' : 'es'}` : ''}.<br>
    New quotes use these prices right away (with your markup added). ${s.finishes ? 'You can set the color of new finishes in Company Settings → Door Styles / Finishes.' : ''}
    ${s.skuColumn ? '' : '<div class="pi-note" style="margin-top:12px;">Supplier item codes weren\'t saved — the database update for them (supabase-price-import.sql) hasn\'t been run yet.</div>'}</div>`,
    `<button class="btn btn-primary" onclick="piClose()">Done</button>`];
}
