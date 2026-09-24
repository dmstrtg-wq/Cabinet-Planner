// My Cabinet Planner — js/account.js
// Job status + activity log, team context, company profile + tier gating, invite/recovery.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// PROJECT MANAGEMENT
// ════════════════════════════
const STATUS_COLORS = {
  Lead:       { bg:'#dbeafe', color:'#1d4ed8' },
  Quoted:     { bg:'#fef9c3', color:'#a16207' },
  Ordered:    { bg:'#ffedd5', color:'#c2410c' },
  Installing: { bg:'#f3e8ff', color:'#7e22ce' },
  Complete:   { bg:'#dcfce7', color:'#15803d' },
};

function openStatusMenu(pill) {
  const menu = document.getElementById('status-menu');
  const rect = pill.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';
  menu.classList.toggle('open');
  if (menu.classList.contains('open')) {
    setTimeout(() => document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target) && e.target !== pill) {
        menu.classList.remove('open');
        document.removeEventListener('click', close);
      }
    }), 0);
  }
}

function setProjectStatus(status) {
  const p = activeProj(); if (!p) return;
  const prev = p.status || 'Lead';
  const needsQuote = ['Ordered', 'Installing', 'Complete'].includes(status);
  if (needsQuote && !p.quoteLocked && !p.lastQuotedAt) {
    const proceed = confirm(
      `This project hasn't had a quote sent yet — advance to "${status}" anyway?`
    );
    if (!proceed) {
      document.getElementById('status-menu').classList.remove('open');
      return;
    }
  }
  p.status = status;
  // Auto-add a log entry for the status change
  if (!p.activityLog) p.activityLog = [];
  p.activityLog.unshift({
    id: uid(), type: 'status',
    text: `Status changed from ${prev} to ${status}`,
    createdAt: new Date().toISOString(),
    user: currentUser ? currentUser.email : 'You'
  });
  document.getElementById('status-menu').classList.remove('open');
  persist(); renderProjectView();
}

function openActivityLog() {
  if (!canAccess('silver')) { showTierUpgradePrompt('silver', 'Job Status Pipeline'); return; }
  const p = activeProj(); if (!p) return;
  document.getElementById('al-project-name').textContent = p.customer + (p.company ? ` · ${p.company}` : '');
  document.getElementById('al-note-input').value = '';
  renderActivityFeed();
  openModal('modal-activity-log');
}

function renderActivityFeed() {
  const p = activeProj();
  const feed = document.getElementById('al-feed');
  if (!p) return;
  const log = p.activityLog || [];
  if (!log.length) {
    feed.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px 0;">No activity yet — add a note above.</p>';
    return;
  }
  feed.innerHTML = log.map(e => {
    const d = new Date(e.createdAt);
    const dateStr = d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
    const isStatus = e.type === 'status';
    const isQuote  = e.type === 'quote';
    const initials = (e.user || 'You').split('@')[0].slice(0,2).toUpperCase();
    const avatarStyle = isStatus ? 'background:linear-gradient(135deg,#3b82f6,#1d4ed8);'
                      : isQuote  ? 'background:linear-gradient(135deg,#0f766e,#0f766e);'
                      : '';
    const avatarIcon = isStatus ? '⟳' : isQuote ? '📄' : initials;
    const textStyle  = isStatus ? 'color:var(--text-muted);font-style:italic;'
                     : isQuote  ? 'color:#0f766e;font-weight:600;'
                     : '';
    return `
      <div class="al-entry">
        <div class="al-avatar" style="${avatarStyle}">${avatarIcon}</div>
        <div class="al-body">
          <div class="al-meta">${escHtml(e.user || 'You')} · ${dateStr} at ${timeStr}</div>
          <div class="al-text" style="${textStyle}">${escHtml(e.text)}</div>
        </div>
      </div>`;
  }).join('');
}

function addActivityNote() {
  const p = activeProj(); if (!p) return;
  const input = document.getElementById('al-note-input');
  const text = input.value.trim();
  if (!text) return;
  if (!p.activityLog) p.activityLog = [];
  p.activityLog.unshift({
    id: uid(), type: 'note',
    text,
    createdAt: new Date().toISOString(),
    user: currentUser ? currentUser.email : 'You'
  });
  input.value = '';
  persist(); renderActivityFeed();
}

// ════════════════════════════
// TEAM CONTEXT — which account this session is acting under
// ════════════════════════════
// effectiveOwnerId is whose data (projects, company profile, pricing) we read/write —
// either the logged-in user's own account, or the owner of a team they're an active
// member of. myTeamRole is 'owner' (default) or the role ('admin'/'member') assigned
// by that owner. Call resolveTeamContext() once per session, before loading anything
// account-scoped.
let effectiveOwnerId = null;
let myTeamRole = 'owner';
async function resolveTeamContext() {
  effectiveOwnerId = currentUser.id;
  myTeamRole = 'owner';
  let { data } = await db.from('team_members')
    .select('owner_id, role, status')
    .eq('member_user_id', currentUser.id)
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data && data.status === 'pending') {
    // First time this membership is seen — activate it via the server function (never a
    // direct client write to team_members beyond the owner's own row, so a member can't
    // self-promote). Covers both a fresh invite-link arrival and an existing user who
    // already had a password and just logged in normally.
    try {
      const { data: { session } } = await db.auth.getSession();
      await fetch('/.netlify/functions/accept-team-invite', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      data.status = 'active';
    } catch (e) { console.warn('Accept invite error:', e); }
  }
  if (data && data.status === 'active') {
    effectiveOwnerId = data.owner_id;
    myTeamRole = data.role;
  }
}

// ════════════════════════════
// COMPANY SETTINGS
// ════════════════════════════
let companyProfile = {};

// ── Subscription tier helpers ──────────────────────────────────────────────
// Tier order: free < silver < gold
const TIER_RANK = { free: 0, silver: 1, gold: 2 };
function currentTier() { return companyProfile.subscription_tier || 'free'; }
function canAccess(requiredTier) {
  return (TIER_RANK[currentTier()] ?? 0) >= (TIER_RANK[requiredTier] ?? 99);
}

async function loadCompanyProfile() {
  if (!currentUser) return;
  const { data } = await db.from('company_profiles').select('*').eq('user_id', effectiveOwnerId).single();
  if (data) companyProfile = data;
  applyTierGates();
}

// Apply/remove tier-gated UI after profile loads
function applyTierGates() {
  // Free tier body class — controls "Connect with a Pro" button visibility
  document.body.classList.toggle('free-tier', !canAccess('silver'));
  // Pricing-locked class — hides pricing toggle below Silver (Silver+ unlocks)
  document.body.classList.toggle('pricing-locked', !canAccess('silver'));

  // PDF export button — Silver+
  const pdfBtn = document.getElementById('pdf-export-btn');
  if (pdfBtn) {
    const locked = !canAccess('silver');
    pdfBtn.style.opacity  = locked ? '0.45' : '';
    pdfBtn.style.cursor   = locked ? 'not-allowed' : '';
    pdfBtn.title          = locked ? 'PDF export requires Silver or higher' : '';
  }
  // Status pill + log button visibility — Silver+
  const statusPill = document.getElementById('pv-status-pill');
  if (statusPill) statusPill.style.display = canAccess('silver') ? '' : 'none';
}

function showTierUpgradePrompt(required, featureName) {
  const tierLabel = { silver: 'Silver', gold: 'Gold' };
  const msg = `${featureName} is available on the ${tierLabel[required] || required} plan and above.\n\nUpgrade at mycabinetplanner.com to unlock this feature.`;
  alert(msg);
}

// ════════════════════════════
// INVITE / RECOVERY FLOW
// ════════════════════════════
function getHashParam(key) {
  const params = new URLSearchParams(window.location.hash.substring(1));
  return params.get(key);
}

// Open a specific project if ?project=ID is in the URL (deep-link from profile/project pages)
function openProjectFromUrl() {
  const projId = new URLSearchParams(location.search).get('project');
  if (projId && getProj(projId)) {
    openProject(projId);
    // Clean the URL so refreshing doesn't re-trigger
    history.replaceState({}, '', '/app');
  }
}
async function setNewPassword() {
  const pw      = document.getElementById('sp-password').value;
  const confirm = document.getElementById('sp-confirm').value;
  const err     = document.getElementById('sp-error');
  err.textContent = '';
  if (pw.length < 8)  { err.textContent = 'Password must be at least 8 characters.'; return; }
  if (pw !== confirm) { err.textContent = 'Passwords do not match.'; return; }
  const btn = document.querySelector('#modal-set-password .btn-primary');
  btn.disabled = true; btn.textContent = 'Saving…';
  const { error } = await db.auth.updateUser({ password: pw });
  if (error) { btn.disabled = false; btn.textContent = 'Set Password & Continue →'; err.textContent = error.message; return; }

  // Team invite: resolveTeamContext() activates the pending membership and resolves
  // which account we're now acting under, then reload their shared workspace.
  if (pendingAuthType === 'invite') {
    await resolveTeamContext();
    await loadAccountData();
  }

  btn.disabled = false; btn.textContent = 'Set Password & Continue →';
  closeModal('modal-set-password');
  history.replaceState(null, '', window.location.pathname);
}

