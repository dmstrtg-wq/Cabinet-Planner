/**
 * Returns the last 12 Stripe invoices for the authenticated user.
 *
 * POST /.netlify/functions/stripe-invoices
 * Body: { userId: "supabase-uid" }
 * Returns: { invoices: [{ number, date, amount, status, pdf }] }
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

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { userId } = body;
  if (!userId) return { statusCode: 400, body: 'Missing userId' };

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
