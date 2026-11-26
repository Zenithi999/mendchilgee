-- ═══════════════════════════════════════════════════════════════
-- Letter trees (Захидлын мод)
--
-- An owner buys a tree with a letter capacity (10 → 15,000₮ … 30 → 35,000₮),
-- shares its link / QR code, and friends (no login needed) each write one
-- letter that hangs on the tree as an ornament they pick.
-- Letters stay sealed until the tree's unlock_at (1 January, 00:00
-- Ulaanbaatar time) and only the owner can read them.
--
-- Everything goes through the functions below; nobody writes the tables
-- directly, so "paid" and the unlock time can't be forged.
-- Run after 20261125000000_init.sql (SQL Editor → paste → Run).
-- ═══════════════════════════════════════════════════════════════

-- Next 1 January 00:00 in Ulaanbaatar.
create or replace function public.next_new_year()
returns timestamptz language sql stable as $$
  select make_timestamptz(
    extract(year from now() at time zone 'Asia/Ulaanbaatar')::int + 1, 1, 1, 0, 0, 0,
    'Asia/Ulaanbaatar')
$$;

create table if not exists public.letter_trees (
  id          text primary key default public.gen_doc_id(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Шинэ оны захидлын мод',
  owner_name  text not null default '',
  capacity    int  not null check (capacity in (10, 15, 20, 25, 30)),
  paid        boolean not null default false,
  paid_at     timestamptz,
  unlock_at   timestamptz not null default public.next_new_year(),
  created_at  timestamptz not null default now()
);
create index if not exists letter_trees_user_idx on public.letter_trees (user_id);

create table if not exists public.tree_letters (
  id          uuid primary key default gen_random_uuid(),
  tree_id     text not null references public.letter_trees (id) on delete cascade,
  slot        int  not null,
  decor       text not null,
  author      text not null,
  message     text not null,
  created_at  timestamptz not null default now(),
  unique (tree_id, slot)
);

alter table public.letter_trees enable row level security;
alter table public.tree_letters enable row level security;

-- Owners may list their own trees; letters are only readable via get_letter_tree.
drop policy if exists "trees read own" on public.letter_trees;
create policy "trees read own" on public.letter_trees for select
  using (user_id = auth.uid() or public.is_admin());

revoke insert, update, delete on public.letter_trees from anon, authenticated;
revoke all on public.tree_letters from anon, authenticated;

-- Allowed ornaments (keep in sync with src/components/LetterTree/decors.js)
create or replace function public.tree_decor_ok(p text)
returns boolean language sql immutable as $$
  select p = any (array[
    'ball-red', 'ball-blue', 'ball-green', 'ball-gold', 'bulb-red', 'bulb-blue',
    'candy', 'star', 'bell', 'snowflake', 'gift', 'sock', 'heart', 'snowman',
    'cookie', 'moon'])
$$;

-- ── Create (unpaid) ──────────────────────────────────────────────
create or replace function public.create_letter_tree(
  p_title text, p_owner_name text, p_capacity int)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id text;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'login_required';
  end if;
  if p_capacity not in (10, 15, 20, 25, 30) then raise exception 'invalid_capacity'; end if;
  insert into public.letter_trees (user_id, title, owner_name, capacity)
  values (uid,
          coalesce(nullif(left(btrim(p_title), 60), ''), 'Шинэ оны захидлын мод'),
          left(btrim(coalesce(p_owner_name, '')), 40),
          p_capacity)
  returning id into new_id;
  return new_id;
end $$;

-- Owner may rename / change size until it's paid.
create or replace function public.update_letter_tree(
  p_tree_id text, p_title text, p_owner_name text, p_capacity int default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.letter_trees;
begin
  select * into t from public.letter_trees where id = p_tree_id for update;
  if not found or t.user_id <> auth.uid() then raise exception 'not_found'; end if;
  if p_capacity is not null and p_capacity <> t.capacity then
    if t.paid then raise exception 'already_paid'; end if;
    if p_capacity not in (10, 15, 20, 25, 30) then raise exception 'invalid_capacity'; end if;
  end if;
  update public.letter_trees
     set title      = coalesce(nullif(left(btrim(p_title), 60), ''), title),
         owner_name = left(btrim(coalesce(p_owner_name, owner_name)), 40),
         capacity   = coalesce(p_capacity, capacity)
   where id = p_tree_id;
end $$;

-- Owner may delete an unpaid tree.
create or replace function public.delete_letter_tree(p_tree_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.letter_trees
   where id = p_tree_id and user_id = auth.uid() and not paid;
  if not found then raise exception 'not_found'; end if;
end $$;

-- ── Public view of a tree ────────────────────────────────────────
-- Everyone sees the ornaments; only the owner, after unlock, gets the letters.
create or replace function public.get_letter_tree(p_tree_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t public.letter_trees;
  is_owner boolean;
  unlocked boolean;
begin
  select * into t from public.letter_trees where id = p_tree_id;
  if not found then return null; end if;
  is_owner := t.user_id = auth.uid();
  unlocked := now() >= t.unlock_at;

  return jsonb_build_object(
    'id', t.id, 'title', t.title, 'ownerName', t.owner_name,
    'capacity', t.capacity, 'paid', t.paid, 'unlockAt', t.unlock_at,
    'serverNow', now(), 'isOwner', is_owner, 'unlocked', unlocked,
    'ornaments', coalesce((
      select jsonb_agg(
               case when is_owner and unlocked then
                 jsonb_build_object('slot', l.slot, 'decor', l.decor, 'author', l.author,
                                    'message', l.message, 'createdAt', l.created_at)
               else jsonb_build_object('slot', l.slot, 'decor', l.decor) end
               order by l.slot)
        from public.tree_letters l where l.tree_id = t.id), '[]'::jsonb)
  );
end $$;

-- ── Write a letter (no login needed) ─────────────────────────────
create or replace function public.add_tree_letter(
  p_tree_id text, p_decor text, p_author text, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.letter_trees;
  used int;
  free_slot int;
  a text := left(btrim(coalesce(p_author, '')), 40);
  m text := left(btrim(coalesce(p_message, '')), 1000);
begin
  select * into t from public.letter_trees where id = p_tree_id for update;
  if not found then raise exception 'not_found'; end if;
  if not t.paid then raise exception 'not_paid'; end if;
  if now() >= t.unlock_at then raise exception 'closed'; end if;
  if not public.tree_decor_ok(p_decor) then raise exception 'invalid_decor'; end if;
  if a = '' or m = '' then raise exception 'empty'; end if;

  select count(*) into used from public.tree_letters where tree_id = t.id;
  if used >= t.capacity then raise exception 'full'; end if;

  -- lowest free slot (the app maps slots to spots spread over the tree)
  select s into free_slot from generate_series(0, t.capacity - 1) s
   where not exists (select 1 from public.tree_letters l where l.tree_id = t.id and l.slot = s)
   order by s limit 1;

  insert into public.tree_letters (tree_id, slot, decor, author, message)
  values (t.id, free_slot, p_decor, a, m);

  return jsonb_build_object('slot', free_slot, 'count', used + 1, 'capacity', t.capacity);
end $$;

-- ── Owner's list (with letter counts) ────────────────────────────
create or replace function public.my_letter_trees()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'title', t.title, 'ownerName', t.owner_name,
           'capacity', t.capacity, 'paid', t.paid, 'unlockAt', t.unlock_at,
           'createdAt', t.created_at,
           'count', (select count(*) from public.tree_letters l where l.tree_id = t.id))
         order by t.created_at desc), '[]'::jsonb)
    from public.letter_trees t
   where t.user_id = auth.uid()
$$;

revoke execute on function public.my_letter_trees() from public, anon;
grant execute on function public.my_letter_trees() to authenticated;
grant execute on function public.get_letter_tree(text) to anon, authenticated;
grant execute on function public.add_tree_letter(text, text, text, text) to anon, authenticated;
revoke execute on function public.create_letter_tree(text, text, int) from public, anon;
revoke execute on function public.update_letter_tree(text, text, text, int) from public, anon;
revoke execute on function public.delete_letter_tree(text) from public, anon;
grant execute on function public.create_letter_tree(text, text, int) to authenticated;
grant execute on function public.update_letter_tree(text, text, text, int) to authenticated;
grant execute on function public.delete_letter_tree(text) to authenticated;

-- ── Payments: add purchaseType "tree" ────────────────────────────
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
  elsif ptype = 'tree' then
    -- the size paid for is the one recorded at checkout time
    update public.letter_trees
       set paid = true, paid_at = now(),
           capacity = coalesce((p.data->>'capacity')::int, capacity)
     where id = p.data->>'treeId';
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

revoke execute on function public.process_credit_payment(text, jsonb, text) from public, anon, authenticated;

