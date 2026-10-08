// My Cabinet Planner — js/homeowner.js
// Homeowner mode (Build Plan 6.1). A Gold company turns on its design link in Profile →
// Company Settings and puts it on its own website: /app?pro=<link name>. Homeowners get a
// simple, branded planner — the company's logo and finishes, no prices, no quote or job
// tools — and send their design straight to that company's Leads tab. In the Leads tab the
// company opens it (/app?lead=<id>) and it becomes a normal project to adjust and quote.
// Runs on top of the demo plumbing (IS_DEMO is true in homeowner mode): no login, designs
// kept in this browser under their own key (localProjectsKey in core.js).
// Loaded by app.html as a classic script, before shell.js (which starts it).

let HOME_LISTING = null;   // the company's public listing: name, logo, contact, finishes

async function homeStart() {
  currentUser = null;
  const { data, error } = await db.from('pro_listings')
    .select('user_id, company_name, logo_url, phone, email, website, city, state, finishes, design_slug')
    .eq('design_slug', HOME_PRO).eq('design_link', true).maybeSingle();
  if (error || !data) { homeClosed(); return; }
  HOME_LISTING = data;
  window.HOME_LISTING = data;
  showApp();
  homeBrand();
  if (typeof buildStylePanel === 'function') buildStylePanel();   // the company's finishes
  loadProjectsFromLocal();
  if (!state.projects.length) openNewProjectModal();
}

// Link switched off, mistyped, or the company isn't on Gold any more
function homeClosed() {
  document.getElementById('login-screen').classList.add('hidden');
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:inherit;padding:24px;';
  el.innerHTML = `<div style="max-width:420px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:8px;">This design link isn't active</div>
    <div style="font-size:14px;color:#64748b;line-height:1.6;margin-bottom:18px;">The company may have turned it off or changed its address. Please check the link on their website, or contact them directly.</div>
    <a href="/" style="color:#0f766e;font-weight:700;text-decoration:none;">mycabinetplanner.com</a></div>`;
  document.body.appendChild(el);
}

// The company's name and logo in place of ours; "Send my design" everywhere it matters
function homeBrand() {
  const L = HOME_LISTING, name = L.company_name || 'your cabinet pro';
  document.title = `Design your kitchen — ${name}`;
  const brand = document.querySelector('.sidebar-brand a');
  if (brand) {
    brand.removeAttribute('href');
    brand.innerHTML = `${L.logo_url ? `<img src="${escHtml(L.logo_url)}" alt="" style="width:40px;height:40px;object-fit:contain;border-radius:8px;background:#fff;flex-shrink:0;">` : ''}
      <div><div style="font-size:14px;font-weight:800;color:#fff;line-height:1.2;">${escHtml(name)}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:1px;">Design your kitchen</div></div>`;
    brand.style.cssText += ';display:flex;align-items:center;gap:10px;text-decoration:none;';
  }
  const send = `Send my design to ${name}`;
  const side = document.getElementById('connect-pro-btn');
  if (side) side.textContent = send;
  const actions = document.querySelector('.header-actions');
  if (actions && !document.getElementById('home-send-btn')) {
    const b = document.createElement('button');
    b.id = 'home-send-btn'; b.className = 'btn btn-primary'; b.textContent = 'Send to ' + name;
    b.onclick = () => openModal('modal-pro-lead');
    actions.appendChild(b);
  }
  // Phone layout: the bottom bar's Quote tab becomes "Send"
  const pq = document.getElementById('pnav-quote');
  if (pq) {
    pq.onclick = () => openModal('modal-pro-lead');
    const lbl = [...pq.childNodes].reverse().find(n => n.nodeType === 3 && n.textContent.trim());
    if (lbl) lbl.textContent = 'Send'; else pq.append('Send');
  }
  const title = document.getElementById('lead-modal-title'), intro = document.getElementById('lead-modal-intro'), legal = document.getElementById('lead-modal-legal');
  if (title) title.textContent = `Send your design to ${name}`;
  if (intro) intro.textContent = `${name} gets your whole design, including every cabinet, measurement and finish you picked, and will contact you about pricing and next steps.`;
  if (legal) legal.textContent = `By sending, you agree to be contacted by ${name} about your project. Your design and contact details go only to them.`;
  const welcome = document.querySelector('#welcome h2');
  if (welcome) welcome.textContent = `Design your kitchen with ${name}`;
  document.querySelectorAll('#welcome p').forEach((p, i) => { p.textContent = i === 0 ? 'Free kitchen design' : `Lay out your cabinets, pick a door style and see it in 3D. When you're happy, send it to ${name} for pricing.`; });
  const start = document.querySelector('#welcome .btn-primary');
  if (start) start.textContent = 'Start your design →';
}

// What gets sent: the design itself — rooms, finish, counters, scene. Text is stripped of
// anything that looks like HTML, and it must stay small.
function homeDesignPayload(p) {
  const d = homeClean({ type: p.type, style: p.style, rooms: p.rooms, scene: p.scene || null, countertop: p.countertop || null, hardware: p.hardware || null });
  const size = JSON.stringify(d).length;
  if (size > 350000) throw new Error('This design is too large to send. Remove a room or two and try again.');
  return d;
}
// Deep copy with every string cleaned (the design comes from an anonymous visitor)
function homeClean(v, depth = 0) {
  if (depth > 12) return null;
  if (typeof v === 'string') return v.replace(/[<>]/g, '').slice(0, 500);
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'boolean' || v == null) return v;
  if (Array.isArray(v)) return v.slice(0, 500).map(x => homeClean(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    Object.keys(v).slice(0, 80).forEach(k => { if (!k.startsWith('_')) o[k.slice(0, 40)] = homeClean(v[k], depth + 1); });
    return o;
  }
  return null;
}

// ── In the company's own planner: accept a lead → it becomes a project ──
// From the lead email's link (/app?lead=<id>), the Leads tab, or the planner's lead alert.
// A lead with a design opens that design; one without gets a blank room with the
// homeowner's details filled in. Accepting twice just opens the same project.
const LEADS_ADMIN = 'dmstrtg@gmail.com';   // sees network leads (matches the leads RLS policies)
async function openLeadFromUrl() {
  const id = new URLSearchParams(location.search).get('lead');
  if (!id || !currentUser) return;
  history.replaceState({}, '', '/app');   // a refresh shouldn't import it twice
  await acceptLead(id);
}
async function acceptLead(id) {
  const { data: lead, error } = await db.from('leads').select('*').eq('id', id).maybeSingle();
  if (error || !lead) { alert("Couldn't open that lead — it may have been removed, or it belongs to another company."); return; }
  if (lead.project_id && getProj(lead.project_id)) { closeLeadInbox(); openProject(lead.project_id); return; }
  ['name', 'phone', 'email', 'zip', 'note', 'plan_summary'].forEach(k => { if (lead[k] != null) lead[k] = homeClean(String(lead[k])); });   // typed by an anonymous visitor
  const d = homeClean(lead.design || {}) || {};
  const rooms = Array.isArray(d.rooms) && d.rooms.length ? d.rooms : [{
    id: uid(), name: 'Kitchen', kind: 'kitchen', walls: { north: 120, south: 120, east: 96, west: 96 }, ceilingHeight: 96, cabinets: [], openings: [], appliances: [],
  }];
  const when = new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const how = lead.source === 'design_link' ? 'your design link' : 'Connect with a Pro';
  const proj = migrateProject({
    id: newId(),
    customer: lead.name || 'New lead',
    phone: lead.phone || '',
    company: companyProfile.company_name || '',
    type: d.type || 'Kitchen',
    notes: [lead.note, lead.email ? 'Email: ' + lead.email : '', lead.zip ? 'ZIP: ' + lead.zip : '',
      d.rooms ? `Designed by the homeowner (${how}, ${when}).` : `Lead from ${how} (${when})${lead.plan_summary ? ': ' + lead.plan_summary : ''} — no design attached; room size is a placeholder.`].filter(Boolean).join('\n'),
    address: '', city: '', state: '',
    style: getStyles().some(s => s.code === d.style) ? d.style : (getStyles()[0] || {}).code,
    createdAt: Date.now(),
    rooms,
    ...(d.scene ? { scene: d.scene } : {}), ...(d.countertop ? { countertop: d.countertop } : {}), ...(d.hardware ? { hardware: d.hardware } : {}),
    status: 'Lead',
    activityLog: [{ id: uid(), type: 'note', text: `Accepted lead from ${lead.name || 'a homeowner'} (${how})`, createdAt: new Date().toISOString(), user: currentUser.email }],
    jobCosts: [], trimItems: [], quoteLocked: false, lockedQuote: null, quoteHistory: [],
  });
  state.projects.unshift(proj);
  renderSidebar();
  closeLeadInbox();
  openProject(proj.id, proj.rooms[0] && proj.rooms[0].id);
  persist();
  const { error: e2 } = await db.from('leads').update({ project_id: proj.id }).eq('id', id);
  if (e2) console.warn('Lead → project link not saved:', e2);
  refreshLeadAlerts();
}

// ── New-lead alert in the planner sidebar + a small inbox ──
// "New" = not accepted into a project yet and not marked handled. Checked on load, every few
// minutes, and when the tab comes back into focus.
let leadInbox = [], leadAlertCount = null, leadAlertTimer = null;
function leadsVisibleToMe() {
  return currentUser && !IS_DEMO && (canAccess('silver') || currentUser.email === LEADS_ADMIN);
}
async function refreshLeadAlerts() {
  const btn = document.getElementById('lead-alert-btn');
  if (!btn || !leadsVisibleToMe()) { if (btn) btn.classList.add('hidden'); return; }
  let q = db.from('leads').select('id, created_at, name, email, phone, zip, note, plan_summary, floor_plan_dataurl, source, company_id')
    .is('project_id', null).eq('contacted', false).order('created_at', { ascending: false }).limit(50);
  // the admin can read every lead; only unassigned ones (and their own) are theirs to act on
  if (currentUser.email === LEADS_ADMIN) q = q.or(`company_id.is.null,company_id.eq.${effectiveOwnerId}`);
  const [{ data, error }, approvals] = await Promise.all([q, typeof loadShareApprovals === 'function' ? loadShareApprovals() : []]);
  if (error) { console.warn('Lead alert check failed:', error); return; }
  const prev = leadAlertCount, prevApprovals = (window.approvalInbox || []).length;
  leadInbox = data || [];
  window.approvalInbox = approvals || [];
  leadAlertCount = leadInbox.length + approvalInbox.length;
  btn.classList.toggle('hidden', !leadAlertCount);
  document.getElementById('lead-alert-n').textContent = leadAlertCount;
  document.getElementById('lead-alert-label').textContent = approvalInbox.length && !leadInbox.length ? 'Design approved' : approvalInbox.length ? 'New' : 'New leads';
  if (prev != null && approvalInbox.length > prevApprovals) leadToast(`${approvalInbox[0].approved_name} approved a design`);
  else if (prev != null && leadAlertCount > prev && leadInbox.length) leadToast(`New lead from ${leadInbox[0].name || 'a homeowner'}`);
  if (!document.getElementById('modal-lead-inbox').classList.contains('hidden')) renderLeadInbox();
}
function startLeadAlerts() {
  refreshLeadAlerts();
  clearInterval(leadAlertTimer);
  leadAlertTimer = setInterval(refreshLeadAlerts, 5 * 60 * 1000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && leadAlertCount != null) refreshLeadAlerts(); });
function openLeadInbox() { renderLeadInbox(); openModal('modal-lead-inbox'); }
function closeLeadInbox() { const m = document.getElementById('modal-lead-inbox'); if (m) closeModal('modal-lead-inbox'); }
function renderLeadInbox() {
  const box = document.getElementById('lead-inbox-list');
  const appr = window.approvalInbox || [];
  if (!leadInbox.length && !appr.length) { box.innerHTML = '<div style="padding:18px;color:#64748b;font-size:13px;">Nothing new. 🎉</div>'; return; }
  box.innerHTML = appr.map(a => { const p = getProj(a.project_id) || {}; return `<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);align-items:flex-start;">
      <div style="font-size:22px;">✅</div><div style="flex:1;font-size:13px;line-height:1.5;">
        <div style="font-weight:800;">${escHtml(a.approved_name)} approved the design for ${escHtml(p.customer || 'a project')}</div>
        <div style="color:#64748b;font-size:12px;">${new Date(a.approved_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${a.approved_label ? ' · ' + escHtml(a.approved_label) : ''} · a design approval, not a signed contract</div>
        <div style="display:flex;gap:6px;margin-top:6px;"><button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" onclick="markApprovalSeen('${escHtml(a.id)}', true)">Open project</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:5px 12px;" onclick="markApprovalSeen('${escHtml(a.id)}')">Got it</button></div></div></div>`; }).join('') +
  leadInbox.map(l => `<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);align-items:flex-start;">
      ${l.floor_plan_dataurl ? `<img src="${escHtml(l.floor_plan_dataurl)}" alt="" style="width:90px;border:1px solid var(--border);border-radius:6px;flex-shrink:0;">` : ''}
      <div style="flex:1;min-width:0;font-size:13px;line-height:1.5;">
        <div style="font-weight:800;">${escHtml(l.name || 'Homeowner')} <span style="font-weight:400;color:#64748b;font-size:11px;">${new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${l.source === 'design_link' ? 'your design link' : 'Connect with a Pro'}</span></div>
        <div style="color:#475569;">${[l.email, l.phone, l.zip].filter(Boolean).map(escHtml).join(' · ')}</div>
        ${l.plan_summary ? `<div style="color:#64748b;font-size:12px;">${escHtml(l.plan_summary)}</div>` : ''}
        ${l.note ? `<div style="color:#64748b;font-size:12px;font-style:italic;">“${escHtml(l.note)}”</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
          <button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" onclick="acceptLead('${escHtml(l.id)}')">Accept → open as project</button>
          <button class="btn btn-secondary" style="font-size:12px;padding:5px 12px;" onclick="markLeadHandled('${escHtml(l.id)}')">Mark handled</button>
        </div></div></div>`).join('');
}
async function markLeadHandled(id) {
  const { error } = await db.from('leads').update({ contacted: true }).eq('id', id);
  if (error) { alert("Couldn't update that lead: " + error.message); return; }
  refreshLeadAlerts();
}
function leadToast(msg) {
  const t = document.createElement('div');
  t.textContent = '🔔 ' + msg;
  t.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;background:#0f766e;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.2);cursor:pointer;';
  t.onclick = () => { t.remove(); openLeadInbox(); };
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 8000);
}
