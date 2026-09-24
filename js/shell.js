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
  if (IS_DEMO) {
    currentUser = null;
    showApp();
    seedDemoIfFirstVisit();
    loadProjectsFromLocal();
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
const TOUR_STEPS = [
  { tag:'Welcome',
    title:'Welcome to My Cabinet Planner!',
    body:"Let's take a 30-second tour of the key features. You can skip anytime — the Tips button in the header replays it whenever you need." },
  { tag:'Adding Cabinets',
    title:'Left Panel — Add Cabinets',
    body:'Select a cabinet type and dimensions in the left panel, then click Add Cabinet. It appears on whichever wall is selected in the dropdown above it.' },
  { tag:'Floor Plan',
    title:'Your Floor Plan',
    body:'Cabinets show up as colored boxes on the floor plan. Double-click any cabinet to edit dimensions, add notes, or delete it. Drag it to reposition along the wall.' },
  { tag:'Base vs. Upper',
    title:'Switching Between Layers',
    body:'Use the Show dropdown in the toolbar to filter the floor plan. "Wall Only" shows just upper cabinets — much easier when placing them without base cabinets in the way.' },
  { tag:'Views',
    title:'Floor Plan · Elevation · 3D',
    body:'The tabs at the top right switch your view. Elevation shows a side view of each wall — great for verifying upper cabinet heights and gaps. 3D gives you a full walkthrough.' },
  { tag:'Exporting',
    title:'Export Your Quote',
    body:'Export PDF generates a multi-page document: floor plan, wall elevations, and a full quote with line items, totals, signature lines, and terms — ready to hand to a customer.',
    last:true },
];
let _tourStep = 0;

function maybeStartTour() {
  if (!localStorage.getItem('mcp_tour_done')) setTimeout(startTour, 1000);
}
function startTour() {
  try { closeModal('modal-faq'); } catch(e) {}
  _tourStep = 0;
  _renderTourStep();
  document.getElementById('tour-overlay').classList.add('active');
}
function _renderTourStep() {
  const step = TOUR_STEPS[_tourStep];
  document.getElementById('tour-tag').textContent   = step.tag;
  document.getElementById('tour-title').textContent = step.title;
  document.getElementById('tour-body').textContent  = step.body;
  document.getElementById('tour-next-btn').textContent = step.last ? 'Done ✓' : 'Next →';
  // Progress dots
  const dotsEl = document.getElementById('tour-dots');
  dotsEl.innerHTML = TOUR_STEPS.map((_,i) =>
    `<div class="tour-dot${i===_tourStep?' active':''}"></div>`
  ).join('');
}
function tourNext() {
  if (_tourStep >= TOUR_STEPS.length - 1) { endTour(); return; }
  _tourStep++;
  _renderTourStep();
}
function endTour() {
  localStorage.setItem('mcp_tour_done', '1');
  document.getElementById('tour-overlay').classList.remove('active');
}

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
async function submitProLead() {
  const name  = (document.getElementById('lead-name').value  || '').trim();
  const email = (document.getElementById('lead-email').value || '').trim();
  const phone = (document.getElementById('lead-phone').value || '').trim();
  const zip   = (document.getElementById('lead-zip').value   || '').trim();
  const note  = (document.getElementById('lead-note').value  || '').trim();
  const errEl = document.getElementById('lead-error');
  const btn   = document.getElementById('lead-submit-btn');

  errEl.style.display = 'none';
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

  btn.disabled = true; btn.textContent = 'Sending…';

  // Build plan summary from current project
  let planSummary = '';
  try {
    const p = activeProj();
    const r = activeRoom();
    if (p && r) {
      const walls = r.walls || [];
      const cabCount = walls.reduce((s, w) => s + (w.cabinets || []).length, 0);
      planSummary = `${p.customer || 'Untitled project'} — ${r.name || 'Room'}: ${walls.length} wall(s), ${cabCount} cabinet(s)`;
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

  // Netlify Forms — sends email notification to site owner
  try {
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'form-name': 'cabinet-pro-lead',
        name, email, phone, zip, note,
        plan_summary: planSummary
      }).toString()
    });
    emailSent = res.ok;
    if (!res.ok) console.warn('Lead Netlify submit failed:', res.status);
  } catch(e) { console.warn('Lead Netlify submit error:', e); }

  // Supabase — stores lead for the admin Leads view in profile.html
  // (supabase-js reports failures via the returned error, it doesn't throw)
  try {
    const { error } = await db.from('leads').insert({
      name, email, phone, zip, note,
      plan_summary: planSummary,
      floor_plan_dataurl: floorPlanDataUrl
    });
    if (error) console.warn('Lead Supabase insert error:', error); else saved = true;
  } catch(e) { console.warn('Lead Supabase insert error:', e); }

  if (!emailSent && !saved) {
    // Nothing got through — don't pretend it did. Keep the form filled so they can retry.
    errEl.textContent = "We couldn't send your info just now. Please try again in a moment.";
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
  alert('Thanks! A cabinet pro will be in touch soon.');
}


