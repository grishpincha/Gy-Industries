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

## The Store
A **Store** link in the top menu opens a page where players spend S-Bux. Each item shows an emoji, name, description and price. Buying takes two taps ("Buy", then "Tap again to confirm"), each item can be owned once, and the purchase is checked in the database (enough S-Bux, not already owned).

**Adding or editing items:** Supabase > Table Editor > `store_items`. Columns: `id` (lowercase letters, numbers and dashes, never change it once players own it), `name`, `description`, `price` (in S-Bux), `emoji`, `sort` (lower shows first), `active` (untick to hide an item; don't delete items players already own).
There are 38 items in 6 categories (Hats, Gear, Frames, Name styles, Effects, Pets) to start with. They are **placeholders**: rename, reprice or hide them to match what your games really show. The `category` column creates the filter buttons on the Store page; type a new category name and a new button appears.

**Games read what a player owns:** `GY.owns('golden-crown')` and `GY.inventory()` return promises. The store only records ownership; each game decides what the item looks like or does.

## Sign in and sign up
**On the site** the login box now has: Show/Hide on every password field, a Confirm password field on sign-up, a live "username is available / taken" check, a Terms and Privacy Policy checkbox, clear messages when the email already has an account, the password is too easy to guess, or there were too many attempts, and a "Resend confirmation email" button. All new text is translated into Spanish, French, Hindi and Tamil.

**In games** (`gy-scores.js`) the old browser pop-ups (which showed the password as plain text) are replaced by a real dialog with Log in, Sign up and Forgot password. Players can also create their account without leaving the game. A game can open it with `GY.login()`.

**Check in Supabase (Authentication > URL Configuration):** the Site URL should be `https://gyindustries.vercel.app` and the same address should be in the Redirect URLs list, so the links in the confirmation and reset-password emails land back on your site.

## Staff dashboard
- **Subscriptions & S-Bux panel:** subscribers per plan, how many end at period end, approximate plan income per year, S-Bux sold (and the rupees that equals), S-Bux sitting in wallets, S-Bux spent in the store, and the best-selling items.
- **Give or remove S-Bux:** pick a player, type an amount (a minus removes) and a reason. It asks you to confirm, can never take a balance below 0, and the change is recorded in the ledger with the staff member who made it.
- **Store items panel:** edit name, description, price, category, emoji and Shown/Hidden right in the table (each box saves when you leave it), and add new items. Hide items instead of deleting them.
- **Staff sign-in:** Show/Hide password and a "Forgot password?" link.
- **Staff list:** grishpincha@gmail.com, yavyapincha817@gmail.com and thegyindustries@gmail.com are all owners. Owners can add or remove staff under Staff access.

## Not built yet
- Store text is English only (the other 4 languages need translations added).
