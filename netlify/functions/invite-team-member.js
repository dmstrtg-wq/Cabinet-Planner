/**
 * Invites a new team member onto a Gold account. Creates a real Supabase auth user
 * (sending an actual invite email with a signup link — app.html's existing "set your
 * password" flow handles the landing side of this) and a team_members row.
 *
 * POST /.netlify/functions/invite-team-member
 * Headers: Authorization: Bearer <supabase-access-token>
 * Body: { name, email, role: 'admin'|'member' }
 *
 * Only the account owner can invite (never trust a client-supplied owner ID — the
 * caller's own verified ID IS the owner, except for Dan's support/admin bypass below).
 * Enforces Gold-tier gating and the 5-member cap server-side — the client checks both
 * too, but a client-side check alone can always be bypassed.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TEAM_SEAT_CAP = 5;

// Dan's account — support/admin bypass, can invite on behalf of any account by passing
// targetOwnerId. Mirrors OWNER_USER_IDS in stripe-webhook.js, but scoped to just Dan
// (the sister is a customer of her own team, not a platform admin).
const PLATFORM_ADMIN_ID = 'f464edfb-8f74-49b7-b366-79b89605bbb7';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth token' }) };
  }
  const { data: authData, error: authError } = await db.auth.getUser(authHeader.slice(7));
  if (authError || !authData?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  }
  const callerId = authData.user.id;

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const role = body.role === 'admin' ? 'admin' : 'member';
  const ownerId = (callerId === PLATFORM_ADMIN_ID && body.targetOwnerId) ? body.targetOwnerId : callerId;

  if (!name || !email || !email.includes('@')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid name/email' }) };
  }
  if (ownerId !== callerId && callerId !== PLATFORM_ADMIN_ID) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Only the account owner can invite team members' }) };
  }

  // Team members are a Gold-tier feature
  const { data: profile } = await db.from('company_profiles').select('subscription_tier').eq('user_id', ownerId).single();
  if ((profile?.subscription_tier || 'free') !== 'gold') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Team members are available on the Gold plan' }) };
  }

  // Enforce the 5-member cap
  const { count } = await db.from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId);
  if ((count || 0) >= TEAM_SEAT_CAP) {
    return { statusCode: 400, body: JSON.stringify({ error: `You've reached your ${TEAM_SEAT_CAP}-member limit.` }) };
  }

  // Create the invited user's auth account and send the real invite email. If they
  // already have an account (existing user, e.g. a prior free signup), fall back to
  // looking them up by email instead of trying to create a duplicate.
  let memberUserId;
  const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://mycabinetplanner.com/app',
  });
  if (invited?.user) {
    memberUserId = invited.user.id;
  } else if (/already registered|already exists/i.test(inviteErr?.message || '')) {
    const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = listErr ? null : list.users.find(u => (u.email || '').toLowerCase() === email);
    if (!existing) {
      return { statusCode: 400, body: JSON.stringify({ error: 'That email is already registered, but the account could not be found.' }) };
    }
    memberUserId = existing.id;
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: inviteErr?.message || 'Could not send the invite.' }) };
  }

  const { error: dbErr } = await db.from('team_members').upsert({
    owner_id: ownerId,
    member_user_id: memberUserId,
    email,
    name,
    role,
    status: 'pending',
    invited_at: new Date().toISOString(),
  }, { onConflict: 'owner_id,email' });

  if (dbErr) {
    return { statusCode: 500, body: JSON.stringify({ error: dbErr.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
