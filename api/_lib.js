// Shared helpers for the subscription API routes (Vercel Node functions).
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// Service-role client: bypasses RLS. Server-side only, never ship this key to the browser.
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
const SITE = (process.env.SITE_URL || 'https://gyindustries.vercel.app').replace(/\/$/, '');

// Verifies the Supabase access token sent by the browser and returns the user (or null).
async function userFromRequest(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data || !data.user ? null : data.user;
}

// Plan name -> Stripe price id (set in Vercel env vars).
const PLANS = {
  plus: process.env.STRIPE_PRICE_PLUS,
  pro: process.env.STRIPE_PRICE_PRO,
  max: process.env.STRIPE_PRICE_MAX
};
function planFromPrice(priceId) {
  return Object.keys(PLANS).find((k) => PLANS[k] && PLANS[k] === priceId) || null;
}

// 1 S-Bux = 25 paise (₹0.25). The ONLY place the rate lives on the server.
const SBUX_PAISE = 25;

module.exports = { stripe, admin, SITE, userFromRequest, PLANS, planFromPrice, SBUX_PAISE };
