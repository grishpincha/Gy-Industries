const { stripe, admin, planFromPrice, SBUX_PAISE } = require('./_lib');

// Stripe signs the RAW body, so read the stream ourselves (don't touch req.body).
function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function saveSubscription(sub) {
  const userId = sub.metadata && sub.metadata.user_id;
  if (!userId) { console.warn('subscription without user_id metadata:', sub.id); return; }

  // Ignore a stale "canceled" event for an older subscription if the user has since re-subscribed.
  if (sub.status === 'canceled') {
    const { data: cur } = await admin.from('subscriptions')
      .select('stripe_subscription_id').eq('user_id', userId).maybeSingle();
    if (cur && cur.stripe_subscription_id && cur.stripe_subscription_id !== sub.id) return;
  }

  // Newer Stripe API versions put the period end on the subscription item.
  const item = sub.items && sub.items.data && sub.items.data[0];
  const periodEnd = sub.current_period_end || (item && item.current_period_end);

  const { error } = await admin.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    status: sub.status,
    plan: planFromPrice(item && item.price && item.price.id) || (sub.metadata && sub.metadata.plan) || 'plus',
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  // 23503 = the GY account no longer exists (deleted). Nothing to sync; acknowledge.
  if (error && error.code !== '23503') throw error;
}

// Credits S-Bux for a paid one-time checkout. Safe to run twice: credit_sbux() is idempotent per session id.
async function creditPurchase(s) {
  const m = s.metadata || {};
  if (s.mode !== 'payment' || s.payment_status !== 'paid' || m.kind !== 'sbux') return;
  const amount = parseInt(m.sbux, 10);
  if (!m.user_id || !(amount > 0)) return;
  // Sanity check: the amount actually paid must match the S-Bux being credited.
  if (s.currency !== 'inr' || s.amount_total !== amount * SBUX_PAISE) {
    console.warn('S-Bux purchase amount mismatch', s.id);
    return;
  }
  const { error } = await admin.rpc('credit_sbux', { p_user: m.user_id, p_amount: amount, p_ref: s.id });
  if (error && error.code !== '23503') throw error;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(
      buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    console.warn('bad webhook signature', e.message);
    return res.status(400).send('Bad signature');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.mode === 'subscription' && s.subscription) {
          const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription.id;
          await saveSubscription(await stripe.subscriptions.retrieve(subId));
        } else {
          await creditPurchase(s);
        }
        break;
      }
      case 'checkout.session.async_payment_succeeded':
        await creditPurchase(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await saveSubscription(event.data.object);
        break;
      default:
        break; // ignore everything else
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('webhook handler failed', event.type, e);
    return res.status(500).send('Handler error'); // Stripe will retry
  }
};
