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
