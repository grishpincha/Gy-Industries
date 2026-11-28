-- Run once in the Supabase SQL editor.
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text not null,
  plan                   text not null default 'gy_plus',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Only the webhook (service role) may write.
revoke insert, update, delete on public.subscriptions from anon, authenticated;

create or replace function public.is_subscriber()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = auth.uid() and status in ('active', 'trialing')
  );
$$;
revoke all on function public.is_subscriber() from public;
revoke execute on function public.is_subscriber() from anon;
grant execute on function public.is_subscriber() to authenticated;

-- Which tier the signed-in player is on (null if none)
create or replace function public.my_plan()
returns text language sql stable security definer set search_path = public as $$
  select plan from public.subscriptions
  where user_id = auth.uid() and status in ('active', 'trialing')
  limit 1;
$$;
revoke all on function public.my_plan() from public;
revoke execute on function public.my_plan() from anon;
grant execute on function public.my_plan() to authenticated;

-- ===== S-Bux wallet, perks per plan, safe account deletion =====
create table if not exists public.wallets (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  balance       integer not null default 0 check (balance >= 0),
  last_claim_at timestamptz
);
create table if not exists public.sbux_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     integer not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
alter table public.wallets enable row level security;
alter table public.sbux_ledger enable row level security;
drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet" on public.wallets for select to authenticated using (user_id = auth.uid());
drop policy if exists "read own ledger" on public.sbux_ledger;
create policy "read own ledger" on public.sbux_ledger for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.wallets from anon, authenticated;
revoke insert, update, delete on public.sbux_ledger from anon, authenticated;

create or replace function public.plan_perks(p text)
returns jsonb language sql immutable set search_path = public as $$
  select case p
    when 'plus' then '{"sbux":10,"sbux_period_days":7,"vip":[],"wallpaper":false,"admin":["the-supreme-forge","1plus1-tycoon"]}'::jsonb
    when 'pro'  then '{"sbux":25,"sbux_period_days":7,"vip":["supreme-gamez"],"wallpaper":true,"admin":["the-supreme-forge","1plus1-tycoon"]}'::jsonb
    when 'max'  then '{"sbux":200,"sbux_period_days":30,"vip":["*"],"wallpaper":true,"admin":["the-supreme-forge","1plus1-tycoon"]}'::jsonb
    else null end;
$$;
revoke all on function public.plan_perks(text) from public;

create or replace function public.my_perks()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.my_plan() is null then null
              else jsonb_build_object('plan', public.my_plan()) || public.plan_perks(public.my_plan()) end;
$$;
revoke all on function public.my_perks() from public;
revoke execute on function public.my_perks() from anon;
grant execute on function public.my_perks() to authenticated;

create or replace function public.my_sbux()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_perks jsonb;
  v_bal int := 0;
  v_last timestamptz;
  v_next timestamptz;
begin
  if v_uid is null then return null; end if;
  select balance, last_claim_at into v_bal, v_last from public.wallets where user_id = v_uid;
  v_bal := coalesce(v_bal, 0);
  v_perks := public.plan_perks(public.my_plan());
  if v_perks is null then
    return jsonb_build_object('balance', v_bal, 'claimable', false, 'next_at', null);
  end if;
  v_next := case when v_last is null then now()
                 else v_last + make_interval(days => (v_perks->>'sbux_period_days')::int) end;
  return jsonb_build_object('balance', v_bal, 'claimable', v_next <= now(), 'next_at', v_next,
                            'amount', (v_perks->>'sbux')::int);
end;
$$;
revoke all on function public.my_sbux() from public;
revoke execute on function public.my_sbux() from anon;
grant execute on function public.my_sbux() to authenticated;

create or replace function public.claim_sbux()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_perks jsonb;
  v_amt int;
  v_days int;
  v_last timestamptz;
  v_bal int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  v_plan := public.my_plan();
  v_perks := public.plan_perks(v_plan);
  if v_perks is null then return jsonb_build_object('ok', false, 'reason', 'no_plan'); end if;
  v_amt := (v_perks->>'sbux')::int;
  v_days := (v_perks->>'sbux_period_days')::int;

  insert into public.wallets(user_id) values (v_uid) on conflict do nothing;
  select last_claim_at, balance into v_last, v_bal from public.wallets where user_id = v_uid for update;

  if v_last is not null and v_last + make_interval(days => v_days) > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_ready',
      'next_at', v_last + make_interval(days => v_days), 'balance', v_bal);
  end if;

  update public.wallets set balance = balance + v_amt, last_claim_at = now()
    where user_id = v_uid returning balance into v_bal;
  insert into public.sbux_ledger(user_id, amount, reason) values (v_uid, v_amt, 'plan_grant:' || v_plan);
  return jsonb_build_object('ok', true, 'granted', v_amt, 'balance', v_bal,
    'next_at', now() + make_interval(days => v_days));
end;
$$;
revoke all on function public.claim_sbux() from public;
revoke execute on function public.claim_sbux() from anon;
grant execute on function public.claim_sbux() to authenticated;

-- Direct deletion is blocked while a subscription is live; the site uses /api/delete-account,
-- which cancels the Stripe subscription first.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path to 'public', 'auth' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if exists (select 1 from public.subscriptions
             where user_id = auth.uid()
               and status in ('active','trialing','past_due','unpaid','incomplete')) then
    raise exception 'cancel your subscription first';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ===== Buying S-Bux directly (1 S-Bux = 0.25 rupees) =====
alter table public.sbux_ledger add column if not exists ref text unique;

create or replace function public.credit_sbux(p_user uuid, p_amount int, p_ref text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  insert into public.sbux_ledger(user_id, amount, reason, ref)
    values (p_user, p_amount, 'purchase', p_ref)
    on conflict (ref) do nothing;
  if not found then return false; end if;  -- already credited
  insert into public.wallets(user_id, balance) values (p_user, p_amount)
    on conflict (user_id) do update set balance = public.wallets.balance + excluded.balance;
  return true;
end;
$$;
revoke all on function public.credit_sbux(uuid, int, text) from public, anon, authenticated;
grant execute on function public.credit_sbux(uuid, int, text) to service_role;

-- ===== Store (spend S-Bux on items) =====
create table if not exists public.store_items (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 400),
  price       integer not null check (price > 0),
  emoji       text not null default '🎁',
  active      boolean not null default true,
  sort        integer not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists public.purchases (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null references public.store_items(id),
  price_paid integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

alter table public.store_items enable row level security;
alter table public.purchases   enable row level security;

drop policy if exists "anyone reads active items" on public.store_items;
create policy "anyone reads active items" on public.store_items
  for select to anon, authenticated using (active);
drop policy if exists "staff manage items" on public.store_items;
create policy "staff manage items" on public.store_items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases" on public.purchases
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.purchases from anon, authenticated;

create or replace function public.buy_item(p_item text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_price int;
  v_bal int;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select price into v_price from public.store_items where id = p_item and active;
  if v_price is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  insert into public.wallets(user_id) values (v_uid) on conflict do nothing;
  select balance into v_bal from public.wallets where user_id = v_uid for update;  -- serialises double-clicks

  if exists (select 1 from public.purchases where user_id = v_uid and item_id = p_item) then
    return jsonb_build_object('ok', false, 'reason', 'owned', 'balance', v_bal);
  end if;
  if v_bal < v_price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_bal, 'price', v_price);
  end if;

  update public.wallets set balance = balance - v_price where user_id = v_uid returning balance into v_bal;
  insert into public.purchases(user_id, item_id, price_paid) values (v_uid, p_item, v_price);
  insert into public.sbux_ledger(user_id, amount, reason) values (v_uid, -v_price, 'item:' || p_item);
  return jsonb_build_object('ok', true, 'balance', v_bal);
end;
$$;
revoke all on function public.buy_item(text) from public;
revoke execute on function public.buy_item(text) from anon;
grant execute on function public.buy_item(text) to authenticated;

-- Placeholder items: edit or delete these in Table Editor > store_items
insert into public.store_items (id, name, description, price, emoji, sort) values
  ('bronze-frame', 'Bronze Avatar Frame', 'A bronze frame around your profile picture. A simple way to stand out.', 50, '🥉', 10),
  ('neon-name',    'Neon Name Glow',      'Make your name glow in bright neon colours.', 120, '✨', 20),
  ('golden-crown', 'Golden Crown',        'A shiny golden crown accessory for your avatar.', 250, '👑', 30),
  ('rocket-boots', 'Rocket Boots',        'Cool rocket boots for your avatar to wear.', 300, '👟', 40),
  ('rainbow-trail','Rainbow Trail',       'Leave a colourful rainbow trail behind your character.', 500, '🌈', 50)
on conflict (id) do nothing;

-- ===== Store categories + more items =====
alter table public.store_items add column if not exists category text not null default 'Gear';
update public.store_items set category = 'Frames'      where id = 'bronze-frame';
update public.store_items set category = 'Name styles' where id = 'neon-name';
update public.store_items set category = 'Hats'        where id = 'golden-crown';
update public.store_items set category = 'Gear'        where id = 'rocket-boots';
update public.store_items set category = 'Effects'     where id = 'rainbow-trail';

insert into public.store_items (id, name, description, price, emoji, category, sort) values
  ('party-hat','Party Hat','A fun pointy party hat. Every day is a celebration!',40,'🥳','Hats',11),
  ('hard-hat','Builder Hard Hat','A yellow hard hat for serious builders and tycoons.',60,'👷','Hats',12),
  ('cowboy-hat','Cowboy Hat','Yeehaw! A classic cowboy hat for your avatar.',80,'🤠','Hats',13),
  ('wizard-hat','Wizard Hat','A tall, starry wizard hat full of mystery.',90,'🧙','Hats',14),
  ('top-hat','Fancy Top Hat','A smart black top hat for the most stylish players.',150,'🎩','Hats',15),
  ('viking-helmet','Viking Helmet','A mighty helmet with big horns for brave explorers.',200,'⚔️','Hats',16),
  ('sunglasses','Cool Sunglasses','Dark shades that make you look super cool.',70,'😎','Gear',41),
  ('backpack','Explorer Backpack','A sturdy backpack for every adventure.',100,'🎒','Gear',42),
  ('headphones','Gamer Headphones','Big comfy headphones for serious gaming.',120,'🎧','Gear',43),
  ('hero-cape','Hero Cape','A flowing red cape that flaps in the wind.',180,'🦸','Gear',44),
  ('shield','Steel Shield','A strong shield to wear on your back.',280,'🛡️','Gear',45),
  ('sword','Silver Sword','A shiny silver sword for brave heroes.',350,'🗡️','Gear',46),
  ('jetpack','Jetpack','Blast off with a jetpack on your back.',400,'🚀','Gear',47),
  ('silver-frame','Silver Avatar Frame','A sparkling silver frame for your profile picture.',100,'🥈','Frames',6),
  ('gold-frame','Gold Avatar Frame','A rich golden frame for your profile picture.',200,'🥇','Frames',7),
  ('fire-frame','Fire Frame','A blazing frame with flickering flames.',300,'🔥','Frames',8),
  ('ice-frame','Ice Frame','A frosty frame with sparkling snowflakes.',300,'❄️','Frames',9),
  ('diamond-frame','Diamond Frame','The fanciest frame of all, made of shining diamonds.',450,'💎','Frames',10),
  ('ocean-name','Ocean Name','Your name in cool ocean blue.',100,'🌊','Name styles',21),
  ('sunset-name','Sunset Name','Your name in warm orange and pink sunset colours.',100,'🌇','Name styles',22),
  ('gold-name','Golden Name','Your name in shiny gold.',150,'🏆','Name styles',23),
  ('galaxy-name','Galaxy Name','Your name glittering like stars in deep space.',350,'🌌','Name styles',24),
  ('smoke-puff','Smoke Puff','A puff of smoke whenever you appear.',120,'💨','Effects',51),
  ('confetti-pop','Confetti Pop','Confetti bursts out when you win!',150,'🎉','Effects',52),
  ('star-burst','Star Burst','A burst of golden stars around your character.',250,'🌟','Effects',53),
  ('lightning-aura','Lightning Aura','Crackling lightning swirls around you.',400,'⚡','Effects',54),
  ('pet-penguin','Pet Penguin','A waddling penguin buddy that follows you around.',250,'🐧','Pets',61),
  ('pet-cat','Pet Cat','A curious little cat for your adventures.',300,'🐱','Pets',62),
  ('pet-dog','Pet Dog','A loyal puppy that never leaves your side.',300,'🐶','Pets',63),
  ('pet-owl','Wise Owl','A clever owl that sits on your shoulder.',350,'🦉','Pets',64),
  ('pet-fox','Pet Fox','A sneaky and speedy fox friend.',400,'🦊','Pets',65),
  ('pet-robot','Robot Buddy','A friendly little robot that beeps and boops.',600,'🤖','Pets',66),
  ('pet-dragon','Baby Dragon','A tiny dragon that breathes sparkly fire. Super rare!',900,'🐉','Pets',67)
on conflict (id) do nothing;

-- ===== Staff tools =====
alter table public.sbux_ledger add column if not exists actor uuid references auth.users(id) on delete set null;

create or replace function public.admin_sbux_adjust(p_user uuid, p_amount int, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_bal int;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then raise exception 'bad amount'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 1 and 120 then raise exception 'reason required'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'no such player'; end if;
  insert into public.wallets(user_id) values (p_user) on conflict do nothing;
  select balance into v_bal from public.wallets where user_id = p_user for update;
  if v_bal + p_amount < 0 then raise exception 'player only has % S-Bux', v_bal; end if;
  update public.wallets set balance = balance + p_amount where user_id = p_user returning balance into v_bal;
  insert into public.sbux_ledger(user_id, amount, reason, actor)
    values (p_user, p_amount, 'staff: ' || trim(p_reason), auth.uid());
  return v_bal;
end;
$$;
revoke all on function public.admin_sbux_adjust(uuid, int, text) from public, anon;
grant execute on function public.admin_sbux_adjust(uuid, int, text) to authenticated;

create or replace function public.admin_store_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  return jsonb_build_object(
    'plans', coalesce((select jsonb_object_agg(plan, n) from (
               select plan, count(*) as n from public.subscriptions
               where status in ('active', 'trialing') group by plan) q), '{}'::jsonb),
    'canceling', (select count(*) from public.subscriptions where status in ('active','trialing') and cancel_at_period_end),
    'sbux_sold', coalesce((select sum(amount) from public.sbux_ledger where reason = 'purchase'), 0),
    'sbux_in_wallets', coalesce((select sum(balance) from public.wallets), 0),
    'items_sold', (select count(*) from public.purchases),
    'sbux_spent', coalesce((select sum(price_paid) from public.purchases), 0),
    'top_items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'emoji', i.emoji, 'n', c.n) order by c.n desc)
               from (select item_id, count(*) as n from public.purchases group by 1 order by 2 desc limit 5) c
               join public.store_items i on i.id = c.item_id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_store_stats() from public, anon;
grant execute on function public.admin_store_stats() to authenticated;
