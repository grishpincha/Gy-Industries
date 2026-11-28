const { stripe, admin, userFromRequest } = require('./_lib');

const LIVE = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'];

// Cancels any live Stripe subscription FIRST, then deletes the GY account.
// If cancelling fails we stop, so nobody keeps getting billed for a deleted account.
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

    if (row && row.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({ customer: row.stripe_customer_id, status: 'all', limit: 20 });
      for (const s of subs.data) {
        if (LIVE.includes(s.status)) await stripe.subscriptions.cancel(s.id);
      }
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('delete-account error', e);
    return res.status(500).json({ error: 'Could not delete the account.' });
  }
};
