/**
 * Creates a Stripe Checkout Session server-side so we can set client_reference_id
 * to the Supabase user ID — this is what the webhook uses to update the tier.
 *
 * POST /.netlify/functions/create-checkout-session
 * Body: { priceId: "price_...", userId: "supabase-uid", userEmail: "..." }
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const ALLOWED_PRICE_IDS = [
  process.env.STRIPE_PRICE_STUDENT,
  process.env.STRIPE_PRICE_SILVER,
  process.env.STRIPE_PRICE_GOLD,
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { priceId, userId, userEmail } = body;

  if (!priceId || !userId) {
    return { statusCode: 400, body: 'Missing priceId or userId' };
  }

  // Only allow known price IDs — prevent arbitrary charges
  if (!ALLOWED_PRICE_IDS.includes(priceId)) {
    return { statusCode: 400, body: 'Invalid price ID' };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,          // webhook uses this to find the Supabase user
      customer_email: userEmail || undefined, // pre-fills email on checkout page
      success_url: 'https://mycabinetplanner.com/app.html?checkout=success',
      cancel_url:  'https://mycabinetplanner.com/#pricing',
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe session creation failed:', err.message);
    return { statusCode: 500, body: 'Failed to create checkout session' };
  }
};
