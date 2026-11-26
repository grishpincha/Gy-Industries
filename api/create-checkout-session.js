const { stripe, admin, SITE, userFromRequest, PLANS } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Log in first.' });

    const plan = req.body && req.body.plan;
    const price = PLANS[plan];
    if (!price) return res.status(400).json({ error: 'unknown_plan' });

    const { data: row } = await admin
      .from('subscriptions')
      .select('stripe_customer_id,status')
      .eq('user_id', user.id)
      .maybeSingle();

    // Don't let someone pay twice: send them to the portal instead.
    if (row && ['active', 'trialing', 'past_due'].includes(row.status)) {
      return res.status(409).json({ error: 'already_subscribed' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price, quantity: 1 }],
      client_reference_id: user.id,
      ...(row && row.stripe_customer_id
        ? { customer: row.stripe_customer_id }
        : { customer_email: user.email }),
      // The webhook reads this to know which GY account the subscription belongs to.
      subscription_data: { metadata: { user_id: user.id, plan: plan } },
      allow_promotion_codes: true,
      success_url: SITE + '/?sub=success',
      cancel_url: SITE + '/?sub=cancelled'
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('checkout error', e);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
};
