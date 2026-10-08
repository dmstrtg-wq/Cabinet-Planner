// My Cabinet Planner — js/pricelists.js
// "Your price lists" (My Pricing tab, Dan 2026-10-08): every supplier price list the account has
// loaded, with View (price table), Download (our template, filled in — edit in Excel and upload
// back), Replace (re-import that supplier; the new list replaces the old one entirely) and
// Delete (its prices, item codes, open questions and the finishes its import created).
// Loaded by profile.html after priceimport.js (classic script, shared globals).
//
// Which prices belong to which supplier: imports from 2026-10-08 on record the finish codes they
// priced (price_import_state.suppliers[name].codes). Older imports didn't — for those, a supplier
// owns the finishes tagged with its name, its MSRP finishes, and (when it's the account's only
// supplier) every finish that has one of its item codes saved.

function plOwnership(cp) {
  cp = cp || companyProfile || {};
  const styles = Array.isArray(cp.custom_styles) ? cp.custom_styles : [];
  const state = (cp.price_import_state && cp.price_import_state.suppliers) || {};
  const pb = (cp.quote_settings || {}).priceBasis || {};
  const names = new Set([...Object.keys(state), ...styles.map(s => s.supplier).filter(Boolean),
    ...Object.values(pb).map(b => b && b.supplier).filter(Boolean)]);
  const tagged = {};
  styles.forEach(s => { if (s.supplier) (tagged[s.supplier] = tagged[s.supplier] || new Set()).add(s.code); });
  const taggedAny = new Set(styles.filter(s => s.supplier).map(s => s.code));
  const skuCodes = new Set();
  Object.values(cp.supplier_skus || {}).forEach(t => Object.values(t || {}).forEach(sz => Object.keys(sz || {}).forEach(c => skuCodes.add(c))));
  return [...names].map(name => {
    const rec = state[name] || {};
    const codes = new Set([...(rec.codes || []), ...(tagged[name] || [])]);
    Object.entries(pb).forEach(([c, b]) => { if (b && b.supplier === name) codes.add(c); });
    if (!rec.codes && names.size === 1) skuCodes.forEach(c => { if (!taggedAny.has(c) || (tagged[name] || new Set()).has(c)) codes.add(c); });
    return { name, codes, created: [...(tagged[name] || [])], pending: (rec.pending || []).length,
      importedAt: rec.importedAt || null, fileName: rec.fileName || '' };
  });
}
// Every saved price for the given finish codes: [{ t, sk, c, p, sku }]
function plCells(cp, codes) {
  const out = [], skus = cp.supplier_skus || {};
  Object.entries(cp.price_overrides || {}).forEach(([t, sizes]) => {
    if (!sizes || typeof sizes !== 'object') return;
    Object.entries(sizes).forEach(([sk, by]) => {
      if (!by || typeof by !== 'object') return;
      Object.entries(by).forEach(([c, p]) => { if (codes.has(c)) out.push({ t, sk, c, p: parseFloat(p), sku: ((skus[t] || {})[sk] || {})[c] || '' }); });
    });
  });
  return out;
}
// The lists shown: one per supplier, plus prices that aren't any supplier's (price sheet / typed)
function plLists(cp) {
  cp = cp || companyProfile || {};
  const lists = plOwnership(cp);
  const owned = new Set(lists.flatMap(l => [...l.codes]));
  const other = new Set();
  plCells(cp, { has: () => true }).forEach(x => { if (!owned.has(x.c)) other.add(x.c); });
  if (other.size) lists.push({ name: '', other: true, codes: other, created: [], pending: 0 });
  return lists.map(l => ({ ...l, cells: plCells(cp, l.codes) })).filter(l => l.cells.length || l.pending || l.created.length);
}
const plFinishName = code => ((companyFinishes().find(f => f.code === code)) || {}).name || code;
const plTitle = l => l.other ? 'Your price sheet / other prices' : l.name;
const plKey = l => l.other ? '' : l.name;

function plRender() {
  const el = document.getElementById('pl-lists'); if (!el) return;
  const lists = plLists();
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  el.innerHTML = `<div class="section-head"><div class="section-title">Your Price Lists</div></div>
    <div class="card" style="padding:4px 18px;">${lists.length ? lists.map((l, i) => {
      const fins = [...new Set(l.cells.map(x => x.c))];
      const bits = [`${fins.length} finish${fins.length === 1 ? '' : 'es'}`, `${l.cells.length.toLocaleString()} price${l.cells.length === 1 ? '' : 's'}`];
      if (l.importedAt) bits.push('imported ' + fmtDate(l.importedAt));
      if (l.pending) bits.push(`${l.pending} open question${l.pending === 1 ? '' : 's'}`);
      return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 0;${i ? 'border-top:1px solid var(--border);' : ''}">
        <div style="flex:1;min-width:220px;"><div style="font-weight:700;font-size:14px;">${esc(plTitle(l))}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${bits.join(' · ')}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(fins.slice(0, 8).map(plFinishName).join(', '))}${fins.length > 8 ? ` and ${fins.length - 8} more` : ''}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-ghost" style="font-size:12px;padding:6px 12px;" onclick="plView(${i})">View</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:6px 12px;" onclick="plDownload(${i})">Download</button>
          ${l.other ? '' : `<button class="btn btn-ghost" style="font-size:12px;padding:6px 12px;" onclick="plReplace(${i})">Replace</button>`}
          <button class="btn btn-ghost" style="font-size:12px;padding:6px 12px;color:#b91c1c;" onclick="plAskDelete(${i})">Delete</button></div>
      </div>`; }).join('')
      : '<div style="padding:14px 0;font-size:13px;color:var(--muted);">No prices loaded yet. Fill in our price sheet or import your supplier\'s list below, and it will show up here.</div>'}</div>`;
  el.style.display = '';
}

function plModal(html, wide) {
  let el = document.getElementById('pl-modal');
  if (!el) {
    el = document.createElement('div'); el.id = 'pl-modal'; el.className = 'modal-overlay';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.addEventListener('click', e => { if (e.target === el) plCloseModal(); });
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="modal-box" style="max-width:${wide ? '920px' : '480px'};max-height:88vh;overflow:auto;">${html}</div>`;
  el.classList.add('open');
}
function plCloseModal() { const el = document.getElementById('pl-modal'); if (el) el.classList.remove('open'); }

// ── View ────────────────────────────────────────────────────────────────
function plView(i) {
  const l = plLists()[i]; if (!l) return;
  const fins = [...new Set(l.cells.map(x => x.c))];
  const typeLabel = t => (CABINET_TYPES.find(x => x.key === t) || {}).label || t;
  const byType = {};
  l.cells.forEach(x => { ((byType[x.t] = byType[x.t] || {})[x.sk] = byType[x.t][x.sk] || {})[x.c] = x; });
  const sizeLabel = sk => sk.includes('x') ? sk.replace('x', '" × ') + '"' : sk + '"';
  const sizeNum = sk => sk.split('x').map(Number);
  const order = CABINET_TYPES.map(t => t.key);
  const tables = Object.keys(byType).sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(t => {
    const sizes = Object.keys(byType[t]).sort((a, b) => { const A = sizeNum(a), B = sizeNum(b); return A[0] - B[0] || (A[1] || 0) - (B[1] || 0); });
    return `<tr><td colspan="${fins.length + 2}" style="background:#f1f5f9;font-weight:700;padding:6px 8px;">${esc(typeLabel(t))}</td></tr>` +
      sizes.map(sk => { const row = byType[t][sk]; const sku = Object.values(row).map(x => x.sku).find(Boolean) || '';
        return `<tr><td style="padding:4px 8px;white-space:nowrap;">${esc(sizeLabel(sk))}</td><td style="padding:4px 8px;color:var(--muted);font-size:11px;">${esc(sku)}</td>` +
          fins.map(c => `<td style="padding:4px 8px;text-align:right;white-space:nowrap;">${row[c] ? '$' + row[c].p.toFixed(2) : '<span style="color:#cbd5e1;">—</span>'}</td>`).join('') + '</tr>'; }).join('');
  }).join('');
  plModal(`<h3>${esc(plTitle(l))}</h3>
    <p style="margin-bottom:10px;">${l.cells.length.toLocaleString()} prices. These are the prices your quotes use (before markup).</p>
    <div style="overflow:auto;border:1px solid var(--border);border-radius:8px;"><table style="border-collapse:collapse;font-size:12px;width:100%;">
      <thead><tr><th style="text-align:left;padding:6px 8px;position:sticky;top:0;background:#fff;">Size</th><th style="text-align:left;padding:6px 8px;position:sticky;top:0;background:#fff;">Item code</th>
      ${fins.map(c => `<th style="text-align:right;padding:6px 8px;position:sticky;top:0;background:#fff;">${esc(plFinishName(c))}</th>`).join('')}</tr></thead><tbody>${tables}</tbody></table></div>
    <div class="modal-actions" style="margin-top:14px;"><button class="btn btn-ghost" onclick="plDownload(${i})">Download</button><button class="btn btn-primary" onclick="plCloseModal()">Close</button></div>`, true);
}

// ── Download: our price sheet template with this list's prices filled in ──
function plDownload(i) {
  const l = plLists()[i]; if (!l) return;
  const fins = [...new Set(l.cells.map(x => x.c))];
  const at = {}; l.cells.forEach(x => { at[`${x.t}|${x.sk}|${x.c}`] = x; });
  const rows = [['Cabinet Type', 'Width (in)', 'Height (in)', ...fins.map(plFinishName), 'Your SKU / Notes (optional)']];
  CABINET_TYPES.forEach(t => {
    (CABINET_WIDTHS[t.key] || []).forEach(w => {
      (CABINET_HEIGHTS[t.key] || ['—']).forEach(h => {
        const sk = CABINET_HEIGHTS[t.key] ? `${w}x${h}` : `${w}`;
        const cells = fins.map(c => at[`${t.key}|${sk}|${c}`]);
        const sku = (cells.find(x => x && x.sku) || {}).sku || '';
        rows.push([t.label, w, h, ...cells.map(x => x ? x.p : ''), sku]);
      });
    });
  });
  const csv = rows.map(r => r.map(csvField).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = (plTitle(l).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'price-list') + '-prices.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

// ── Replace: a new import for this supplier (piSave replaces the old list on save) ──
function plReplace(i) {
  const l = plLists()[i]; if (!l || l.other) return;
  if (typeof piOpen !== 'function') return;
  piOpen();
  if (PI) { PI.supplier = l.name; PI.replacing = l.name; piRender(); }
}

// ── Delete ─────────────────────────────────────────────────────────────
function plProjectsUsing(codes) {
  return (typeof allProjects !== 'undefined' ? allProjects : []).filter(p => {
    const d = p.data || {};
    if (codes.has(p.style)) return true;
    return (d.rooms || []).some(r => (r.cabinets || []).some(c => codes.has(c.styleOverride)));
  }).map(p => p.customer || 'Untitled');
}
function plAskDelete(i) {
  if (myTeamRole !== 'owner') { showToast('Only the account owner can manage pricing.'); return; }
  const l = plLists()[i]; if (!l) return;
  const fins = [...new Set(l.cells.map(x => x.c))];
  const removeFins = l.created;
  const using = plProjectsUsing(new Set(removeFins));
  plModal(`<h3>Delete ${esc(plTitle(l))}?</h3>
    <p style="margin-bottom:8px;">This removes ${l.cells.length.toLocaleString()} price${l.cells.length === 1 ? '' : 's'} on ${fins.length} finish${fins.length === 1 ? '' : 'es'}${l.other ? '' : ', the supplier item codes'}${l.pending ? ` and ${l.pending} open question${l.pending === 1 ? '' : 's'}` : ''}. Cabinets in those finishes will show N/A on quotes until you load prices again.</p>
    ${removeFins.length ? `<p style="margin-bottom:8px;">These finishes were added by this import and will be removed too: <b>${esc(removeFins.map(plFinishName).join(', '))}</b>.</p>` : ''}
    ${using.length ? `<p style="margin-bottom:8px;color:#b45309;">⚠ ${using.length} project${using.length === 1 ? ' uses' : 's use'} those finishes (${esc(using.slice(0, 5).join(', '))}${using.length > 5 ? '…' : ''}). Pick a new finish in ${using.length === 1 ? 'it' : 'them'} afterwards.</p>` : ''}
    <p style="margin-bottom:14px;">${l.other ? '' : 'To load a newer list instead, use Replace — your current prices stay until the new ones are saved.'}</p>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="plCloseModal()">Cancel</button>
      <button class="btn btn-primary" style="background:#b91c1c;border-color:#b91c1c;" onclick="plDelete(${i})">Delete price list</button></div>`);
}
async function plDelete(i) {
  const l = plLists()[i]; if (!l) return;
  const cols = 'price_overrides, supplier_skus, price_import_state, custom_styles, quote_settings';
  const { data: cur, error: e1 } = await db.from('company_profiles').select(cols).eq('user_id', effectiveOwnerId).single();
  if (e1) { showToast('Could not load your pricing: ' + e1.message); return; }
  const own = plLists(cur).find(x => plKey(x) === plKey(l)); if (!own) { plCloseModal(); plRender(); return; }
  const row = { user_id: effectiveOwnerId, updated_at: new Date().toISOString(), ...plWithout(cur, own) };
  const { data, error } = await db.from('company_profiles').upsert(row, { onConflict: 'user_id' }).select().single();
  if (error) { showToast('Could not delete: ' + error.message); return; }
  companyProfile = data;
  plCloseModal();
  if (typeof renderPfStyles === 'function') renderPfStyles(data.custom_styles || []);
  plRender(); if (typeof piRenderPending === 'function') piRenderPending(); if (typeof piRenderBasis === 'function') piRenderBasis();
  showToast(`${plTitle(l)} deleted.`);
}
// The pricing columns with a list taken out (also used by piSave when replacing a supplier).
// keepCodes: finish codes the new import keeps (their created finishes aren't removed).
function plWithout(cur, own, keepCodes) {
  keepCodes = keepCodes || new Set();
  const strip = obj => {
    const out = {};
    Object.entries(obj || {}).forEach(([t, sizes]) => {
      if (!sizes || typeof sizes !== 'object') { out[t] = sizes; return; }
      const ns = {};
      Object.entries(sizes).forEach(([sk, by]) => {
        if (!by || typeof by !== 'object') { ns[sk] = by; return; }
        const nb = {}; Object.entries(by).forEach(([c, v]) => { if (!own.codes.has(c)) nb[c] = v; });
        if (Object.keys(nb).length) ns[sk] = nb;
      });
      if (Object.keys(ns).length) out[t] = ns;
    });
    return out;
  };
  const drop = new Set(own.created.filter(c => !keepCodes.has(c)));
  const styles = (Array.isArray(cur.custom_styles) ? cur.custom_styles : []).filter(s => !drop.has(s.code));
  const qs = { ...(cur.quote_settings || {}) }, pb = { ...(qs.priceBasis || {}) };
  own.codes.forEach(c => { delete pb[c]; });
  qs.priceBasis = pb;
  const state = { ...(cur.price_import_state || {}) }, sups = { ...(state.suppliers || {}) };
  if (own.name) delete sups[own.name];
  state.suppliers = sups;
  return { price_overrides: strip(cur.price_overrides), supplier_skus: strip(cur.supplier_skus),
    custom_styles: styles.length ? styles : null, quote_settings: qs, price_import_state: state };
}
