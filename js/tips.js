// My Cabinet Planner — js/tips.js
// Feature tips: the first time someone opens each part of the app, a short set of skippable
// tips points at the real buttons (the rest of the page dims, a bubble explains the button).
// Used by app.html and profile.html (classic script, shared globals).
//
// • Seen tips are remembered per account (Supabase auth user_metadata.tips_seen, one entry per
//   tip: "<set>.<index>"), so a laptop,
//   a tablet and a phone don't repeat them. Demo visitors, homeowners (design link) and customers
//   (share link) have no account — their browser remembers instead.
// • A tip whose button isn't on screen (phone layout, hidden for this mode) is skipped and stays
//   unseen, so it shows later on a screen that has it. Only the tips actually shown are marked.
// • Features the plan doesn't include still get their tip, tagged "Silver feature"/"Gold feature".
// • The Tips button (planner header / profile title) replays the tips for the current screen.
// Keep every tip TRUE to the current code — nothing aspirational, nothing about prices we
// don't have (prices only ever come from the account's own price sheet).

const TIP_SETS = {
  // ── Planner ──────────────────────────────────────────────────────────
  welcome: { name: 'Getting started', steps: [
    { el: '#welcome .btn-primary, #new-project-btn', title: 'Start your first project',
      body: 'Each customer job is one project. Enter the customer\'s name, the project type and the room size. You can add more rooms later.' },
    { el: '#my-profile-link', title: 'Set up your company',
      body: 'Open My Profile, then Company Settings. Your logo, address, phone and terms print on every quote and PDF, and two minutes there makes everything look like yours.' },
    { el: '#my-profile-link', tier: 'silver', title: 'Prices come from your price lists',
      body: 'Nothing is guessed: a cabinet only gets a price from a price list you add (My Profile → My Pricing). Until then, it shows N/A.' },
  ]},
  planner: { name: 'Designing', steps: [
    { el: '#palette-section', title: 'The catalog',
      body: 'Drag any cabinet onto the floor plan, and it snaps to the wall and its neighbors. You can also click a tile to add it to the end of the selected wall. Search by code ("B36") or by word ("sink").' },
    { el: '#floor-plan', title: 'Select, move, edit',
      body: 'Click a cabinet to select it. Then drag it or use the arrow keys to move it, or press Delete to remove it. Double-click it to change its size, door style or notes.' },
    { el: '.add-room-btn', title: 'Rooms',
      body: 'One project can hold several rooms (kitchen, baths, laundry…). Each room tab has its own layout; the quote adds them all up.' },
    { el: '#vt-floor', also: ['#vt-elev', '#vt-3d'], title: 'Floor Plan · Elevation · 3D',
      body: 'These are three views of the same design. Change one, and the others follow. Elevation shows each wall straight on, and 3D is what sells the job.' },
    { el: '#designcheck-section', tier: 'silver', title: 'Design Check',
      body: 'Design Check flags layout problems as you work, such as tight aisles, missing landing space, uppers that are too low, or cabinets over a window. Click a warning to find it.' },
    { el: 'button[onclick="replayTips()"]', title: 'Tips any time',
      body: 'Tap Tips any time to see the tips for the screen you\'re on. Help & FAQ, linked in every tip, answers common questions.' },
  ]},
  'planner-more': { name: 'Quoting & ordering', steps: [
    { el: '.header-actions button[onclick="openQuoteModal()"]', tier: 'silver', title: 'Quote',
      body: 'The quote uses the prices from your price sheet, plus labor, trim, hardware and your markup. Print it or save it as a PDF.' },
    { el: '#pdf-export-btn', tier: 'silver', title: 'Export PDF',
      body: 'One customer-ready file: you choose the floor plans and elevations for every room, 3D views, the cut list and the itemized quote with your terms and signature lines. Leave the quote out for a plans-only set for installers.' },
    { el: '#share-btn', tier: 'gold', title: 'Share with your customer',
      body: 'Send your customer a link. They can spin the 3D view on their phone and tap Approve. You get an email, and the approval is logged on the job.' },
    { el: '#order-list-btn', tier: 'silver', title: 'Order List',
      body: 'This lists every cabinet, panel and filler with your supplier\'s item codes. Download it as a CSV for your supplier\'s order form, or print it.' },
    { el: '#pv-status-pill', tier: 'silver', title: 'Job status',
      body: 'Move the job from Lead to Quoted, Ordered, Installing and Complete. The Log button keeps the job\'s history, including notes, quote versions and approvals.' },
    { el: 'button[onclick="showShortcutSheet()"]', also: ['#undo-btn'], title: 'Undo & shortcuts',
      body: 'Press ⌘Z to undo and Shift-⌘Z to redo (Ctrl on Windows). The ⌨ button lists every shortcut. For example, B, W and T jump straight to Base, Wall and Tall cabinets.' },
  ]},
  elevation: { name: 'Elevation', steps: [
    { el: '.elev-wall-tab', also: ['.elev-wall-tab:last-of-type'], title: 'Pick a wall',
      body: 'Each tab shows one wall straight on, with its base and upper heights, gaps, windows and doors.' },
    { el: '#elevation-plan', title: 'Work right on the wall',
      body: 'You can drag cabinets here too, which is handy for uppers. Double-click a cabinet to edit it. The numbered tags match the cut list and the quote.' },
    { el: '#dims-btn-elev', title: 'Dims',
      body: 'Dims shows the measurements and the open space left on the wall so you can see what still fits.' },
    { el: '#cutlist-btn-elev', title: 'Cut list',
      body: 'The cut list shows every numbered item in the room with its size, using the same numbers as the drawings.' },
  ]},
  '3d': { name: '3D view', steps: [
    { el: '#iso-plan', title: 'Look around',
      body: 'Drag to spin the kitchen. Scroll or pinch to zoom.' },
    { el: 'button[onclick="setCameraPreset(\'hero\')"]', also: ['button[onclick="setCameraPreset(\'overhead\')"]'], title: 'Camera presets',
      body: 'Jump to a 3/4 view, a view from the doorway at eye height, a view straight at any wall, or a view from overhead.' },
    { el: '#light-sel', also: ['#floor-sel'], title: 'Lighting and floor',
      body: 'Choose daylight or evening light, and a floor that looks like the customer\'s.' },
    { el: '#style-current', title: 'Door style',
      body: 'Change the finish for the whole project and watch the 3D view update. To make one cabinet different, double-click it.' },
    { el: '#snap-add-btn', tier: 'silver', title: 'Add to quote',
      body: 'This puts the exact view you see on the quote in your PDF. You can add up to 3 views.' },
  ]},
  quote: { name: 'Quote', steps: [
    { el: '#job-cost-rows, button[onclick="addJobCostRow()"]', also: ['button[onclick="addJobCostRow()"]'], title: 'Job costs',
      body: 'Add labor, removal, delivery or anything else that isn\'t a cabinet. You can add as many lines as you need.' },
    { el: '#hardware-rows', title: 'Hardware & accessories',
      body: 'Pulls, knobs and trash pull-outs are counted from your plan. You type in the prices; nothing is filled in for you.' },
    { el: '#quote-totals-preview', tier: 'silver', title: 'Totals and markup',
      body: 'Set your markup on cabinets here. Your customer sees it built into the cabinet prices, never as a separate line.' },
    { el: '#quote-export-btn', tier: 'silver', title: 'Export PDF',
      body: 'Export PDF makes a PDF of this quote with your terms and signature lines, and you can add the drawings and 3D views to the same file. On Gold, you can mark it as sent, and any change after that prints as a tracked revision.' },
    { el: '#quote-share-btn', tier: 'gold', title: 'Share with customer',
      body: 'Send your customer a link to view the design (and the quote, if you choose) and approve it.' },
  ]},
  // ── Homeowner design link / customer share link ──────────────────────
  home: { name: 'Design your space', steps: [
    { el: '#palette-section', title: 'Add cabinets',
      body: 'Drag cabinets onto the floor plan, and they snap to the wall. Click a cabinet to move it, or double-click it to change its size.' },
    { el: '#style-current', title: 'Pick a finish',
      body: 'Choose a door style and color, and your whole design updates.' },
    { el: '#vt-3d', title: 'See it in 3D',
      body: 'Drag to spin around your new kitchen.' },
    { el: '#home-send-btn, #connect-pro-btn, #pnav-quote', title: 'Send your design',
      body: 'When you\'re happy with it, send it. The cabinet company gets every cabinet and measurement and will contact you about pricing.' },
  ]},
  share: { name: 'Your design', steps: [
    { el: '#vt-3d', also: ['#vt-floor'], title: 'Look at it every way',
      body: 'Switch between the 3D view, the floor plan and each wall. In 3D, drag to spin the design.' },
    { el: '#share-approve-slot button, #share-approve-slot, #pnav-quote', title: 'Approve the design',
      body: 'If you\'re happy with it, tap Approve and type your name. Your cabinet company is notified right away. This approves the design; it isn\'t a contract.' },
  ]},
  // ── Profile ──────────────────────────────────────────────────────────
  'profile-overview': { name: 'Your account', steps: [
    { el: '.profile-sidebar', title: 'Everything in one place',
      body: 'Your projects, calendar, company settings, pricing, team and leads each have their own tab.' },
    { el: 'sec:Plan', title: 'Your plan',
      body: 'This shows what your plan includes. You can upgrade or change it any time under Subscription.' },
  ]},
  'profile-projects': { name: 'Projects', steps: [
    { el: 'sec:All Projects', title: 'All your jobs',
      body: 'This lists every project with its status and value. Click one to open it in the planner.' },
  ]},
  'profile-calendar': { name: 'Calendar', steps: [
    { el: '#cal-wrap, #cal-locked', tier: 'silver', title: 'Your schedule',
      body: 'Keep measures, installs and appointments in one place. Click a day to add one.' },
  ]},
  'profile-company': { name: 'Company settings', steps: [
    { el: 'sec:Company Info', title: 'Company info',
      body: 'Your logo, address, phone and terms print on every quote and PDF, so fill these in first.' },
    { el: '#cp-alert-emails', title: 'Email alerts',
      body: 'We email you when a new lead comes in or a customer approves a design. You can turn this off here.' },
    { el: 'sec:Find a Pro Listing', tier: 'silver', title: 'Find a Pro listing',
      body: 'Turn on your listing so My Cabinet Planner can send you homeowner leads from your area.' },
    { el: 'sec:Homeowner Design Link', tier: 'gold', title: 'Homeowner design link',
      body: 'This gives you a "Design your kitchen" button for your website. Homeowners design with your finishes (without seeing prices), and their design lands in your Leads.' },
    { el: 'sec:Door Styles / Finishes', title: 'Door styles / finishes',
      body: 'These are the finishes you and your customers pick from. Name them the way your supplier does.' },
  ]},
  'profile-files': { name: 'My pricing', steps: [
    { el: '#pl-add-btn', tier: 'silver', title: 'Add a price list',
      body: 'Every price comes from here, and nothing is guessed. Upload your supplier\'s list just as they sent it (Excel, CSV or PDF). It\'s read for you, you answer any questions, and nothing is saved until you review it.' },
    { el: 'a[onclick^="downloadPriceSheetTemplate"]', tier: 'silver', title: 'No supplier file?',
      body: 'Download our blank template, type in your price for each size and finish, and add it the same way.' },
    { el: '#pl-lists', tier: 'silver', title: 'Your price lists',
      body: 'Every price list you\'ve loaded is listed here. You can view its prices, download it to edit in Excel, replace it with a newer list, or delete it.' },
  ]},
  'profile-team': { name: 'Team', steps: [
    { el: 'sec:Team Members', tier: 'gold', title: 'Your team',
      body: 'Invite up to 5 people to design and quote in your projects. You stay in charge of billing, pricing and company settings.' },
  ]},
  'profile-leads': { name: 'Leads', steps: [
    { el: 'sec:Your Leads', tier: 'silver', title: 'Homeowner leads',
      body: 'These are homeowners who asked for a quote. "Accept → planner" turns their design into a project you can price. New leads are also emailed to you.' },
  ]},
};

// ── Remembering what's been seen ───────────────────────────────────────
function _tipsAccount() {
  return typeof currentUser !== 'undefined' && currentUser && currentUser.id
    && !(typeof IS_DEMO !== 'undefined' && IS_DEMO) ? currentUser : null;
}
function _tipsKey() {
  const u = _tipsAccount();
  if (u) return 'mcp_tips_' + u.id;
  if (typeof HOME_PRO !== 'undefined' && HOME_PRO) return 'mcp_tips_home';
  if (typeof SHARE_TOKEN !== 'undefined' && SHARE_TOKEN) return 'mcp_tips_share';
  return 'mcp_tips_guest';
}
function _tipsState() {
  let ls = {};
  try { ls = JSON.parse(localStorage.getItem(_tipsKey()) || '{}') || {}; } catch (e) {}
  const u = _tipsAccount(), md = (u && u.user_metadata) || {};
  return { seen: new Set([...(ls.seen || []), ...(md.tips_seen || [])]), off: !!(ls.off || md.tips_off) };
}
function _tipsSave(st) {
  const data = { tips_seen: [...st.seen], tips_off: st.off };
  try { localStorage.setItem(_tipsKey(), JSON.stringify({ seen: data.tips_seen, off: data.tips_off })); } catch (e) {}
  const u = _tipsAccount();
  if (u && typeof db !== 'undefined') {
    u.user_metadata = { ...(u.user_metadata || {}), ...data };
    db.auth.updateUser({ data }).catch(() => {});   // best effort — the browser copy covers a failure
  }
}
function _tipsSessionSeen(id) {
  try { return (sessionStorage.getItem('mcp_tips_session') || '').split(',').includes(id); } catch (e) { return false; }
}
function _tipsMarkSession(id) {
  try { const s = (sessionStorage.getItem('mcp_tips_session') || '').split(',').filter(Boolean); if (!s.includes(id)) s.push(id); sessionStorage.setItem('mcp_tips_session', s.join(',')); } catch (e) {}
}

function _tipsToast(msg) {
  if (typeof showToast === 'function') showToast(msg);
  else if (typeof leadToast === 'function') leadToast(msg);
  else if (typeof showMoveTip === 'function') showMoveTip(msg);
}

// ── Finding the element a step points at ───────────────────────────────
function _tipsVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && el.closest('.hidden') == null;
}
function _tipsFind(sel) {
  if (sel.startsWith('sec:')) {
    const t = sel.slice(4).trim();
    const h = [...document.querySelectorAll('.section-title')].find(x => x.textContent.trim().startsWith(t) && _tipsVisible(x));
    return h ? (h.closest('.section') || h) : null;
  }
  for (const s of sel.split(/,\s*(?![^\[]*\])/)) {
    const el = [...document.querySelectorAll(s)].find(_tipsVisible);
    if (el) return el;
  }
  return null;
}
// The box to highlight: the element, stretched over any "also" elements (e.g. a row of tabs)
function _tipsRect(step) {
  const el = _tipsFind(step.el); if (!el) return null;
  let r = el.getBoundingClientRect(), x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
  (step.also || []).forEach(s => { const o = _tipsFind(s); if (o) { const q = o.getBoundingClientRect(); x1 = Math.min(x1, q.left); y1 = Math.min(y1, q.top); x2 = Math.max(x2, q.right); y2 = Math.max(y2, q.bottom); } });
  return { el, x1, y1, x2, y2 };
}

// ── Showing a set ───────────────────────────────────────────────────────
let _tips = null;   // { steps:[{...step, set}], i, ids }

function _tipsCss() {
  if (document.getElementById('tips-css')) return;
  const s = document.createElement('style'); s.id = 'tips-css';
  s.textContent = `
#tips-block{position:fixed;inset:0;z-index:100000;}
#tips-hl{position:fixed;z-index:100001;border-radius:10px;box-shadow:0 0 0 3px #14b8a6,0 0 0 9999px rgba(15,23,42,.55);pointer-events:none;transition:all .2s ease;}
#tips-bubble{position:fixed;z-index:100002;width:320px;max-width:calc(100vw - 32px);background:#fff;color:#1e293b;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:16px 18px 14px;font-family:inherit;}
#tips-bubble .tips-tag{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;margin-bottom:4px;}
#tips-bubble h4{margin:0 0 6px;font-size:16px;line-height:1.3;color:#1e293b;}
#tips-bubble p{margin:0;font-size:14px;line-height:1.55;color:#334155;}
#tips-bubble .tips-tier{display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:#92400e;background:#fef3c7;border-radius:999px;padding:2px 10px;}
#tips-bubble .tips-row{display:flex;align-items:center;gap:8px;margin-top:14px;}
#tips-bubble .tips-row .sp{flex:1;}
#tips-bubble button{font:inherit;font-size:13px;font-weight:700;border-radius:8px;padding:7px 14px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#334155;}
#tips-bubble button.tips-next{background:#0f766e;border-color:#0f766e;color:#fff;}
#tips-bubble button.tips-link{border:none;padding:7px 4px;color:#475569;font-weight:600;background:none;text-decoration:underline;}
#tips-bubble .tips-foot{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:10px;}
#tips-bubble .tips-off{display:inline;font-size:12px;color:#64748b;background:none;border:none;padding:0;text-decoration:underline;font-weight:500;}
@media (max-width:600px){#tips-bubble{left:16px!important;right:16px;bottom:16px!important;top:auto!important;width:auto;}}
`;
  document.head.appendChild(s);
}

function _tipsRender() {
  const T = _tips; if (!T) return;
  const step = T.steps[T.i];
  const R = _tipsRect(step);
  if (!R) { _tipsGo(T.i + (T.dir || 1)); return; }        // it scrolled away / closed — skip it
  const vw = innerWidth, vh = innerHeight, pad = 6;
  // Tall sections: keep the highlight inside the window
  const box = { x: Math.max(4, R.x1 - pad), y: Math.max(4, R.y1 - pad), x2: Math.min(vw - 4, R.x2 + pad), y2: Math.min(vh - 4, R.y2 + pad) };
  const hl = document.getElementById('tips-hl');
  Object.assign(hl.style, { left: box.x + 'px', top: box.y + 'px', width: (box.x2 - box.x) + 'px', height: (box.y2 - box.y) + 'px' });
  const b = document.getElementById('tips-bubble');
  const locked = step.tier && typeof canAccess === 'function' && !canAccess(step.tier);
  const last = T.i === T.steps.length - 1;
  b.innerHTML = `<div class="tips-tag">${step.setName} · ${T.i + 1} of ${T.steps.length}</div>
    <h4>${step.title}</h4><p>${step.body}</p>
    ${locked ? `<span class="tips-tier">${step.tier === 'gold' ? 'Gold' : 'Silver'} feature</span>` : ''}
    <div class="tips-row"><button class="tips-link" onclick="endTips()">Skip</button><span class="sp"></span>
      ${T.i > 0 ? '<button onclick="_tipsGo(_tips.i - 1, -1)">Back</button>' : ''}
      <button class="tips-next" onclick="${last ? 'endTips()' : '_tipsGo(_tips.i + 1, 1)'}">${last ? 'Done' : 'Next'}</button></div>
    <div class="tips-foot"><button class="tips-off" onclick="tipsTurnOff()">Don't show tips automatically</button>${document.getElementById('modal-faq') ? '<button class="tips-off" onclick="endTips(true);openModal(\'modal-faq\')">Help &amp; FAQ</button>' : ''}</div>`;
  // Place the bubble below the highlight, else above, else beside; clamp to the window
  const bw = b.offsetWidth, bh = b.offsetHeight, gap = 12;
  let top = box.y2 + gap, left = Math.min(Math.max(16, box.x), vw - bw - 16);
  if (top + bh > vh - 8) top = box.y - gap - bh;
  if (top < 8) {
    top = Math.min(Math.max(8, box.y), vh - bh - 8);
    left = box.x2 + gap + bw < vw - 8 ? box.x2 + gap : (box.x - gap - bw > 8 ? box.x - gap - bw : 16);
  }
  Object.assign(b.style, { top: top + 'px', left: left + 'px' });
  b.querySelector('.tips-next').focus({ preventScroll: true });
}

function _tipsGo(i, dir) {
  const T = _tips; if (!T) return;
  T.dir = dir || 1;
  if (i < 0) i = 0;
  if (i >= T.steps.length) { endTips(); return; }
  T.i = i;
  const R = _tipsRect(T.steps[i]);
  if (R && (R.y1 < 0 || R.y2 > innerHeight)) {
    R.el.scrollIntoView({ block: R.y2 - R.y1 > innerHeight * 0.7 ? 'start' : 'center' });
    setTimeout(_tipsRender, 250);
  } else _tipsRender();
}

// Show one or more sets in a row (ids). Steps with nothing on screen are dropped.
function showTips(ids, opts) {
  ids = [].concat(ids).filter(id => TIP_SETS[id]);
  if (_tips) endTips(true);
  const steps = [];
  const seen = opts && opts.unseenOnly ? _tipsState().seen : null;
  ids.forEach(id => TIP_SETS[id].steps.forEach((s, k) => {
    const key = id + '.' + k;
    if ((!seen || !seen.has(key)) && _tipsFind(s.el)) steps.push({ ...s, setName: TIP_SETS[id].name, set: id, key });
  }));
  if (!steps.length) {
    if (opts && opts.replay) _tipsToast('No tips for this screen yet.');
    return false;
  }
  _tipsCss();
  ['tips-block', 'tips-hl', 'tips-bubble'].forEach(id => { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); });
  document.getElementById('tips-bubble').setAttribute('role', 'dialog');
  document.getElementById('tips-bubble').setAttribute('aria-label', 'Tips');
  _tips = { steps, i: 0, ids: [...new Set(steps.map(s => s.set))], keys: steps.map(s => s.key) };
  addEventListener('resize', _tipsRender); addEventListener('keydown', _tipsOnKey, true);
  _tipsGo(0);
  return true;
}
function _tipsOnKey(e) {
  if (!_tips) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTips(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); _tipsGo(_tips.i + 1, 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); _tipsGo(_tips.i - 1, -1); }
  else e.stopPropagation();   // no planner shortcuts while tips are open
}
// Ending (Done, Skip or Esc) marks the tips that were on the list as seen.
function endTips(silent) {
  if (!_tips) return;
  const ids = _tips.ids, keys = _tips.keys; _tips = null;
  removeEventListener('resize', _tipsRender); removeEventListener('keydown', _tipsOnKey, true);
  ['tips-block', 'tips-hl', 'tips-bubble'].forEach(id => { const d = document.getElementById(id); if (d) d.remove(); });
  const st = _tipsState();
  keys.forEach(k => st.seen.add(k));
  ids.forEach(_tipsMarkSession);
  _tipsSave(st);
  if (!silent) setTimeout(_tipsNextQueued, 300);
}
function tipsTurnOff() {
  const st = _tipsState(); st.off = true; _tipsSave(st);
  endTips(true);
  _tipsToast('Tips are off. Tap Tips any time to see them for the screen you\'re on.');
}

// Show a set the first time only (unless tips are off). Waits a moment for the screen to settle,
// and queues behind a set that's already showing.
let _tipsQueue = [];
const _TIPS_ORDER = ['welcome', 'home', 'share', 'planner', 'planner-more', 'quote', 'elevation', '3d'];
function _tipsAllSeen(id, st) { return TIP_SETS[id].steps.every((s, k) => st.seen.has(id + '.' + k)); }
function _tipsAnySeen(id, st) { return TIP_SETS[id].steps.some((s, k) => st.seen.has(id + '.' + k)); }
function maybeTips(id) {
  const st = _tipsState();
  if (st.off || !TIP_SETS[id] || _tipsAllSeen(id, st)) return;
  if (!_tipsQueue.includes(id)) _tipsQueue.push(id);
  const rank = x => { const r = _TIPS_ORDER.indexOf(x); return r < 0 ? 99 : r; };
  _tipsQueue.sort((a, b) => rank(a) - rank(b));   // the basics before a view's own tips
  clearTimeout(maybeTips._t);
  maybeTips._t = setTimeout(_tipsNextQueued, 700);
}
function _tipsNextQueued() {
  if (_tips) return;
  // Not while a dialog (other than the one the set is about) is open
  while (_tipsQueue.length) {
    const id = _tipsQueue.shift();
    const st = _tipsState();
    if (st.off || _tipsAllSeen(id, st)) continue;
    if (id !== 'quote' && document.querySelector('.modal-overlay:not(.hidden)')) { _tipsQueue.unshift(id); setTimeout(_tipsNextQueued, 1500); return; }
    if (showTips(id, { unseenOnly: true })) return;
  }
}

// ── Planner: which sets fit the screen right now ───────────────────────
function plannerTipIds() {
  if (typeof SHARE_TOKEN !== 'undefined' && SHARE_TOKEN) return ['share'];
  if (typeof HOME_PRO !== 'undefined' && HOME_PRO) return ['home'];
  const q = document.getElementById('modal-quote');
  if (q && !q.classList.contains('hidden')) return ['quote'];
  if (typeof activeProj !== 'function' || !activeProj()) return ['welcome'];
  const m = (typeof state !== 'undefined' && state.viewMode) || 'floor';
  return m === 'elevation' ? ['elevation'] : m === '3d' ? ['3d'] : ['planner', 'planner-more'];
}
// After sign-in / page load: the right first set. 'Quoting & ordering' waits for a later visit,
// so a brand-new user isn't handed twelve tips at once.
function tipsStart() {
  if (typeof SHARE_TOKEN !== 'undefined' && SHARE_TOKEN) { maybeTips('share'); return; }
  if (typeof HOME_PRO !== 'undefined' && HOME_PRO) { maybeTips('home'); return; }
  if (typeof activeProj !== 'function' || !activeProj()) { maybeTips('welcome'); return; }
  tipsForProject();
}
function tipsForProject() {
  if ((typeof SHARE_TOKEN !== 'undefined' && SHARE_TOKEN) || (typeof HOME_PRO !== 'undefined' && HOME_PRO)) return;
  const st = _tipsState();
  const fresh = !_tipsAnySeen('planner', st);
  maybeTips('planner');                                   // (only tips not seen yet)
  if (!fresh && !_tipsSessionSeen('planner')) maybeTips('planner-more');
}
// The Tips button: replay this screen's tips
function replayTips() {
  if (typeof closeModal === 'function') { try { closeModal('modal-faq'); } catch (e) {} }
  const ids = document.getElementById('profile-page') ? ['profile-' + ((location.hash || '#overview').slice(1) || 'overview')] : plannerTipIds();
  setTimeout(() => showTips(ids, { replay: true }), 150);
}
