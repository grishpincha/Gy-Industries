const { stripe, admin, SITE, userFromRequest } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Log in first.' });

    const { data: row } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!row || !row.stripe_customer_id) return res.status(404).json({ error: 'no_customer' });

    const portal = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: SITE + '/?sub=portal'
    });
    return res.status(200).json({ url: portal.url });
  } catch (e) {
    console.error('portal error', e);
    return res.status(500).json({ error: 'Could not open billing.' });
  }
};
