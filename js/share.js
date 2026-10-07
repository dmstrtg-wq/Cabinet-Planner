// My Cabinet Planner — js/share.js
// Customer share link (Build Plan 5.6, Gold). The company clicks Share in a project and gets
// a private link (/app?share=<token>) to send its customer. The link opens a frozen,
// view-only copy of the design — 3D, floor plan, elevations — plus, if the company chose,
// the quote total or the itemized quote. The customer can tap "Approve this design":
// a design approval (name, time, quote version), not a contract (Dan, 2026-10-05).
// The copy lives in project_shares (supabase-share-links.sql); customers only reach it via
// get_share()/approve_share(), never the projects table. "Update link" refreshes the copy.
// Loaded by app.html as a classic script, before shell.js (which starts the customer view).

// ════════════════════════════
// COMPANY SIDE — the Share window
// ════════════════════════════
const SHARE_EXPIRY_DAYS = { 7: '7 days', 30: '30 days', 90: '90 days', 0: 'No expiry' };
let shareCurrent = null;   // this project's live share link (if any)

function shareToken() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);   // 256 bits
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function shareUrl(token) { return `${location.origin}/app?share=${token}`; }

async function openShareModal() {
  if (!demoGate('share')) return;
  if (!canAccess('gold')) { showTierUpgradePrompt('gold', 'Customer Share Link'); return; }
  const p = activeProj(); if (!p) return;
  shareEnsureModal();
  document.getElementById('share-body').innerHTML = '<div style="padding:20px;color:#64748b;">Loading…</div>';
  openModal('modal-share');
  const { data, error } = await db.from('project_shares').select('*').eq('project_id', p.id).eq('revoked', false).order('created_at', { ascending: false }).limit(1);
  if (error) {
    document.getElementById('share-body').innerHTML = `<div class="pi-note" style="color:#b91c1c;">${/project_shares/.test(error.message || '') ? 'Run supabase-share-links.sql in Supabase first.' : escHtml(error.message)}</div>`;
    return;
  }
  shareCurrent = (data && data[0]) || null;
  if (shareCurrent && shareCurrent.expires_at && new Date(shareCurrent.expires_at) < new Date()) shareCurrent = { ...shareCurrent, _expired: true };
  renderShareModal();
}
function shareEnsureModal() {
  if (document.getElementById('modal-share')) return;
  const el = document.createElement('div');
  el.id = 'modal-share'; el.className = 'modal-overlay hidden';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Share with customer');
  el.innerHTML = `<div class="modal" style="width:540px;max-width:96vw;"><h3>Share with your customer</h3><div id="share-body"></div></div>`;
  document.body.appendChild(el);
}
function renderShareModal(confirmUpdate) {
  const s = shareCurrent, p = activeProj();
  const prices = s ? s.show_prices : 'none';
  // Prices only go out when every cabinet has one — a total that quietly leaves some out
  // would mislead the customer
  const unpriced = quoteTotals(p).unpriced;
  const opt = (v, label, help) => { const off = v !== 'none' && unpriced > 0; return `<label style="display:block;font-weight:400;font-size:13px;margin-bottom:6px;cursor:${off ? 'not-allowed' : 'pointer'};${off ? 'opacity:.5;' : ''}"><input type="radio" name="share-prices" value="${v}" ${(off ? v === 'none' : prices === v) || (v === 'none' && unpriced > 0) ? 'checked' : ''} ${off ? 'disabled' : ''}> <b>${label}</b> <span style="color:#64748b;">${help}</span></label>`; };
  const settings = `
    <div class="form-group"><label>What your customer sees</label>
      ${opt('none', 'Design only', '— 3D, floor plan and elevations')}
      ${opt('total', 'Design + quote total', '— one total, no line items')}
      ${opt('full', 'Design + itemized quote', '— every line, as on your printed quote')}
      ${unpriced ? `<div style="font-size:12px;color:#b45309;margin-top:4px;">${unpriced} cabinet${unpriced === 1 ? ' has' : 's have'} no price for ${unpriced === 1 ? 'its' : 'their'} finish yet, so prices can't be shared — the total would leave ${unpriced === 1 ? 'it' : 'them'} out. Price ${unpriced === 1 ? 'it' : 'them'} first, then update the link.</div>` : ''}</div>
    <div class="form-group"><label for="share-expiry">Link works for</label>
      <select id="share-expiry">${Object.entries(SHARE_EXPIRY_DAYS).map(([d, l]) => `<option value="${d}" ${String(d) === '30' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  const body = document.getElementById('share-body');
  if (!s || s._expired) {
    body.innerHTML = `<p style="font-size:13px;color:#64748b;margin:0 0 14px;">Creates a private link to a <b>view-only copy</b> of ${escHtml(p.customer || 'this project')}'s design. Your customer can spin it in 3D on their phone and tap <b>Approve this design</b> — you'll see it here, in the activity log and as an alert. It's a design approval, not a signed contract.</p>
      ${s && s._expired ? '<div class="pi-note">The last link expired. Create a new one below.</div>' : ''}
      ${settings}
      <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('modal-share')">Cancel</button><button class="btn btn-primary" onclick="saveShare()">Create link</button></div>`;
    return;
  }
  const exp = s.expires_at ? new Date(s.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'never';
  const when = d => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  body.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
      <code id="share-url" style="font-size:12px;background:#f8fafc;border:1px solid var(--border);border-radius:6px;padding:7px 9px;word-break:break-all;flex:1;min-width:220px;">${escHtml(shareUrl(s.token))}</code>
      <button class="btn btn-primary" style="font-size:12px;padding:7px 12px;" onclick="copyShareLink()">Copy link</button>
      <a class="btn btn-secondary" style="font-size:12px;padding:7px 12px;text-decoration:none;" href="${escHtml(shareUrl(s.token))}" target="_blank" rel="noopener">Preview</a></div>
    <div style="font-size:12px;color:#475569;line-height:1.7;margin-bottom:12px;">
      Showing: <b>${{ none: 'design only', total: 'design + quote total', full: 'design + itemized quote' }[s.show_prices]}</b> · ${escHtml(s.quote_label || '')}<br>
      Shared ${when(s.created_at)}${s.updated_at && s.updated_at !== s.created_at ? ` · updated ${when(s.updated_at)}` : ''} · expires ${exp} · opened ${s.views} time${s.views === 1 ? '' : 's'}${s.last_viewed_at ? ` (last ${when(s.last_viewed_at)})` : ''}<br>
      ${s.approved_at ? `<span style="color:#15803d;font-weight:800;">✓ Approved by ${escHtml(s.approved_name)} — ${when(s.approved_at)}</span>${s.approved_label ? ` <span style="color:#64748b;">(${escHtml(s.approved_label)})</span>` : ''}` : '<span style="color:#92400e;">Not approved yet</span>'}</div>
    <details ${confirmUpdate ? 'open' : ''}><summary style="font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;">Update the link</summary>
      <p style="font-size:12px;color:#64748b;margin:0 0 10px;">The link shows the design as it was when you shared it. Update it after changes — same link, fresh copy.${s.approved_at ? ' <b>Your customer already approved the earlier version; if the design or price changed, they\'ll be asked to approve again.</b>' : ''}</p>
      ${settings}
      ${confirmUpdate ? `<div class="pi-note">${escHtml(confirmUpdate)} <button class="btn btn-primary" style="font-size:12px;padding:5px 10px;margin-left:6px;" onclick="saveShare(true)">Yes, update</button></div>` : ''}
      <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px;" onclick="saveShare()">Update link</button></details>
    <div class="modal-footer"><button class="btn btn-secondary" style="color:#b91c1c;" onclick="revokeShare()">Turn off link</button><button class="btn btn-primary" onclick="closeModal('modal-share')">Done</button></div>`;
}
async function copyShareLink() {
  try { await navigator.clipboard.writeText(shareUrl(shareCurrent.token)); alertLite('Link copied — paste it into a text or email to your customer.'); }
  catch (e) { alertLite('Select the link and copy it.'); }
}

// The frozen copy the customer sees. No prices unless chosen; never cost or price sheets.
function shareSnapshot(p, showPrices) {
  const used = new Set([p.style, ...p.rooms.flatMap(r => (r.cabinets || []).map(c => c.styleOverride).filter(Boolean))]);
  const styles = getStyles().filter(s => used.has(s.code)).map(s => ({ code: s.code, name: s.name, swatch: s.swatch || null, tier: s.tier || null, door: s.door || null }));
  const cp = companyProfile;
  const T = quoteTotals(p);
  const last = (p.quoteHistory || [])[p.quoteHistory.length - 1];
  const label = p.quoteLocked && last ? `Quote #${last.quoteNum}${last.revision > 1 ? ' · revision ' + last.revision : ''}` : 'Draft quote';
  let quote = null;
  if (showPrices !== 'none') {
    quote = { label, total: T.total, tax: T.tax, taxPct: getTax() * 100, asOf: new Date().toISOString(), unpriced: T.unpriced };
    if (showPrices === 'full') {
      quote.rooms = p.rooms.map(r => ({ name: r.name,
        cabinets: quoteCabinets(r).map(c => { const pr = cabinetPrice(c); return { n: c.itemNum || '', label: (CATALOG[c.type] || {}).label + (c.glassDoors ? ' + glass doors' : '') + (c.trash ? ' + trash pull-out' : ''), size: `${fmtFrac(c.width)}W × ${fmtFrac(c.height)}H × ${c.depth}"D`, price: pr }; }),
        appliances: (r.appliances || []).filter(a => a.price > 0 && !(APPLIANCES[a.type] || {}).decor).map(a => ({ n: a.itemNum || '', label: (APPLIANCES[a.type] || {}).label || a.type, price: a.price })),
      })).filter(r => r.cabinets.length || r.appliances.length);
      quote.hardware = hardwareQuoteLines(p).map(l => ({ label: l.label, qty: l.qty, total: l.total }));
      quote.jobCosts = quoteJobCosts(p).map(x => ({ label: x.label || 'Additional cost', amount: parseFloat(x.amount) || 0 }));
      quote.trim = quoteTrimItems(p).map(t => ({ label: t.label || 'Trim', qty: parseFloat(t.qty) || 0, total: (parseFloat(t.qty) || 0) * (parseFloat(t.unitPrice) || 0) }));
      quote.sub = { cabinets: T.cab, appliances: T.app, hardware: T.hw, jobCosts: T.jc, trim: T.trim };
      quote.terms = cp.terms_and_conditions || '';
    }
  }
  return {
    payload: {
      v: 1, sharedAt: new Date().toISOString(),
      company: { name: p.company || cp.company_name || '', logo_url: cp.logo_url || null, phone: cp.phone || '', email: cp.email || '', website: cp.website || '' },
      project: { customer: p.customer, type: p.type, style: p.style, rooms: p.rooms, scene: p.scene || null, countertop: p.countertop || null, hardware: p.hardware || null },
      styles, quote,
    },
    label, sig: quoteSignature(p, T.total),
  };
}
async function saveShare(confirmed) {
  const p = activeProj(); if (!p) return;
  let showPrices = (document.querySelector('input[name="share-prices"]:checked') || {}).value || 'none';
  if (showPrices !== 'none' && quoteTotals(p).unpriced > 0) showPrices = 'none';   // never a total that leaves cabinets out
  const days = parseInt(document.getElementById('share-expiry').value, 10);
  const snap = shareSnapshot(p, showPrices);
  if (JSON.stringify(snap.payload).length > 1900000) { alertLite('This design is too large to share. Remove some rooms and try again.'); return; }
  const s = shareCurrent && !shareCurrent._expired ? shareCurrent : null;
  const changed = s && s.approved_at && (s.quote_sig !== snap.sig || s.show_prices !== showPrices);
  if (changed && !confirmed) { renderShareModal('The design or price changed since your customer approved it. Updating asks them to approve again.'); return; }
  const row = {
    show_prices: showPrices, payload: snap.payload, quote_label: snap.label, quote_sig: snap.sig,
    expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null, updated_at: new Date().toISOString(),
    ...(changed ? { approved_at: null, approved_name: null, approved_label: null, approval_seen: false } : {}),
  };
  const q = s
    ? db.from('project_shares').update(row).eq('id', s.id).select().single()
    : db.from('project_shares').insert({ ...row, token: shareToken(), user_id: effectiveOwnerId, project_id: p.id, created_by: currentUser.id }).select().single();
  const { data, error } = await q;
  if (error) { alertLite("Couldn't save the link: " + error.message); return; }
  shareCurrent = data;
  if (!p.activityLog) p.activityLog = [];
  p.activityLog.unshift({ id: uid(), type: 'share', text: `${s ? 'Updated' : 'Shared'} the design with the customer (${{ none: 'design only', total: 'with quote total', full: 'with itemized quote' }[showPrices]})`, createdAt: new Date().toISOString(), user: currentUser.email });
  persist();
  renderShareModal();
}
async function revokeShare() {
  if (!shareCurrent) return;
  const { error } = await db.from('project_shares').update({ revoked: true, updated_at: new Date().toISOString() }).eq('id', shareCurrent.id);
  if (error) { alertLite("Couldn't turn it off: " + error.message); return; }
  const p = activeProj();
  if (p) { p.activityLog = p.activityLog || []; p.activityLog.unshift({ id: uid(), type: 'share', text: 'Turned off the customer share link', createdAt: new Date().toISOString(), user: currentUser.email }); persist(); }
  shareCurrent = null;
  renderShareModal();
}
function alertLite(msg) { (typeof leadToast === 'function') ? leadToast(msg) : alert(msg); }

// Approvals waiting to be seen (shown with new leads in the sidebar alert — homeowner.js).
// Also puts each approval's line back into the project's activity log if a save from an open
// planner wrote over the one the server added.
async function loadShareApprovals() {
  if (!currentUser || IS_DEMO || !canAccess('gold')) return [];
  const { data, error } = await db.from('project_shares').select('id, project_id, approved_at, approved_name, approved_label, approval_seen')
    .not('approved_at', 'is', null).order('approved_at', { ascending: false }).limit(100);
  if (error) return [];
  (data || []).forEach(a => {
    const p = getProj(a.project_id); if (!p) return;
    const id = 'share-' + a.id;
    if ((p.activityLog || []).some(e => e.id === id)) return;
    p.activityLog = p.activityLog || [];
    p.activityLog.unshift({ id, type: 'approval', text: `Design approved by ${a.approved_name} on the share link${a.approved_label ? ' (' + a.approved_label + ')' : ''}`, createdAt: a.approved_at, user: a.approved_name });
    p.activityLog.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
    if (activeProj() && activeProj().id === p.id) persist();
  });
  return (data || []).filter(a => !a.approval_seen && getProj(a.project_id));
}
async function markApprovalSeen(id, open) {
  await db.from('project_shares').update({ approval_seen: true }).eq('id', id);
  const a = (window.approvalInbox || []).find(x => x.id === id);
  if (open && a) { closeLeadInbox(); openProject(a.project_id); }
  refreshLeadAlerts();
}

// ════════════════════════════
// CUSTOMER SIDE — /app?share=<token>
// ════════════════════════════
let SHARE_DATA = null;
async function shareStart() {
  currentUser = null;
  const { data, error } = await db.rpc('get_share', { p_token: SHARE_TOKEN });
  if (error || !data || !data.payload) { shareClosed(); return; }
  SHARE_DATA = data; window.SHARE_DATA = data;
  const P = data.payload, d = P.project || {};
  const proj = migrateProject({
    id: 'shared-design', customer: d.customer || 'Your design', type: d.type || 'Kitchen', style: d.style,
    rooms: Array.isArray(d.rooms) ? d.rooms : [], ...(d.scene ? { scene: d.scene } : {}), ...(d.countertop ? { countertop: d.countertop } : {}), ...(d.hardware ? { hardware: d.hardware } : {}),
    notes: '', status: 'Lead', activityLog: [], jobCosts: [], trimItems: [], quoteHistory: [], createdAt: Date.now(),
  });
  state.projects = [proj];
  showApp();
  shareBrand();
  state.viewMode = '3d';
  openProject(proj.id, proj.rooms[0] && proj.rooms[0].id);
  setViewMode('3d');
}
function shareClosed() {
  document.getElementById('login-screen').classList.add('hidden');
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:inherit;padding:24px;';
  el.innerHTML = `<div style="max-width:420px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:8px;">This link isn't active</div>
    <div style="font-size:14px;color:#64748b;line-height:1.6;">It may have expired or been turned off. Please ask your cabinet company for a new link.</div></div>`;
  document.body.appendChild(el);
}
function shareBrand() {
  const P = SHARE_DATA.payload, co = P.company || {}, q = P.quote;
  document.title = `${P.project.customer || 'Your design'} — ${co.name || 'Cabinet design'}`;
  const bar = document.createElement('div');
  bar.id = 'share-bar';
  bar.innerHTML = `<div class="sb-co">${co.logo_url ? `<img src="${escHtml(co.logo_url)}" alt="">` : ''}<div><div class="sb-name">${escHtml(co.name || '')}</div>
      <div class="sb-sub">Design for ${escHtml(P.project.customer || 'you')}${co.phone ? ' · ' + escHtml(co.phone) : ''}</div></div></div>
    <div class="sb-actions">
      ${q ? `<button class="btn btn-secondary" onclick="openShareQuote()">${q.rooms ? 'View quote' : 'Quote total: ' + fmtMoney(q.total)}</button>` : ''}
      <span id="share-approve-slot"></span></div>`;
  document.body.prepend(bar);
  // the app fills the rest of the screen below the bar (same mechanism as the demo banner)
  const fit = () => { document.body.style.setProperty('--demo-banner-h', bar.offsetHeight + 'px'); if (typeof resizeIso3D === 'function' && state.viewMode === '3d') resizeIso3D(); };
  document.body.classList.add('demo-banner-on');
  fit(); window.addEventListener('resize', fit);
  renderApproveSlot();
  const pq = document.getElementById('pnav-quote');   // phone bottom bar: Quote → Approve
  if (pq) { pq.onclick = () => SHARE_DATA.approved_at ? openShareQuote() : openApproveModal(); const lbl = [...pq.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim()); if (lbl) lbl.textContent = SHARE_DATA.approved_at ? 'Approved' : 'Approve'; }
}
function renderApproveSlot() {
  const slot = document.getElementById('share-approve-slot');
  if (!slot) return;
  slot.innerHTML = SHARE_DATA.approved_at
    ? `<span class="sb-approved">✓ Approved by ${escHtml(SHARE_DATA.approved_name)} · ${new Date(SHARE_DATA.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>`
    : `<button class="btn btn-primary" onclick="openApproveModal()">Approve this design</button>`;
}
function shareModal(id, html) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; el.className = 'modal-overlay hidden'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
  el.innerHTML = html;
  openModal(id);
}
function openApproveModal() {
  const P = SHARE_DATA.payload, co = P.company || {};
  shareModal('modal-share-approve', `<div class="modal" style="width:460px;max-width:96vw;">
    <h3>Approve this design</h3>
    <p style="font-size:13px;color:#475569;line-height:1.6;margin:0 0 12px;">You're telling ${escHtml(co.name || 'your cabinet company')} the layout and finishes look right${P.quote ? ` (${escHtml(P.quote.label)})` : ''}. <b>This is not a contract or an order</b> — final pricing, ordering and payment terms come from ${escHtml(co.name || 'them')}.</p>
    <div class="form-group"><label for="share-approve-name">Your full name</label><input type="text" id="share-approve-name" class="cp-input" maxlength="80" autocomplete="name"></div>
    <div id="share-approve-err" style="color:#dc2626;font-size:12px;margin-bottom:8px;"></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal('modal-share-approve')">Not yet</button><button class="btn btn-primary" id="share-approve-btn" onclick="approveShare()">Approve design</button></div></div>`);
  setTimeout(() => document.getElementById('share-approve-name').focus(), 50);
}
async function approveShare() {
  const name = document.getElementById('share-approve-name').value.trim(), err = document.getElementById('share-approve-err'), btn = document.getElementById('share-approve-btn');
  if (name.length < 2) { err.textContent = 'Please type your full name.'; return; }
  btn.disabled = true; btn.textContent = 'Sending…';
  const { data, error } = await db.rpc('approve_share', { p_token: SHARE_TOKEN, p_name: name });
  if (error) { err.textContent = error.message || "Couldn't send your approval. Please try again."; btn.disabled = false; btn.textContent = 'Approve design'; return; }
  SHARE_DATA.approved_at = data.approved_at; SHARE_DATA.approved_name = data.approved_name;
  closeModal('modal-share-approve');
  renderApproveSlot();
  const pq = document.getElementById('pnav-quote');
  if (pq) { pq.onclick = () => SHARE_DATA.payload.quote ? openShareQuote() : null; const lbl = [...pq.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim()); if (lbl) lbl.textContent = 'Approved'; }
  const co = SHARE_DATA.payload.company || {};
  shareModal('modal-share-done', `<div class="modal" style="width:420px;max-width:96vw;text-align:center;"><h3>Thank you!</h3>
    <p style="font-size:14px;color:#475569;line-height:1.6;">${escHtml(co.name || 'Your cabinet company')} has your approval and will be in touch about next steps.${co.phone ? `<br>Questions? Call ${escHtml(co.phone)}.` : ''}</p>
    <div class="modal-footer" style="justify-content:center;"><button class="btn btn-primary" onclick="closeModal('modal-share-done')">Back to the design</button></div></div>`);
}
function openShareQuote() {
  const P = SHARE_DATA.payload, q = P.quote, co = P.company || {};
  if (!q) return;
  const money = v => v == null ? '<span style="color:#94a3b8;">—</span>' : fmtMoney(v);
  const asOf = new Date(q.asOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let lines = '';
  if (q.rooms) {
    q.rooms.forEach(r => {
      lines += `<tr class="sq-room"><td colspan="4">${escHtml(r.name)}</td></tr>`;
      r.cabinets.forEach(c => { lines += `<tr><td class="n">${escHtml(String(c.n))}</td><td>${escHtml(c.label)}</td><td>${escHtml(c.size)}</td><td class="a">${money(c.price)}</td></tr>`; });
      r.appliances.forEach(a => { lines += `<tr><td class="n">${escHtml(String(a.n))}</td><td>${escHtml(a.label)}</td><td></td><td class="a">${money(a.price)}</td></tr>`; });
    });
    if (q.hardware.length) { lines += `<tr class="sq-room"><td colspan="4">Hardware &amp; accessories</td></tr>`; q.hardware.forEach(h => { lines += `<tr><td></td><td>${escHtml(h.label)}</td><td>Qty ${escHtml(String(h.qty))}</td><td class="a">${money(h.total)}</td></tr>`; }); }
    if (q.jobCosts.length) { lines += `<tr class="sq-room"><td colspan="4">Additional costs</td></tr>`; q.jobCosts.forEach(j => { lines += `<tr><td></td><td colspan="2">${escHtml(j.label)}</td><td class="a">${money(j.amount)}</td></tr>`; }); }
    if (q.trim.length) { lines += `<tr class="sq-room"><td colspan="4">Trim &amp; materials</td></tr>`; q.trim.forEach(t => { lines += `<tr><td></td><td>${escHtml(t.label)}</td><td>Qty ${escHtml(String(t.qty))}</td><td class="a">${money(t.total)}</td></tr>`; }); }
  }
  shareModal('modal-share-quote', `<div class="modal" style="width:640px;max-width:96vw;">
    <h3>${escHtml(q.label)}</h3>
    <div style="font-size:12px;color:#64748b;margin:-4px 0 12px;">${escHtml(co.name || '')} · prices as of ${asOf}</div>
    ${lines ? `<div style="max-height:52vh;overflow:auto;"><table class="sq"><thead><tr><th>#</th><th>Item</th><th>Size</th><th class="a">Price</th></tr></thead><tbody>${lines}</tbody></table></div>` : ''}
    <div class="sq-tot">${q.tax > 0 ? `<div><span>Tax (${(+q.taxPct).toFixed(1)}%)</span><span>${fmtMoney(q.tax)}</span></div>` : ''}<div class="sq-total"><span>Total</span><span>${fmtMoney(q.total)}</span></div></div>
    ${q.terms ? `<details style="margin-top:10px;"><summary style="font-size:12px;font-weight:700;cursor:pointer;">Terms &amp; conditions</summary><p style="white-space:pre-wrap;font-size:11px;color:#475569;line-height:1.6;">${escHtml(q.terms)}</p></details>` : ''}
    <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal('modal-share-quote')">Close</button></div></div>`);
}
