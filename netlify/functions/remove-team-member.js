/**
 * Removes a team member from an owner's roster. They lose access immediately —
 * the RLS policies on projects/company_profiles/company_files only grant a team
 * member access while their team_members row exists with status='active'.
 *
 * POST /.netlify/functions/remove-team-member
 * Headers: Authorization: Bearer <supabase-access-token>
 * Body: { id }  — the team_members row id to remove
 *
 * Only the account owner can remove (never trust a client-supplied owner ID — the
 * caller's own verified ID must match the row's owner_id), except for Dan's account,
 * which can act as a support/admin bypass on any account.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Dan's account — support/admin bypass. Mirrors OWNER_USER_IDS in stripe-webhook.js,
// but scoped to just Dan (the sister is a customer of her own team, not a platform admin).
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

  const id = body.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id' }) };
  }

  const { data: row, error: lookupErr } = await db
    .from('team_members')
    .select('id, owner_id')
    .eq('id', id)
    .single();
  if (lookupErr || !row) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Team member not found' }) };
  }

  if (row.owner_id !== callerId && callerId !== PLATFORM_ADMIN_ID) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Only the account owner can remove team members' }) };
  }

  const { error: delErr } = await db.from('team_members').delete().eq('id', id);
  if (delErr) {
    return { statusCode: 500, body: JSON.stringify({ error: delErr.message }) };
  }
  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
