// My Cabinet Planner — js/schedule.js
// Put a job on the calendar from inside the planner (Dan, 2026-10-08). The calendar itself lives
// in Profile → Calendar (calendar_events table); this adds an entry for the open project:
//   • the Schedule button (header, next to Log) — Silver+
//   • a prompt when a job moves to Ordered or Installing ("add a date?") — nothing is added
//     without a date, and "Not now" is one click.
// Loaded by app.html as a classic script, before shell.js.

function openScheduleModal(opts) {
  opts = opts || {};
  if (!demoGate('quote')) return;
  if (!canAccess('silver')) { showTierUpgradePrompt('silver', 'Calendar'); return; }
  const p = activeProj(); if (!p) return;
  let el = document.getElementById('modal-schedule');
  if (!el) {
    el = document.createElement('div');
    el.id = 'modal-schedule'; el.className = 'modal-overlay hidden';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Add to calendar');
    document.body.appendChild(el);
  }
  const today = new Date(); const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const title = opts.title || `${p.customer || 'Job'}`;
  el.innerHTML = `<div class="modal" style="width:440px;max-width:96vw;">
    <h3>${escHtml(opts.heading || 'Add to calendar')}</h3>
    ${opts.intro ? `<p style="font-size:13px;color:#64748b;margin:0 0 10px;">${escHtml(opts.intro)}</p>` : ''}
    <div class="form-group"><label for="sch-title">Title</label><input id="sch-title" class="cp-input" maxlength="120" value="${escHtml(title)}"></div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <div class="form-group" style="margin:0;"><label for="sch-date">Date</label><input id="sch-date" type="date" class="cp-input" value="${iso(today)}"></div>
      <div class="form-group" style="margin:0;"><label for="sch-start">Start time</label><input id="sch-start" type="time" class="cp-input"></div>
      <div class="form-group" style="margin:0;"><label for="sch-end">End time</label><input id="sch-end" type="time" class="cp-input"></div>
    </div>
    <div class="form-hint" style="margin-top:4px;">Leave the times blank for an all-day entry.</div>
    <div class="form-group" style="margin-top:10px;"><label for="sch-notes">Notes</label><textarea id="sch-notes" class="cp-input" rows="2" placeholder="Crew, gate code, what to bring…"></textarea></div>
    <div id="sch-err" style="color:#b91c1c;font-size:13px;min-height:18px;"></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal('modal-schedule')">${opts.skipLabel || 'Cancel'}</button>
      <button class="btn btn-primary" id="sch-save" onclick="saveScheduleEntry()">Add to calendar</button>
    </div></div>`;
  openModal('modal-schedule');
}

async function saveScheduleEntry() {
  const p = activeProj(); if (!p) return;
  const err = document.getElementById('sch-err'), btn = document.getElementById('sch-save');
  const title = document.getElementById('sch-title').value.trim(), date = document.getElementById('sch-date').value;
  const st = document.getElementById('sch-start').value || null, et = document.getElementById('sch-end').value || null;
  if (!title) { err.textContent = 'Give it a title.'; return; }
  if (!date) { err.textContent = 'Pick a date.'; return; }
  if (st && et && et < st) { err.textContent = "The end time can't be before the start time."; return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  const { error } = await db.from('calendar_events').insert({
    owner_id: effectiveOwnerId, project_id: p.id, kind: 'job', title, color: 'teal',
    start_date: date, end_date: date, start_time: st, end_time: st ? et : null,
    notes: document.getElementById('sch-notes').value.trim() || null,
    created_by: currentUser ? currentUser.email : null,
  });
  btn.disabled = false; btn.textContent = 'Add to calendar';
  if (error) { err.textContent = "We couldn't add that just now. Please try again."; console.error(error); return; }
  closeModal('modal-schedule');
  const when = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!p.activityLog) p.activityLog = [];
  p.activityLog.unshift({ id: uid(), type: 'note', text: `Added to the calendar: ${title} (${when})`, createdAt: new Date().toISOString(), user: currentUser ? currentUser.email : 'You' });
  persist();
  if (typeof leadToast === 'function') leadToast(`Added to your calendar for ${when}. See it in My Profile → Calendar.`);
}

// After a status change (account.js setProjectStatus)
function maybeScheduleForStatus(p, status) {
  if (IS_DEMO || !canAccess('silver') || !['Ordered', 'Installing'].includes(status)) return;
  openScheduleModal({
    heading: status === 'Ordered' ? 'Ordered: add a date to your calendar?' : 'Installing: add the install to your calendar?',
    intro: status === 'Ordered' ? 'Add the delivery or install date while you have it, or skip this for now.' : 'Add the install date and crew notes, or skip this for now.',
    title: `${status === 'Ordered' ? 'Delivery' : 'Install'}: ${p.customer || 'Job'}`,
    skipLabel: 'Not now',
  });
}
