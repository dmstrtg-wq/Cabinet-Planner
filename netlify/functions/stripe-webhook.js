/**
 * Stripe Webhook Handler
 * Netlify Function: /.netlify/functions/stripe-webhook
 *
 * Required environment variables (set in Netlify → Site → Environment Variables):
 *   STRIPE_SECRET_KEY        sk_live_... (or sk_test_... for testing)
 *   STRIPE_WEBHOOK_SECRET    whsec_...
 *   SUPABASE_URL             https://ojlbxofgpucihqxgpxzz.supabase.co
 *   SUPABASE_SERVICE_KEY     your Supabase SERVICE ROLE key (not the anon key — has admin access)
 *
 * Stripe Price ID → tier mapping (update with your actual Price IDs):
 *   STRIPE_PRICE_STUDENT     price_...
 *   STRIPE_PRICE_SILVER      price_...
 *   STRIPE_PRICE_GOLD        price_...
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service role key bypasses RLS — safe server-side only
);

// ── Owner accounts — always Gold, never touched by Stripe ──────────────────
// Paste the UUID from Supabase → Authentication → Users for each owner account
const OWNER_USER_IDS = [
  // 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Dan
  // 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Sister
];

// Map Stripe Price IDs → subscription tier names
function tierFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_STUDENT) return 'student';
  if (priceId === process.env.STRIPE_PRICE_SILVER)  return 'silver';
  if (priceId === process.env.STRIPE_PRICE_GOLD)    return 'gold';
  return 'free';
}

async function setTier(supabaseUserId, tier) {
  if (OWNER_USER_IDS.includes(supabaseUserId)) {
    console.log(`Skipping tier update for owner account ${supabaseUserId}`);
    return;
  }
  const { error } = await db
    .from('company_profiles')
    .upsert({ user_id: supabaseUserId, subscription_tier: tier }, { onConflict: 'user_id' });
  if (error) {
    console.error(`Failed to set tier for ${supabaseUserId}:`, error.message);
    throw error;
  }
  console.log(`Set tier=${tier} for user=${supabaseUserId}`);
}

// Stripe stores Supabase user ID in customer metadata at checkout time
async function getUserIdFromCustomer(customerId) {
  const customer = await stripe.customers.retrieve(customerId);
  return customer.metadata?.supabase_uid || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {

      // ── Customer completes checkout ──────────────────────────────────────
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        if (session.mode !== 'subscription') break;

        let supabaseUid = session.client_reference_id || session.metadata?.supabase_uid;

        // Fallback: look up Supabase user by email if no UID was passed
        if (!supabaseUid && session.customer_details?.email) {
          const { data: { users } } = await db.auth.admin.listUsers();
          const match = users?.find(u => u.email === session.customer_details.email);
          if (match) {
            supabaseUid = match.id;
            console.log(`Matched user by email: ${session.customer_details.email}`);
          } else {
            console.log(`No Supabase user found for email ${session.customer_details.email} — will update when they sign up`);
          }
        }

        if (!supabaseUid) {
          console.error('Could not identify Supabase user for session', session.id);
          break;
        }

        // Skip owner accounts — their tier is permanently set in Supabase
        if (OWNER_USER_IDS.includes(supabaseUid)) {
          console.log(`Skipping checkout tier update for owner account ${supabaseUid}`);
          break;
        }

        // Fetch the subscription to get the price ID
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = tierFromPriceId(priceId);

        // Store the stripe_customer_id and stripe_subscription_id for future lookups
        await db.from('company_profiles').upsert({
          user_id: supabaseUid,
          subscription_tier: tier,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
        }, { onConflict: 'user_id' });

        console.log(`Checkout complete: user=${supabaseUid} tier=${tier}`);
        break;
      }

      // ── Subscription changed (upgrade / downgrade) ───────────────────────
      case 'customer.subscription.updated': {
        const sub = stripeEvent.data.object;
        const priceId = sub.items.data[0]?.price?.id;
        const tier = tierFromPriceId(priceId);

        const uid = await getUserIdFromCustomer(sub.customer);
        if (!uid) {
          // Fall back to looking up by stripe_customer_id in our table
          const { data } = await db
            .from('company_profiles')
            .select('user_id')
            .eq('stripe_customer_id', sub.customer)
            .single();
          if (data) await setTier(data.user_id, tier);
        } else {
          await setTier(uid, tier);
        }
        break;
      }

      // ── Subscription cancelled ───────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object;

        const { data } = await db
          .from('company_profiles')
          .select('user_id')
          .eq('stripe_customer_id', sub.customer)
          .single();

        if (data) await setTier(data.user_id, 'free');
        break;
      }

      // ── Payment failed (after all retries) ──────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        // Only act on final failure (attempt_count >= 4 means Stripe gave up)
        if ((invoice.attempt_count || 0) < 4) break;

        const { data } = await db
          .from('company_profiles')
          .select('user_id')
          .eq('stripe_customer_id', invoice.customer)
          .single();

        if (data) await setTier(data.user_id, 'free');
        break;
      }

      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }
  } catch (err) {
    console.error('Handler error:', err.message);
    return { statusCode: 500, body: 'Internal error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
