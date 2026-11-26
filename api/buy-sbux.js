const { stripe, SITE, userFromRequest, SBUX_PAISE } = require('./_lib');

// One-time purchase of S-Bux at 1 S-Bux = 25 paise. Amount: 100..20000 in steps of 100.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Log in first.' });

    const n = Number(req.body && req.body.amount);
    if (!Number.isInteger(n) || n < 100 || n > 20000 || n % 100 !== 0) {
      return res.status(400).json({ error: 'bad_amount' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: n / 100,
        price_data: {
          currency: 'inr',
          unit_amount: 100 * SBUX_PAISE, // price of 100 S-Bux, in paise
          product_data: { name: '100 S-Bux', description: 'GY Industries in-game currency' }
        }
      }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { kind: 'sbux', user_id: user.id, sbux: String(n) },
      success_url: SITE + '/?sbux=success',
      cancel_url: SITE + '/?sbux=cancelled'
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('buy-sbux error', e);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
};
