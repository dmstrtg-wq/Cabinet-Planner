/**
 * Creates a Stripe Customer Portal session so the user can manage
 * their payment method, view invoices, and cancel their subscription
 * entirely within Stripe's hosted UI.
 *
 * POST /.netlify/functions/stripe-portal
 * Body: { userId: "supabase-uid" }
 * Returns: { url: "https://billing.stripe.com/..." }
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

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { userId } = body;
  if (!userId) return { statusCode: 400, body: 'Missing userId' };

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
