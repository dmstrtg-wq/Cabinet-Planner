/**
 * Returns the last 12 Stripe invoices for the authenticated user.
 *
 * POST /.netlify/functions/stripe-invoices
 * Headers: Authorization: Bearer <supabase-access-token>
 * Returns: { invoices: [{ number, date, amount, status, pdf }] }
 *
 * The Supabase user ID is derived from the verified token, never from the
 * request body — this endpoint runs with the service role key (bypasses RLS),
 * so trusting a client-supplied ID would let anyone act on any account.
 *
 * Env vars: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
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

  // Look up Stripe customer ID
  const { data, error } = await db
    .from('company_profiles')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  if (error || !data?.stripe_customer_id) {
    // No subscription yet — return empty list, not an error
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices: [] }),
    };
  }

  try {
    const { data: stripeInvoices } = await stripe.invoices.list({
      customer: data.stripe_customer_id,
      limit: 12,
    });

    const invoices = stripeInvoices.map(inv => ({
      number:  inv.number || inv.id,
      date:    inv.created,           // Unix timestamp
      amount:  inv.amount_paid / 100, // cents → dollars
      status:  inv.status,            // 'paid', 'open', 'void', 'uncollectible'
      pdf:     inv.invoice_pdf,       // download URL (null if not available)
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices }),
    };
  } catch (err) {
    console.error('Invoice fetch failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
