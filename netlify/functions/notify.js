/**
 * Email alerts to companies: a new lead, or a customer approved a shared design.
 *
 * POST /.netlify/functions/notify   Body: { kind: 'lead' | 'approval', id: <uuid> }
 * Called by the database (supabase-email-alerts.sql: a trigger queues the request with pg_net).
 *
 * The request only says WHICH row changed. Everything in the email is read here from the
 * database with the service key, the email only goes to the company the row belongs to, and
 * each lead (per company) / each approval is emailed once — the row is stamped before sending.
 * So anyone can call this, but a call can only send an email that was due anyway.
 *
 * Network leads (no company) aren't handled here — they still reach the site admin through the
 * Netlify form email. A company can turn these emails off (company_profiles.alert_emails).
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY
 *   optional: ALERT_FROM (default "My Cabinet Planner <alerts@mycabinetplanner.com>" — the domain
 *             must be verified in Resend), SITE_URL (default https://mycabinetplanner.com)
 */

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const FROM = process.env.ALERT_FROM || 'My Cabinet Planner <alerts@mycabinetplanner.com>';
const SITE = (process.env.SITE_URL || 'https://mycabinetplanner.com').replace(/\/$/, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Where the company's alerts go: the email on its company profile, else its login email.
async function companyInbox(companyId) {
  const { data: cp } = await db.from('company_profiles').select('company_name, email, alert_emails').eq('user_id', companyId).maybeSingle();
  if (cp && cp.alert_emails === false) return null;
  let to = cp && cp.email && /@/.test(cp.email) ? cp.email.trim() : null;
  if (!to) {
    const { data } = await db.auth.admin.getUserById(companyId);
    to = data && data.user && data.user.email;
  }
  return to ? { to, company: (cp && cp.company_name) || 'your company' } : null;
}

function page(title, intro, rows, button, footer) {
  const rowsHtml = rows.filter(r => r[1]).map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#1e293b;white-space:pre-wrap;">${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <div style="background:#2c1f14;color:#fff;padding:14px 20px;border-radius:10px 10px 0 0;font-weight:700;font-size:14px;letter-spacing:.04em;">MY CABINET PLANNER</div>
  <div style="background:#fff;padding:22px 20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#1e293b;">${esc(title)}</h1>
    <p style="margin:0 0 14px;font-size:14px;color:#475569;line-height:1.6;">${esc(intro)}</p>
    <table style="border-collapse:collapse;margin-bottom:18px;">${rowsHtml}</table>
    <a href="${esc(button[1])}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:8px;">${esc(button[0])}</a>
    <p style="margin:18px 0 0;font-size:12px;color:#64748b;line-height:1.6;">${esc(footer)}</p>
  </div>
</div></body></html>`;
}
const text = (title, intro, rows, button, footer) =>
  [title, '', intro, '', ...rows.filter(r => r[1]).map(([k, v]) => `${k}: ${v}`), '', `${button[0]}: ${button[1]}`, '', footer].join('\n');

async function send(msg) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, ...msg }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const OFF_NOTE = 'You get this because alerts are on in Company Settings → Email alerts. You can turn them off there.';

async function leadAlert(id) {
  const { data: lead } = await db.from('leads')
    .select('id, created_at, name, email, phone, zip, note, plan_summary, floor_plan_dataurl, source, company_id, notified_company')
    .eq('id', id).maybeSingle();
  if (!lead || !lead.company_id || lead.notified_company === lead.company_id) return 'nothing to send';
  // Stamp first (only if nobody else did meanwhile) so the company is emailed once
  let q = db.from('leads').update({ notified_company: lead.company_id }).eq('id', id);
  q = lead.notified_company ? q.eq('notified_company', lead.notified_company) : q.is('notified_company', null);
  const { data: stamped } = await q.select('id');
  if (!stamped || !stamped.length) return 'already sent';
  const inbox = await companyInbox(lead.company_id);
  if (!inbox) return 'alerts off';

  const fromLink = lead.source === 'design_link';
  const title = `New lead: ${lead.name || 'a homeowner'}`;
  const intro = fromLink
    ? `${lead.name || 'A homeowner'} designed their space on your homeowner design link and sent it to ${inbox.company}.`
    : `My Cabinet Planner sent ${inbox.company} a new lead.`;
  const rows = [['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone], ['ZIP', lead.zip], ['Design', lead.plan_summary], ['Message', lead.note]];
  const button = ['Accept lead → open in the planner', `${SITE}/app?lead=${lead.id}`];
  const footer = `Reply to this email to answer ${lead.name || 'them'} directly. All your leads: ${SITE}/profile#leads. ${OFF_NOTE}`;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(lead.floor_plan_dataurl || '');
  await send({
    to: [inbox.to], subject: title + (lead.zip ? ` (${lead.zip})` : ''),
    html: page(title, intro, rows, button, footer), text: text(title, intro, rows, button, footer),
    ...(lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email) ? { reply_to: lead.email } : {}),
    ...(m ? { attachments: [{ filename: 'floor-plan.jpg', content: m[1] }] } : {}),
  });
  return 'sent';
}

async function approvalAlert(id) {
  const { data: s } = await db.from('project_shares')
    .select('id, user_id, project_id, approved_at, approved_name, approved_label, approval_emailed_at')
    .eq('id', id).maybeSingle();
  if (!s || !s.approved_at) return 'nothing to send';
  if (s.approval_emailed_at && new Date(s.approval_emailed_at) >= new Date(s.approved_at)) return 'already sent';
  let q = db.from('project_shares').update({ approval_emailed_at: new Date().toISOString() }).eq('id', id);
  q = s.approval_emailed_at ? q.eq('approval_emailed_at', s.approval_emailed_at) : q.is('approval_emailed_at', null);
  const { data: stamped } = await q.select('id');
  if (!stamped || !stamped.length) return 'already sent';
  const inbox = await companyInbox(s.user_id);
  if (!inbox) return 'alerts off';
  const { data: proj } = await db.from('projects').select('customer:data->>customer').eq('id', s.project_id).maybeSingle();
  const job = (proj && proj.customer) || 'your project';

  const when = new Date(s.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const title = `Design approved: ${job}`;
  const intro = `${s.approved_name || 'Your customer'} approved the design you shared with them. This is a design approval, not a signed contract.`;
  const rows = [['Project', job], ['Approved by', s.approved_name], ['When', when], ['Version', s.approved_label]];
  const button = ['Open the project', `${SITE}/app?project=${s.project_id}`];
  await send({ to: [inbox.to], subject: title, html: page(title, intro, rows, button, OFF_NOTE), text: text(title, intro, rows, button, OFF_NOTE) });
  return 'sent';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  if (!process.env.RESEND_API_KEY) return json(503, { error: 'Email alerts are not set up yet (missing RESEND_API_KEY).' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Bad JSON' }); }
  const { kind, id } = body;
  if (!UUID.test(String(id || ''))) return json(400, { error: 'Bad id' });
  try {
    const result = kind === 'lead' ? await leadAlert(id) : kind === 'approval' ? await approvalAlert(id) : null;
    if (!result) return json(400, { error: 'Unknown kind' });
    return json(200, { result });
  } catch (e) {
    console.error('notify failed', kind, id, e.message);
    return json(502, { error: 'Could not send the email' });
  }
};
