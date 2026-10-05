// My Cabinet Planner — js/priceimport.js
// AI price-list import (Build Plan 5.8 / 5.8b). A company drops in its supplier's price list
// exactly as the supplier sent it. Whatever the layout, it's turned into one list of rows —
// finish group · item code · price — and everything after that is the same:
//   1. Columns & finishes — each finish group (a price column, a title row like "BLUE, HUNTER
//      GREEN & ARCTIC SHAKER", a tier section like "Pricing Gold", a sheet name, or a finish
//      column) is connected to one or more of the company's finishes.
//   2. The AI (netlify/functions/price-import.js) says what each item code is (type + size).
//   3. Questions — every flagged price or finish issue, one at a time: a suggested fix, a
//      manual fix, or "skip for now" (saved on the account as an open question).
//   4. Review, then save.
// Spreadsheet prices are read straight from the file here in the browser — the AI never
// supplies a number. Price rule (Dan): differences up to $5 are fine (the higher price is used);
// over $5 is flagged.
// Multiple suppliers: every import is for one named supplier; finishes it creates are tagged
// with it, and prices only merge in for the finishes it touches.
// Saved into company_profiles: price_overrides (what quotes read), custom_styles (new finishes,
// with `supplier`), supplier_skus (order list codes) and price_import_state (open questions).
// Loaded by profile.html as a classic script after its inline script (shares its globals:
// db, companyProfile, effectiveOwnerId, myTeamRole, canAccess, currentUser, showToast, esc,
// CABINET_TYPES, CABINET_WIDTHS, CABINET_HEIGHTS, DEFAULT_STYLES, renderPfStyles).

const PI_FN = '/.netlify/functions/price-import';
const PI_BATCH = 25, PI_PARALLEL = 3, PI_SAMPLE_ROWS = 45, PI_MAX_ROWS = 6000;
const PI_TOL = 5;   // dollars — price differences up to this are accepted (Dan, 2026-10-05)
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
// Finishes an import for this supplier may use: its own, or ones with no supplier set —
// never another supplier's finish that happens to share a name (their prices stay separate).
function piUsableFinishes() {
  const sup = (PI && PI.supplier || '').toLowerCase();
  return companyFinishes().filter(f => !f.supplier || f.supplier.toLowerCase() === sup);
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
function piDefaultSwatch(code) { return ({ WS: '#F5F4F0', GS: '#9CA3AF', ES: '#3B2314', NW: '#C9A96D' })[code] || '#F5F4F0'; }
function piNewCode(name, taken) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let base = words.map(w => w[0]).join('').slice(0, 3) || 'F';
  if (base.length < 2) base = (words[0] || 'FX').slice(0, 2);
  let code = base, n = 2;
  while (taken.has(code)) code = base + (n++);
  taken.add(code);
  return code;
}
// "WHITE SHAKER" → "White Shaker" (leave mixed-case names and short codes alone)
function piTitle(s) {
  s = String(s).trim();
  if (s !== s.toUpperCase() || /^[A-Z]{1,3}$/.test(s)) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
}
// For "does this new finish look like one they already have?" — gray/grey, spacing, case
const piNorm = s => String(s).toLowerCase().replace(/gray/g, 'grey').replace(/colour/g, 'color').replace(/[^a-z0-9]/g, '');

// ════════════════════════════
// FILE → GRIDS
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
const piColName = c => String.fromCharCode(65 + (c % 26)) + (c >= 26 ? '2' : '');

function piSheetGrid(sheetName) {
  return XLSX.utils.sheet_to_json(PI.wb.Sheets[sheetName], { header: 1, defval: '', raw: true })
    .filter(r => r.some(c => String(c).trim() !== '')).slice(0, PI_MAX_ROWS);
}
const piPriceCells = grid => grid.reduce((n, r) => n + r.filter(c => piPrice(c) != null && typeof c !== 'boolean').length, 0);
// Rows with text but no price-like cell — candidates for finish-group titles
function piTextRows(grid) {
  const out = [];
  grid.forEach((r, i) => {
    if (r.some(c => piPrice(c) != null)) return;
    const t = r.map(c => String(c).trim()).filter(Boolean).join(' | ');
    if (t && t.length <= 120) out.push({ row: i, text: t });
  });
  return out;
}

// ════════════════════════════
// OPEN
// ════════════════════════════
function piOpen(file) {
  if (myTeamRole !== 'owner') { showToast('Only the account owner can manage pricing.'); return; }
  if (!canAccess('silver')) { alert('Supplier price-list import is available on the Silver and Gold plans.'); return; }
  PI = { step: 'file', importId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    supplier: '', multiplier: 1, usage: { input: 0, output: 0, calls: 0, model: '' }, tab: 'look', editing: null,
    targets: {}, layouts: {}, grids: {}, use: {}, sheet: null, kind: 'sheet', pages: [], visionRows: [] };
  piEnsureModal();
  document.getElementById('pi-overlay').classList.add('open');
  if (file) piLoadFile(file); else piRender();
}
function piClose() {
  if (PI && ['matching', 'saving', 'reading', 'loading', 'triage', 'readingPages'].includes(PI.step)) return;
  if (PI && ['questions', 'review'].includes(PI.step) && !confirm('Close without saving? Nothing from this price list will be saved.')) return;
  document.getElementById('pi-overlay').classList.remove('open');
  PI = null;
}

async function piLoadFile(files) {
  files = files instanceof File ? [files] : [...(files || [])];
  if (!files.length) return;
  const file = files[0];
  const isImg = f => /\.(jpe?g|png|webp)$/i.test(f.name) || /^image\//.test(f.type || '');
  if (files.every(isImg)) return piLoadImages(files);
  if (/\.pdf$/i.test(file.name)) return piLoadPdf(file);
  if (!/\.(csv|xlsx?|xlsm)$/i.test(file.name)) { showToast('Use an Excel, CSV or PDF file, or photos/screenshots of the price pages.'); return; }
  if (file.size > 8 * 1024 * 1024) { showToast('That spreadsheet is over 8 MB — export just the price sheets and try again.'); return; }
  PI.kind = 'sheet'; PI.pages = []; PI.visionRows = [];
  try {
    PI.wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  } catch (e) { showToast("Couldn't read that file."); return; }
  PI.fileName = file.name;
  PI.grids = {}; PI.use = {}; PI.layouts = {}; PI.targets = {};
  PI.wb.SheetNames.forEach(n => { PI.grids[n] = piSheetGrid(n); PI.use[n] = piPriceCells(PI.grids[n]) >= 3; });
  if (!Object.values(PI.use).some(Boolean)) PI.use[PI.wb.SheetNames[0]] = true;
  PI.sheet = PI.wb.SheetNames.find(n => PI.use[n]);
  piGuessSupplier(file.name);
  PI.step = 'file';
  piRender();
}
function piGuessSupplier(name) {
  if (!PI.supplier) PI.supplier = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/price\s*list|pricing|catalog|shareable|dealer|\b\d{4}\b/ig, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}
const piUsedSheets = () => PI.wb.SheetNames.filter(n => PI.use[n]);

// ════════════════════════════
// PDFs AND PHOTOS (5.8b step 2)
// ════════════════════════════
// A PDF page with real text is turned into a grid and read like a spreadsheet (exact). A
// scanned page — or a photo/screenshot — is sent as a picture: a quick pass on a small copy
// finds the price pages and their finish group ("Pricing Gold" on a section cover carries on
// to the pages after it), then each price page is read twice; when the reads disagree a third
// read settles it, and anything still more than $5 apart becomes a question.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PI_MAX_PAGES = 150, PI_PAGE_PX = 2000, PI_TRIAGE_PX = 900, PI_THUMB_PX = 240;
// Rough cost per scanned page (two reads + the odd third), shown before reading
const PI_PAGE_COST = 0.09;
let _piPdfLib = null;
function piPdfLib() {
  if (_piPdfLib) return _piPdfLib;
  _piPdfLib = new Promise((res, rej) => {
    if (window.pdfjsLib) { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return res(window.pdfjsLib); }
    const el = document.createElement('script');
    el.src = PDFJS; el.setAttribute('data-categories', 'essential');
    el.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; res(window.pdfjsLib); };
    el.onerror = () => { _piPdfLib = null; rej(new Error("Couldn't load the PDF reader — check your connection and try again.")); };
    document.head.appendChild(el);
  });
  return _piPdfLib;
}
async function piRenderPdfPage(page, px, quality) {
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(4, px / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  // intent 'print' renders without waiting on animation frames, which stop in a background tab
  await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
  return c.toDataURL('image/jpeg', quality);
}
function piScaleImage(src, px, quality) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, px / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', quality));
    };
    im.onerror = () => rej(new Error("Couldn't open that image."));
    im.src = src;
  });
}
// Text items → rows (by height on the page) → cells (by column position)
function piTextGrid(items) {
  const its = items.map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width || 0 })).filter(i => i.s);
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  its.forEach(i => { const L = lines[lines.length - 1]; if (L && Math.abs(L.y - i.y) <= 3) L.items.push(i); else lines.push({ y: i.y, items: [i] }); });
  const xs = [...new Set(its.map(i => Math.round(i.x)))].sort((a, b) => a - b);
  const cols = [];
  xs.forEach(x => { if (!cols.length || x - cols[cols.length - 1].last > 14) cols.push({ first: x, last: x }); else cols[cols.length - 1].last = x; });
  const colOf = x => { let k = 0; cols.forEach((c, j) => { if (x >= c.first - 2) k = j; }); return k; };
  return lines.map(L => {
    const row = Array(cols.length).fill('');
    L.items.sort((a, b) => a.x - b.x).forEach(i => { const k = colOf(Math.round(i.x)); row[k] = row[k] ? row[k] + ' ' + i.s : i.s; });
    return row.map(c => { const p = piPrice(c); return p != null && /^\$?\s*[\d,]+(\.\d+)?$/.test(c) ? p : c; });
  }).filter(r => r.some(c => String(c).trim() !== ''));
}

async function piLoadPdf(file) {
  if (file.size > 80 * 1024 * 1024) { showToast('That PDF is over 80 MB — save just the price pages and try again.'); return; }
  PI.kind = 'pdf'; PI.fileName = file.name; PI.pages = []; PI.visionRows = []; PI.grids = {}; PI.use = {}; PI.layouts = {}; PI.targets = {};
  PI.wb = { SheetNames: [] };
  PI.step = 'loading'; PI.progress = { done: 0, total: 1, what: 'Opening the PDF…' }; piRender();
  try {
    const lib = await piPdfLib();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    PI.pdf = doc;
    const N = Math.min(doc.numPages, PI_MAX_PAGES);
    if (doc.numPages > PI_MAX_PAGES) showToast(`Only the first ${PI_MAX_PAGES} pages are read.`);
    PI.progress = { done: 0, total: N, what: 'Opening pages' };
    for (let n = 1; n <= N; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim());
      const isText = items.filter(i => /\d/.test(i.str)).length >= 15;
      const pg = { n, text: isText, thumb: await piRenderPdfPage(page, PI_THUMB_PX, 0.6), use: true, group: '' };
      if (isText) {
        const name = 'Page ' + n;
        PI.grids[name] = piTextGrid(items);
        pg.use = piPriceCells(PI.grids[name]) >= 3;
        PI.wb.SheetNames.push(name); PI.use[name] = pg.use;
      }
      PI.pages.push(pg);
      PI.progress.done = n; piUpdateProgress();
    }
  } catch (e) { showToast(e.message || "Couldn't read that PDF."); PI.step = 'file'; PI.pages = []; PI.wb = null; piRender(); return; }
  piGuessSupplier(file.name);
  PI.step = 'file'; piRender();
}
async function piLoadImages(files) {
  if (files.length > PI_MAX_PAGES) { showToast(`Up to ${PI_MAX_PAGES} pictures at a time.`); return; }
  PI.kind = 'pdf'; PI.fileName = files.length === 1 ? files[0].name : `${files.length} pictures`;
  PI.pages = []; PI.visionRows = []; PI.grids = {}; PI.use = {}; PI.layouts = {}; PI.targets = {}; PI.wb = { SheetNames: [] }; PI.pdf = null;
  PI.step = 'loading'; PI.progress = { done: 0, total: files.length, what: 'Opening pictures' }; piRender();
  // keep the order they were picked in, or by name when that looks like page order
  const list = files.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  try {
    for (let k = 0; k < list.length; k++) {
      const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(list[k]); });
      PI.pages.push({ n: k + 1, text: false, src: url, name: list[k].name, thumb: await piScaleImage(url, PI_THUMB_PX, 0.6), use: true, group: '' });
      PI.progress.done = k + 1; piUpdateProgress();
    }
  } catch (e) { showToast(e.message || "Couldn't open those pictures."); PI.step = 'file'; PI.pages = []; piRender(); return; }
  piGuessSupplier(list[0].name);
  PI.step = 'file'; piRender();
}
async function piPageImage(pg, px, q) {
  if (pg.src) return piScaleImage(pg.src, px, q);
  return piRenderPdfPage(await PI.pdf.getPage(pg.n), px, q);
}
function piUpdateProgress() {
  const bar = document.getElementById('pi-progress'), t = document.getElementById('pi-progress-n');
  if (!bar || !PI.progress) return;
  bar.style.width = Math.round(100 * PI.progress.done / Math.max(1, PI.progress.total)) + '%';
  t.textContent = `${PI.progress.what} — ${PI.progress.done} of ${PI.progress.total}`;
}
async function piPool(list, n, fn) {
  const q = list.slice(); let stop = null;
  await Promise.all(Array.from({ length: n }, async () => { while (q.length && !stop) { try { await fn(q.shift()); } catch (e) { stop = e; } } }));
  if (stop) throw stop;
}

// Find the price pages (scanned ones) and the finish group each one is for
async function piFindPricePages() {
  const scans = PI.pages.filter(p => !p.text);
  PI.step = 'triage'; PI.progress = { done: 0, total: scans.length, what: 'Finding the price pages' }; piRender();
  try {
    await piPool(scans, 4, async pg => {
      if (!pg.triaged) {
        try {
          const r = await piCall({ step: 'triage', page: pg.n, image: await piPageImage(pg, PI_TRIAGE_PX, 0.7) });
          pg.hasPrices = r.hasPrices; pg.title = r.group; pg.triaged = true;
        } catch (e) {
          if ([429, 403, 503].includes(e.status)) throw e;
          pg.hasPrices = true; pg.title = ''; pg.triaged = true;   // couldn't tell — keep it, the person can untick it
        }
      }
      PI.progress.done++; piUpdateProgress();
    });
  } catch (e) { showToast(e.message); PI.step = 'file'; piRender(); return; }
  // a finish group named on one page carries on to the pages after it until another is named
  let cur = '';
  PI.pages.forEach(pg => {
    if (pg.text) return;
    if (pg.title) cur = pg.title;
    if (!pg.groupEdited) pg.group = cur;
    pg.use = !!pg.hasPrices;
  });
  PI.step = 'pages'; piRender();
}
function piTogglePage(n) {
  const pg = PI.pages.find(p => p.n === n); pg.use = !pg.use;
  if (pg.text) PI.use['Page ' + n] = pg.use;
  piRender();
}
function piSetPageGroup(n, v) { const pg = PI.pages.find(p => p.n === n); pg.group = v.trim(); pg.groupEdited = true; }
function piShowPage(n) {
  const pg = PI.pages.find(p => p.n === n);
  const w = window.open('', '_blank');
  if (!w) { showToast('Allow pop-ups to open the page.'); return; }
  w.document.write(`<title>Page ${n}</title><body style="margin:0;background:#333"><img src="${pg.full || pg.thumb}" style="width:100%;display:block"></body>`);
}

// Read the chosen pages: text pages through the layout step, scanned pages twice (+1 if needed)
async function piReadPages() {
  const scans = PI.pages.filter(p => p.use && !p.text);
  const texts = PI.pages.filter(p => p.use && p.text).map(p => 'Page ' + p.n);
  if (!scans.length && !texts.length) { showToast('Tick at least one page.'); return; }
  PI.step = 'readingPages'; PI.progress = { done: 0, total: scans.length + texts.length, what: 'Reading pages' }; piRender();
  try {
    if (texts.length) {
      const fatal = await piLayoutSheets(texts);
      if (fatal) throw Object.assign(new Error(fatal), { status: 429 });
      PI.progress.done += texts.length; piUpdateProgress();
    }
    await piPool(scans, 3, async pg => {
      if (!pg.read) {
        const img = await piPageImage(pg, PI_PAGE_PX, 0.85);
        pg.full = img;
        const reads = await Promise.all([piReadPage(pg, img), piReadPage(pg, img)]);
        let m = piMergeReads(reads, pg);
        if (m.disputed || reads.some(r => r.truncated)) { reads.push(await piReadPage(pg, img)); m = piMergeReads(reads, pg); }
        pg.read = m.rows; pg.readCount = reads.length; pg.failed = reads.every(r => r.failed);
      }
      PI.progress.done++; piUpdateProgress();
    });
  } catch (e) { showToast(e.message); PI.step = 'pages'; piRender(); return; }
  PI.visionRows = PI.pages.filter(p => p.read).flatMap(p => p.read);
  const failed = PI.pages.filter(p => p.use && p.failed).map(p => p.n);
  if (failed.length) showToast(`Page${failed.length > 1 ? 's' : ''} ${failed.join(', ')} couldn't be read — go back to try again, or untick ${failed.length > 1 ? 'them' : 'it'}.`);
  failed.forEach(n => { const pg = PI.pages.find(p => p.n === n); pg.read = null; });
  piExtract();
  PI.step = 'columns'; piRender();
}
async function piReadPage(pg, img) {
  try { return await piCall({ step: 'page', page: pg.n, image: img, context: pg.group }); }
  catch (e) {
    if ([429, 403, 503].includes(e.status)) throw e;
    try { return await piCall({ step: 'page', page: pg.n, image: img, context: pg.group, fast: true }); }   // timed out: faster model
    catch (e2) { if ([429, 403, 503].includes(e2.status)) throw e2; return { rows: [], failed: true }; }
  }
}
// Line up the reads of one page. A price two reads agree on (within $5) is used — the higher of
// them. With two reads, any disagreement or a line only one read found asks for a third read;
// after that, two out of three is enough; anything else is "disputed" (a question later).
function piMergeReads(reads, pg) {
  const ok = reads.filter(r => !r.failed);
  const groupOf = r => pg.groupEdited ? pg.group : (r.group || pg.group);   // the person's edit wins
  const keyOf = r => [piNorm(groupOf(r)), r.sku.toUpperCase().replace(/\s+/g, ''), piNorm(r.col)].join('|');
  const maps = ok.map(r => {
    const m = new Map();
    r.rows.forEach(x => { const k0 = keyOf(x); let k = k0, i = 1; while (m.has(k)) k = k0 + '#' + (++i); m.set(k, x); });
    return m;
  });
  const keys = new Set(maps.flatMap(m => [...m.keys()]));
  const rows = []; let disputed = 0;
  keys.forEach(k => {
    const vals = maps.map(m => m.has(k) ? m.get(k).price : null);
    const x = maps.map(m => m.get(k)).find(Boolean);
    const present = vals.filter(v => v != null);
    let price = null;
    for (const v of present) {
      const agree = present.filter(w => Math.abs(w - v) <= PI_TOL);
      if (agree.length >= 2 && agree.length > present.length / 2) { price = Math.max(...agree); break; }
    }
    if (ok.length === 1) price = present[0];   // only one read came back — it'll be flagged below
    const isDisputed = price == null || ok.length < 2;
    if (isDisputed) disputed++;
    rows.push({ page: pg.n, group: groupOf(x), sku: x.sku, col: x.col, section: x.section, price: price != null ? price : Math.max(...present), reads: vals, disputed: isDisputed });
  });
  return { rows, disputed };
}
const piReadSuggest = reads => Math.max(...reads.filter(v => v != null));

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

// ════════════════════════════
// LAYOUT (step 1 of reading)
// ════════════════════════════
function piReadSettings() {
  PI.supplier = (document.getElementById('pi-supplier').value || '').trim();
  const mult = parseFloat(document.getElementById('pi-mult').value);
  if (!PI.supplier) { showToast('Name the supplier first — finishes and prices are kept per supplier.'); return false; }
  if (!(mult > 0 && mult <= 5)) { showToast('The multiplier should be a number like 1 or 0.45.'); return false; }
  PI.multiplier = mult;
  return true;
}
async function piReadLayout() {
  if (!piReadSettings()) return;
  if (PI.kind === 'pdf') return piFindPricePages();
  if (!piUsedSheets().length) { showToast('Tick at least one sheet to import.'); return; }
  PI.step = 'reading'; piRender();
  const fatal = await piLayoutSheets(piUsedSheets());
  if (fatal) { showToast(fatal); PI.step = 'file'; piRender(); return; }
  piExtract();
  PI.step = 'columns'; piRender();
}
// The AI describes each sheet's layout (tables, columns, finish-group titles). Returns an
// error message if the import can't go on (plan, daily limit, AI not set up).
async function piLayoutSheets(names) {
  let fatal = null;
  for (const name of names) {
    if (fatal) break;
    const grid = PI.grids[name], textRows = piTextRows(grid);
    let s, note = '';
    try {
      s = await piCall({ step: 'structure', sheet: name, textRows: textRows.slice(0, 200),
        rows: grid.slice(0, PI_SAMPLE_ROWS).map(r => r.slice(0, 40).map(c => String(c))) });
      note = s.notes || '';
    } catch (e) {
      if (e.status === 429 || e.status === 403 || e.status === 503) { fatal = e.message; break; }
      s = piGuessLayout(grid);
      note = "The AI couldn't read this sheet's layout, so this is a best guess — check it below.";
    }
    const titles = new Map((s.groupTitles || []).map(g => [g.row, g.name]));
    PI.layouts[name] = {
      headerRow: s.headerRow, tables: piCleanTables(s.tables || [], [...titles.values(), name]),
      sheetIsGroup: !!s.sheetIsGroup, note,
      // every text-only row can be switched on/off as a finish-group title; the AI's picks start on
      candidates: [...textRows.map(t => ({ row: t.row, name: titles.get(t.row) || t.text, on: titles.has(t.row) })),
        ...[...titles].filter(([r]) => !textRows.some(t => t.row === r)).map(([row, name]) => ({ row, name, on: true }))].sort((a, b) => a.row - b.row),
    };
  }
  return fatal;
}

// Tidy the AI's table list so one mistake can't put a price under the wrong finish group:
// a table listed once per finish group becomes one table (the group comes from the title
// rows), and a price-column label that just repeats a group title or the sheet name is dropped.
function piCleanTables(tables, groupNames) {
  const groups = new Set(groupNames.map(n => piNorm(n)).filter(Boolean));
  const seen = new Map();
  tables.forEach(t => {
    const pcs = t.priceCols.map(p => ({ col: p.col, label: groups.has(piNorm(p.label || '')) ? '' : (p.label || '') }));
    const key = `${t.skuCol}|${pcs.map(p => p.col).sort((a, b) => a - b).join(',')}|${t.finishCol ?? ''}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, { ...t, priceCols: pcs }); return; }
    // same columns seen again: keep a label only if every copy agrees on it
    prev.priceCols.forEach(p => { const q = pcs.find(x => x.col === p.col); if (!q || piNorm(q.label) !== piNorm(p.label)) p.label = ''; });
    ['descCol', 'widthCol', 'heightCol'].forEach(k => { if (prev[k] == null && t[k] != null) prev[k] = t[k]; });
  });
  return [...seen.values()];
}

// If the AI can't be reached: header row with item/price words, every SKU-looking column
// followed by a price column becomes a table.
function piGuessLayout(grid) {
  const g = grid.slice(0, PI_SAMPLE_ROWS);
  let headerRow = g.findIndex(r => r.filter(c => /sku|item|code|model|desc|price|part/i.test(String(c))).length >= 1 && r.filter(c => String(c).trim()).length >= 2);
  if (headerRow < 0) headerRow = null;
  const hdr = headerRow == null ? [] : g[headerRow].map(c => String(c));
  const body = g.slice(headerRow == null ? 0 : headerRow + 1);
  const ncols = Math.max(...g.map(r => r.length));
  const isSku = c => { const v = body.map(r => String(r[c] ?? '').trim()).filter(Boolean); return v.length >= 3 && v.filter(x => /^[A-Z0-9][A-Z0-9 .\-\/*"]{1,24}$/i.test(x) && /\d/.test(x) && /[A-Z]/i.test(x)).length / v.length > 0.6; };
  const isPrice = c => { const v = body.map(r => r[c]).filter(x => String(x).trim() !== ''); return v.length >= 3 && v.filter(x => piPrice(x) != null).length / v.length > 0.6 && !/width|height|depth|qty|^w$|^h$|^d$/i.test(hdr[c] || ''); };
  const tables = [];
  for (let c = 0; c < ncols; c++) {
    if (!isSku(c)) continue;
    const pcs = [];
    for (let d = c + 1; d < ncols && !isSku(d); d++) if (isPrice(d)) pcs.push({ col: d, label: hdr[d] && !/price|cost|net|list/i.test(hdr[d]) ? hdr[d] : '' });
    if (pcs.length) tables.push({ skuCol: c, descCol: null, widthCol: null, heightCol: null, finishCol: null, priceCols: pcs });
  }
  return { headerRow, tables, groupTitles: [], sheetIsGroup: false };
}

// ════════════════════════════
// EXTRACT → rows · sources · items
// ════════════════════════════
function piSourceLabel(group, finishVal, colLabel) {
  const parts = [];
  if (group) parts.push(group);
  if (finishVal) parts.push(finishVal);
  if (colLabel && !(group && group.toLowerCase().includes(colLabel.toLowerCase()))) parts.push(colLabel);
  return parts.join(' · ') || 'Price';
}
// Every used sheet → rows { sheet, r, sku, desc, extra, src, price }
function piExtract() {
  const rows = [];
  piUsedSheets().forEach(name => {
    const L = PI.layouts[name], g = PI.grids[name];
    if (!L) return;
    const titles = L.candidates.filter(c => c.on).sort((a, b) => a.row - b.row);
    const titleRows = new Set(titles.map(t => t.row));
    const hdr = L.headerRow == null ? [] : g[L.headerRow];
    g.forEach((r, ri) => {
      if (ri === L.headerRow || titleRows.has(ri)) return;
      let group = '';
      for (const t of titles) { if (t.row < ri) group = t.name; else break; }
      if (!group && L.sheetIsGroup) group = name;
      L.tables.forEach(T => {
        const sku = piCell(r, T.skuCol);
        if (!sku || sku.length > 60 || !/\d/.test(sku)) return;   // item codes carry a size; headings don't
        const finishVal = T.finishCol != null ? piCell(r, T.finishCol) : '';
        if (T.finishCol != null && !finishVal) return;
        const extra = [[T.widthCol, 'W'], [T.heightCol, 'H']].filter(([c]) => c != null && piCell(r, c)).map(([c, l]) => `${piCell(hdr, c) || l} ${piCell(r, c)}`).join(', ');
        T.priceCols.forEach(pc => {
          const price = piPrice(r[pc.col]);
          if (price == null) return;
          rows.push({ sheet: name, r: ri, sku, desc: piCell(r, T.descCol), extra, src: piSourceLabel(group, finishVal, pc.label), price });
        });
      });
    });
  });
  (PI.visionRows || []).forEach(v => {
    const pg = PI.pages.find(p => p.n === v.page && p.use);
    if (!pg) return;
    rows.push({ sheet: 'Page ' + v.page, page: v.page, r: -1, sku: v.sku, desc: v.section || '', extra: '', src: piSourceLabel(pg.groupEdited ? pg.group : v.group, '', v.col), price: v.price, reads: v.reads, disputed: v.disputed });
  });
  PI.rows = rows;
  const counts = new Map();
  rows.forEach(x => counts.set(x.src, (counts.get(x.src) || 0) + 1));
  PI.sources = [...counts].map(([label, count]) => ({ id: 's:' + label.toLowerCase(), label, count }));
  rows.forEach(x => { x.srcId = 's:' + x.src.toLowerCase(); });
  piDefaultTargets();
}
const piSources = () => PI.sources || [];

// Suggest finishes for a finish group. In order: exact name; a tier ("Pricing Gold" → every
// Gold finish); finish codes ("PR, PS"); otherwise split "BLUE, HUNTER GREEN & ARCTIC SHAKER"
// into Blue Shaker / Hunter Green Shaker / Arctic Shaker, each an existing finish or a new one.
function piSuggestRefs(label) {
  const fin = piUsableFinishes();
  const byName = n => fin.find(f => f.name.toLowerCase() === n.toLowerCase());
  const whole = byName(label) || byName(piTitle(label));
  if (whole) return [whole.code];
  const parts = label.split(' · ');
  const last = parts[parts.length - 1];
  const codes = last.split(/\s*(?:,|&|\/|\band\b)\s*/i).map(x => x.trim()).filter(Boolean);
  if (codes.length && codes.every(c => /^[A-Z0-9]{2,3}$/.test(c) && fin.some(f => f.code === c))) return codes;
  const tier = parts[0].replace(/pricing|price|tier|series|level/ig, '').trim().toLowerCase();
  if (tier && parts.length === 1) { const t = fin.filter(f => (f.tier || '').toLowerCase() === tier); if (t.length) return t.map(f => f.code); }
  if (label === 'Price') return ['new:' + PI.supplier];
  // "Pricing Gold" → a new finish just called "Gold"
  const clean = last.replace(/\b(pricing|price list|prices|price|tier|series|level|collection)\b/ig, ' ').replace(/\s+/g, ' ').trim() || last;
  const names = clean.split(/\s*(?:,|&|\/|\band\b)\s*/i).map(x => piTitle(x.trim())).filter(Boolean);
  const STYLE_WORD = /shaker|panel|slab|flat|raised|door|style|inset|beaded|square|mission/i;
  // "Blue, Hunter Green & Arctic Shaker": the last word ("Shaker") belongs to every name — but
  // only when it's a door-style word, never for codes like "PR, PS"
  const lastWord = names.length > 1 ? (names[names.length - 1].match(/(\S+)$/) || [])[1] : '';
  const tail = lastWord && STYLE_WORD.test(lastWord) && !names.every(n => /^[A-Z0-9]{1,3}$/.test(n)) ? lastWord : '';
  return names.map(n => {
    const full = (tail && !STYLE_WORD.test(n)) ? `${n} ${tail}` : n;
    const hit = byName(full) || byName(n);
    return hit ? hit.code : 'new:' + full;
  });
}
function piDefaultTargets() {
  piSources().forEach(src => { if (!PI.targets[src.id]) PI.targets[src.id] = piSuggestRefs(src.label); });
}
function piRefLabel(ref) {
  if (ref.startsWith('new:')) return `${ref.slice(4)} (new · ${PI.supplier})`;
  const f = companyFinishes().find(x => x.code === ref);
  return f ? `${f.name} · ${f.code}${f.supplier ? ' · ' + f.supplier : ''}` : ref;
}
const piRefName = ref => ref.startsWith('new:') ? ref.slice(4) : ((companyFinishes().find(x => x.code === ref) || {}).name || ref);
function piAddTarget(srcId, ref) {
  if (!ref) return;
  if (ref === '__new') {
    const name = (prompt('Name for the new finish:') || '').trim();
    if (!name) { piRender(); return; }
    ref = 'new:' + name;
  }
  if (!PI.targets[srcId].includes(ref)) PI.targets[srcId].push(ref);
  piRender();
}
function piRemoveTarget(srcId, ref) { PI.targets[srcId] = PI.targets[srcId].filter(r => r !== ref); piRender(); }

// Column editor
function piLayoutSet(sheet, field, val, ti, pi) {
  const L = PI.layouts[sheet], v = val === '' ? null : +val;
  if (field === 'headerRow') L.headerRow = v;
  else if (field === 'sheetIsGroup') L.sheetIsGroup = !!val;
  else if (field === 'title') { const c = L.candidates.find(x => x.row === v); if (c) c.on = !c.on; }
  else if (field === 'addTable') L.tables.push({ skuCol: 0, descCol: null, widthCol: null, heightCol: null, finishCol: null, priceCols: [{ col: 1, label: '' }] });
  else if (field === 'delTable') L.tables.splice(ti, 1);
  else if (field === 'addPrice') { if (v != null && !L.tables[ti].priceCols.some(p => p.col === v)) L.tables[ti].priceCols.push({ col: v, label: '' }); }
  else if (field === 'delPrice') L.tables[ti].priceCols.splice(pi, 1);
  else if (field === 'priceLabel') L.tables[ti].priceCols[pi].label = String(val).trim();
  else L.tables[ti][field] = v;
  piExtract();
  piRender();
}

// ════════════════════════════
// ITEMS
// ════════════════════════════
// One item per item code. The same code listed again for the same finish group: within $5
// the higher price is used; more than $5 apart, it becomes a question.
function piBuildItems() {
  const byKey = new Map();
  PI.rows.forEach(x => {
    if (!(PI.targets[x.srcId] || []).length) return;
    const key = x.sku.toUpperCase().replace(/\s+/g, ' ');
    let it = byKey.get(key);
    if (!it) {
      it = { key, sku: x.sku, desc: x.desc, extra: x.extra, where: x.page ? `page ${x.page}` : `${PI.wb.SheetNames.length > 1 ? x.sheet + ', ' : ''}row ${x.r + 1}`, page: x.page,
        prices: {}, manual: {}, t: null, w: null, h: null, v: '', c: 'low', confirmed: false, exclude: false, pick: false };
      byKey.set(key, it);
    }
    const s = x.srcId, cur = it.prices[s];
    if (x.disputed) { it.readIssue = it.readIssue || {}; it.readIssue[s] = { reads: x.reads, page: x.page }; }
    if (cur == null) { it.prices[s] = x.price; return; }
    if (Math.abs(cur - x.price) <= 0.004) return;
    if (Math.abs(cur - x.price) <= PI_TOL) { it.prices[s] = Math.max(cur, x.price); it.notes = ['listed twice within $' + PI_TOL + ' — using the higher price']; return; }
    it.dupPrice = true;
    it.alts = it.alts || {};
    const a = it.alts[s] = it.alts[s] || [cur];
    if (!a.some(p => Math.abs(p - x.price) <= 0.004)) a.push(x.price);
  });
  PI.items = [...byKey.values()];
  PI.items.forEach((it, i) => { it.i = i; });
}

// What each item code is — the AI, a few at a time
async function piMatchItems() {
  if (!piSources().some(s => (PI.targets[s.id] || []).length)) { showToast('Connect at least one finish group to a finish.'); return; }
  piBuildItems();
  if (!PI.items.length) { showToast('No item codes with prices were found — check the columns.'); return; }
  PI.step = 'matching'; PI.done = 0; piRender();
  const L0 = PI.layouts[piUsedSheets()[0]] || {};
  const hdr = L0.headerRow == null ? [] : PI.grids[piUsedSheets()[0]][L0.headerRow].map(c => String(c));
  const queue = [];
  for (let i = 0; i < PI.items.length; i += PI_BATCH) queue.push(PI.items.slice(i, i + PI_BATCH));
  let stop = null;
  const run = async batch => {
    if (stop) return;
    try {
      const out = await piCall({ step: 'map', header: hdr, items: batch.map(it => ({ i: it.i, sku: it.sku, desc: it.desc, extra: it.extra })) });
      (out.items || []).forEach(m => { const it = PI.items[m.i]; if (it) Object.assign(it, { t: m.t, w: m.w, h: m.h, v: m.v || '', c: m.c }); });
      batch.filter(it => !it.t).forEach(it => { it.aiError = "The AI didn't answer for this one."; });
    } catch (e) {
      if (e.status === 429 || e.status === 403 || e.status === 503) { stop = e.message; return; }
      if (batch.length > 5) { const h = Math.ceil(batch.length / 2); await run(batch.slice(0, h)); await run(batch.slice(h)); return; }
      batch.forEach(it => { it.aiError = "The AI couldn't read this one."; });
    }
    PI.done += batch.length;
    const bar = document.getElementById('pi-progress');
    if (bar) { bar.style.width = Math.round(100 * PI.done / PI.items.length) + '%'; document.getElementById('pi-progress-n').textContent = `${Math.min(PI.done, PI.items.length)} of ${PI.items.length}`; }
  };
  const workers = Array.from({ length: PI_PARALLEL }, async () => { while (queue.length && !stop) await run(queue.shift()); });
  await Promise.all(workers);
  if (stop) showToast(stop);
  PI.items.filter(it => !it.t && !it.aiError).forEach(it => { it.aiError = 'Not read.'; });
  piStartQuestions();
}

// ════════════════════════════
// RULES
// ════════════════════════════
const piSizeKey = it => CABINET_HEIGHTS[it.t] ? `${it.w}x${it.h}` : `${it.w}`;
const piTypeLabel = k => k === 'skip' ? 'Not a cabinet' : (CABINET_TYPES.find(x => x.key === k) || {}).label || '—';
const piItemLabel = it => it.t && it.t !== 'skip' ? `${piTypeLabel(it.t)} ${it.w}"${CABINET_HEIGHTS[it.t] ? ` × ${it.h}"` : ''}` : piTypeLabel(it.t);
function piSizeIssue(it) {
  const t = CABINET_TYPES.find(x => x.key === it.t);
  const widths = CABINET_WIDTHS[it.t] || [];
  if (!widths.includes(it.w)) return `The planner has no ${it.w ? it.w + '"-wide ' : ''}${t ? t.label : 'cabinet'} (it uses ${widths.join(', ')})`;
  const hs = CABINET_HEIGHTS[it.t];
  if (hs && !hs.includes(it.h)) return `The planner has no ${it.h ? it.h + '"-high ' : ''}${t.label} (heights ${hs.join(', ')})`;
  return '';
}
// Finish code → cost for this item. When several finish groups price the same finish (Matrix:
// "Gold" for every Gold door, "PR, PS" for just those two), the more specific group wins.
// Two equally specific groups pricing the same finish: within $5 the higher is used; further
// apart it's a question (unless the person already picked one).
function piItemPriceInfo(it) {
  const opts = {};
  Object.entries(it.prices).forEach(([src, p]) => {
    const refs = PI.targets[src] || [];
    const cost = it.manual[src] != null ? it.manual[src] : piRound(p * PI.multiplier);
    refs.forEach(ref => (opts[ref] = opts[ref] || []).push({ src, cost, n: refs.length }));
  });
  const prices = {}, conflicts = [];
  Object.entries(opts).forEach(([ref, list]) => {
    const n = Math.min(...list.map(o => o.n));
    const ties = list.filter(o => o.n === n);
    const pref = it.prefer && it.prefer[ref] && ties.find(o => o.src === it.prefer[ref]);
    if (pref) { prices[ref] = pref.cost; return; }
    const hi = Math.max(...ties.map(o => o.cost)), lo = Math.min(...ties.map(o => o.cost));
    prices[ref] = hi;
    if (hi - lo > PI_TOL) conflicts.push({ ref, opts: ties });
  });
  return { prices, conflicts };
}
const piItemPrices = it => piItemPriceInfo(it).prices;
function piStatuses() {
  const st = new Map(), cand = [];
  PI.items.forEach(it => {
    if (it.deferred) return st.set(it, ['later', 'Saved as an open question — finish it from My Pricing', 'later']);
    if (it.exclude) return st.set(it, ['skip', 'Left out by you']);
    if (!it.t) return st.set(it, ['look', (it.aiError || 'Not read yet') + ' Set the cabinet type and size.', 'size']);
    if (it.t === 'skip') return st.set(it, ['skip', 'Not something the planner prices' + (it.v ? ` (${it.v})` : '')]);
    const sz = piSizeIssue(it); if (sz) return st.set(it, ['look', sz, 'size']);
    if (!Object.keys(piItemPrices(it)).length) return st.set(it, ['skip', 'No price in the finish groups you connected']);
    if (it.dupPrice && !it.confirmed) return st.set(it, ['look', `Listed more than once with prices more than $${PI_TOL} apart`, 'price']);
    if (it.readIssue && !it.readOk) return st.set(it, ['look', `The reads of page ${Object.values(it.readIssue)[0].page} don't agree on this price (more than $${PI_TOL} apart, or one read missed it)`, 'read']);
    const cf = piItemPriceInfo(it).conflicts;
    if (cf.length) return st.set(it, ['look', cf.map(c => `${piRefName(c.ref)} gets different prices from ${c.opts.map(o => `${(piSources().find(x => x.id === o.src) || {}).label} (${piMoney(o.cost)})`).join(' and ')}`).join('; '), 'which', cf]);
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
  const ok = [];
  cand.forEach(it => {
    if (beaten.has(it)) return st.set(it, ['skip', `Same cabinet as ${beaten.get(it).sku} — the planner uses that one`, 'dup']);
    if (unsettled.has(it)) return st.set(it, ['look', `Same cabinet as ${unsettled.get(it).filter(x => x !== it).map(x => x.sku).join(', ')} — keep one`, 'dup']);
    if (it.c === 'low' && !it.confirmed) return st.set(it, ['look', "The AI wasn't sure what this is", 'low']);
    ok.push(it);
  });
  // Sanity check: within one cabinet line and finish, a wider box shouldn't cost less than a
  // narrower one (more than $5 less). The wider one is flagged.
  const lines = new Map();
  ok.forEach(it => Object.entries(piItemPrices(it)).forEach(([ref, cost]) => {
    if ((CABINET_WIDTHS[it.t] || []).length < 2) return;
    const k = `${it.t}|${it.h || ''}|${ref}`; (lines.get(k) || lines.set(k, []).get(k)).push({ it, cost, ref });
  }));
  const odd = new Map();
  lines.forEach(list => {
    list.sort((a, b) => a.it.w - b.it.w);
    let top = null;
    list.forEach(x => {
      if (top && x.it.w > top.it.w && x.cost < top.cost - PI_TOL && !x.it.orderOk) (odd.get(x.it) || odd.set(x.it, []).get(x.it)).push({ ...x, prev: top });
      if (!top || x.cost >= top.cost) top = x;
    });
  });
  ok.forEach(it => {
    const os = odd.get(it);
    if (os) return st.set(it, ['look', os.map(o => `${piRefName(o.ref)}: ${piMoney(o.cost)} is less than the narrower ${o.prev.it.sku} (${piMoney(o.prev.cost)})`).join('; ') + ' — possible typo in the price list', 'order', os]);
    st.set(it, ['ok', [it.v ? `Variant: ${it.v}` : '', ...(it.notes || [])].filter(Boolean).join(' · ')]);
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

// ════════════════════════════
// QUESTIONS — one at a time: suggested fix · manual fix · skip for now
// ════════════════════════════
function piStartQuestions() {
  const st = piStatuses(), qs = [];
  // Finish questions: a new finish whose name looks like one the company already has
  const seen = new Set();
  Object.values(PI.targets).flat().forEach(ref => {
    if (!ref.startsWith('new:') || seen.has(ref)) return;
    seen.add(ref);
    const n = piNorm(ref.slice(4));
    const like = piUsableFinishes().find(f => { const m = piNorm(f.name); return m === n || (m.length > 5 && (m.includes(n) || n.includes(m))); });
    if (like) qs.push({ kind: 'style', ref, like: like.code });
  });
  PI.items.forEach(it => { const s = st.get(it); if (s[0] === 'look') qs.push({ kind: s[2], it }); });
  PI.questions = qs; PI.qi = 0;
  PI.step = qs.length ? 'questions' : 'review';
  PI.tab = 'ok';
  piRender();
}
const piOpenQuestions = () => (PI.questions || []).filter(q => !q.answer);
function piAnswer(how) {
  const q = PI.questions[PI.qi];
  if (!q) return;
  q.answer = how;
  piNextQuestion();
}
function piNextQuestion() {
  // an answer can settle other questions too (keeping one of two look-alike codes settles both)
  const st = piStatuses();
  PI.questions.forEach(q => { if (!q.answer && q.it && st.get(q.it)[0] !== 'look') q.answer = 'settled'; });
  const next = PI.questions.findIndex((q, i) => i > PI.qi && !q.answer);
  const any = PI.questions.findIndex(q => !q.answer);
  if (next >= 0) PI.qi = next;
  else if (any >= 0) PI.qi = any;
  else { PI.step = 'review'; PI.tab = 'ok'; }
  piRender();
}
function piQBack() { if (PI.qi > 0) { PI.qi--; piRender(); } }
// A sensible price when a code is listed at two prices: the one that fits between the
// narrower and wider sizes of the same line; if there aren't any, the higher one.
function piSuggestAlt(it, src) {
  const alts = it.alts[src];
  const same = PI.items.filter(x => x !== it && x.t === it.t && x.h === it.h && x.prices[src] != null && !x.dupPrice);
  const lower = same.filter(x => x.w < it.w).sort((a, b) => b.w - a.w)[0], upper = same.filter(x => x.w > it.w).sort((a, b) => a.w - b.w)[0];
  if (lower || upper) {
    const fits = alts.filter(p => (!lower || p >= lower.prices[src] - PI_TOL) && (!upper || p <= upper.prices[src] + PI_TOL));
    if (fits.length === 1) return { price: fits[0], why: `fits between ${lower ? lower.sku : '—'} and ${upper ? upper.sku : '—'}` };
  }
  return { price: Math.max(...alts), why: 'the higher price, so a quote never comes in low' };
}
function piFixSuggested() {
  const q = PI.questions[PI.qi], it = q.it;
  if (q.kind === 'style') Object.keys(PI.targets).forEach(k => { PI.targets[k] = [...new Set(PI.targets[k].map(r => r === q.ref ? q.like : r))]; });
  else if (q.kind === 'size') it.exclude = true;
  else if (q.kind === 'low') { it.confirmed = true; it.c = 'high'; }
  else if (q.kind === 'price') { Object.keys(it.alts).forEach(src => { it.prices[src] = piSuggestAlt(it, src).price; }); it.confirmed = true; }
  else if (q.kind === 'dup') { const w = piDupWinner(it); PI.items.forEach(x => { if (x.t === w.t && piSizeKey(x) === piSizeKey(w)) x.pick = false; }); w.pick = true; }
  else if (q.kind === 'order') it.orderOk = true;
  else if (q.kind === 'read') { Object.entries(it.readIssue).forEach(([src, ri]) => { it.manual[src] = piReadSuggest(ri.reads); }); it.readOk = true; }
  else if (q.kind === 'which') { it.prefer = it.prefer || {}; piItemPriceInfo(it).conflicts.forEach(c => { it.prefer[c.ref] = c.opts.slice().sort((a, b) => b.cost - a.cost)[0].src; }); }
  piAnswer('suggested');
}
function piDupWinner(it) {
  const st = piStatuses(), list = PI.items.filter(x => x.t === it.t && x.t && piSizeKey(x) === piSizeKey(it) && st.get(x)[2] === 'dup');
  return list.slice().sort((a, b) => a.sku.length - b.sku.length || a.sku.localeCompare(b.sku))[0] || it;
}
function piFixSkip() {
  const q = PI.questions[PI.qi];
  if (q.it) q.it.deferred = true;
  piAnswer('skipped');
}
// Manual fixes
function piQSetType(field, val) {
  const it = PI.questions[PI.qi].it;
  if (field === 't') { it.t = val || null; if (!CABINET_HEIGHTS[val]) it.h = null; }
  else it[field] = val === '' ? null : parseFloat(val);
  piRender();
}
function piQApplyType() {
  const it = PI.questions[PI.qi].it;
  if (!it.t) { showToast('Pick a cabinet type (or "Not a cabinet").'); return; }
  if (it.t !== 'skip' && piSizeIssue(it)) { showToast('Pick a width' + (CABINET_HEIGHTS[it.t] ? ' and height' : '') + ' the planner uses.'); return; }
  it.confirmed = true; it.c = 'high'; it.aiError = '';
  piAnswer('manual');
}
function piQApplyPrice() {
  const q = PI.questions[PI.qi], it = q.it;
  let okAny = false;
  document.querySelectorAll('#pi-body [data-man-src]').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) { it.manual[inp.dataset.manSrc] = piRound(v); okAny = true; }
  });
  if (!okAny) { showToast('Type a price first.'); return; }
  it.confirmed = true; it.orderOk = true; it.dupPrice = false; it.readOk = true;
  piAnswer('manual');
}
function piQPrefer(ref, src) {
  const it = PI.questions[PI.qi].it;
  it.prefer = it.prefer || {}; it.prefer[ref] = src;
  if (!piItemPriceInfo(it).conflicts.length) piAnswer('manual'); else piRender();
}
function piQKeep(i) { const w = PI.items[i]; PI.items.forEach(x => { if (x.t === w.t && piSizeKey(x) === piSizeKey(w)) x.pick = false; }); w.pick = true; piAnswer('manual'); }
function piQStyleManual(val) {
  const q = PI.questions[PI.qi];
  if (!val) return;
  let ref = val;
  if (val === '__new') { const name = (prompt('Name for the new finish:', q.ref.slice(4)) || '').trim(); if (!name) return; ref = 'new:' + name; }
  Object.keys(PI.targets).forEach(k => { PI.targets[k] = [...new Set(PI.targets[k].map(r => r === q.ref ? ref : r))]; });
  piAnswer('manual');
}

// Review-table row actions
function piEdit(i) { PI.editing = i; piRender(); }
function piSetItem(i, field, val) {
  const it = PI.items[i];
  if (field === 't') { it.t = val; if (!CABINET_HEIGHTS[val]) it.h = null; }
  else it[field] = val === '' ? null : parseFloat(val);
  it.confirmed = true; it.c = 'high'; it.aiError = '';
  piRender();
}
function piConfirm(i) { const it = PI.items[i]; it.confirmed = true; it.c = 'high'; PI.editing = null; piRender(); }
function piToggleExclude(i) { const it = PI.items[i]; it.exclude = !it.exclude; it.deferred = false; piRender(); }
function piTab(t) { PI.tab = t; PI.editing = null; piRender(); }
function piReopenQuestions() {
  // re-ask anything still unsettled (incl. new flags from edits on the review screen)
  const st = piStatuses();
  PI.items.forEach(it => { const s = st.get(it); if (s[0] === 'look' && !PI.questions.some(q => q.it === it && !q.answer)) PI.questions.push({ kind: s[2], it }); });
  const any = PI.questions.findIndex(q => !q.answer);
  if (any < 0) { showToast('No open questions.'); return; }
  PI.qi = any; PI.step = 'questions'; piRender();
}

// ════════════════════════════
// SAVE
// ════════════════════════════
async function piSave() {
  const st = piStatuses(), plan = piPlan(st);
  const later = PI.items.filter(it => st.get(it)[0] === 'later' || st.get(it)[0] === 'look');
  if (!plan.rows.length && !later.length) { showToast('Nothing matched yet to save.'); return; }
  const lines = [`Save ${plan.rows.length} price${plan.rows.length === 1 ? '' : 's'} from ${PI.supplier}?`, '',
    `• ${plan.fresh} new`, `• ${plan.changed.length} changed from what you have now`, `• ${plan.same} the same as now`];
  if (plan.newFinishes.length) lines.push(`• New finishes: ${plan.newFinishes.map(r => r.slice(4)).join(', ')}`);
  if (later.length) lines.push(`• ${later.length} item${later.length === 1 ? '' : 's'} kept as open questions to finish later`);
  if (plan.changed.length) {
    lines.push('', 'Biggest changes:');
    plan.changed.slice().sort((a, b) => Math.abs(b.price - b.was) - Math.abs(a.price - a.was)).slice(0, 8)
      .forEach(r => lines.push(`  ${r.it.sku} ${piRefName(r.ref)}: ${piMoney(r.was)} → ${piMoney(r.price)}`));
  }
  if (!confirm(lines.join('\n'))) return;

  PI.step = 'saving'; piRender();
  const cols = ['price_overrides', 'custom_styles', 'supplier_skus', 'price_import_state'];
  let sel = await db.from('company_profiles').select(cols.join(', ')).eq('user_id', effectiveOwnerId).single();
  const missing = new Set();
  for (let tries = 0; sel.error && tries < 2; tries++) {   // columns from SQL that hasn't been run yet
    const m = cols.find(c => c !== 'price_overrides' && c !== 'custom_styles' && !missing.has(c) && (sel.error.message || '').includes(c));
    if (!m) break;
    missing.add(m);
    sel = await db.from('company_profiles').select(cols.filter(c => !missing.has(c)).join(', ')).eq('user_id', effectiveOwnerId).single();
  }
  if (sel.error && sel.error.code !== 'PGRST116') { showToast('Could not load your pricing: ' + sel.error.message); PI.step = 'review'; piRender(); return; }
  const cur = sel.data || {};

  // Finishes: create the new ones this import actually prices. A company still on the generic
  // defaults keeps them (existing projects may use them) — owner accounts keep the built-in catalog.
  const isOwnerAcct = OWNER_USER_IDS.includes(effectiveOwnerId);
  const styles = Array.isArray(cur.custom_styles) && cur.custom_styles.length ? cur.custom_styles.map(s => ({ ...s }))
    : (isOwnerAcct ? [] : DEFAULT_STYLES.map(s => ({ swatch: piDefaultSwatch(s.code), ...s })));
  const taken = new Set([...styles.map(s => s.code), ...(isOwnerAcct ? STYLES.map(s => s.code) : [])]);
  const names = new Set([...styles, ...(isOwnerAcct ? STYLES : [])].map(s => s.name.toLowerCase()));
  const refCode = {};
  const newRefs = [...new Set([...plan.newFinishes, ...later.flatMap(it => Object.keys(piItemPrices(it)).filter(r => r.startsWith('new:')))])];
  newRefs.forEach(ref => {
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
  if (!missing.has('supplier_skus')) row.supplier_skus = skus;
  if (!missing.has('price_import_state') && later.length) {
    const state = { ...(cur.price_import_state || {}) };
    const sups = { ...(state.suppliers || {}) };
    const sup = { ...(sups[PI.supplier] || {}) };
    const keep = (sup.pending || []).filter(p => !later.some(it => it.key === p.key));
    later.forEach(it => {
      const prices = {};
      Object.entries(piItemPrices(it)).forEach(([ref, p]) => { prices[refCode[ref] || ref] = p; });
      const alts = {};
      Object.entries(it.alts || {}).forEach(([src, list]) => (PI.targets[src] || []).forEach(ref => { alts[refCode[ref] || ref] = list.map(p => piRound(p * PI.multiplier)); }));
      keep.push({ key: it.key, sku: it.sku, desc: it.desc, issue: st.get(it)[1] && st.get(it)[0] === 'look' ? st.get(it)[1] : (piOpenQuestionText(it) || 'Skipped for now'),
        t: it.t, w: it.w, h: it.h, prices, alts, at: new Date().toISOString() });
    });
    sup.pending = keep.slice(0, 500);
    sups[PI.supplier] = sup;
    state.suppliers = sups;
    row.price_import_state = state;
  }
  const { data, error } = await db.from('company_profiles').upsert(row, { onConflict: 'user_id' }).select().single();
  if (error) { showToast('Could not save pricing: ' + error.message); PI.step = 'review'; piRender(); return; }
  companyProfile = data;
  if (typeof renderPfStyles === 'function') renderPfStyles(data.custom_styles || []);   // keep Company Settings in step
  PI.saved = { count: plan.rows.length, finishes: newRefs.length, later: later.length, skuColumn: !missing.has('supplier_skus'), stateColumn: !missing.has('price_import_state') };
  PI.step = 'done'; piRender();
  piRenderPending();
}
// The reason an item was skipped for now (its question's text)
function piOpenQuestionText(it) {
  const q = (PI.questions || []).find(x => x.it === it);
  if (!q) return '';
  return { size: 'Not a size or type the planner has', low: "The AI wasn't sure what this is", price: `Listed at prices more than $${PI_TOL} apart`,
    dup: 'Another code looks like the same cabinet', which: 'Two finish groups give this finish different prices', read: "The page reads didn't agree on this price", order: 'Price looks out of line with the other sizes' }[q.kind] || '';
}

// ════════════════════════════
// OPEN QUESTIONS (saved for later) — My Pricing tab
// ════════════════════════════
function piPendingList() {
  const sups = (companyProfile.price_import_state && companyProfile.price_import_state.suppliers) || {};
  return Object.entries(sups).flatMap(([supplier, s]) => (s.pending || []).map(p => ({ ...p, supplier })));
}
function piRenderPending() {
  const el = document.getElementById('pi-pending');
  if (!el) return;
  const list = piPendingList();
  if (!list.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
  const by = {};
  list.forEach(p => { by[p.supplier] = (by[p.supplier] || 0) + 1; });
  el.style.display = '';
  el.innerHTML = `<div class="card" style="padding:14px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-color:#fcd34d;background:#fffbeb;">
    <div style="flex:1;min-width:220px;font-size:13px;color:#78350f;"><b>Open price questions:</b> ${Object.entries(by).map(([s, n]) => `${esc(s)} (${n})`).join(', ')} — these items aren't priced yet.</div>
    <button class="btn btn-primary" style="font-size:12px;padding:7px 14px;" onclick="piOpenPending()">Answer them</button></div>`;
}
let PQ = null;
function piOpenPending() {
  if (myTeamRole !== 'owner') { showToast('Only the account owner can manage pricing.'); return; }
  PQ = { list: piPendingList(), i: 0 };
  if (!PQ.list.length) return;
  piEnsureModal();
  document.getElementById('pi-overlay').classList.add('open');
  PI = null;
  piRenderPendingCard();
}
function piRenderPendingCard() {
  const p = PQ.list[PQ.i];
  document.getElementById('pi-title').textContent = 'Open price questions';
  document.getElementById('pi-steps').innerHTML = `<span class="on">${PQ.i + 1} of ${PQ.list.length}</span>`;
  if (!p) { piClosePending(); return; }
  const ws = CABINET_WIDTHS[p.t] || [], hs = CABINET_HEIGHTS[p.t];
  const fin = companyFinishes();
  document.getElementById('pi-body').innerHTML = `
    <div class="pi-q"><div style="font-size:12px;color:var(--muted);">${esc(p.supplier)}</div>
    <div style="font-size:16px;font-weight:800;margin:2px 0;">${esc(p.sku)} <span style="font-weight:400;color:var(--muted);font-size:13px;">${esc(p.desc || '')}</span></div>
    <div class="pi-why" style="font-size:13px;margin-bottom:12px;">${esc(p.issue)}</div>
    <div class="pi-row"><label>Planner cabinet</label><div>${piTypeSelects(p, 'piPQSet')}</div></div>
    ${Object.entries(p.prices).map(([code, price]) => `<div class="pi-row"><label>${esc((fin.find(f => f.code === code) || {}).name || code)}</label><div>
      <input type="number" step="0.01" min="0" data-pq-code="${esc(code)}" value="${price}" style="width:120px;">
      ${(p.alts && p.alts[code] || []).filter(a => Math.abs(a - price) > 0.004).map(a => `<button class="pi-link" onclick="this.previousElementSibling.value='${a}'">use ${piMoney(a)}</button>`).join('')}</div></div>`).join('')}</div>`;
  document.getElementById('pi-foot').innerHTML = `<button class="btn btn-ghost" onclick="piPQLater()">Skip for now</button>
    <button class="btn btn-ghost" onclick="piPQResolve(false)">Leave it out</button>
    <button class="btn btn-primary" onclick="piPQResolve(true)">Save this price</button>`;
}
function piPQSet(field, val) {
  const p = PQ.list[PQ.i];
  if (field === 't') { p.t = val || null; if (!CABINET_HEIGHTS[val]) p.h = null; }
  else p[field] = val === '' ? null : parseFloat(val);
  // keep typed prices when the selects re-render
  const typed = {}; document.querySelectorAll('#pi-body [data-pq-code]').forEach(i => { typed[i.dataset.pqCode] = parseFloat(i.value); });
  Object.entries(typed).forEach(([c, v]) => { if (v > 0) p.prices[c] = v; });
  piRenderPendingCard();
}
function piPQLater() { PQ.i++; if (PQ.i >= PQ.list.length) piClosePending(); else piRenderPendingCard(); }
async function piPQResolve(save) {
  const p = PQ.list[PQ.i];
  const prices = {};
  document.querySelectorAll('#pi-body [data-pq-code]').forEach(i => { const v = parseFloat(i.value); if (v > 0) prices[i.dataset.pqCode] = piRound(v); });
  if (save) {
    if (!p.t || p.t === 'skip' || piSizeIssue(p)) { showToast('Pick a cabinet type and a size the planner uses.'); return; }
    if (!Object.keys(prices).length) { showToast('Type at least one price.'); return; }
  }
  const { data: cur, error: e1 } = await db.from('company_profiles').select('price_overrides, supplier_skus, price_import_state').eq('user_id', effectiveOwnerId).single();
  if (e1) { showToast('Could not load your pricing: ' + e1.message); return; }
  const row = { user_id: effectiveOwnerId, updated_at: new Date().toISOString() };
  if (save) {
    const sk = CABINET_HEIGHTS[p.t] ? `${p.w}x${p.h}` : `${p.w}`;
    const overrides = { ...(cur.price_overrides || {}) }, skus = { ...(cur.supplier_skus || {}) };
    overrides[p.t] = { ...(typeof overrides[p.t] === 'object' ? overrides[p.t] : {}) };
    overrides[p.t][sk] = { ...(overrides[p.t][sk] || {}), ...prices };
    skus[p.t] = { ...(skus[p.t] || {}) };
    skus[p.t][sk] = { ...(skus[p.t][sk] || {}), ...Object.fromEntries(Object.keys(prices).map(c => [c, p.sku])) };
    row.price_overrides = overrides; row.supplier_skus = skus;
  }
  const state = { ...(cur.price_import_state || {}) }, sups = { ...(state.suppliers || {}) };
  const sup = { ...(sups[p.supplier] || {}) };
  sup.pending = (sup.pending || []).filter(x => x.key !== p.key);
  sups[p.supplier] = sup; state.suppliers = sups; row.price_import_state = state;
  const { data, error } = await db.from('company_profiles').upsert(row, { onConflict: 'user_id' }).select().single();
  if (error) { showToast('Could not save: ' + error.message); return; }
  companyProfile = data;
  showToast(save ? `Saved ${p.sku}.` : `Left out ${p.sku}.`);
  PQ.list.splice(PQ.i, 1);
  piRenderPending();
  if (PQ.i >= PQ.list.length) piClosePending(); else piRenderPendingCard();
}
function piClosePending() {
  PQ = null;
  document.getElementById('pi-overlay').classList.remove('open');
  document.getElementById('pi-title').textContent = 'Import a supplier price list';
}

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
  .pi-prev td{white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
  .pi-prev tr.ttl td{font-weight:800;background:#fffbeb}
  .pi-row{display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:center;margin-bottom:10px;font-size:13px}
  .pi-row label{font-weight:600}
  #pi-overlay select,#pi-overlay input[type=text],#pi-overlay input[type=number]{padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:inherit;font-size:13px;background:var(--surface);color:var(--text)}
  .pi-chip{display:inline-flex;align-items:center;gap:6px;background:#f0fdfa;border:1px solid #99f6e4;color:#115e59;border-radius:99px;padding:3px 6px 3px 10px;margin:2px 4px 2px 0;font-size:12px;font-weight:600}
  .pi-chip.new{background:#fffbeb;border-color:#fcd34d;color:#92400e}
  .pi-chip button{border:none;background:none;cursor:pointer;color:inherit;font-size:13px;padding:0 2px}
  .pi-tabs{display:flex;gap:6px;margin:10px 0;flex-wrap:wrap}
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
  .pi-foot .sum{margin-right:auto;font-size:12px;color:var(--muted)}
  .pi-sheet{border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px}
  .pi-tbl{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12px;padding:6px 0;border-top:1px dashed var(--border)}
  .pi-opt{border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px}
  .pi-opt h5{font-size:13px;margin:0 0 6px}
  .pi-q .pi-row{grid-template-columns:160px 1fr}`;
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
  document.getElementById('pi-title').textContent = 'Import a supplier price list';
  const steps = ['1 · Price list', '2 · Finishes', '3 · Questions', '4 · Review', '5 · Saved'];
  const at = { file: 0, loading: 0, reading: 0, triage: 0, pages: 0, readingPages: 0, columns: 1, matching: 2, questions: 2, review: 3, saving: 3, done: 4 }[PI.step];
  document.getElementById('pi-steps').innerHTML = steps.map((l, i) => `<span class="${i === at ? 'on' : ''}">${l}</span>`).join('');
  const body = document.getElementById('pi-body'), foot = document.getElementById('pi-foot');
  const cost = (PI.usage.calls && currentUser && currentUser.id === PI_ADMIN_ID) ? piCostText() : '';
  const fn = { file: piViewFile, loading: piViewProgress, triage: piViewProgress, readingPages: piViewProgress, pages: piViewPages, reading: piViewBusy, columns: piViewColumns, matching: piViewMatching, questions: piViewQuestion, review: piViewReview, saving: piViewBusy, done: piViewDone }[PI.step];
  const [b, f] = fn();
  body.innerHTML = b;
  foot.innerHTML = (cost ? `<span class="sum">${cost}</span>` : '') + f;
}
function piCostText() {
  const m = PI.usage.model || '', r = PI_RATES[Object.keys(PI_RATES).find(k => m.includes(k)) || 'haiku'];
  const usd = (PI.usage.input * r[0] + PI.usage.output * r[1]) / 1e6;
  return `AI use: ${PI.usage.calls} calls, about $${usd.toFixed(3)} (admin only)`;
}
// Type / width / height selects (manual fixes). `fn` is the setter's name; `arg` (optional)
// is passed first, e.g. the item index on the review table.
function piTypeSelects(it, fn, arg) {
  const ws = CABINET_WIDTHS[it.t] || [], hs = CABINET_HEIGHTS[it.t];
  const call = f => `${fn}(${arg != null ? arg + ',' : ''}'${f}',this.value)`;
  return `<select onchange="${call('t')}"><option value="">— cabinet type —</option>${CABINET_TYPES.map(t => `<option value="${t.key}" ${t.key === it.t ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}<option value="skip" ${it.t === 'skip' ? 'selected' : ''}>Not a cabinet (don't import)</option></select>
    ${it.t && it.t !== 'skip' ? `<select onchange="${call('w')}"><option value="">Width</option>${ws.map(w => `<option value="${w}" ${w === it.w ? 'selected' : ''}>${w}"</option>`).join('')}</select>` : ''}
    ${hs ? `<select onchange="${call('h')}"><option value="">Height</option>${hs.map(h => `<option value="${h}" ${h === it.h ? 'selected' : ''}>${h}"</option>`).join('')}</select>` : ''}`;
}

function piViewFile() {
  const sups = piSuppliers();
  const hasFile = PI.kind === 'pdf' ? PI.pages.length > 0 : !!PI.wb;
  const sheets = hasFile && PI.kind !== 'pdf' ? PI.wb.SheetNames : [];
  const prevGrid = hasFile ? PI.grids[PI.sheet] || [] : [];
  const prev = !hasFile ? '' : PI.kind === 'pdf' ? `
    <div style="font-size:12px;color:var(--muted);margin:10px 0 6px;"><b>${esc(PI.fileName)}</b> — ${PI.pages.length} page${PI.pages.length === 1 ? '' : 's'}: ${PI.pages.filter(p => p.text).length} with text (read exactly), ${PI.pages.filter(p => !p.text).length} scanned/pictures (read by the AI, twice)</div>
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;">${PI.pages.slice(0, 20).map(p => `<img src="${p.thumb}" alt="Page ${p.n}" style="height:110px;border:1px solid var(--border);border-radius:4px;">`).join('')}</div>` : `
    ${sheets.length > 1 ? `<div class="pi-row"><label>Sheets to import</label><div style="display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;">${sheets.map(n => `<label style="font-weight:400;white-space:nowrap;"><input type="checkbox" ${PI.use[n] ? 'checked' : ''} onchange="PI.use['${piJs(n)}']=this.checked;PI.sheet='${piJs(n)}';piRender()"> ${esc(n)} <span style="color:var(--muted);">(${PI.grids[n].length} rows)</span></label>`).join('')}</div></div>` : ''}
    <div style="font-size:12px;color:var(--muted);margin:10px 0 6px;">First rows of <b>${esc(PI.fileName)}</b>${sheets.length > 1 ? ` — ${esc(PI.sheet)}` : ''}</div>
    <div style="overflow:auto;max-height:230px;border:1px solid var(--border);border-radius:8px;"><table class="pi-grid pi-prev">${prevGrid.slice(0, 12).map(r => `<tr>${r.slice(0, 14).map(c => `<td title="${esc(c)}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
  return [`
    <p style="margin-bottom:14px;">Drop in your supplier's price list exactly as they sent it — Excel, CSV, PDF, or photos/screenshots of the pages. The AI works out the layout and what each item code is. Spreadsheet and text-PDF prices are read straight from the file; scanned pages are read twice and checked. Every question is asked before anything is saved, and you review it all at the end.</p>
    <div class="pi-row"><label for="pi-file">Price list file</label><div><input type="file" id="pi-file" multiple accept=".csv,.xls,.xlsx,.xlsm,.pdf,.jpg,.jpeg,.png,.webp" onchange="piLoadFile(this.files)">
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Pictures: pick all the pages at once (in page order).</div></div></div>
    <div class="pi-row"><label for="pi-supplier">Supplier</label><div><input type="text" id="pi-supplier" list="pi-sup-list" maxlength="40" value="${esc(PI.supplier)}" placeholder="e.g. Highland Cabinetry" style="width:260px;">
      <datalist id="pi-sup-list">${sups.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Finishes and prices are kept per supplier — importing another supplier never touches these.</div></div></div>
    <div class="pi-row"><label for="pi-mult">Price multiplier</label><div><input type="number" id="pi-mult" step="0.001" min="0.01" max="5" value="${PI.multiplier}" style="width:110px;">
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Leave at 1 when the list shows your cost. For a list/retail price where you pay, say, 42% of list, enter 0.42. Your markup is still added on quotes.</div></div></div>
    <div style="font-size:11px;color:var(--muted);">Privacy: the rows of this file are sent to our AI provider (Anthropic) to read them. They aren't used to train AI and we don't keep them after the import.</div>
    ${prev}`,
    `<button class="btn btn-ghost" onclick="piClose()">Cancel</button><button class="btn btn-primary" ${hasFile ? '' : 'disabled'} onclick="piReadLayout()">${PI.kind === 'pdf' ? 'Find the price pages →' : 'Read this price list →'}</button>`];
}
function piViewProgress() {
  const p = PI.progress || { done: 0, total: 1, what: '' };
  const title = { loading: 'Opening your file…', triage: 'Finding the price pages…', readingPages: 'Reading the prices — each scanned page twice…' }[PI.step];
  return [`<div style="padding:30px 10px;"><div style="font-size:14px;font-weight:700;">${title}</div>
    <div class="pi-bar"><div id="pi-progress" style="width:${Math.round(100 * p.done / Math.max(1, p.total))}%"></div></div>
    <div style="font-size:12px;color:var(--muted);" id="pi-progress-n">${esc(p.what)} — ${p.done} of ${p.total}</div>
    ${PI.step === 'readingPages' ? '<div style="font-size:12px;color:var(--muted);margin-top:10px;">Big catalogs take a few minutes. Keep this window open.</div>' : ''}</div>`, ''];
}
function piViewPages() {
  const used = PI.pages.filter(p => p.use), scans = used.filter(p => !p.text);
  const cost = scans.length * PI_PAGE_COST;
  const cards = PI.pages.map(p => `<div style="width:150px;border:2px solid ${p.use ? 'var(--accent)' : 'var(--border)'};border-radius:10px;padding:6px;background:${p.use ? '#f0fdfa' : 'var(--surface)'};">
      <img src="${p.thumb}" alt="Page ${p.n}" style="width:100%;border-radius:4px;display:block;cursor:pointer;${p.use ? '' : 'opacity:.45;'}" onclick="piTogglePage(${p.n})">
      <label style="display:flex;gap:6px;align-items:center;font-size:12px;font-weight:700;margin-top:4px;"><input type="checkbox" ${p.use ? 'checked' : ''} onchange="piTogglePage(${p.n})"> Page ${p.n}
        <span style="font-weight:400;color:var(--muted);">${p.text ? 'text' : 'scan'}</span></label>
      ${!p.text && p.use ? `<input type="text" value="${esc(p.group)}" placeholder="finish group" title="Which finishes this page prices" onchange="piSetPageGroup(${p.n},this.value)" style="width:100%;margin-top:4px;padding:4px 6px !important;font-size:11px !important;">` : ''}</div>`).join('');
  return [`
    <p style="margin-bottom:8px;"><b>${used.length}</b> of ${PI.pages.length} pages look like price pages and are ticked. Untick anything that isn't, or tick a page that was missed. For scanned pages, check the <b>finish group</b> under each (e.g. "Pricing Gold", "White Shaker") — it says which finishes the page's prices are for.</p>
    ${scans.length ? `<div class="pi-note">${scans.length} scanned page${scans.length === 1 ? '' : 's'}: each is read twice by the AI (a third time if the reads disagree), and any price that still differs by more than $${PI_TOL} becomes a question. Estimated AI cost: about $${cost < 1 ? cost.toFixed(2) : cost.toFixed(0)}.</div>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:10px;">${cards}</div>`,
    `<button class="btn btn-ghost" onclick="PI.step='file';piRender()">← Back</button><button class="btn btn-primary" ${used.length ? '' : 'disabled'} onclick="piReadPages()">Read ${used.length} page${used.length === 1 ? '' : 's'} →</button>`];
}

function piViewBusy() {
  const msg = PI.step === 'saving' ? 'Saving your prices…' : `Reading the layout of ${piUsedSheets().length > 1 ? piUsedSheets().length + ' sheets' : 'your price list'}…`;
  return [`<div style="padding:40px;text-align:center;color:var(--muted);font-size:14px;">${msg}</div>`, ''];
}
function piViewColumns() {
  const fin = piUsableFinishes();
  const finOpts = `<option value="">＋ Add finish…</option><optgroup label="Your finishes">${fin.map(f => `<option value="${esc(f.code)}">${esc(f.name)} · ${esc(f.code)}${f.supplier ? ' · ' + esc(f.supplier) : ''}</option>`).join('')}</optgroup><option value="__new">New finish…</option>`;
  const srcRows = piSources().map(src => `<tr><td><b>${esc(src.label)}</b><div style="font-size:11px;color:var(--muted);">${src.count} price${src.count === 1 ? '' : 's'}</div></td>
      <td>${(PI.targets[src.id] || []).map(ref => `<span class="pi-chip ${ref.startsWith('new:') ? 'new' : ''}">${esc(piRefLabel(ref))}<button title="Remove" aria-label="Remove" onclick="piRemoveTarget('${piJs(src.id)}','${piJs(ref)}')">×</button></span>`).join('') || '<span style="color:var(--muted);font-size:12px;">Not imported</span>'}
      <select onchange="piAddTarget('${piJs(src.id)}',this.value)" style="margin-left:4px;">${finOpts}</select></td></tr>`).join('');
  const sheetsHtml = piUsedSheets().map(name => {
    const L = PI.layouts[name], g = PI.grids[name];
    if (!L) return '';
    const ncols = Math.min(40, Math.max(1, ...g.slice(0, PI_SAMPLE_ROWS).map(r => r.length)));
    const hdr = L.headerRow == null ? [] : g[L.headerRow];
    const cn = c => `${piColName(c)}${piCell(hdr, c) ? ' · ' + piCell(hdr, c) : ''}`;
    const colOpts = (sel, none) => `${none ? '<option value="">— none —</option>' : ''}${Array.from({ length: ncols }, (_, c) => `<option value="${c}" ${sel === c ? 'selected' : ''}>${esc(cn(c))}</option>`).join('')}`;
    const tables = L.tables.map((T, ti) => `<div class="pi-tbl"><b>Table ${ti + 1}</b>
      Item code <select onchange="piLayoutSet('${piJs(name)}','skuCol',this.value,${ti})">${colOpts(T.skuCol)}</select>
      Description <select onchange="piLayoutSet('${piJs(name)}','descCol',this.value,${ti})">${colOpts(T.descCol, true)}</select>
      Finish column <select onchange="piLayoutSet('${piJs(name)}','finishCol',this.value,${ti})">${colOpts(T.finishCol, true)}</select>
      Prices: ${T.priceCols.map((p, pi) => `<span class="pi-chip">${piColName(p.col)} <input type="text" value="${esc(p.label)}" placeholder="label (optional)" style="width:110px;padding:2px 6px;font-size:11px;" onchange="piLayoutSet('${piJs(name)}','priceLabel',this.value,${ti},${pi})"><button title="Remove" onclick="piLayoutSet('${piJs(name)}','delPrice','',${ti},${pi})">×</button></span>`).join('')}
      <select onchange="piLayoutSet('${piJs(name)}','addPrice',this.value,${ti})"><option value="">＋ price column</option>${colOpts(null)}</select>
      <button class="pi-link" onclick="piLayoutSet('${piJs(name)}','delTable','',${ti})">Remove table</button></div>`).join('');
    const titles = L.candidates.slice(0, 80).map(c => `<label style="font-weight:400;display:inline-flex;gap:4px;margin:2px 12px 2px 0;font-size:12px;${c.on ? 'font-weight:700;' : 'color:var(--muted);'}"><input type="checkbox" ${c.on ? 'checked' : ''} onchange="piLayoutSet('${piJs(name)}','title',${c.row})"> Row ${c.row + 1}: ${esc(c.name.slice(0, 60))}</label>`).join('');
    const n = PI.rows.filter(x => x.sheet === name).length;
    return `<div class="pi-sheet">${piUsedSheets().length > 1 || PI.wb.SheetNames.length > 1 ? `<div style="font-weight:800;margin-bottom:6px;">Sheet: ${esc(name)}</div>` : ''}
      ${L.note ? `<div class="pi-note">${esc(L.note)}</div>` : ''}
      <div style="font-size:12px;margin-bottom:6px;">Found <b>${n}</b> price${n === 1 ? '' : 's'}. Heading row
        <select onchange="piLayoutSet('${piJs(name)}','headerRow',this.value)"><option value="">none</option>${g.slice(0, PI_SAMPLE_ROWS).map((r, i) => `<option value="${i}" ${L.headerRow === i ? 'selected' : ''}>Row ${i + 1}: ${esc(r.slice(0, 4).join(' | ').slice(0, 50))}</option>`).join('')}</select></div>
      ${tables || '<div class="pi-note">No item/price table found — add one.</div>'}
      <div style="margin:4px 0 8px;"><button class="pi-link" onclick="piLayoutSet('${piJs(name)}','addTable','')">＋ Add a table</button></div>
      <details ${L.candidates.some(c => c.on) ? 'open' : ''}><summary style="font-size:12px;font-weight:700;cursor:pointer;">Finish-group titles (rows that say which finishes the prices below are for)</summary>
        <div style="margin-top:6px;">${titles || '<span style="font-size:12px;color:var(--muted);">No text-only rows.</span>'}</div>
        <label style="font-weight:400;font-size:12px;display:block;margin-top:6px;"><input type="checkbox" ${L.sheetIsGroup ? 'checked' : ''} onchange="piLayoutSet('${piJs(name)}','sheetIsGroup',this.checked)"> The sheet name (“${esc(name)}”) is the finish group</label></details></div>`;
  }).join('');
  return [`
    <h4 style="font-size:14px;margin:0 0 6px;">Which finishes does each finish group go to?</h4>
    <p style="font-size:12px;margin-bottom:8px;">A group can price several finishes — e.g. "Blue, Hunter Green &amp; Arctic Shaker", or a tier like "Gold". When two groups price the same finish, the more specific one wins (e.g. "PR, PS" over "Gold"). Yellow = a new finish will be created under ${esc(PI.supplier)}.</p>
    <table class="pi-grid" style="margin-bottom:16px;"><thead><tr><th style="width:280px;">Finish group in the file</th><th>Saves as finish</th></tr></thead><tbody>${srcRows || '<tr><td colspan="2" style="color:var(--muted);">No prices found yet — check the layout below.</td></tr>'}</tbody></table>
    ${sheetsHtml ? `<details ${piSources().length ? '' : 'open'}><summary style="font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;">How the file is laid out (tables, columns, finish-group titles)</summary>${sheetsHtml}</details>` : ''}
    ${PI.kind === 'pdf' && PI.pages.some(p => p.read) ? `<div style="font-size:12px;color:var(--muted);">Scanned pages read: ${PI.pages.filter(p => p.read).map(p => `page ${p.n} (${p.read.length} prices${p.readCount > 2 ? ', 3 reads' : ''})`).join(', ')}. Wrong finish group on a page? Go back and fix it under the page.</div>` : ''}`,
    `<button class="btn btn-ghost" onclick="PI.step=PI.kind==='pdf'?'pages':'file';piRender()">← Back</button><button class="btn btn-primary" onclick="piMatchItems()">Match items →</button>`];
}
function piViewMatching() {
  return [`<div style="padding:30px 10px;"><div style="font-size:14px;font-weight:700;">Matching item codes to cabinet types and sizes…</div>
    <div class="pi-bar"><div id="pi-progress" style="width:${Math.round(100 * (PI.done || 0) / PI.items.length)}%"></div></div>
    <div style="font-size:12px;color:var(--muted);" id="pi-progress-n">${PI.done || 0} of ${PI.items.length}</div></div>`, ''];
}
function piViewQuestion() {
  const q = PI.questions[PI.qi];
  const total = PI.questions.length, left = piOpenQuestions().length;
  const head = `<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Question ${PI.qi + 1} of ${total} · ${left} still open. Nothing is saved until the review screen.</div>`;
  const nav = `<button class="btn btn-ghost" ${PI.qi ? '' : 'disabled'} onclick="piQBack()">← Back</button><button class="btn btn-ghost" onclick="PI.step='review';piRender()">Go to review</button>`;
  if (!q) return [head, nav];
  const answered = q.answer ? `<div class="pi-note" style="background:#f0fdfa;border-color:#99f6e4;color:#115e59;">Answered (${{ skipped: 'skipped for now', settled: 'settled by an earlier answer' }[q.answer] || q.answer + ' fix'}). You can change it below.</div>` : '';
  if (q.kind === 'style') {
    const like = companyFinishes().find(f => f.code === q.like) || {};
    const fin = piUsableFinishes();
    return [head + answered + `<div class="pi-q">
      <div style="font-size:16px;font-weight:800;margin-bottom:4px;">New finish “${esc(q.ref.slice(4))}” looks like your “${esc(like.name)}”</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px;">If they're the same door, its prices should go to your existing finish instead of creating a second one.</div>
      <div class="pi-opt"><h5>Suggested fix</h5><button class="btn btn-primary" onclick="piFixSuggested()">Use my “${esc(like.name)}”</button></div>
      <div class="pi-opt"><h5>Manual fix</h5><select onchange="piQStyleManual(this.value)"><option value="">Save as…</option>${fin.map(f => `<option value="${esc(f.code)}">${esc(f.name)} · ${esc(f.code)}</option>`).join('')}<option value="__new">A new finish with a different name…</option></select></div>
      <div class="pi-opt"><h5>Skip for now</h5><button class="btn btn-ghost" onclick="piAnswer('skipped')">Keep it as a new finish</button></div></div>`, nav];
  }
  const it = q.it, st = piStatuses().get(it);
  const prices = piItemPrices(it);
  const priceList = Object.entries(prices).map(([ref, p]) => `<span class="pi-price">${esc(piRefName(ref))} ${piMoney(p)}</span>`).join(' ');
  let issue = st[0] === 'look' ? st[1] : (st[1] || 'Settled.');
  let suggested = '', manual = '';
  if (q.kind === 'size' || q.kind === 'low') {
    suggested = q.kind === 'size'
      ? `<button class="btn btn-primary" onclick="piFixSuggested()">Leave it out of the planner's pricing</button><div style="font-size:11px;color:var(--muted);margin-top:6px;">The planner can't place this size, so a price for it would never be used.</div>`
      : `<button class="btn btn-primary" onclick="piFixSuggested()">Yes — it's a ${esc(piItemLabel(it))}</button>`;
    manual = `${piTypeSelects(it, 'piQSetType')} <button class="btn btn-ghost" style="margin-left:6px;" onclick="piQApplyType()">Use this</button>`;
  } else if (q.kind === 'price') {
    const parts = Object.entries(it.alts || {}).map(([src, list]) => {
      const sg = piSuggestAlt(it, src), label = (piSources().find(s => s.id === src) || {}).label || '';
      return { src, label, list, sg };
    });
    issue = `Listed more than once at different prices: ` + parts.map(p => `${p.label}: ${p.list.map(x => piMoney(x)).join(' / ')}`).join('; ');
    suggested = `<button class="btn btn-primary" onclick="piFixSuggested()">Use ${parts.map(p => piMoney(p.sg.price)).join(' / ')}</button><div style="font-size:11px;color:var(--muted);margin-top:6px;">${esc(parts.map(p => p.sg.why).join('; '))}</div>`;
    manual = parts.map(p => `<div style="margin-bottom:4px;">${esc(p.label)}: <input type="number" step="0.01" min="0" data-man-src="${esc(p.src)}" placeholder="price" style="width:110px;"></div>`).join('') + `<button class="btn btn-ghost" onclick="piQApplyPrice()">Use my price</button><div style="font-size:11px;color:var(--muted);margin-top:4px;">Type your actual cost.</div>`;
  } else if (q.kind === 'dup') {
    const list = PI.items.filter(x => x.t === it.t && x.t && piSizeKey(x) === piSizeKey(it) && piStatuses().get(x)[2] === 'dup');
    const w = piDupWinner(it);
    suggested = `<button class="btn btn-primary" onclick="piFixSuggested()">Keep ${esc(w.sku)} (the standard one)</button>`;
    manual = list.map(x => `<button class="btn btn-ghost" style="margin:0 6px 6px 0;" onclick="piQKeep(${x.i})">Keep ${esc(x.sku)} — ${esc(x.desc || '')} ${Object.values(piItemPrices(x)).slice(0, 1).map(p => piMoney(p)).join('')}</button>`).join('');
  } else if (q.kind === 'read') {
    const parts = Object.entries(it.readIssue).map(([src, ri]) => ({ src, ri, label: (piSources().find(x => x.id === src) || {}).label || '' }));
    const page = PI.pages.find(p => p.n === parts[0].ri.page);
    issue = parts.map(p => `${p.label}: ` + p.ri.reads.map((v, k) => `read ${k + 1} ${v == null ? 'missed it' : piMoney(v)}`).join(' · ')).join('; ');
    suggested = `<button class="btn btn-primary" onclick="piFixSuggested()">Use ${parts.map(p => piMoney(piReadSuggest(p.ri.reads))).join(' / ')}</button><div style="font-size:11px;color:var(--muted);margin-top:6px;">The higher reading, so a quote never comes in low — check it against the page.</div>`;
    manual = parts.map(p => `<div style="margin-bottom:4px;">${esc(p.label)}: <input type="number" step="0.01" min="0" data-man-src="${esc(p.src)}" placeholder="price on the page" style="width:140px;"></div>`).join('') + `<button class="btn btn-ghost" onclick="piQApplyPrice()">Use my price</button>`;
    if (page && (page.full || page.thumb)) manual += `<div style="margin-top:10px;"><a href="#" onclick="piShowPage(${page.n});return false;" style="font-size:12px;font-weight:700;color:var(--accent);">Open page ${page.n} to check ↗</a></div>`;
  } else if (q.kind === 'which') {
    const cf = piItemPriceInfo(it).conflicts;
    suggested = `<button class="btn btn-primary" onclick="piFixSuggested()">Use the higher price${cf.length > 1 ? 's' : ''}</button><div style="font-size:11px;color:var(--muted);margin-top:6px;">So a quote never comes in low.</div>`;
    manual = cf.map(c => `<div style="margin-bottom:6px;"><b>${esc(piRefName(c.ref))}:</b> ${c.opts.map(o => `<button class="btn btn-ghost" style="margin:2px 4px;" onclick="piQPrefer('${piJs(c.ref)}','${piJs(o.src)}')">${esc((piSources().find(x => x.id === o.src) || {}).label || '')} — ${piMoney(o.cost)}</button>`).join('')}</div>`).join('');
  } else if (q.kind === 'order') {
    const os = st[3] || [];
    // one price box per finish group that's out of line (a group can feed several finishes)
    const srcs = [...new Set(os.map(o => Object.keys(it.prices).find(sid => (PI.targets[sid] || []).includes(o.ref))).filter(Boolean))];
    suggested = `<button class="btn btn-primary" onclick="piFixSuggested()">Keep the price list's price${srcs.length > 1 ? 's' : ''}</button><div style="font-size:11px;color:var(--muted);margin-top:6px;">Worth a quick check with the supplier — it may be a typo.</div>`;
    manual = srcs.map(sid => `<div style="margin-bottom:4px;">${esc((piSources().find(x => x.id === sid) || {}).label || '')}: <input type="number" step="0.01" min="0" data-man-src="${esc(sid)}" placeholder="price" style="width:110px;"></div>`).join('') + `<button class="btn btn-ghost" onclick="piQApplyPrice()">Use my price</button>`;
  }
  return [head + answered + `<div class="pi-q">
    <div style="font-size:12px;color:var(--muted);">${esc(it.where)}</div>
    <div style="font-size:16px;font-weight:800;margin:2px 0;">${esc(it.sku)} <span style="font-weight:400;color:var(--muted);font-size:13px;">${esc(it.desc || '')}</span></div>
    <div style="font-size:12px;margin-bottom:6px;">${it.t ? 'Read as: <b>' + esc(piItemLabel(it)) + '</b>' + (it.v ? ` (${esc(it.v)})` : '') : ''} ${priceList ? '· ' + priceList : ''}</div>
    <div class="pi-why" style="font-size:13px;margin-bottom:14px;">${esc(issue)}</div>
    <div class="pi-opt"><h5>Suggested fix</h5>${suggested}</div>
    <div class="pi-opt"><h5>Manual fix</h5>${manual}</div>
    <div class="pi-opt"><h5>Skip for now</h5><button class="btn btn-ghost" onclick="piFixSkip()">Skip for now</button><span style="font-size:11px;color:var(--muted);margin-left:8px;">Not priced yet — saved as an open question you can finish later from My Pricing.</span></div></div>`, nav];
}
function piViewReview() {
  const st = piStatuses(), plan = piPlan(st);
  const by = { ok: [], look: [], skip: [], later: [] };
  PI.items.forEach(it => by[st.get(it)[0]].push(it));
  const tabs = [['ok', 'Matched'], ['look', 'Needs a look'], ['later', 'Open questions'], ['skip', 'Skipped']];
  const list = by[PI.tab] || [];
  const LIMIT = 400;
  const rows = list.slice(0, LIMIT).map(it => {
    const [s, why] = st.get(it);
    const editing = PI.editing === it.i;
    const priceHtml = Object.entries(piItemPrices(it)).map(([ref, p]) => {
      const was = (it.t && it.t !== 'skip' && !ref.startsWith('new:')) ? piExisting(it.t, piSizeKey(it), ref) : null;
      const chg = was != null && Math.abs(was - p) > 0.004 ? ` <span class="${p > was ? 'pi-up' : 'pi-down'}">(was ${piMoney(was)})</span>` : '';
      return `<span class="pi-price">${esc(piRefName(ref))} ${piMoney(p)}${chg}</span>`;
    }).join('<br>');
    const mapCell = editing ? piTypeSelects(it, 'piSetItem', it.i) : esc(piItemLabel(it));
    const acts = [];
    if (s === 'look') acts.push(`<button class="pi-link" onclick="piReopenQuestions()">Answer</button>`);
    if (!editing && s !== 'look') acts.push(`<button class="pi-link" onclick="piEdit(${it.i})">Edit</button>`);
    if (editing) acts.push(`<button class="pi-link" onclick="piConfirm(${it.i})">Done</button>`);
    acts.push(`<button class="pi-link" onclick="piToggleExclude(${it.i})">${it.exclude || it.deferred ? 'Include' : 'Leave out'}</button>`);
    return `<tr><td><b>${esc(it.sku)}</b><div style="font-size:11px;color:var(--muted);max-width:240px;">${esc(it.desc)}</div></td>
      <td>${mapCell}${why ? `<div class="pi-why">${esc(why)}</div>` : ''}</td><td>${priceHtml || '—'}</td><td style="white-space:nowrap;">${acts.join('')}</td></tr>`;
  }).join('');
  const open = piOpenQuestions().length + by.look.length;
  const sum = `<b>${plan.rows.length}</b> price${plan.rows.length === 1 ? '' : 's'} ready: ${plan.fresh} new, <span class="${plan.changed.length ? 'pi-up' : ''}">${plan.changed.length} changed</span>, ${plan.same} unchanged${plan.newFinishes.length ? ` · ${plan.newFinishes.length} new finish${plan.newFinishes.length === 1 ? '' : 'es'}` : ''}${PI.multiplier !== 1 ? ` · price × ${PI.multiplier}` : ''}`;
  return [`
    <div style="font-size:13px;">${sum}. Only <b>Matched</b> items are priced; <b>Open questions</b> are saved to finish later.</div>
    ${by.look.length ? `<div class="pi-note" style="margin-top:8px;">${by.look.length} item${by.look.length === 1 ? '' : 's'} still need${by.look.length === 1 ? 's' : ''} an answer — <button class="pi-link" onclick="piReopenQuestions()">answer them</button>, or they'll be kept as open questions.</div>` : ''}
    <div class="pi-tabs">${tabs.map(([k, l]) => `<button class="${PI.tab === k ? 'on' : ''}" onclick="piTab('${k}')">${l} (${by[k].length})</button>`).join('')}</div>
    <table class="pi-grid"><thead><tr><th>Item code</th><th>Planner cabinet</th><th>Price per finish (your cost)</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" style="color:var(--muted);padding:18px;">None.</td></tr>`}</tbody></table>
    ${list.length > LIMIT ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">Showing the first ${LIMIT} of ${list.length}.</div>` : ''}`,
    `<button class="btn btn-ghost" onclick="PI.step='columns';piRender()">← Finishes</button>${open ? `<button class="btn btn-ghost" onclick="piReopenQuestions()">Questions (${open})</button>` : ''}<button class="btn btn-primary" ${plan.rows.length || by.later.length || by.look.length ? '' : 'disabled'} onclick="piSave()">Save ${plan.rows.length} price${plan.rows.length === 1 ? '' : 's'}</button>`];
}
function piViewDone() {
  const s = PI.saved;
  return [`<div style="padding:24px 4px;font-size:14px;line-height:1.7;">
    ✅ Saved <b>${s.count}</b> price${s.count === 1 ? '' : 's'} from <b>${esc(PI.supplier)}</b>${s.finishes ? ` and added ${s.finishes} finish${s.finishes === 1 ? '' : 'es'}` : ''}.<br>
    New quotes use these prices right away (with your markup added). ${s.finishes ? 'You can set the color of new finishes in Company Settings → Door Styles / Finishes.' : ''}
    ${s.later ? `<br>${s.later} open question${s.later === 1 ? '' : 's'} ${s.stateColumn ? 'saved — finish them any time from My Pricing.' : "couldn't be saved yet (run supabase-price-import-2.sql)."}` : ''}
    ${s.skuColumn ? '' : '<div class="pi-note" style="margin-top:12px;">Supplier item codes weren\'t saved — the database update for them (supabase-price-import.sql) hasn\'t been run yet.</div>'}</div>`,
    `<button class="btn btn-primary" onclick="piClose()">Done</button>`];
}
