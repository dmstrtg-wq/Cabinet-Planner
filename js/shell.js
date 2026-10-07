// My Cabinet Planner — js/shell.js
// Phone mode, BOOT (runs the app), tour, contact, FAQ, Connect with a Pro.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// PHONE MODE
// ════════════════════════════
function phoneTab(tab) {
  // Update bottom nav active state
  ['plan','elev','3d','quote'].forEach(t => {
    const btn = document.getElementById('pnav-' + t);
    if (btn) {
      btn.classList.toggle('active', t === tab);
      const svg = btn.querySelector('svg');
      if (svg) svg.style.stroke = t === tab ? '#0f766e' : '#6b7280';
    }
  });

  const qp = document.getElementById('phone-quote-panel');
  if (tab === 'quote') {
    // Show quote panel over the canvas
    qp.classList.add('pq-open');
    renderPhoneQuote();
  } else {
    qp.classList.remove('pq-open');
    // Switch canvas view
    const modeMap = { plan: 'floor', elev: 'elevation', '3d': '3d' };
    if (modeMap[tab]) setViewMode(modeMap[tab]);
  }
}

function renderPhoneQuote() {
  const r = activeRoom ? activeRoom() : null;
  const titleEl = document.getElementById('phone-quote-title');
  const bodyEl  = document.getElementById('phone-quote-body');
  if (!r) {
    if (titleEl) titleEl.textContent = 'Quote';
    if (bodyEl)  bodyEl.innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px 0;">No project selected.</p>';
    return;
  }
  if (titleEl) titleEl.textContent = (r.name || 'Room') + ' — Quote';

  const cabs  = r.cabinets  || [];
  const apps  = r.appliances || [];
  const isls  = r.islands   || [];
  const all   = [...cabs, ...apps, ...isls];

  if (!all.length) {
    bodyEl.innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px 0;">No items added yet.</p>';
    return;
  }

  // Group by type+label
  const groups = {};
  all.forEach(item => {
    const key   = item.type;
    const label = CATALOG[key]?.label || APPLIANCES[key]?.label || key;
    if (!groups[key]) groups[key] = { label, count: 0, items: [] };
    groups[key].count++;
    groups[key].items.push(item);
  });

  const rows = Object.values(groups).map(g => `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:13px 0;border-bottom:1px solid #e5e7eb;">
      <span style="font-size:14px;color:#0f172a;font-weight:500;">${g.label}</span>
      <span style="font-size:14px;font-weight:700;color:#0f172a;white-space:nowrap;margin-left:12px;">× ${g.count}</span>
    </div>
  `).join('');

  bodyEl.innerHTML = `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
      ${rows}
      <div style="display:flex;justify-content:space-between;padding:14px 0 0;font-size:13px;color:#6b7280;">
        <span>Total items</span>
        <strong style="color:#0f172a;">${all.length}</strong>
      </div>
    </div>
    <p style="font-size:12px;color:#6b7280;text-align:center;line-height:1.6;">
      Pricing &amp; full PDF export available on desktop or tablet.
    </p>
  `;
}

// Sync phone nav active state when desktop view toggle is used
const _origSetViewMode = typeof setViewMode === 'function' ? setViewMode : null;
// (phoneTab calls setViewMode internally; desktop calls setViewMode directly — both are fine)

// ════════════════════════════
// ════════════════════════════
// BOOT
// ════════════════════════════
document.getElementById('new-project-btn').addEventListener('click', openNewProjectModal);
document.getElementById('login-btn').addEventListener('click', handleSignIn);
document.getElementById('login-password').addEventListener('keydown', e => { if (e.key==='Enter') handleSignIn(); });
document.getElementById('login-email').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('login-password').focus(); });
buildStylePanel();
_initVpEvents('floor');
_initVpEvents('elev');

// F key = fit to view on active canvas
document.addEventListener('keydown', e => {
  if (e.key === 'f' || e.key === 'F') {
    if (document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
    const view = state.viewMode === 'elevation' ? 'elev' : 'floor';
    fitView(view);
  }
});

(async () => {
  // Demo mode: skip login, boot straight into the app with a local-only session
  if (HOME_PRO) { await homeStart(); maybeStartTour(); return; }   // homeowner mode (js/homeowner.js)
  if (SHARE_TOKEN) { await shareStart(); maybeStartTour(); return; }   // customer's share link (js/share.js)
  if (IS_DEMO) {
    currentUser = null;
    showApp();
    seedDemoIfFirstVisit();
    loadProjectsFromLocal();
    maybeStartTour();
    return;
  }

  pendingAuthType = getHashParam('type'); // 'invite' or 'recovery' if arriving via email link
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    currentUser = session.user;
    showApp();
    await resolveTeamContext();
    await loadAccountData();
    openProjectFromUrl();
    if (typeof openLeadFromUrl === 'function') openLeadFromUrl();   // homeowner design → project (6.1)
    maybeStartTour();
      if (pendingAuthType === 'invite' || pendingAuthType === 'recovery') {
      openModal('modal-set-password');
    }
  } else {
    showLogin();
  }
})();

db.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') showLogin();
});

// ════════════════════════════
// TOUR
// ════════════════════════════
// Replaced by feature tips (js/tips.js). These names are still called at startup.
function maybeStartTour() { if (typeof tipsStart === 'function') tipsStart(); }
function startTour() { if (typeof replayTips === 'function') replayTips(); }

// ════════════════════════════
// ════════════════════════════
// CONTACT
// ════════════════════════════
async function submitContact() {
  const name    = document.getElementById('contact-name').value.trim();
  const email   = document.getElementById('contact-email').value.trim();
  const subject = document.getElementById('contact-subject').value;
  const message = document.getElementById('contact-message').value.trim();
  if (!name || !email || !subject || !message) { alert('Please fill in all fields.'); return; }
  // Send via mailto as a fallback until a backend form is wired up
  const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`);
  const subjectLine = encodeURIComponent(`[My Cabinet Planner] ${subject}`);
  window.location.href = `mailto:contact@mycabinetplanner.com?subject=${subjectLine}&body=${body}`;
  closeModal('modal-contact');
  // Clear fields
  ['contact-name','contact-email','contact-message'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('contact-subject').value = '';
}

// ════════════════════════════
// FAQ
// ════════════════════════════
function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const isOpen = answer.classList.contains('open');
  document.querySelectorAll('.faq-a').forEach(a=>a.classList.remove('open'));
  document.querySelectorAll('.faq-q').forEach(q=>q.classList.remove('open'));
  if (!isOpen) { answer.classList.add('open'); btn.classList.add('open'); }
}

/* ── CONNECT WITH A PRO ── */
// Plain-text description of a design for the lead email: rooms, sizes, finish, and the
// cabinets on each wall (so the email is useful even before anyone opens the planner)
function designDetails(p) {
  if (!p) return '';
  const ft = v => `${Math.floor(v / 12)}'${v % 12 ? Math.round(v % 12) + '"' : ''}`;
  const style = (getStyles().find(s => s.code === p.style) || {}).name || p.style || '';
  return p.rooms.map(r => {
    const w = r.walls || {};
    const lines = [`${r.name || 'Room'} — ${ft(w.north || w.south || 0)} × ${ft(w.east || w.west || 0)}, ceiling ${r.ceilingHeight || 96}"`];
    roomWalls(r).forEach(wall => {
      const cabs = (r.cabinets || []).filter(c => c.wall === wall).sort((a, b) => a.offset - b.offset);
      const apps = (r.appliances || []).filter(a => a.wall === wall);
      if (!cabs.length && !apps.length) return;
      lines.push(`  ${wall[0].toUpperCase() + wall.slice(1)} wall: ` + [...cabs.map(c => `${(CATALOG[c.type] || {}).label || c.type} ${c.width}"`), ...apps.map(a => (APPLIANCES[a.type] || {}).label || a.type)].join(', '));
    });
    (r.islands || []).forEach(i => lines.push(`  Island ${i.width}" × ${i.depth}"`));
    return lines.join('\n');
  }).join('\n') + (style ? `\nFinish: ${style}` : '');
}

async function submitProLead() {
  const name  = (document.getElementById('lead-name').value  || '').trim();
  const email = (document.getElementById('lead-email').value || '').trim();
  const phone = (document.getElementById('lead-phone').value || '').trim();
  const zip   = (document.getElementById('lead-zip').value   || '').trim();
  const note  = (document.getElementById('lead-note').value  || '').trim();
  const errEl = document.getElementById('lead-error');
  const btn   = document.getElementById('lead-submit-btn');

  errEl.style.display = 'none';
  // Spam trap: a hidden field people never see; bots fill it in. Pretend it worked.
  if ((document.getElementById('lead-website') || {}).value) { closeModal('modal-pro-lead'); return; }
  if (!name || !email || !zip) {
    errEl.textContent = 'Name, email, and ZIP are required.';
    errEl.style.display = 'block';
    return;
  }
  if (!email.includes('@')) {
    errEl.textContent = 'Please enter a valid email address.';
    errEl.style.display = 'block';
    return;
  }

  // The whole design goes with the lead, so whoever gets it can accept it straight into
  // their planner (6.1). On a company's design link a design is required; on the demo's
  // "Connect with a Pro" it's sent whenever there is one.
  let design = null;
  const dp = activeProj();
  const hasCabs = dp && dp.rooms.some(r => (r.cabinets || []).length);
  if (HOME_PRO && !hasCabs) {
    errEl.textContent = 'Add some cabinets to your design first, then send it.';
    errEl.style.display = 'block';
    return;
  }
  if (hasCabs) {
    try { design = homeDesignPayload(dp); }
    catch (e) { if (HOME_PRO) { errEl.textContent = e.message; errEl.style.display = 'block'; return; } }
  }
  const leadId = (crypto.randomUUID ? crypto.randomUUID() : null);

  btn.disabled = true; btn.textContent = 'Sending…';

  // Build plan summary from current project (rooms keep their cabinets in r.cabinets —
  // this used to count r.walls[].cabinets, which doesn't exist, so it always said 0)
  let planSummary = '';
  try {
    const p = activeProj();
    if (p) {
      const cabCount = p.rooms.reduce((n, r) => n + (r.cabinets || []).length, 0);
      planSummary = `${p.type || 'Kitchen'}: ${p.rooms.map(r => r.name || 'Room').join(', ')} — ${cabCount} cabinet${cabCount === 1 ? '' : 's'}` +
        (p.rooms[0] && p.rooms[0].walls ? (w => `, ${Math.round((w.north || w.south || 0) / 12 * 10) / 10}' × ${Math.round((w.east || w.west || 0) / 12 * 10) / 10}' room`)(p.rooms[0].walls) : '');   // (L-shaped rooms can have a 0 on one side)
    }
  } catch(e) {}

  // Thumbnail from the floor-plan canvas (JPEG, ~300px wide)
  let floorPlanDataUrl = null;
  try {
    const fpCanvas = document.getElementById('floor-plan');
    if (fpCanvas && fpCanvas.width > 0) {
      const thumb = document.createElement('canvas');
      thumb.width  = 300;
      thumb.height = Math.round(300 * fpCanvas.height / fpCanvas.width);
      thumb.getContext('2d').drawImage(fpCanvas, 0, 0, thumb.width, thumb.height);
      floorPlanDataUrl = thumb.toDataURL('image/jpeg', 0.65);
    }
  } catch(e) {}

  // Two independent channels; the lead counts as delivered if either one lands.
  let emailSent = false, saved = false;

  // Supabase first — stores the lead (and design) for the Leads tab; the email below links to it
  // (supabase-js reports failures via the returned error, it doesn't throw)
  try {
    const { error } = await db.from('leads').insert({
      ...(leadId ? { id: leadId } : {}),
      name, email, phone, zip, note,
      plan_summary: planSummary,
      floor_plan_dataurl: floorPlanDataUrl,
      design,
      ...(HOME_PRO ? { company_id: HOME_LISTING.user_id, source: 'design_link' } : {}),
    });
    if (error) { console.warn('Lead Supabase insert error:', error); if (/Too many|already sent/.test(error.message || '')) errEl.dataset.msg = error.message; }
    else saved = true;
  } catch(e) { console.warn('Lead Supabase insert error:', e); }

  // Netlify Forms — sends email notification to site owner (network leads only: a lead sent
  // to one company through its design link belongs to that company, not to us)
  if (!HOME_PRO) try {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'form-name': 'cabinet-pro-lead',
        name, email, phone, zip, note,
        plan_summary: planSummary,
        design_details: designDetails(dp),
        accept_lead: saved && leadId ? `${location.origin}/app?lead=${leadId}` : 'Open the Leads tab in your profile',
      }).toString()
    });
    emailSent = res.ok;
    if (!res.ok) console.warn('Lead Netlify submit failed:', res.status);
  } catch(e) { console.warn('Lead Netlify submit error:', e); }

  if (!emailSent && !saved) {
    // Nothing got through — don't pretend it did. Keep the form filled so they can retry.
    errEl.textContent = errEl.dataset.msg || "We couldn't send your info just now. Please try again in a moment.";
    delete errEl.dataset.msg;
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Send My Info';
    return;
  }

  // Reset + close
  ['lead-name','lead-email','lead-phone','lead-zip','lead-note'].forEach(id => {
    document.getElementById(id).value = '';
  });
  btn.disabled = false; btn.textContent = 'Send My Info';
  closeModal('modal-pro-lead');
  if (HOME_PRO) {
    const L = HOME_LISTING;
    alert(`Sent! ${L.company_name} has your design and will be in touch.` + (L.phone ? `\n\nWant to talk sooner? Call ${L.phone}.` : ''));
  } else alert('Thanks! A cabinet pro will be in touch soon.');
}


