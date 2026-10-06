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
  if (intro) intro.textContent = `${name} gets your whole design — every cabinet, measurement and finish you picked — and will contact you about pricing and next steps.`;
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

// ── In the company's own planner: open a lead's design as a project ──
async function openLeadFromUrl() {
  const id = new URLSearchParams(location.search).get('lead');
  if (!id || !currentUser) return;
  history.replaceState({}, '', '/app');   // a refresh shouldn't import it twice
  const { data: lead, error } = await db.from('leads').select('*').eq('id', id).maybeSingle();
  if (error || !lead) { alert("Couldn't open that lead — it may have been removed, or it belongs to another company."); return; }
  if (lead.project_id && getProj(lead.project_id)) { openProject(lead.project_id); return; }
  const d = homeClean(lead.design || {});
  ['name', 'phone', 'email', 'zip', 'note'].forEach(k => { if (lead[k] != null) lead[k] = homeClean(String(lead[k])); });   // typed by an anonymous visitor
  if (!d || !Array.isArray(d.rooms) || !d.rooms.length) { alert('That lead has no design attached.'); return; }
  const when = new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const proj = migrateProject({
    id: newId(),
    customer: lead.name || 'Homeowner design',
    phone: lead.phone || '',
    company: companyProfile.company_name || '',
    type: d.type || 'Kitchen',
    notes: [lead.note, lead.email ? 'Email: ' + lead.email : '', lead.zip ? 'ZIP: ' + lead.zip : '', `Designed by the homeowner on your design link (${when}).`].filter(Boolean).join('\n'),
    address: '', city: '', state: '',
    style: getStyles().some(s => s.code === d.style) ? d.style : (getStyles()[0] || {}).code,
    createdAt: Date.now(),
    rooms: d.rooms,
    ...(d.scene ? { scene: d.scene } : {}), ...(d.countertop ? { countertop: d.countertop } : {}), ...(d.hardware ? { hardware: d.hardware } : {}),
    status: 'Lead',
    activityLog: [{ id: uid(), type: 'note', text: `Created from ${lead.name || 'a homeowner'}'s design, sent from your design link`, createdAt: new Date().toISOString(), user: currentUser.email }],
    jobCosts: [], trimItems: [], quoteLocked: false, lockedQuote: null, quoteHistory: [],
  });
  state.projects.unshift(proj);
  renderSidebar();
  openProject(proj.id, proj.rooms[0] && proj.rooms[0].id);
  persist();
  const { error: e2 } = await db.from('leads').update({ project_id: proj.id }).eq('id', id);
  if (e2) console.warn('Lead → project link not saved:', e2);
}
