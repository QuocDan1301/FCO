begin;

-- Mốc nạp tích luỹ nhận QUÀ (gói cầu thủ, BP hoặc STP), chạy SONG SONG với mốc FC khuyến mãi (người dùng 2026-11-25: "Thêm cơ chế mốc nạp
-- tích lũy nhận gói cầu thủ, bp hoặc stp, có thể chạy song song với mốc nạp tích lũy fc").
--   • Dùng chung sự kiện nạp tích luỹ (fco_topup_events, 202611200005) và cùng cách tính tổng tiền nạp trong đợt (fco_topup_event_vnd): ngoài
--     sự kiện không có quà mốc; mỗi đợt tính lại từ đầu; hết giờ là tắt hẳn (fco_topup_claim_days() = 0, 202611200008).
--   • fco_topup_gift_tiers: mốc (VND) → 1–10 phần quà {pack, count} | {bp} | {stp}. Admin sửa ở Quản lý nạp → Mốc quà tích luỹ. Mốc quà độc lập
--     với mốc FC (có thể trùng hoặc khác số tiền).
--   • Tự trao như mốc FC: trigger sau khi ghi sổ FC lý do 'admin' (duyệt đơn / nạp bill) gọi thêm fco_topup_gift_award. Gói + BP vào hàng chờ
--     quà fco_admin_gifts (game tự nhận vào kho như quà admin); STP cộng thẳng vào ví (fco_apply_stp, lý do 'topup_milestone').
--   • Sổ nhận fco_topup_gift_claims (người, đợt, mốc) — mỗi mốc mỗi đợt một lần, ghi kèm phần quà đã trao. Nút Nhận ở trang nạp để dự phòng.
--   • Chạy file KHÔNG trao bù gì (chưa có mốc quà nào cho tới khi admin đặt). Đặt mốc giữa đợt: người đã vượt mốc nhận ở lần nạp kế tiếp hoặc
--     bấm Nhận ở trang nạp.
-- Chạy SAU 202611250003_fco_naruto_no_system_sale.sql (và sau 202611220012_fco_topup_no_double_bonus.sql). Chạy lại được.

create table if not exists public.fco_topup_gift_tiers (
  min_vnd bigint primary key check (min_vnd >= 1000 and min_vnd <= 1000000000 and min_vnd % 1000 = 0),
  rewards jsonb not null check (jsonb_typeof(rewards) = 'array' and jsonb_array_length(rewards) between 1 and 10),
  updated_at timestamptz not null default now()
);
alter table public.fco_topup_gift_tiers enable row level security;
revoke all on public.fco_topup_gift_tiers from public, anon, authenticated;

create table if not exists public.fco_topup_gift_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id bigint not null,
  min_vnd bigint not null,
  rewards jsonb not null,
  auto boolean not null default true,
  claimed_at timestamptz not null default now(),
  primary key (user_id, event_id, min_vnd)
);
alter table public.fco_topup_gift_claims enable row level security;
revoke all on public.fco_topup_gift_claims from public, anon, authenticated;

-- Một phần quà hợp lệ: {pack, count 1–1000} | {bp 1–10^15} | {stp 1–100.000}, số nguyên, không khoá thừa.
create or replace function public.fco_topup_gift_reward_ok(r jsonb) returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(r) = 'object' and case
    when r ? 'pack' then (select count(*) from jsonb_object_keys(r)) = 2 and jsonb_typeof(r->'pack') = 'string' and (r->>'pack') ~ '^[A-Za-z0-9._-]{1,64}$'
      and jsonb_typeof(r->'count') = 'number' and (r->>'count')::numeric between 1 and 1000 and (r->>'count')::numeric = trunc((r->>'count')::numeric)
    when r ? 'bp' then (select count(*) from jsonb_object_keys(r)) = 1 and jsonb_typeof(r->'bp') = 'number'
      and (r->>'bp')::numeric between 1 and 1000000000000000 and (r->>'bp')::numeric = trunc((r->>'bp')::numeric)
    when r ? 'stp' then (select count(*) from jsonb_object_keys(r)) = 1 and jsonb_typeof(r->'stp') = 'number'
      and (r->>'stp')::numeric between 1 and 100000 and (r->>'stp')::numeric = trunc((r->>'stp')::numeric)
    else false end
$$;

-- Trao quà một mốc (gọi khi đã khoá ví). Đã nhận mốc này trong đợt thì không làm gì, trả false.
create or replace function public.fco_topup_gift_grant(p_uid uuid, p_event public.fco_topup_events, p_vnd bigint, p_rewards jsonb, p_auto boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare queued jsonb; stp bigint;
begin
  insert into public.fco_topup_gift_claims (user_id, event_id, min_vnd, rewards, auto) values (p_uid, p_event.id, p_vnd, p_rewards, p_auto)
    on conflict do nothing;
  if not found then return false; end if;
  -- Gói + BP vào hàng chờ quà (game tự nhận vào kho); STP cộng thẳng vào ví.
  select jsonb_agg(x) filter (where not x ? 'stp'), coalesce(sum((x->>'stp')::bigint) filter (where x ? 'stp'), 0)
    into queued, stp from jsonb_array_elements(p_rewards) x;
  if queued is not null then
    insert into public.fco_admin_gifts (user_id, rewards, note)
      values (p_uid, queued, p_event.title || ' · quà mốc nạp ' || public.fco_inv_money(p_vnd) || 'đ');
  end if;
  if stp > 0 then
    perform public.fco_apply_stp(p_uid, stp, 'topup_milestone', jsonb_build_object('event', p_event.id, 'vnd', p_vnd, 'note', p_event.title));
  end if;
  return true;
end;
$$;

-- Tự trao mọi mốc quà vừa đạt trong đợt đang chạy (gọi từ trigger nạp, ví đã khoá trong cùng giao dịch).
create or replace function public.fco_topup_gift_award(p_uid uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.fco_topup_events := public.fco_topup_event_now(); total bigint; t public.fco_topup_gift_tiers; n integer := 0;
begin
  if e.id is null or p_uid is null then return 0; end if;
  total := public.fco_topup_event_vnd(p_uid, e);
  for t in select * from public.fco_topup_gift_tiers x where x.min_vnd <= total order by x.min_vnd loop
    if public.fco_topup_gift_grant(p_uid, e, t.min_vnd, t.rewards, true) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- Trigger nạp (202611200006): sau mốc FC, trao thêm mốc quà.
create or replace function public.fco_topup_ledger_award() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_topup_auto_award(new.user_id);
  perform public.fco_topup_gift_award(new.user_id);
  return null;
end;
$$;

-- Trang nạp: thanh mốc quà của tôi.
create or replace function public.fco_topup_gifts_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); e public.fco_topup_events := public.fco_topup_event_now();
begin
  if e.id is null then return jsonb_build_object('event', null, 'totalVnd', 0, 'tiers', '[]'::jsonb); end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'title', e.title, 'startsAt', (extract(epoch from e.starts_at) * 1000)::bigint,
      'endsAt', (extract(epoch from e.ends_at) * 1000)::bigint,
      'claimUntil', (extract(epoch from e.ends_at + make_interval(days => public.fco_topup_claim_days())) * 1000)::bigint),
    'totalVnd', public.fco_topup_event_vnd(uid, e),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('vnd', t.min_vnd,
        'rewards', coalesce(c.rewards, t.rewards), 'claimed', c.user_id is not null) order by t.min_vnd)
      from public.fco_topup_gift_tiers t
      left join public.fco_topup_gift_claims c on c.user_id = uid and c.event_id = e.id and c.min_vnd = t.min_vnd), '[]'::jsonb));
end;
$$;

-- Nhận tay (dự phòng): chỉ khi sự kiện đang chạy và đã đạt mốc.
create or replace function public.fco_topup_gift_claim(p_vnd bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); e public.fco_topup_events := public.fco_topup_event_now(); t public.fco_topup_gift_tiers;
begin
  if e.id is null or now() >= e.ends_at then raise exception 'FCO_TOPUP_NO_EVENT' using errcode = 'P0001'; end if;
  select * into t from public.fco_topup_gift_tiers x where x.min_vnd = p_vnd;
  if not found then raise exception 'FCO_MILESTONE_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  if public.fco_topup_event_vnd(uid, e) < t.min_vnd then raise exception 'FCO_MILESTONE_NOT_REACHED' using errcode = 'P0001'; end if;
  if not public.fco_topup_gift_grant(uid, e, t.min_vnd, t.rewards, false) then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  return jsonb_build_object('vnd', t.min_vnd, 'rewards', t.rewards, 'wallet', public.fco_wallet_json(uid));
end;
$$;

-- ===== Admin =====
create or replace function public.fco_admin_topup_gift_tiers() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.fco_topup_events;
begin
  perform public.fco_require_admin();
  select * into e from public.fco_topup_events order by starts_at desc limit 1;
  return jsonb_build_object(
    'event', case when e.id is null then null else jsonb_build_object('id', e.id, 'title', e.title) end,
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('vnd', t.min_vnd, 'rewards', t.rewards,
        'claims', (select count(*) from public.fco_topup_gift_claims c where c.event_id = e.id and c.min_vnd = t.min_vnd)) order by t.min_vnd)
      from public.fco_topup_gift_tiers t), '[]'::jsonb));
end;
$$;

-- Lưu toàn bộ danh sách mốc quà: p_tiers = [{vnd, rewards: [...]}, ...] (tối đa 20 mốc). Gói phải có trong danh mục máy chủ (Đồng bộ dữ liệu).
create or replace function public.fco_admin_topup_gift_tiers_save(p_tiers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x jsonb; r jsonb; v numeric;
begin
  perform public.fco_require_admin();
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) > 20 then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
  for x in select * from jsonb_array_elements(p_tiers) loop
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x->'vnd') <> 'number' or jsonb_typeof(x->'rewards') <> 'array'
       or jsonb_array_length(x->'rewards') not between 1 and 10 then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
    v := (x->>'vnd')::numeric;
    if v < 1000 or v > 1000000000 or v % 1000 <> 0 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
    for r in select * from jsonb_array_elements(x->'rewards') loop
      if not public.fco_topup_gift_reward_ok(r) then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
      if r ? 'pack' and exists (select 1 from public.fco_cat_packs) and not exists (select 1 from public.fco_cat_packs p where p.id = r->>'pack') then
        raise exception 'FCO_PACK_NOT_FOUND' using errcode = 'P0001', detail = r->>'pack';
      end if;
    end loop;
  end loop;
  if (select count(distinct (y->>'vnd')::numeric) from jsonb_array_elements(p_tiers) y) <> jsonb_array_length(p_tiers) then
    raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023', detail = 'trùng mốc';
  end if;
  delete from public.fco_topup_gift_tiers;
  insert into public.fco_topup_gift_tiers (min_vnd, rewards)
    select (y->>'vnd')::bigint, y->'rewards' from jsonb_array_elements(p_tiers) y;
  return public.fco_admin_topup_gift_tiers();
end;
$$;

revoke all on function public.fco_topup_gift_reward_ok(jsonb), public.fco_topup_gift_grant(uuid, public.fco_topup_events, bigint, jsonb, boolean),
  public.fco_topup_gift_award(uuid), public.fco_topup_ledger_award() from public, anon, authenticated;
revoke all on function public.fco_topup_gifts_me(), public.fco_topup_gift_claim(bigint), public.fco_admin_topup_gift_tiers(),
  public.fco_admin_topup_gift_tiers_save(jsonb) from public, anon;
grant execute on function public.fco_topup_gifts_me(), public.fco_topup_gift_claim(bigint), public.fco_admin_topup_gift_tiers(),
  public.fco_admin_topup_gift_tiers_save(jsonb) to authenticated;

commit;
