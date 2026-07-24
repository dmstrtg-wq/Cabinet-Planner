/**
 * Creates a Stripe Customer Portal session so the user can manage
 * their payment method, view invoices, and cancel their subscription
 * entirely within Stripe's hosted UI.
 *
 * POST /.netlify/functions/stripe-portal
 * Headers: Authorization: Bearer <supabase-access-token>
 * Returns: { url: "https://billing.stripe.com/..." }
 *
 * The Supabase user ID is derived from the verified token, never from the
 * request body — this endpoint runs with the service role key (bypasses RLS),
 * so trusting a client-supplied ID would let anyone act on any account.
 *
 * Prerequisites:
 *   1. Enable Customer Portal in Stripe Dashboard → Settings → Billing → Customer portal
 *   2. Configure which features are allowed (invoice downloads, cancel, etc.)
 *
 * Env vars required: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verify the caller's Supabase session token — never trust a client-supplied userId,
  // since this function runs with the service role key and bypasses RLS.
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth token' }) };
  }
  const { data: authData, error: authError } = await db.auth.getUser(authHeader.slice(7));
  if (authError || !authData?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) };
  }
  const userId = authData.user.id;

  // Look up Stripe customer ID from Supabase
  const { data, error } = await db
    .from('company_profiles')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (error || !data?.stripe_customer_id) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'No billing account found. Subscribe first.' }),
    };
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: 'https://mycabinetplanner.com/profile',
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Portal session creation failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
