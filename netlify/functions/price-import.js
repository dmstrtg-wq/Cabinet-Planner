/**
 * AI price-list import (Build Plan 5.8). Reads a supplier's price list the way the supplier
 * sent it and suggests how each line maps onto the planner's cabinet types and sizes.
 *
 * POST /.netlify/functions/price-import
 * Headers: Authorization: Bearer <supabase-access-token>
 * Body: { importId, step: 'structure', sheet, rows: [[cell,…],…], textRows: [{row,text}] } → tables, columns, finish groups
 *    or { importId, step: 'map', header: [..], items: [{ i, sku, desc, extra }] } → type/size per item
 *
 * What this function deliberately does NOT do:
 *   • it never sees or returns prices as answers — the browser reads prices straight from the
 *     file, so an AI mistake can only mis-file a row (which the review screen shows), never
 *     invent a number;
 *   • it never writes pricing — nothing is saved until the user confirms the review screen,
 *     and that save goes through the user's own row-level access like every other setting;
 *   • the Anthropic key stays here (Netlify env var), never in the browser.
 *
 * Gating: Silver or Gold, checked against the caller's own company_profiles row (team members
 * have their own free-tier row, so only account owners get through — same as the upload button).
 * Limits: IMPORTS_PER_DAY distinct imports and CALLS_PER_DAY calls per account per 24h, size caps
 * on every request, and every call is logged to price_import_log (no price data, just counts).
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
 *   optional: PRICE_IMPORT_MODEL (default claude-haiku-4-5-20251001)
 */

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const MODEL = process.env.PRICE_IMPORT_MODEL || 'claude-haiku-4-5-20251001';

const IMPORTS_PER_DAY = 10;
const CALLS_PER_DAY = 400;
const MAX_BODY = 200 * 1024;
const MAX_STRUCT_ROWS = 45, MAX_COLS = 40, MAX_CELL = 60;
const MAX_MAP_ITEMS = 30;
// Netlify cuts a normal function off at ~10s; stop the AI call first so we can answer cleanly
// and the browser can retry with a smaller batch.
const AI_TIMEOUT_MS = 9000;

// Cabinet types the planner prices — keys must match CABINET_TYPES in profile.html.
const TYPES = {
  base:         'Base cabinet, door(s) and usually one top drawer. SKUs like B12, B15, B36, "Base 1 door 1 drawer".',
  drawerBase:   'Drawer base, all drawers. SKUs like DB18, 3DB18, DB24-3. The 3-drawer base is the standard one (v empty); 2- or 4-drawer versions (2DB24, 4DB18) get v "2 drawer" / "4 drawer".',
  sink:         'Sink base. SKUs like SB30, SB36. Farmhouse/apron sink bases (FSB36, ASB33) are type sink with v "farmhouse".',
  cornerBase:   'Blind corner base. SKUs like BBC36, BLB39, BCB42, "Blind base corner".',
  lazysusan:    'Lazy susan / corner base with turntable. SKUs like LS33, LS36, LSB36, BLS33, BLS36 (Base Lazy Susan).',
  vanity:       'Bathroom vanity base. SKUs like V24, V30, VSB2421 / VSB36 (vanity sink base, the standard one), VDB (vanity drawer base: v "drawers"), VSD (vanity sink + drawers combo: v "combo").',
  wall:         'Standard wall (upper) cabinet, width AND height. SKUs like W1530 (15 wide 30 high), W3036, W3012, W3615.',
  diagWall:     'Diagonal corner wall cabinet, width AND height. SKUs like WDC2430, DCW2436, WDC243012 (24 wide 30 high 12 deep). Glass-door versions (WDCG…) are skip.',
  tall:         'Pantry / utility tall cabinet, width AND height. SKUs like U1884, UT2490, PC1896.',
  ovenTall:     'Tall oven cabinet, width AND height. SKUs like OC3384, OV3090.',
  mwDrawerBase: 'Base cabinet for a microwave drawer. SKUs like MDB24, MWDB30.',
  linenTall:    'Linen tower / tall vanity storage, width AND height. SKUs like LC1884, LT1890.',
  mediaBase:    'Media / entertainment base, width AND height.',
  openTall:     'Open bookcase (no doors), width AND height.',
  locker:       'Mudroom locker unit, width AND height.',
  bench:        'Bench seat base.',
  fridgePanel:  'Refrigerator end panel / tall end panel (REP, FEP, "refrigerator end panel"). Width is the panel thickness 0.75.',
  filler3:      'Filler strip 3 inches wide (BF3, WF3x30, F3, "3 inch filler"). Width 3.',
  filler6:      'Filler strip 6 inches wide (BF6, WF6x42, F6). Width 6.',
  skip:         'Anything else: moulding, trim, crown, toe kick, light rail, hardware, accessories, roll-outs, inserts, glass, decorative panels, skins, shelves, valances, modifications, freight, or a line you cannot read with confidence.',
};
const HEIGHT_TYPES = ['wall', 'tall', 'ovenTall', 'linenTall', 'mediaBase', 'openTall', 'locker', 'diagWall'];

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'AI import is not set up yet (missing ANTHROPIC_API_KEY).' });
  if ((event.body || '').length > MAX_BODY) return json(413, { error: 'Request too large.' });

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Missing auth token' });
  const { data: authData, error: authError } = await db.auth.getUser(authHeader.slice(7));
  if (authError || !authData?.user) return json(401, { error: 'Invalid or expired session' });
  const userId = authData.user.id;

  let body;
  try { body = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid JSON' }); }
  const importId = clip(body.importId, 64);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(importId)) return json(400, { error: 'Missing import id' });
  if (!['structure', 'map'].includes(body.step)) return json(400, { error: 'Unknown step' });

  // Silver + Gold only (Dan, 2026-10-05)
  const { data: profile } = await db.from('company_profiles').select('subscription_tier').eq('user_id', userId).single();
  if (!['silver', 'gold'].includes(profile?.subscription_tier || 'free')) {
    return json(403, { error: 'AI price-list import is available on the Silver and Gold plans.' });
  }

  // Rate limits, per account, rolling 24 hours
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent, error: logErr } = await db.from('price_import_log')
    .select('import_id').eq('user_id', userId).gte('created_at', since);
  if (logErr) return json(500, { error: 'Import log unavailable (has supabase-price-import.sql been run?)' });
  const imports = new Set((recent || []).map(r => r.import_id));
  if (!imports.has(importId) && imports.size >= IMPORTS_PER_DAY) {
    return json(429, { error: `You've reached ${IMPORTS_PER_DAY} price-list imports in the last 24 hours. Try again tomorrow.` });
  }
  if ((recent || []).length >= CALLS_PER_DAY) return json(429, { error: 'Too many requests today. Try again tomorrow.' });

  let req;
  try { req = body.step === 'structure' ? structureRequest(body) : mapRequest(body); }
  catch (e) { return json(400, { error: e.message }); }

  let res, ok = false, usage = {};
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), AI_TIMEOUT_MS);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: req.maxTokens, system: req.system,
        tools: [req.tool], tool_choice: { type: 'tool', name: req.tool.name },
        messages: [{ role: 'user', content: req.prompt }] }),
    });
    clearTimeout(timer);
    const out = await r.json();
    usage = out.usage || {};
    if (!r.ok) throw new Error(out?.error?.message || `AI error ${r.status}`);
    const call = (out.content || []).find(c => c.type === 'tool_use');
    if (!call) throw new Error('AI gave no answer');
    res = req.clean(call.input);
    ok = true;
  } catch (e) {
    res = { error: e.name === 'AbortError' ? 'timeout' : (e.message || 'AI error') };
  }

  await db.from('price_import_log').insert({
    user_id: userId, import_id: importId, step: body.step, model: MODEL,
    items: req.count, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0, ok,
  });

  if (!ok) return json(res.error === 'timeout' ? 504 : 502, res);
  return json(200, { ...res, usage: { input: usage.input_tokens || 0, output: usage.output_tokens || 0, model: MODEL } });
};

// ── Step 1: the layout of one sheet/page — its tables, columns and finish groups ──
// A supplier list can have several tables side by side (HCI: three item/price pairs per page),
// one price column per finish or price group (Matrix: "Gold | PR, PS"), a finish column
// (one row per finish), and title rows naming the finish group the prices below apply to
// ("BLUE, HUNTER GREEN & ARCTIC SHAKER", "Pricing Gold").
function structureRequest(body) {
  if (!Array.isArray(body.rows) || !body.rows.length) throw new Error('No rows sent');
  const rows = body.rows.slice(0, MAX_STRUCT_ROWS).map(r => (Array.isArray(r) ? r : []).slice(0, MAX_COLS).map(c => clip(c, MAX_CELL)));
  const textRows = (Array.isArray(body.textRows) ? body.textRows : []).slice(0, 200)
    .map(t => ({ row: Number.isInteger(t.row) ? t.row : -1, text: clip(t.text, 80) })).filter(t => t.row >= 0 && t.text);
  const sheet = clip(body.sheet, 60);
  const ncols = Math.max(...rows.map(r => r.length));
  const grid = rows.map((r, i) => `${i}: ` + r.map((c, j) => c ? `[${j}] ${c}` : '').filter(Boolean).join(' | ')).join('\n');
  const intOrNull = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
  return {
    count: rows.length,
    maxTokens: 1500,
    system: 'You read the first rows of a kitchen cabinet supplier\'s price list and describe its layout. ' +
      'Answer only through the tool. Use null when a column does not exist. Never guess prices.',
    prompt: (sheet ? `Sheet name: ${sheet}\n` : '') +
      'First rows (each line is "row: [column] value | …"; empty cells left out):\n' + grid +
      (textRows.length ? '\n\nRows further down that have no prices (row: text) — some may be finish-group titles:\n' + textRows.map(t => `${t.row}: ${t.text}`).join('\n') : '') +
      '\n\nDescribe the layout:\n' +
      '- headerRow: row holding column names, or null.\n' +
      '- tables: one entry per item/price table, listed ONCE by its columns even if the same columns repeat under ' +
      'every finish group further down. Several tables can sit side by side, each with its own item-code ' +
      'column (SKU like B15, W3030, DB18) and price column(s). For each: skuCol, descCol, widthCol/heightCol if separate, ' +
      'priceCols (every price column of that table; label = the finish / door style / price group named in its header, ' +
      'e.g. "Gold", "PR, PS", "White" — empty string if the header just says Price/Cost/Net or there is none, and ' +
      'empty when the finish comes from a title row instead), and ' +
      'finishCol if a column says which finish each row is for.\n' +
      '- groupTitles: rows that name the finish(es), door style(s), collection or price tier the prices BELOW them apply to ' +
      '(e.g. "WHITE SHAKER", "BLUE, HUNTER GREEN & ARCTIC SHAKER", "Pricing Gold"). Give the row and the name as written. ' +
      'Section headings that name a cabinet category ("WALL CABINETS", "BASE CABINETS", "ACCESSORIES", "Glass Doors") are NOT finish groups.\n' +
      '- sheetIsGroup: true if the sheet name itself is the finish/door style the whole sheet prices.\n' +
      '- notes: one short sentence on anything a person should check.',
    tool: {
      name: 'describe_layout',
      description: 'Describe the price list layout.',
      input_schema: {
        type: 'object',
        properties: {
          headerRow: intOrNull,
          tables: { type: 'array', items: { type: 'object', properties: {
            skuCol: { type: 'integer' }, descCol: intOrNull, widthCol: intOrNull, heightCol: intOrNull, finishCol: intOrNull,
            priceCols: { type: 'array', items: { type: 'object', properties: { col: { type: 'integer' }, label: { type: 'string' } }, required: ['col'] } },
          }, required: ['skuCol', 'priceCols'] } },
          groupTitles: { type: 'array', items: { type: 'object', properties: { row: { type: 'integer' }, name: { type: 'string' } }, required: ['row', 'name'] } },
          sheetIsGroup: { type: 'boolean' },
          notes: { type: 'string' },
        },
        required: ['tables'],
      },
    },
    clean(x) {
      const col = v => (Number.isInteger(v) && v >= 0 && v < Math.max(ncols, MAX_COLS)) ? v : null;
      const okRows = new Set([...rows.map((_, i) => i), ...textRows.map(t => t.row)]);
      return {
        headerRow: Number.isInteger(x.headerRow) && x.headerRow >= 0 && x.headerRow < rows.length ? x.headerRow : null,
        tables: (Array.isArray(x.tables) ? x.tables : []).filter(t => col(t.skuCol) != null).slice(0, 12).map(t => ({
          skuCol: t.skuCol, descCol: col(t.descCol), widthCol: col(t.widthCol), heightCol: col(t.heightCol), finishCol: col(t.finishCol),
          priceCols: (Array.isArray(t.priceCols) ? t.priceCols : []).filter(p => col(p.col) != null && p.col !== t.skuCol).slice(0, 20)
            .map(p => ({ col: p.col, label: clip(p.label, 60) })),
        })).filter(t => t.priceCols.length),
        groupTitles: (Array.isArray(x.groupTitles) ? x.groupTitles : []).filter(g => okRows.has(g.row)).slice(0, 100)
          .map(g => ({ row: g.row, name: clip(g.name, 80) })).filter(g => g.name),
        sheetIsGroup: !!x.sheetIsGroup,
        notes: clip(x.notes, 300),
      };
    },
  };
}

// ── Step 2: what each item code is (type + width + height), in small batches ──
function mapRequest(body) {
  if (!Array.isArray(body.items) || !body.items.length) throw new Error('No items sent');
  if (body.items.length > MAX_MAP_ITEMS) throw new Error(`At most ${MAX_MAP_ITEMS} items per request`);
  const items = body.items.map(it => ({ i: Number.isInteger(it.i) ? it.i : -1, sku: clip(it.sku, 60), desc: clip(it.desc, 160), extra: clip(it.extra, 120) }));
  const header = (Array.isArray(body.header) ? body.header : []).slice(0, MAX_COLS).map(h => clip(h, 40)).filter(Boolean);
  const typeList = Object.entries(TYPES).map(([k, d]) => `- ${k}: ${d}`).join('\n');
  const lines = items.map(it => `${it.i}\t${it.sku}\t${it.desc}${it.extra ? '\t' + it.extra : ''}`).join('\n');
  return {
    count: items.length,
    maxTokens: 2000,
    system: 'You classify kitchen and bath cabinet supplier item codes for a cabinet design app. ' +
      'Answer only through the tool. Sizes are in inches. Be conservative: a wrong match puts a wrong price on a ' +
      'customer quote, so use "skip" or confidence "low" whenever you are not sure.',
    prompt: 'Planner cabinet types:\n' + typeList +
      '\n\nRules:\n' +
      '- Standard SKU codes read prefix + width (+ height for wall/tall types): W3030 = 30 wide x 30 high, U1884 = 18 x 84, B15 = 15 wide.\n' +
      '- Give h (height) only for: ' + HEIGHT_TYPES.join(', ') + '. Otherwise h = null.\n' +
      '- Variants of a size (left/right hinge, butt doors, full-height door, 1 vs 2 drawers, deeper/shallower versions, ' +
      'glass-ready) still map to the same type and size; put the variant in "v" (e.g. "full height door", "24 deep"). Leave v empty for the plain standard item.\n' +
      '- Wall cabinets that are not 12" deep (e.g. 24" deep refrigerator walls W3624X24) are type wall with v "24 deep".\n' +
      '- c = "high" only when the code or description clearly states the type and size; otherwise "low".\n' +
      (header.length ? '\nColumn names in this file: ' + header.join(' | ') + '\n' : '') +
      '\nItems (index, item code, description, other columns):\n' + lines,
    tool: {
      name: 'classify_items',
      description: 'Classify every item, one entry per index.',
      input_schema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object', properties: {
            i: { type: 'integer' },
            t: { type: 'string', enum: Object.keys(TYPES) },
            w: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            h: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            v: { type: 'string' },
            c: { type: 'string', enum: ['high', 'low'] },
          }, required: ['i', 't', 'c'] } },
        },
        required: ['items'],
      },
    },
    clean(x) {
      const valid = new Set(items.map(it => it.i));
      const num = v => (typeof v === 'number' && isFinite(v) && v > 0 && v < 200) ? v : null;
      return {
        items: (Array.isArray(x.items) ? x.items : []).filter(m => valid.has(m.i) && TYPES[m.t]).map(m => ({
          i: m.i, t: m.t, w: num(m.w), h: HEIGHT_TYPES.includes(m.t) ? num(m.h) : null,
          v: clip(m.v, 60), c: m.c === 'high' ? 'high' : 'low',
        })),
      };
    },
  };
}
