// My Cabinet Planner — js/core.js
// Config, zoom/pan + rulers, demo mode + sample kitchen, auth, catalog/styles/tax, app state, saving/loading (projectToRow/migrateProject), helpers, modals, view switching.
// Loaded by app.html as a classic script (shared global scope, same as when this was
// inline). Load order matters — see the <script> list at the bottom of app.html.

// ════════════════════════════
// SUPABASE
// ════════════════════════════
const SUPABASE_URL = 'https://ojlbxofgpucihqxgpxzz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbGJ4b2ZncHVjaWhxeGdweHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MzY3ODksImV4cCI6MjA5NjExMjc4OX0.u76wC9KxnY95B_rzV47lvQEBEbYUQ6OysTmNA2w541o';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;
let pendingAuthType = null; // 'invite' or 'recovery' if this session arrived via an email link

// ════════════════════════════
// CANVAS ZOOM / PAN
// ════════════════════════════
const CANVAS_SCALE = 6;  // px/inch — fixed internal floor plan resolution
const ELEV_SCALE   = 5;  // px/inch — fixed internal elevation resolution
const RULER_PX     = 24; // thickness of the screen-pinned rulers along the top/left of each viewport
const vpState = {
  floor: { zoom: 1, panX: 0, panY: 0 },
  elev:  { zoom: 1, panX: 0, panY: 0 },
};
// What the on-screen rulers need to know about each drawing, published by
// renderCanvas()/renderElevation(): where inch 0 sits on the internal canvas, the
// drawing's extent in inches, and whether the vertical axis counts upward
// (elevation: height above the floor) or downward (plan: distance from the north wall).
const vpGeom   = { floor: null, elev: null };
const vpCursor = { floor: null, elev: null }; // last mouse position over each viewport, for the ruler cursor marks
const ZOOM_STEPS = [0.08,0.1,0.15,0.2,0.25,0.33,0.5,0.67,0.75,1,1.25,1.5,2,2.5,3,4];
const ZOOM_MIN = 0.08, ZOOM_MAX = 4;

function _vpIds(view) {
  return view === 'floor'
    ? { vp:'fp-viewport',   layer:'fp-zoom-layer',   pct:'fp-zoom-pct',   canvas:'floor-plan',     rulerH:'fp-ruler-h',   rulerV:'fp-ruler-v'   }
    : { vp:'elev-viewport', layer:'elev-zoom-layer', pct:'elev-zoom-pct', canvas:'elevation-plan', rulerH:'elev-ruler-h', rulerV:'elev-ruler-v' };
}

function applyVpTransform(view) {
  const ids = _vpIds(view);
  const st = vpState[view];
  const el = document.getElementById(ids.layer);
  if (el) el.style.transform = `translate(${st.panX}px,${st.panY}px) scale(${st.zoom})`;
  const pct = document.getElementById(ids.pct);
  if (pct) pct.textContent = Math.round(st.zoom * 100) + '%';
  drawViewportRulers(view);
}

// Fit the whole drawing inside the viewport (minus the ruler strips) and center it.
function fitView(view) {
  const ids    = _vpIds(view);
  const canvas = document.getElementById(ids.canvas);
  const vp     = document.getElementById(ids.vp);
  if (!canvas || !vp || !canvas.width || !canvas.height) return;
  const vpW = vp.clientWidth, vpH = vp.clientHeight;
  if (!vpW || !vpH) return; // viewport is hidden — leave state alone so the next visible render fits
  const availW = vpW - RULER_PX, availH = vpH - RULER_PX;
  const zoom = Math.min(availW / canvas.width, availH / canvas.height) * 0.94;
  const st = vpState[view];
  st.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  st.panX = RULER_PX + Math.round((availW - canvas.width  * st.zoom) / 2);
  st.panY = RULER_PX + Math.round((availH - canvas.height * st.zoom) / 2);
  applyVpTransform(view);
}

// Zoom to newZoom keeping the viewport point (cx, cy) fixed on the same spot of the drawing.
function zoomAt(view, newZoom, cx, cy) {
  const st = vpState[view];
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  if (newZoom === st.zoom) return;
  st.panX = cx - (cx - st.panX) * (newZoom / st.zoom);
  st.panY = cy - (cy - st.panY) * (newZoom / st.zoom);
  st.zoom = newZoom;
  applyVpTransform(view);
}

function stepZoom(view, dir) {
  const cur = vpState[view].zoom;
  let idx = ZOOM_STEPS.findIndex(s => s >= cur - 0.001);
  if (idx < 0) idx = ZOOM_STEPS.length - 1;
  if (dir > 0 && ZOOM_STEPS[idx] <= cur + 0.001) idx = Math.min(idx + 1, ZOOM_STEPS.length - 1);
  else if (dir < 0) idx = Math.max(idx - 1, 0);
  const vp = document.getElementById(_vpIds(view).vp);
  // Zoom about the center of the drawing area (the part of the viewport not covered by rulers)
  const cx = vp ? RULER_PX + (vp.clientWidth  - RULER_PX) / 2 : 0;
  const cy = vp ? RULER_PX + (vp.clientHeight - RULER_PX) / 2 : 0;
  zoomAt(view, ZOOM_STEPS[idx], cx, cy);
}

// Wheel → zoom multiplier. Proportional to how far the wheel/trackpad actually moved,
// instead of a fixed 10% per event: a trackpad fires dozens of tiny events per swipe,
// which used to compound into a huge jump. Trackpad pinch arrives as a ctrlKey wheel
// with very small deltas, so it gets a larger coefficient.
function wheelZoomFactor(e) {
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= 16;        // lines → px
  else if (e.deltaMode === 2) dy *= 120;  // pages → px
  dy = Math.max(-120, Math.min(120, dy));
  const k = e.ctrlKey ? 0.01 : 0.0008;    // 120px mouse notch ≈ ×1.10, a gentle trackpad swipe ≈ ×1.2–1.3
  return Math.exp(-dy * k);
}

// ── Screen-pinned rulers ─────────────────────────────────────────────────────
// Drawn on two thin canvases that sit over the top and left edges of the viewport,
// in *screen* space — so they stay put and stay readable no matter how far the
// drawing is zoomed or panned, and the tick spacing adapts to the zoom level.
function fmtRulerIn(i) {
  const a = Math.abs(i), ft = Math.floor(a / 12), inn = a % 12;
  if (a === 0) return '0';
  const s = inn === 0 ? `${ft}'` : ft === 0 ? `${inn}"` : `${ft}'${inn}"`;
  return (i < 0 ? '-' : '') + s;
}

function drawViewportRulers(view) {
  const ids = _vpIds(view);
  const vp = document.getElementById(ids.vp);
  const rh = document.getElementById(ids.rulerH);
  const rv = document.getElementById(ids.rulerV);
  if (!vp || !rh || !rv) return;
  const vpW = vp.clientWidth, vpH = vp.clientHeight;
  if (!vpW || !vpH) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const setup = (c, w, h) => {
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return x;
  };
  const hx = setup(rh, vpW, RULER_PX);
  const vx = setup(rv, RULER_PX, vpH);
  const BG = '#f8fafc', BAND = '#ffffff', LINE = '#cbd5e1', MAJOR = '#475569', MINOR = '#94a3b8', OUTSIDE = '#d6dde6', TEXT = '#334155', CURSOR = '#0f766e';
  const FONT = '600 10px Inter, "Segoe UI", -apple-system, sans-serif';

  hx.fillStyle = BG; hx.fillRect(0, 0, vpW, RULER_PX);
  vx.fillStyle = BG; vx.fillRect(0, 0, RULER_PX, vpH);

  const g = vpGeom[view], st = vpState[view];
  if (g) {
    const ppi = g.scale * st.zoom;                 // screen px per inch
    const ox  = st.panX + g.originX * st.zoom;     // screen x of inch 0
    const oy  = st.panY + g.originY * st.zoom;     // screen y of inch 0
    const dirY = g.vertUp ? -1 : 1;                // which way inches grow on screen

    // Tick spacing: labels ≥ 56px apart, minor ticks ≥ 8px apart, minor divides major.
    const STEPS = [1, 2, 3, 6, 12, 24, 36, 48, 96, 120, 240, 480];
    const major = STEPS.find(s => s * ppi >= 56) || 480;
    const minor = STEPS.find(s => s * ppi >= 8 && major % s === 0) || major;
    const mid   = (major % 2 === 0 && (major / 2) % minor === 0) ? major / 2 : null;

    // Light band marking the extent of the room/wall on each ruler
    hx.fillStyle = BAND; hx.fillRect(ox, 0, g.wIn * ppi, RULER_PX);
    vx.fillStyle = BAND; vx.fillRect(0, g.vertUp ? oy - g.hIn * ppi : oy, RULER_PX, g.hIn * ppi);

    hx.font = FONT; vx.font = FONT; hx.lineWidth = 1; vx.lineWidth = 1;

    // Horizontal ruler (inches along the top edge)
    let i0 = Math.floor((RULER_PX - ox) / ppi / minor) * minor;
    let i1 = Math.ceil((vpW - ox) / ppi / minor) * minor;
    for (let i = i0; i <= i1; i += minor) {
      const x = Math.round(ox + i * ppi) + 0.5;
      if (x < RULER_PX) continue;
      const inside = i >= 0 && i <= g.wIn;
      const isMajor = i % major === 0, isMid = mid !== null && i % mid === 0;
      const len = isMajor ? 12 : isMid ? 8 : 4;
      hx.strokeStyle = !inside ? OUTSIDE : isMajor ? MAJOR : MINOR;
      hx.beginPath(); hx.moveTo(x, RULER_PX); hx.lineTo(x, RULER_PX - len); hx.stroke();
      if (isMajor && inside) {
        hx.fillStyle = TEXT; hx.textAlign = 'left'; hx.textBaseline = 'top';
        hx.fillText(fmtRulerIn(i), x + 3, 3);
      }
    }

    // Vertical ruler (inches down the left edge; upward from the floor in elevation)
    const sy = i => oy + dirY * i * ppi;
    let j0 = Math.floor(Math.min((RULER_PX - oy) * dirY, (vpH - oy) * dirY) / ppi / minor) * minor;
    let j1 = Math.ceil (Math.max((RULER_PX - oy) * dirY, (vpH - oy) * dirY) / ppi / minor) * minor;
    for (let i = j0; i <= j1; i += minor) {
      const y = Math.round(sy(i)) + 0.5;
      if (y < RULER_PX) continue;
      const inside = i >= 0 && i <= g.hIn;
      const isMajor = i % major === 0, isMid = mid !== null && i % mid === 0;
      const len = isMajor ? 12 : isMid ? 8 : 4;
      vx.strokeStyle = !inside ? OUTSIDE : isMajor ? MAJOR : MINOR;
      vx.beginPath(); vx.moveTo(RULER_PX, y); vx.lineTo(RULER_PX - len, y); vx.stroke();
      if (isMajor && inside) {
        // Rotated to read bottom-to-top, placed on the increasing side of the tick
        vx.save(); vx.translate(0, y); vx.rotate(-Math.PI / 2);
        vx.fillStyle = TEXT; vx.textBaseline = 'top';
        if (g.vertUp) { vx.textAlign = 'left';  vx.fillText(fmtRulerIn(i),  3, 3); }
        else          { vx.textAlign = 'right'; vx.fillText(fmtRulerIn(i), -3, 3); }
        vx.restore();
      }
    }

    // Cursor position marks
    const cur = vpCursor[view];
    if (cur) {
      hx.fillStyle = CURSOR; hx.fillRect(Math.round(cur.x), 0, 1, RULER_PX);
      vx.fillStyle = CURSOR; vx.fillRect(0, Math.round(cur.y), RULER_PX, 1);
    }
  }

  // Edge lines and the corner square where the two rulers meet
  hx.fillStyle = LINE; hx.fillRect(0, RULER_PX - 1, vpW, 1);
  vx.fillStyle = LINE; vx.fillRect(RULER_PX - 1, 0, 1, vpH);
  hx.fillStyle = '#f1f5f9'; hx.fillRect(0, 0, RULER_PX, RULER_PX);
  hx.fillStyle = LINE; hx.fillRect(RULER_PX - 1, 0, 1, RULER_PX); hx.fillRect(0, RULER_PX - 1, RULER_PX, 1);
}

function _initVpEvents(view) {
  const vp = document.getElementById(_vpIds(view).vp);
  if (!vp) return;
  let panStart = null;

  // Wheel to zoom, centered on cursor
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    zoomAt(view, vpState[view].zoom * wheelZoomFactor(e), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  // Drag on empty space to pan
  vp.addEventListener('mousedown', e => {
    // Only pan on middle-button OR when no cabinet is hit (handled after canvas mousedown)
    if (e.button === 1) { e.preventDefault(); panStart = { x: e.clientX, y: e.clientY, px: vpState[view].panX, py: vpState[view].panY }; vp.classList.add('panning'); }
  });
  vp.addEventListener('mousemove', e => {
    const rect = vp.getBoundingClientRect();
    vpCursor[view] = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (panStart) {
      vpState[view].panX = panStart.px + (e.clientX - panStart.x);
      vpState[view].panY = panStart.py + (e.clientY - panStart.y);
      applyVpTransform(view);
    } else {
      drawViewportRulers(view);
    }
  });
  vp.addEventListener('mouseup', () => { panStart = null; vp.classList.remove('panning'); });
  vp.addEventListener('mouseleave', () => { panStart = null; vp.classList.remove('panning'); vpCursor[view] = null; drawViewportRulers(view); });

  // Rulers are sized to the viewport, so redraw them whenever it changes size
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => drawViewportRulers(view)).observe(vp);

  // Touch: pinch to zoom
  let touches = {};
  let lastDist = null;
  vp.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const rect = vp.getBoundingClientRect();
      touches.cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      touches.cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
    }
  }, { passive: true });
  vp.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && lastDist) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoomAt(view, vpState[view].zoom * (dist / lastDist), touches.cx, touches.cy);
      lastDist = dist;
    }
  }, { passive: false });
  vp.addEventListener('touchend', () => { lastDist = null; });
}

// ════════════════════════════
// DEMO MODE
// ════════════════════════════
const IS_DEMO = new URLSearchParams(location.search).get('demo') === '1';
function demoGate(action) {
  // Returns true if allowed, false + shows upgrade modal if blocked
  if (!IS_DEMO) return true;
  openModal('modal-upgrade');
  return false;
}

// A finished sample kitchen every first-time demo visitor lands on: an L run with a
// corner, sink base under a window, dishwasher, range with hood, fridge with end panel,
// uppers, and an island with 42" aisles. White Shaker. Lives only in this browser.
const DEMO_SAMPLE_ID = 'demo-sample-kitchen';
function buildDemoSampleProject() {
  let n = 0;
  const cab = (type, wall, width, offset, extra = {}) => ({
    id: uid(), type, wall, width, offset, height: CATALOG[type].heights[0], depth: CATALOG[type].depth,
    note: '', wallBottom: null, glassDoors: false, styleOverride: null, itemNum: ++n, ...extra });
  const upper = (wall, width, offset, height = 30, wallBottom = 54) =>
    cab('wall', wall, width, offset, { height, depth: 12, wallBottom });
  const app = (type, wall, width, offset, extra = {}) => ({
    id: uid(), type, wall, width, offset, height: APPLIANCES[type].height, note: '',
    customElevBottom: null, price: null, itemNum: ++n, ...extra });
  const room = {
    id: 'demo-sample-room', name: 'Kitchen', shape: 'rect',
    walls: { north: 168, south: 168, east: 144, west: 144 }, ceilingHeight: 96,
    cabinets: [
      // North wall run (from the west end): drawers, dishwasher, sink under the window, blind corner at the east end
      cab('base', 'north', 24, 0), cab('base', 'north', 30, 24), cab('sink', 'north', 36, 78),
      cab('drawerBase', 'north', 18, 114), cab('cornerBase', 'north', 36, 132),
      upper('north', 24, 0), upper('north', 30, 24), upper('north', 24, 54), upper('north', 18, 114), upper('north', 36, 132),
      // East wall run (from the north corner, starting past the corner cabinet's depth)
      cab('base', 'east', 15, 24), cab('base', 'east', 12, 69), cab('fridgePanel', 'east', 0.75, 81, { height: 84 }),
      upper('east', 15, 24), upper('east', 12, 69), upper('east', 36, 81.75, 12, 72),
    ],
    appliances: [
      app('dishwasher', 'north', 24, 54),
      app('range', 'east', 30, 39), app('hood', 'east', 30, 39),
      app('refrigerator', 'east', 36, 81.75),
    ],
    openings: [
      { id: uid(), type: 'window', wall: 'north', width: 36, height: 40, offset: 78, sillHeight: 42 },
      { id: uid(), type: 'door',   wall: 'south', width: 36, height: 80, offset: 30, sillHeight: 0 },
    ],
    islands: [{ id: uid(), width: 54, depth: 36, x: 42, y: 66, label: 'Island' }],
  };
  return {
    id: DEMO_SAMPLE_ID, customer: 'Sample Kitchen', phone: '', company: '', type: 'Kitchen',
    notes: 'A finished example — change anything you like, or use Reset demo to start over.',
    address: '', city: '', state: '', style: 'WS', createdAt: Date.now(), rooms: [room],
    status: 'Lead', activityLog: [], jobCosts: [], trimItems: [],
    quoteLocked: false, lockedQuote: null, quoteHistory: [],
  };
}
function openDemoSampleOnLoad() {
  localStorage.setItem('cp_ui', JSON.stringify({ activeProjectId: DEMO_SAMPLE_ID, activeRoomId: 'demo-sample-room',
    activeWall: 'north', elevWall: 'north', viewMode: '3d', activeOpeningType: 'door' }));
}
// First visit only (no demo projects saved yet) — returning visitors keep their work.
function seedDemoIfFirstVisit() {
  if (!IS_DEMO || localStorage.getItem('cp_demo_projects') !== null) return;
  localStorage.setItem('cp_demo_projects', JSON.stringify([buildDemoSampleProject()]));
  openDemoSampleOnLoad();
}
function resetDemo() {
  if (!IS_DEMO) return;
  if (!confirm('Reset the demo? This clears everything you made here and brings back the sample kitchen.')) return;
  localStorage.setItem('cp_demo_projects', JSON.stringify([buildDemoSampleProject()]));
  openDemoSampleOnLoad();
  location.reload();
}

// ════════════════════════════
// AUTH
// ════════════════════════════
let authMode = 'signup'; // 'signup' | 'signin'

function _setFormVisible(visible) {
  const ids = ['auth-heading','auth-sub','login-btn','login-error','auth-toggle-btn','forgot-wrap'];
  const fields = document.querySelectorAll('.login-field');
  ids.forEach(id => document.getElementById(id).style.display = visible ? '' : 'none');
  fields.forEach(el => el.style.display = visible ? '' : 'none');
  document.getElementById('email-confirm-panel').style.display = visible ? 'none' : 'block';
}
function showEmailConfirmPanel(email) {
  document.getElementById('confirm-email-display').textContent = email;
  _setFormVisible(false);
}
function showSignInAfterConfirm() {
  _setFormVisible(true);
  authMode = 'signin';
  document.getElementById('auth-heading').textContent  = 'Welcome back';
  document.getElementById('auth-sub').textContent      = 'Sign in to your account';
  document.getElementById('login-btn').textContent     = 'Sign In →';
  document.getElementById('auth-toggle-btn').textContent = 'Create a free account';
  document.getElementById('forgot-wrap').style.display = 'block';
  document.getElementById('login-error').textContent   = '';
}
function showSignUpForm() {
  _setFormVisible(true);
  authMode = 'signup';
  document.getElementById('auth-heading').textContent  = 'Create your free account';
  document.getElementById('auth-sub').textContent      = 'No credit card required — start designing immediately';
  document.getElementById('login-btn').textContent     = 'Create Free Account →';
  document.getElementById('auth-toggle-btn').textContent = 'Sign in';
  document.getElementById('forgot-wrap').style.display = 'none';
  document.getElementById('login-error').textContent   = '';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}
function toggleAuthMode() {
  authMode = authMode === 'signup' ? 'signin' : 'signup';
  const isSignUp = authMode === 'signup';
  document.getElementById('auth-heading').textContent  = isSignUp ? 'Create your free account' : 'Welcome back';
  document.getElementById('auth-sub').textContent      = isSignUp ? 'No credit card required — start designing immediately' : 'Sign in to your account';
  document.getElementById('login-btn').textContent     = isSignUp ? 'Create Free Account →' : 'Sign In →';
  document.getElementById('auth-toggle-btn').textContent = isSignUp ? 'Sign in' : 'Create a free account';
  document.getElementById('forgot-wrap').style.display = isSignUp ? 'none' : 'block';
  document.getElementById('login-error').textContent   = '';
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-root').classList.add('hidden');
}
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-root').classList.remove('hidden');
  document.getElementById('user-email').textContent = currentUser ? currentUser.email : 'demo@mycabinetplanner.com';
  if (IS_DEMO) {
    document.body.classList.add('demo-mode');
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('cp_demo_banner_dismissed') === '1'; } catch (e) {}
    if (!dismissed) {
      const banner = document.getElementById('demo-banner');
      banner.style.display = 'block';
      document.body.classList.add('demo-banner-on');
      document.body.style.setProperty('--demo-banner-h', banner.offsetHeight + 'px');
    }
  }
}
// The banner is part of the page layout (pushes the app down instead of covering the
// header). Dismissing it gives the space back and keeps it hidden for this browser tab.
function dismissDemoBanner() {
  document.getElementById('demo-banner').style.display = 'none';
  document.body.classList.remove('demo-banner-on');
  try { sessionStorage.setItem('cp_demo_banner_dismissed', '1'); } catch (e) {}
  if (typeof fitView === 'function' && state.activeProjectId) fitView(state.viewMode === 'elevation' ? 'elev' : 'floor');
  if (state.viewMode === '3d' && typeof resizeIso3D === 'function') resizeIso3D();
}
async function handleSignIn() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  if (!email || !password) { err.textContent = 'Enter your email and password.'; return; }
  err.textContent = '';

  if (authMode === 'signup') {
    btn.disabled = true; btn.textContent = 'Creating account…';
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) { err.textContent = error.message; btn.disabled = false; btn.textContent = 'Create Free Account →'; return; }
    if (data.session) {
      // Auto-confirmed (email confirmation disabled in Supabase)
      currentUser = data.user;
      btn.disabled = false;
      showApp();
      await resolveTeamContext();
      await loadAccountData();
      maybeStartTour();
    } else {
      // Email confirmation required — show confirmation panel
      btn.disabled = false; btn.textContent = 'Create Free Account →';
      showEmailConfirmPanel(email);
    }
    return;
  }

  btn.disabled = true; btn.textContent = 'Signing in…';
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Sign In →';
  if (error) { err.textContent = error.message; return; }
  currentUser = data.user;
  // If user came from a pricing plan link, send them to profile to subscribe
  const planParam = new URLSearchParams(location.search).get('plan');
  if (planParam && ['silver','gold'].includes(planParam)) {
    window.location.href = `/profile?checkout=${planParam}`;
    return;
  }
  showApp();
  await resolveTeamContext();
  await loadAccountData();
  openProjectFromUrl();
  maybeStartTour();
}
async function handleForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  const err   = document.getElementById('login-error');
  if (!email) { err.style.color='#0f766e'; err.textContent = 'Enter your email address above first.'; return; }
  err.textContent = '';
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://mycabinetplanner.com'
  });
  if (error) { err.textContent = error.message; }
  else { err.style.color='#16a34a'; err.textContent = '✓ Reset link sent — check your email.'; }
}
async function handleSignOut() {
  await db.auth.signOut();
  currentUser = null;
  state.projects = [];
  state.activeProjectId = null;
  state.activeRoomId = null;
  localStorage.removeItem('cp_ui');
  showLogin();
  showWelcome();
}

// ════════════════════════════
// CATALOG
// ════════════════════════════
const CATALOG = {
  base:       { label:'Base',        widths:[9,12,15,18,21,24,27,30,33,36], heights:[34.5],     depth:24, color:'#3B82F6', abbr:'B',  basePrice: w => w*4.2 },
  wall:       { label:'Wall',        widths:[9,12,15,18,21,24,27,30,33,36], heights:[12,15,18,30,36,42], depth:12, color:'#93C5FD', abbr:'W',  basePrice: w => w*3.8 },
  tall:       { label:'Tall/Pantry', widths:[15,18,24,30],                  heights:[84,90,96], depth:24, color:'#1D4ED8', abbr:'WP', basePrice: w => w*11  },
  sink:       { label:'Sink Base',   widths:[24,27,30,33,36,42],            heights:[34.5],     depth:24, color:'#06B6D4', abbr:'SB', basePrice: w => w*4.8 },
  vanity:     { label:'Vanity',      widths:[24,30,36,48,60],               heights:[34.5],     depth:21, color:'#22C55E', abbr:'V',  basePrice: w => w*5.2 },
  drawerBase: { label:'Drawer Base', widths:[12,15,18,21,24,30,36],         heights:[34.5],     depth:24, color:'#A855F7', abbr:'DB', basePrice: w => w*5.5 },
  cornerBase:  { label:'Corner Base',           widths:[36,39,42],  heights:[34.5],              depth:24, color:'#F59E0B', abbr:'CB',  basePrice: w => w*6  },
  lazysusan:   { label:'Lazy Susan',            widths:[33],        heights:[34.5],              depth:24, color:'#F97316', abbr:'LS',  basePrice: w => w*7  },
  filler3:     { label:'Filler 3"',             widths:[3],         heights:[34.5],              depth:24, color:'#9CA3AF', abbr:'FL',  basePrice: () => 15  },
  filler6:     { label:'Filler 6"',             widths:[6],         heights:[34.5],              depth:24, color:'#9CA3AF', abbr:'FL',  basePrice: () => 20  },
  fridgePanel: { label:'Fridge End Panel',      widths:[0.75],      heights:[84,90,96],          depth:24, color:'#CBD5E1', abbr:'FEP', basePrice: () => 45  },
  diagWall:    { label:'Diagonal Corner Wall',  widths:[24,27],     heights:[30,36,42],          depth:24, color:'#7DD3FC', abbr:'DCW', basePrice: w => w*5  },
};
const STYLES = [
  {tier:'Gold',     code:'AW', name:'Ice White Shaker',      swatch:'#F2F1EE'},
  {tier:'Gold',     code:'AP', name:'Pepper Shaker',          swatch:'#2B2926'},
  {tier:'Gold',     code:'PW', name:'Petit White',            swatch:'#FAF9F7'},
  {tier:'Gold',     code:'PR', name:'Petit Brown',            swatch:'#8C6634'},
  {tier:'Gold',     code:'PS', name:'Petit Sand',             swatch:'#D3C4A0'},
  {tier:'Gold',     code:'PD', name:'Petit Blue',             swatch:'#1B3A5C'},
  {tier:'Platinum', code:'AB', name:'Lait Grey Shaker',       swatch:'#B9BDC6'},
  {tier:'Platinum', code:'AR', name:'Woodland Brown',         swatch:'#6A4B2A'},
  {tier:'Platinum', code:'GW', name:'Gramercy White',         swatch:'#EFECE7'},
  {tier:'Platinum', code:'TW', name:'Uptown White',           swatch:'#FEFEFE'},
  {tier:'Platinum', code:'SL', name:'Signature Pearl',        swatch:'#ECE7DA'},
  {tier:'Platinum', code:'TS', name:'Townsquare Grey',        swatch:'#697080'},
  {tier:'Platinum', code:'AG', name:'Greystone Shaker',       swatch:'#4B4F5C'},
  {tier:'Platinum', code:'AX', name:'Xterra Blue Shaker',     swatch:'#5C8DB9'},
  {tier:'Platinum', code:'PH', name:'Petit Oak',              swatch:'#C9A96D'},
  {tier:'Platinum', code:'AZ', name:'Champagne Shaker',       swatch:'#E7DFD0'},
  {tier:'Titanium', code:'AN', name:'Nova Light Grey Shaker', swatch:'#C6C9CD'},
  {tier:'Titanium', code:'TQ', name:'Townplace Crema',        swatch:'#EDDFC8'},
  {tier:'Titanium', code:'TG', name:'Midtown Grey',           swatch:'#5B6069'},
  {tier:'Titanium', code:'AA', name:'Blaze Black Shaker',     swatch:'#1C1B1A'},
  {tier:'Titanium', code:'AH', name:'Homestead Oak Shaker',   swatch:'#B99050'},
];
// Returns company-specific styles if set, otherwise generic defaults
const DEFAULT_STYLES = [
  {code:'WS', name:'White Shaker',   swatch:'#F5F4F0'},
  {code:'GS', name:'Grey Shaker',    swatch:'#9CA3AF'},
  {code:'ES', name:'Espresso',       swatch:'#3B2314'},
  {code:'NW', name:'Natural Wood',   swatch:'#C9A96D'},
];
// Real supplier catalog stays visible only to these two accounts (matches OWNER_USER_IDS
// in netlify/functions/stripe-webhook.js) — every other account, including new signups
// who haven't set up their own styles yet, gets the generic DEFAULT_STYLES instead.
const OWNER_USER_IDS = [
  'f464edfb-8f74-49b7-b366-79b89605bbb7', // Dan
  'd7620158-9fbd-44de-9770-2f00bdabe71c', // Sister
];
function getStyles() {
  const cs = companyProfile.custom_styles;
  if (cs && Array.isArray(cs) && cs.length > 0) return cs;
  return OWNER_USER_IDS.includes(effectiveOwnerId) ? STYLES : DEFAULT_STYLES;
}

// ════════════════════════════
// DOOR CONSTRUCTION PROFILES — per Matrix Cabinets spec sheets (2025 catalog).
// 'flat'   = Recessed Square, plain center panel (standard Shaker + Petit/Micro Shaker lines)
// 'raised' = Raised Square / "reversed raised" center panel (Gramercy, Uptown, Signature,
//            Blaze Black, Midtown, Nova, Townplace) — drawn with a beveled inner panel.
// frame: 'narrow' = the Petit/Micro Shaker line — visibly slimmer stile/rail than standard
// Shaker, per company naming ("Petit"). Not to exact scale — no published width in the
// manufacturer spec sheet, just deliberately narrower.
// ════════════════════════════
const DOOR_PROFILE = {
  AW:{panel:'flat',frame:'std'},    AP:{panel:'flat',frame:'std'},
  PW:{panel:'flat',frame:'narrow'}, PR:{panel:'flat',frame:'narrow'},
  PS:{panel:'flat',frame:'narrow'}, PD:{panel:'flat',frame:'narrow'}, PH:{panel:'flat',frame:'narrow'},
  AH:{panel:'flat',frame:'std'},    AZ:{panel:'flat',frame:'std'},
  AB:{panel:'flat',frame:'std'},    AR:{panel:'flat',frame:'std'},
  AG:{panel:'flat',frame:'std'},    AX:{panel:'flat',frame:'std'},    TS:{panel:'flat',frame:'std'},
  GW:{panel:'raised',frame:'std'},  TW:{panel:'raised',frame:'std'},  SL:{panel:'raised',frame:'std'},
  AA:{panel:'raised',frame:'std'},  TG:{panel:'raised',frame:'std'},
  AN:{panel:'raised',frame:'std'},  TQ:{panel:'raised',frame:'std'},
};
function getDoorProfile(code) { return DOOR_PROFILE[code] || {panel:'flat', frame:'std'}; }

// Draws one door/drawer-front panel, frame proportioned to the style's real door
// construction instead of a fixed 4px inset for every style.
function drawDoorPanel(ctx, x, y, w, h, code, scale, PDF) {
  const profile = getDoorProfile(code);
  const frameIn = profile.frame === 'narrow' ? 1.1 : 2.1;
  const f = Math.max(2, Math.min(frameIn * scale, w * 0.28, h * 0.28));
  ctx.strokeStyle = PDF ? '#333333' : '#475569';
  ctx.lineWidth = PDF ? 1.2 : 1;
  ctx.strokeRect(x + f, y + f, w - 2*f, h - 2*f);
  if (profile.panel === 'raised') {
    const b = Math.max(2, Math.min(f * 0.6, (w - 2*f) * 0.3, (h - 2*f) * 0.3));
    const ix = x+f+b, iy = y+f+b, iw = w-2*f-2*b, ih = h-2*f-2*b;
    if (iw > 2 && ih > 2) {
      ctx.strokeStyle = PDF ? '#666666' : '#94A3B8'; ctx.lineWidth = PDF ? 0.8 : 0.7;
      ctx.strokeRect(ix, iy, iw, ih);
      ctx.beginPath();
      ctx.moveTo(x+f, y+f);       ctx.lineTo(ix, iy);
      ctx.moveTo(x+w-f, y+f);     ctx.lineTo(ix+iw, iy);
      ctx.moveTo(x+f, y+h-f);     ctx.lineTo(ix, iy+ih);
      ctx.moveTo(x+w-f, y+h-f);   ctx.lineTo(ix+iw, iy+ih);
      ctx.stroke();
    }
  }
}

// ════════════════════════════
// US STATE SALES TAX RATES (base state rate %)
// ════════════════════════════
const STATE_TAX = {
  AL:4.0,AK:0.0,AZ:5.6,AR:6.5,CA:7.25,CO:2.9,CT:6.35,DE:0.0,FL:6.0,GA:4.0,
  HI:4.0,ID:6.0,IL:6.25,IN:7.0,IA:6.0,KS:6.5,KY:6.0,LA:4.45,ME:5.5,MD:6.0,
  MA:6.25,MI:6.0,MN:6.875,MS:7.0,MO:4.225,MT:0.0,NE:5.5,NV:6.85,NH:0.0,NJ:6.625,
  NM:5.0,NY:4.0,NC:4.75,ND:5.0,OH:5.75,OK:4.5,OR:0.0,PA:6.0,RI:7.0,SC:6.0,
  SD:4.5,TN:7.0,TX:6.25,UT:4.85,VT:6.0,VA:5.3,WA:6.5,WV:6.0,WI:5.0,WY:4.0,DC:6.0
};
const US_STATES = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
  ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
  ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
  ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
  ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
  ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
  ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],['DC','Washington DC']
];

const APPLIANCES = {
  refrigerator:    { label:'Refrigerator',              widths:[30,33,36],    heights:[66,68,70,72], height:70,   depth:30, color:'#6B7280', abbr:'REF', wallMount:false, elevBottom:0  },
  range:           { label:'Range / Stove',             widths:[30,36],       height:36,             depth:25, color:'#374151', abbr:'RNG', wallMount:false, elevBottom:0  },
  dishwasher:      { label:'Dishwasher',                widths:[24],          height:34.5,           depth:24, color:'#6B7280', abbr:'DW',  wallMount:false, elevBottom:0  },
  microwave:       { label:'OTR Microwave',             widths:[30,36],       height:16,             depth:17, color:'#4B5563', abbr:'MWV', wallMount:true,  elevBottom:54, elevBottomOptions:[48,54,60,66,72] },
  cooktop:         { label:'Cooktop',                   widths:[30,36],       height:4,              depth:21, color:'#1F2937', abbr:'CTP', wallMount:false, elevBottom:32 },
  hood:            { label:'Range Hood',                widths:[30,36,42],    height:18,             depth:20, color:'#9CA3AF', abbr:'RH',  wallMount:true,  elevBottom:60 },
  beverageCooler:  { label:'Beverage Cooler (UC)',      widths:[18,24,30,36], height:34.5,           depth:24, color:'#60A5FA', abbr:'BEV', wallMount:false, elevBottom:0  },
  floatingShelf:   { label:'Floating Shelf',            widths:[24,30,36,42], height:2.5,            depth:12, color:'#D97706', abbr:'FSH', wallMount:true,  elevBottom:60, elevBottomOptions:[36,42,48,54,60,66,72,78,84] },
};

const OPENING_LABELS = { door:'Door', window:'Window', 'sink-loc':'Sink', arch:'Opening' };

// ════════════════════════════
// STATE
// ════════════════════════════
let showDimensions = false;
let showItemNumbers = false;
let showWorkTriangle = false;

let state = {
  projects: [],
  activeProjectId: null,
  activeRoomId: null,
  activeWall: 'north',
  elevWall: 'north',
  viewMode: 'floor',
  activeOpeningType: 'door',
};

// ════════════════════════════
// PERSISTENCE
// ════════════════════════════
let saveTimer = null;
function setSyncStatus(status) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (!dot) return;
  dot.className = 'sync-dot' + (status === 'saving' ? ' saving' : status === 'error' ? ' error' : '');
  lbl.textContent = status === 'saving' ? 'Saving…' : status === 'error' ? 'Error saving' : 'Saved';
}
function persist() {
  localStorage.setItem('cp_ui', JSON.stringify({
    activeProjectId: state.activeProjectId,
    activeRoomId: state.activeRoomId,
    activeWall: state.activeWall,
    elevWall: state.elevWall,
    viewMode: state.viewMode,
    activeOpeningType: state.activeOpeningType,
  }));
  clearTimeout(saveTimer);
  setSyncStatus('saving');
  saveTimer = setTimeout(syncActiveProject, 1000);
  if (typeof historyNoteChange === 'function') historyNoteChange(); // undo/redo (history.js)
}
// Demo and Free accounts keep projects in this browser only; Silver+ saves to Supabase.
// Load and save must make the same choice, or a Free user's work vanishes on reload.
function isLocalOnly() { return IS_DEMO || !currentUser || !canAccess('silver'); }
// Each signed-in account gets its own key so two logins on one browser never share
// projects. Anonymous demo keeps the original key.
function localProjectsKey() {
  return (IS_DEMO || !currentUser) ? 'cp_demo_projects' : 'cp_projects_' + currentUser.id;
}
function readLocalProjects() {
  const key = localProjectsKey();
  let saved = localStorage.getItem(key);
  // One-time carry-over: before per-account keys, signed-in Free users saved under the
  // demo key. Free accounts only (never uploaded to a paid account, since that key can
  // also hold anonymous demo projects), and only if this account has never had a key.
  if (saved === null && key !== 'cp_demo_projects' && isLocalOnly()) saved = localStorage.getItem('cp_demo_projects');
  try { return saved ? JSON.parse(saved).map(migrateProject) : []; } catch (e) { return []; }
}
function writeLocalProjects(projects) {
  localStorage.setItem(localProjectsKey(), JSON.stringify(projects));
}
async function syncActiveProject() {
  const p = activeProj();
  if (!p) return;
  if (isLocalOnly()) {
    writeLocalProjects(state.projects);
    setSyncStatus('saved');
    return;
  }
  const { error } = await upsertProjectRow(p);
  setSyncStatus(error ? 'error' : 'saved');
  if (error) console.error('Sync error:', error);
  if (p._newerSchema && !p._newerSchemaWarned) { p._newerSchemaWarned = true; alert(error.message); }
}
// ── Project save format ─────────────────────────────────────────────────────
// A Supabase row keeps a few fields in their own columns and everything else in `data`.
// projectToRow / rowToProject are the ONLY places that know this split, and `data` gets
// every other field automatically — so a new project field can't be silently dropped.
const PROJECT_SCHEMA_VERSION = 2;
const PROJECT_COLUMN_FIELDS = ['id', 'customer', 'type', 'notes', 'style', 'createdAt'];
function projectToRow(p) {
  const data = {};
  Object.keys(p).forEach(k => { if (!PROJECT_COLUMN_FIELDS.includes(k) && !k.startsWith('_')) data[k] = p[k]; });
  return {
    id: p.id,
    user_id: effectiveOwnerId,
    customer: p.customer,
    type: p.type,
    notes: p.notes || '',
    style: p.style || 'AW',
    data,
    updated_at: new Date().toISOString()
  };
}
function rowToProject(row) {
  const d = row.data || {};
  return migrateProject({
    ...d,
    jobCosts: d.jobCosts || [],  // cloud projects have always loaded with an empty list here
    id: row.id,
    customer: row.customer,
    type: row.type,
    notes: row.notes || '',
    style: row.style || 'AW',
    createdAt: new Date(row.created_at).getTime(),
  });
}
// Brings any saved project (cloud or browser, any age) up to the current shape. Only
// fills in what's missing — never changes a number the user entered — so running it
// twice, or on an already-current project, changes nothing.
function migrateProject(p) {
  if (!p || typeof p !== 'object') return p;
  const v = p.schemaVersion || 1;
  if (v > PROJECT_SCHEMA_VERSION) { p._newerSchema = true; return p; } // saved by newer code: leave untouched
  // v1 → v2: fill defaults that used to be patched in scattered places
  if (!p.status) p.status = 'Lead';
  ['activityLog', 'trimItems', 'quoteHistory'].forEach(k => { if (!Array.isArray(p[k])) p[k] = []; });
  ['phone', 'company', 'address', 'city', 'state', 'notes'].forEach(k => { if (p[k] == null) p[k] = ''; });
  if (p.quoteLocked == null) p.quoteLocked = false;
  if (p.lockedQuote === undefined) p.lockedQuote = null;
  if (p.lastQuotedAt === undefined) p.lastQuotedAt = null;
  if (!Array.isArray(p.rooms)) p.rooms = [];
  p.rooms.forEach(r => {
    ['cabinets', 'openings', 'appliances', 'islands'].forEach(k => { if (!Array.isArray(r[k])) r[k] = []; });
    if (!r.walls) r.walls = { north: 0, south: 0, east: 0, west: 0 };
    if (!r.shape) r.shape = r.lCut ? 'L' : 'rect';
    if (!r.ceilingHeight) r.ceilingHeight = 96;
    ensureItemNumbers(r);
  });
  p.schemaVersion = PROJECT_SCHEMA_VERSION;
  return p;
}
function upsertProjectRow(p) {
  if (p._newerSchema) {
    // Saving with older code would drop whatever the newer version added.
    return Promise.resolve({ error: { message: 'This project was saved by a newer version of My Cabinet Planner — reload the page to update before editing.' } });
  }
  return db.from('projects').upsert(projectToRow(p), { onConflict: 'id' });
}
function loadProjectsFromLocal() {
  state.projects = readLocalProjects();
  renderSidebar();
  const ui = JSON.parse(localStorage.getItem('cp_ui') || '{}');
  if (ui.activeProjectId && getProj(ui.activeProjectId)) {
    state.activeWall = ui.activeWall || 'north';
    state.elevWall = ui.elevWall || 'north';
    state.viewMode = ui.viewMode || 'floor';
    state.activeOpeningType = ui.activeOpeningType || 'door';
    openProject(ui.activeProjectId, ui.activeRoomId);
  }
  setSyncStatus('saved');
}
async function loadProjects() {
  const { data, error } = await db.from('projects').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); if (!isLocalOnly()) return; }
  const cloud = (data || []).map(rowToProject);
  const local = readLocalProjects();
  if (isLocalOnly()) {
    // Free (incl. lapsed subscribers): cloud projects saved while paid stay visible, and
    // this browser's copy wins for the same id because that's where Free edits are saved.
    const byId = new Map(cloud.map(p => [p.id, p]));
    local.forEach(p => byId.set(p.id, p));
    state.projects = [...byId.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else {
    // Silver+: anything created while on Free is only in this browser — copy it up once.
    const cloudIds = new Set(cloud.map(p => p.id));
    const localOnly = local.filter(p => !cloudIds.has(p.id));
    let uploadFailed = false;
    for (const p of localOnly) {
      const { error: upErr } = await upsertProjectRow(p);
      if (upErr) { console.error('Upload of local project failed:', upErr); uploadFailed = true; }
    }
    state.projects = [...localOnly, ...cloud].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    restoreActiveProject();
    if (uploadFailed) setSyncStatus('error');
    return;
  }
  restoreActiveProject();
}
function restoreActiveProject() {
  renderSidebar();
  const ui = JSON.parse(localStorage.getItem('cp_ui') || '{}');
  if (ui.activeProjectId && getProj(ui.activeProjectId)) {
    state.activeWall = ui.activeWall || 'north';
    state.elevWall = ui.elevWall || 'north';
    state.viewMode = ui.viewMode || 'floor';
    state.activeOpeningType = ui.activeOpeningType || 'door';
    openProject(ui.activeProjectId, ui.activeRoomId);
  }
  setSyncStatus('saved');
}
// Tier decides where projects load from, so the company profile must load first.
async function loadAccountData() {
  await loadCompanyProfile();
  await loadProjects();
}

// ════════════════════════════
// HELPERS
// ════════════════════════════
// roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    r = Math.min(r, w/2, h/2);
    this.moveTo(x+r,y); this.lineTo(x+w-r,y); this.arcTo(x+w,y,x+w,y+r,r);
    this.lineTo(x+w,y+h-r); this.arcTo(x+w,y+h,x+w-r,y+h,r);
    this.lineTo(x+r,y+h); this.arcTo(x,y+h,x,y+h-r,r);
    this.lineTo(x,y+r); this.arcTo(x,y,x+r,y,r); this.closePath();
    return this;
  };
}

const uid      = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const newId    = () => crypto.randomUUID();
const getProj  = id => state.projects.find(p => p.id === id);
const getRoom  = (p, id) => p && p.rooms.find(r => r.id === id);
const activeProj = () => getProj(state.activeProjectId);
const activeRoom = () => getRoom(activeProj(), state.activeRoomId);
const escHtml  = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtIn    = i => i > 0 ? `${i}" (${Math.floor(i/12)}'-${i%12}")` : '0"';
const fmtMoney = v => '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
function getMarkup() { return (parseFloat(document.getElementById('markup-pct').value) || 0) / 100; }
function getTax()    { return (parseFloat(document.getElementById('tax-pct').value)    || 0) / 100; }
function pricingOn() { return document.getElementById('pricing-toggle').checked; }
// Returns the price for this cabinet, or null if there's no price on file for its exact
// size + finish combination. We never substitute a guessed/default price here — a company's
// uploaded price sheet (or legacy manual $/in rate) is the only source of truth, so an
// unpriced cabinet stays visibly unpriced instead of silently showing a wrong number.
function cabinetPrice(cab) {
  const overrides = companyProfile.price_overrides;
  const ov = overrides && overrides[cab.type];
  let base = null;
  if (ov != null) {
    if (typeof ov === 'object') {
      // Per-size, per-finish table from an uploaded price sheet.
      const sizeKey = (cab.type === 'wall' || cab.type === 'tall') ? `${cab.width}x${cab.height}` : `${cab.width}`;
      const bySize = ov[sizeKey];
      if (bySize && typeof bySize === 'object') {
        const styleCode = cab.styleOverride || activeProj()?.style || 'AW';
        if (bySize[styleCode] != null) base = parseFloat(bySize[styleCode]);
      }
    } else {
      // Legacy flat $/inch rate (manual Company Settings entry, pre-price-sheet accounts) —
      // doesn't vary by finish, since it predates finish-aware pricing.
      base = parseFloat(ov) * cab.width;
    }
  }
  if (base == null) return null;
  const glassAddon = (cab.type === 'wall' && cab.glassDoors) ? base * 0.58 : 0;
  return (base + glassAddon) * (1 + getMarkup());
}

// ════════════════════════════
// MODAL
// ════════════════════════════
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
});

// ════════════════════════════
// VIEW MODE
// ════════════════════════════
function setViewMode(m) {
  state.viewMode = m;
  if (typeof closeItemPopover === 'function') closeItemPopover();
  document.getElementById('view-floor').classList.toggle('hidden', m !== 'floor');
  document.getElementById('view-elev').classList.toggle('hidden', m !== 'elevation');
  document.getElementById('view-3d').classList.toggle('hidden', m !== '3d');
  document.getElementById('vt-floor').classList.toggle('active', m === 'floor');
  document.getElementById('vt-elev').classList.toggle('active', m === 'elevation');
  document.getElementById('vt-3d').classList.toggle('active', m === '3d');
  // Re-frame on every switch: the view that was hidden couldn't be fitted while it
  // had no size, and the user expects to land on the whole drawing, centered.
  if (m === 'elevation') { renderElevation(); fitView('elev'); }
  else if (m === '3d')   { renderIsometric(); resetIso3DView(); }
  else                   { renderCanvas(); fitView('floor'); }
}

