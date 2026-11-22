# GY subscriptions (Plus / Pro / Max): install guide

Already done for you (test mode): Supabase table + functions, Stripe products/prices, Customer Portal, webhook endpoint.

## 1. Put the files in your GitHub repo
Upload everything in this zip to the repo root (github.com > Add file > Upload files), keeping the `api` and `supabase` folders. `index.html` and `gy-scores.js` replace the old ones.

## 2. Vercel environment variables (Settings > Environment Variables), then Redeploy
| Name | Value |
|---|---|
| `STRIPE_PRICE_PLUS` | `price_1UeAJxEDFW5sfBD19QBTOquW` |
| `STRIPE_PRICE_PRO` | `price_1UeAJzEDFW5sfBD11QcgBoXn` |
| `STRIPE_PRICE_MAX` | `price_1UeAK2EDFW5sfBD15KA1AT2m` |
| `SUPABASE_URL` | `https://ktactbpxwauyqtzbidus.supabase.co` |
| `SITE_URL` | `https://gyindustries.vercel.app` |
| `STRIPE_SECRET_KEY` | your `sk_test_...` key (Stripe Dashboard > Developers > API keys) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API > service_role |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the webhook "GY Plus subscription sync" (Stripe Dashboard > Developers > Webhooks) |

Keep the last three secret. Never put them in the repo or in `index.html`.

## 3. Test
Log in, open your account, pick a plan, pay with card `4242 4242 4242 4242` (any future date, any CVC). You should return to the site and see "Your plan: GY ..." and a "Manage subscription" button.

## What each plan does now
| | Plus | Pro | Max |
|---|---|---|---|
| Profile badge | yes | yes | yes |
| S-Bux | 10 every 7 days | 25 every 7 days | 200 every 30 days |
| Wallpaper download | no | yes | yes |
| VIP tag (`GY.isVip(game)`) | no | `supreme-gamez` only | every game |
| Admin access flags (`GY.perks().admin`) | the-supreme-forge, 1plus1-tycoon | same | same |

Players claim S-Bux with the "Claim S-Bux" button in their account. Balances and a history are kept in the `wallets` and `sbux_ledger` tables.

## For your games (gy-scores.js)
`GY.plan()`, `GY.isSubscriber()`, `GY.perks()`, `GY.sbux()`, `GY.isVip(gameKey)` all return promises. The Supreme Forge and 1+1 Tycoon decide what "admin" actually unlocks; the site only tells them who has the right. The game keys are `the-supreme-forge` and `1plus1-tycoon`: change them in `plan_perks()` if your games use other names.

## Deleting an account
The button now calls `/api/delete-account`, which cancels the Stripe subscription first and only then deletes the account. The old database function refuses to delete anyone with a live subscription.

## Buying S-Bux
Any logged-in player can buy S-Bux from the account screen: 100 to 20,000 in steps of 100, at 1 S-Bux = ₹0.25 (100 S-Bux = ₹25). Checkout is Stripe's hosted page; when Stripe confirms payment the webhook credits the wallet once (replays are ignored). The rate lives in `SBUX_PAISE` in `api/_lib.js`.
In Stripe, the webhook endpoint must include the event `checkout.session.async_payment_succeeded` as well as the four listed earlier (already done for your test endpoint). Refunds do not remove S-Bux automatically.

## Not built yet
- **Spending S-Bux** (buying accessories). It needs a server-side item shop so a game can't drain a player's balance. Build that together with Supreme Gamez.
- **Perks are for test mode.** Don't take real payments until the Supreme Forge / 1+1 Tycoon admin features and S-Bux spending exist.
- To change tier, a player cancels in "Manage subscription" and picks another plan.
