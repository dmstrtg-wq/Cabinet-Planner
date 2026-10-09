// My Cabinet Planner — js/findapro.js
// Asks each Gold account owner, once, whether to be listed on Find a Pro (/find-a-pro), where
// homeowners search by ZIP and send quote requests straight to the company (Dan, 2026-10-08:
// "the best way to fill this space up initially"). Silver can still turn the listing on in
// Company Settings. The answer is remembered on the login (user_metadata.findapro_asked).
// Loaded by app.html as a classic script, before shell.js.

async function maybeAskToList() {
  if (IS_DEMO || HOME_PRO || SHARE_TOKEN || !currentUser) return;
  if (typeof myTeamRole !== 'undefined' && myTeamRole !== 'owner') return;
  if (!canAccess('gold') || (currentUser.user_metadata || {}).findapro_asked) return;
  const { data: listing, error } = await db.from('pro_listings').select('listed, blurb').eq('user_id', effectiveOwnerId).maybeSingle();
  if (error || (listing && listing.listed)) return;
  // Not on top of the tips or another window — try again shortly
  const busy = () => (typeof _tips !== 'undefined' && _tips) || document.querySelector('.modal-overlay:not(.hidden)');
  if (busy()) { setTimeout(maybeAskToList, 8000); return; }
  fapShow(listing);
}

function fapShow(listing) {
  const cp = companyProfile || {};
  let el = document.getElementById('modal-findapro');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modal-findapro'; el.className = 'modal-overlay hidden';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Get listed on Find a Pro');
    document.body.appendChild(el);
  }
  const missing = !cp.company_name || (!cp.phone && !cp.email);
  el.innerHTML = `<div class="modal" style="width:480px;max-width:96vw;">
    <h3>Want homeowners near you to find you?</h3>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 12px;">Your Gold plan includes a listing on <b>Find a Pro</b> (mycabinetplanner.com/find-a-pro). Homeowners who search your area see ${escHtml(cp.company_name || 'your company')} and can send you a quote request. Requests land in your Leads, and you get an email.</p>
    ${missing ? `<p style="font-size:13px;color:#b45309;margin:0 0 12px;">First add your company name and a phone number or email in Company Settings, so homeowners can reach you.</p>` : `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
      <div class="form-group" style="margin:0;"><label for="fap-zip">Your ZIP code</label><input id="fap-zip" class="cp-input" inputmode="numeric" maxlength="5" value="${escHtml(String(cp.zip || '').slice(0, 5))}" style="width:130px;"></div>
      <div class="form-group" style="margin:0;"><label for="fap-radius">You work within</label><select id="fap-radius" class="cp-select" style="width:150px;">${[10, 25, 50, 100].map(m => `<option value="${m}"${m === 25 ? ' selected' : ''}>${m} miles</option>`).join('')}</select></div>
    </div>
    <div class="form-hint">You can change this or turn the listing off any time in Company Settings → Find a Pro Listing.</div>`}
    <div id="fap-err" style="color:#b91c1c;font-size:13px;min-height:18px;margin-top:6px;"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="fapAnswer(false)">Not now</button>
      ${missing ? `<button class="btn btn-primary" onclick="fapAnswer(false, true)">Open Company Settings</button>`
                : `<button class="btn btn-primary" id="fap-yes" onclick="fapAnswer(true)">List my company</button>`}
    </div></div>`;
  el._listing = listing;
  openModal('modal-findapro');
}

async function fapAnswer(yes, goToSettings) {
  const el = document.getElementById('modal-findapro'), err = document.getElementById('fap-err');
  if (yes) {
    const cp = companyProfile || {}, zip = (document.getElementById('fap-zip').value || '').trim();
    const radius = parseInt(document.getElementById('fap-radius').value, 10) || 25;
    if (!/^\d{5}$/.test(zip)) { err.textContent = 'Enter your 5-digit ZIP code.'; return; }
    const btn = document.getElementById('fap-yes'); btn.disabled = true; btn.textContent = 'Saving…';
    let pt = null;
    try { const r = await fetch('https://api.zippopotam.us/us/' + zip); if (r.ok) { const p = (await r.json()).places[0]; pt = { lat: +p.latitude, lng: +p.longitude }; } } catch (e) {}
    if (!pt) { btn.disabled = false; btn.textContent = 'List my company'; err.textContent = "We couldn't find that ZIP code. Please check it."; return; }
    // Public fields only, copied from the company profile (same as Company Settings → Find a Pro)
    const row = { user_id: effectiveOwnerId, listed: true, company_name: cp.company_name,
      phone: cp.phone || null, email: cp.email || null, website: cp.website || null, logo_url: cp.logo_url || null,
      city: cp.city || null, state: cp.state || null, service_zip: zip, service_radius_miles: radius,
      lat: pt.lat, lng: pt.lng, updated_at: new Date().toISOString() };
    const { error } = await db.from('pro_listings').upsert(row, { onConflict: 'user_id' });
    if (error) { btn.disabled = false; btn.textContent = 'List my company'; err.textContent = "We couldn't save that just now. Please try again, or turn it on in Company Settings."; return; }
    if (typeof leadToast === 'function') leadToast(`You're listed on Find a Pro. Homeowners within ${radius} miles of ${zip} can now find you.`);
  }
  try { await db.auth.updateUser({ data: { findapro_asked: true } }); currentUser.user_metadata = { ...(currentUser.user_metadata || {}), findapro_asked: true }; } catch (e) {}
  closeModal('modal-findapro');
  if (goToSettings) location.href = '/profile#company';
}
