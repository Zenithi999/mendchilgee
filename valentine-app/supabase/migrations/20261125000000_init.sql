-- ═══════════════════════════════════════════════════════════════
-- Mendchilgee — Supabase schema (replaces Firestore)
--
-- Every former Firestore collection is a table with:
--   id    text  primary key   (same IDs as Firestore, so old links work)
--   data  jsonb               (the document body, camelCase keys as before)
-- plus a few real columns where Postgres needs them (owner, counters).
--
-- Run once in Supabase → SQL Editor (or `supabase db push`).
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── Helpers ──────────────────────────────────────────────────────

-- Firestore-style 20-char random id (keeps share links short)
create or replace function public.gen_doc_id()
returns text language plpgsql volatile as $$
declare
  chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  bytes bytea := extensions.gen_random_bytes(20);
  out text := '';
begin
  for i in 0..19 loop
    out := out || substr(chars, (get_byte(bytes, i) % 62) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function public.now_iso()
returns text language sql stable as $$
  select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Tables ───────────────────────────────────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,   -- credits, role, terms*, plan*
  firebase_uid text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.gifts (
  id            text primary key default public.gen_doc_id(),
  user_id       uuid references auth.users(id) on delete set null,
  firebase_uid  text,
  data          jsonb not null default '{}'::jsonb,
  view_count    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index gifts_user_id_idx on public.gifts(user_id);
create index gifts_expiry_idx on public.gifts(((data->>'expiresAt')))
  where coalesce((data->>'paymentExpired')::boolean, false) = false;

create table public.gift_responses (
  id          text primary key,              -- = gift id
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.promo_codes (
  id          text primary key,              -- the code itself, upper-case
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.promo_redemptions (
  id          text primary key,              -- <userId>_<CODE>
  user_id     uuid references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.credit_payments (
  id          text primary key,              -- BYL client_reference_id
  user_id     uuid references auth.users(id) on delete set null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index credit_payments_user_idx on public.credit_payments(user_id);
create index credit_payments_status_idx on public.credit_payments((data->>'status'));

create table public.demo_payments (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index demo_payments_status_idx on public.demo_payments((data->>'status'));

create table public.processed_webhook_events (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.app_settings (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['profiles','gifts','gift_responses','promo_codes',
                           'credit_payments','demo_payments','app_settings'] loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.touch_updated_at()',
                   t || '_touch', t);
  end loop;
end $$;

-- ── Auth: profile row for every new user ─────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, data)
  values (new.id, jsonb_build_object('credits', 0, 'email', new.email, 'createdAt', public.now_iso()))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select data->>'role' = 'admin' from public.profiles where id = auth.uid()),
    false)
$$;

-- ── Gifts: owners may edit content, never payment fields ─────────

create or replace function public.protect_gift_payment_fields()
returns trigger language plpgsql as $$
declare
  k text;
  protected constant text[] := array['paidTier','creditUsed','activatedAt',
                                     'expiresAt','paidAt','paymentExpired'];
begin
  -- service_role (Edge Functions), admins and trusted SQL functions
  -- (which set app.trusted = on) may change anything
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.trusted', true), '') = 'on'
     or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.data := new.data || jsonb_build_object(
      'paidTier', 'free', 'creditUsed', false, 'activatedAt', null,
      'expiresAt', null, 'paidAt', null, 'paymentExpired', false);
    new.view_count := 0;
    return new;
  end if;

  foreach k in array protected loop
    -- anyone may mark an expired gift as expired (downgrade only)
    if k in ('paymentExpired') and (new.data->>k)::boolean is true then
      continue;
    end if;
    if old.data ? k then
      new.data := jsonb_set(new.data, array[k], old.data->k);
    else
      new.data := new.data - k;
    end if;
  end loop;
  -- downgrade to free when marked expired
  if (new.data->>'paymentExpired')::boolean is true
     and coalesce((old.data->>'paymentExpired')::boolean, false) = false then
    new.data := jsonb_set(new.data, '{paidTier}', '"free"');
  end if;
  new.view_count := old.view_count;
  new.user_id := old.user_id;
  return new;
end $$;

create trigger gifts_protect
  before insert or update on public.gifts
  for each row execute function public.protect_gift_payment_fields();

-- view counter, callable by anyone opening a gift link
create or replace function public.trust()
returns void language sql as $$ select set_config('app.trusted', 'on', true) $$;

create or replace function public.increment_gift_view(p_gift_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.trust();
  update public.gifts
     set view_count = view_count + 1,
         data = jsonb_set(data, '{lastViewedAt}', to_jsonb(public.now_iso()))
   where id = p_gift_id;
end $$;

-- anyone may flag a gift whose paid period has ended
create or replace function public.mark_gift_expired(p_gift_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.trust();
  update public.gifts
     set data = data || '{"paymentExpired": true, "paidTier": "free"}'::jsonb
   where id = p_gift_id
     and data->>'expiresAt' is not null
     and (data->>'expiresAt')::timestamptz <= now();
end $$;

-- ── Profiles: terms ──────────────────────────────────────────────

create or replace function public.accept_terms(p_version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.profiles (id, data) values (auth.uid(), '{}'::jsonb)
  on conflict (id) do nothing;
  update public.profiles
     set data = data || jsonb_build_object(
       'termsAccepted', true,
       'termsAcceptedAt', public.now_iso(),
       'termsVersion', p_version)
   where id = auth.uid();
end $$;

-- ── Credits ──────────────────────────────────────────────────────

create or replace function public.add_credits(p_user uuid, p_amount int)
returns int language plpgsql security definer set search_path = public as $$
declare new_balance int;
begin
  insert into public.profiles (id, data) values (p_user, '{}'::jsonb)
  on conflict (id) do nothing;
  update public.profiles
     set data = jsonb_set(data, '{credits}',
                  to_jsonb(coalesce((data->>'credits')::int, 0) + p_amount))
   where id = p_user
  returning (data->>'credits')::int into new_balance;
  return new_balance;
end $$;

create or replace function public.redeem_promo_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  code text := upper(trim(regexp_replace(coalesce(p_code, ''), '[/\\]', '', 'g')));
  c public.promo_codes;
  to_add int;
  new_balance int;
begin
  if uid is null then return jsonb_build_object('error', 'missing_params'); end if;
  if code = '' then return jsonb_build_object('error', 'missing_params'); end if;

  select * into c from public.promo_codes where id = code for update;
  if not found then return jsonb_build_object('error', 'invalid_code'); end if;
  if (c.data->>'active')::boolean is false then
    return jsonb_build_object('error', 'code_inactive');
  end if;
  if exists (select 1 from public.promo_redemptions where id = uid::text || '_' || code) then
    return jsonb_build_object('error', 'already_used');
  end if;
  if coalesce((c.data->>'maxUses')::int, 0) > 0
     and coalesce((c.data->>'currentUses')::int, 0) >= (c.data->>'maxUses')::int then
    return jsonb_build_object('error', 'code_exhausted');
  end if;

  to_add := coalesce((c.data->>'credits')::int, 1);
  new_balance := public.add_credits(uid, to_add);

  insert into public.promo_redemptions (id, user_id, data)
  values (uid::text || '_' || code, uid, jsonb_build_object(
    'userId', uid, 'code', code, 'creditsAdded', to_add, 'redeemedAt', public.now_iso()));

  update public.promo_codes
     set data = jsonb_set(data, '{currentUses}',
                  to_jsonb(coalesce((data->>'currentUses')::int, 0) + 1))
   where id = code;

  return jsonb_build_object('success', true, 'newCredits', new_balance);
end $$;

create or replace function public.use_credit(p_gift_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  credits int;
  g public.gifts;
begin
  if uid is null or p_gift_id is null then
    return jsonb_build_object('error', 'missing_params');
  end if;
  perform public.trust();

  select coalesce((data->>'credits')::int, 0) into credits
    from public.profiles where id = uid for update;
  credits := coalesce(credits, 0);

  select * into g from public.gifts where id = p_gift_id for update;
  if not found then return jsonb_build_object('error', 'gift_not_found'); end if;
  if g.user_id is distinct from uid then
    return jsonb_build_object('error', 'not_owner');
  end if;
  if g.data->>'status' = 'published' and (g.data->>'creditUsed')::boolean is true then
    return jsonb_build_object('success', true, 'remainingCredits', credits, 'alreadyActivated', true);
  end if;
  if credits <= 0 then return jsonb_build_object('error', 'no_credits'); end if;

  update public.profiles
     set data = jsonb_set(data, '{credits}', to_jsonb(credits - 1))
   where id = uid;

  update public.gifts
     set data = data || jsonb_build_object(
       'paidTier', 'premium', 'status', 'published',
       'activatedAt', public.now_iso(), 'paymentExpired', false, 'creditUsed', true)
   where id = p_gift_id;

  return jsonb_build_object('success', true, 'remainingCredits', credits - 1);
end $$;

-- ── Payments (called only by the Edge Function with service_role) ─

create or replace function public.process_credit_payment(
  p_ref text, p_checkout jsonb, p_via text default 'webhook')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.credit_payments;
  uid uuid;
  ptype text;
  days int;
  plan_days constant jsonb := '{"basic":7,"standard":14,"premium":30}';
begin
  perform public.trust();
  select * into p from public.credit_payments where id = p_ref for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if p.data->>'status' = 'paid' then
    return jsonb_build_object('status', 'paid', 'already', true);
  end if;

  uid := p.user_id;
  ptype := p.data->>'purchaseType';

  update public.credit_payments
     set data = data || jsonb_build_object('status', 'paid', 'paidAt', public.now_iso(),
                                           'checkoutRaw', p_checkout, 'paidVia', p_via)
   where id = p_ref;

  if ptype = 'gift' then
    update public.gifts
       set data = data || jsonb_build_object(
         'creditUsed', true, 'status', 'published', 'paidTier', 'standard',
         'paidAt', public.now_iso(), 'paymentExpired', false,
         'expiresAt', to_char((now() + interval '14 days') at time zone 'utc',
                              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
     where id = p.data->>'giftId';
    if uid is not null then perform public.add_credits(uid, 1); end if;
  elsif ptype = 'plan' then
    days := coalesce((plan_days->>(p.data->>'planId'))::int, 7);
    if uid is not null then
      perform public.add_credits(uid, 1);
      update public.profiles
         set data = data || jsonb_build_object(
           'currentPlanId', p.data->>'planId',
           'planExtraImages', coalesce((p.data->>'extraImages')::int, 0),
           'planExtraVideoSeconds', coalesce((p.data->>'extraVideoSeconds')::int, 0),
           'planTotalAmount', coalesce(p.data->'totalAmount', p.data->'amount'),
           'planActivatedAt', public.now_iso(),
           'planExpiresAt', to_char((now() + make_interval(days => days)) at time zone 'utc',
                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       where id = uid;
    end if;
  else
    if uid is not null then
      perform public.add_credits(uid, coalesce((p.data->>'quantity')::int, 1));
    end if;
  end if;

  return jsonb_build_object('status', 'paid', 'already', false);
end $$;

create or replace function public.process_demo_payment(
  p_ref text, p_checkout jsonb, p_via text default 'webhook')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p public.demo_payments;
  plan text;
  days int;
  tier_days constant jsonb := '{"free":7,"standard":14,"premium":30}';
begin
  perform public.trust();
  select * into p from public.demo_payments where id = p_ref for update;

  if not found then
    insert into public.demo_payments (id, data) values (p_ref, jsonb_build_object(
      'client_reference_id', p_ref, 'plan', 'unknown', 'status', 'paid',
      'amount', p_checkout->'amount_total', 'checkout_id', p_checkout->'id',
      'createdAt', public.now_iso(), 'paidAt', public.now_iso(), 'checkoutRaw', p_checkout));
    return jsonb_build_object('status', 'paid');
  end if;
  if p.data->>'status' = 'paid' then
    return jsonb_build_object('status', 'paid', 'already', true);
  end if;

  update public.demo_payments
     set data = data || jsonb_build_object('status', 'paid', 'paidAt', public.now_iso(),
                                           'checkoutRaw', p_checkout, 'paidVia', p_via)
   where id = p_ref;

  plan := coalesce(p.data->>'plan', 'standard');
  days := coalesce((tier_days->>plan)::int, 14);
  if p.data->>'giftId' is not null then
    update public.gifts
       set data = data || jsonb_build_object(
         'paidTier', plan, 'activatedAt', public.now_iso(), 'paymentExpired', false,
         'expiresAt', to_char((now() + make_interval(days => days)) at time zone 'utc',
                              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
     where id = p.data->>'giftId';
  end if;
  return jsonb_build_object('status', 'paid', 'already', false);
end $$;

create or replace function public.expire_gifts()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.trust();
  update public.gifts
     set data = data || '{"paymentExpired": true, "paidTier": "free"}'::jsonb
   where data->>'expiresAt' is not null
     and (data->>'expiresAt')::timestamptz <= now()
     and coalesce((data->>'paymentExpired')::boolean, false) = false;
  get diagnostics n = row_count;
  return n;
end $$;

-- Only the server may run payment / credit-granting functions
revoke execute on function public.add_credits(uuid, int) from public, anon, authenticated;
revoke execute on function public.trust() from public, anon, authenticated;
revoke execute on function public.process_credit_payment(text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.process_demo_payment(text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.expire_gifts() from public, anon, authenticated;

-- ── Row Level Security ───────────────────────────────────────────

alter table public.profiles                 enable row level security;
alter table public.gifts                    enable row level security;
alter table public.gift_responses           enable row level security;
alter table public.promo_codes              enable row level security;
alter table public.promo_redemptions        enable row level security;
alter table public.credit_payments          enable row level security;
alter table public.demo_payments            enable row level security;
alter table public.processed_webhook_events enable row level security;
alter table public.app_settings             enable row level security;

-- profiles: read own, admin reads/edits all. Credits change only via functions.
create policy "profiles read own"   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles admin edit" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- gifts: anyone with the link can read; owners create/edit/delete their own
create policy "gifts public read"  on public.gifts for select using (true);
create policy "gifts owner insert" on public.gifts for insert to authenticated with check (user_id = auth.uid());
create policy "gifts owner update" on public.gifts for update using (user_id = auth.uid() or public.is_admin())
                                                       with check (user_id = auth.uid() or public.is_admin());
create policy "gifts owner delete" on public.gifts for delete using (user_id = auth.uid() or public.is_admin());

-- gift responses: recipients (not logged in) answer questions
create policy "responses read"   on public.gift_responses for select using (true);
create policy "responses insert" on public.gift_responses for insert with check (true);
create policy "responses update" on public.gift_responses for update using (true) with check (true);

-- promo codes: logged-in users can look up; admins manage
create policy "promo read"  on public.promo_codes for select to authenticated using (true);
create policy "promo admin" on public.promo_codes for all using (public.is_admin()) with check (public.is_admin());

create policy "redemptions read" on public.promo_redemptions for select using (user_id = auth.uid() or public.is_admin());

create policy "credit payments read" on public.credit_payments for select using (user_id = auth.uid() or public.is_admin());
create policy "demo payments read"   on public.demo_payments   for select using (public.is_admin());

create policy "settings admin" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());

-- ── Realtime (live credits + admin dashboard) ────────────────────
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.promo_codes;
alter publication supabase_realtime add table public.credit_payments;
alter publication supabase_realtime add table public.gifts;

-- ── Storage bucket for uploaded photos / videos ──────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)  -- 50 MB per file
on conflict (id) do nothing;

create policy "media public read" on storage.objects for select
  using (bucket_id = 'media');
-- users upload only inside their own folder:  <kind>/<their uid>/...
create policy "media owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "media owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[2] = auth.uid()::text);
