/**
 * Marks the caller's own pending team membership as active. Called by the client
 * whenever resolveTeamContext() finds a pending row for the logged-in user — covers
 * both a fresh invite-link arrival (set-password flow) and an existing user (who
 * already had a password) simply logging in normally after being invited.
 *
 * POST /.netlify/functions/accept-team-invite
 * Headers: Authorization: Bearer <supabase-access-token>
 *
 * The membership row updated is always the caller's own (member_user_id derived from
 * the verified token) — there is no client-writable path to team_members beyond the
 * owner managing their own roster, so a member can never touch their own role/owner.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  const { error } = await db
    .from('team_members')
    .update({ status: 'active', joined_at: new Date().toISOString() })
    .eq('member_user_id', callerId)
    .eq('status', 'pending');

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
