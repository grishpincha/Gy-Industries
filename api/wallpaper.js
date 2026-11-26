const { admin, userFromRequest } = require('./_lib');

// Only Pro and Max subscribers get the wallpaper (mirrors plan_perks() in the database).
const WALLPAPER_PLANS = ['pro', 'max'];

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f1226"/><stop offset="1" stop-color="#2b1b4d"/></linearGradient>' +
  '<radialGradient id="r" cx="0.75" cy="0.25" r="0.6"><stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>' +
  '<rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#r)"/>' +
  '<g fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2">' +
  '<circle cx="1500" cy="300" r="260"/><circle cx="1500" cy="300" r="380"/><circle cx="1500" cy="300" r="500"/></g>' +
  '<text x="960" y="540" text-anchor="middle" font-family="Georgia, serif" font-size="150" font-weight="700" fill="#ffffff">GY Industries</text>' +
  '<text x="960" y="620" text-anchor="middle" font-family="Georgia, serif" font-size="36" letter-spacing="10" fill="#ffb347">GAMES &amp; SIMULATIONS</text>' +
  '</svg>';

module.exports = async (req, res) => {
  try {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Log in first.' });

    const { data: row } = await admin
      .from('subscriptions')
      .select('plan,status')
      .eq('user_id', user.id)
      .maybeSingle();
    const ok = row && ['active', 'trialing'].includes(row.status) && WALLPAPER_PLANS.includes(row.plan);
    if (!ok) return res.status(403).json({ error: 'Pro or Max required.' });

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', 'attachment; filename="gy-industries-wallpaper.svg"');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(SVG);
  } catch (e) {
    console.error('wallpaper error', e);
    return res.status(500).json({ error: 'Could not load wallpaper.' });
  }
};
