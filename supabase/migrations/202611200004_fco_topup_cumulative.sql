begin;

-- Khuyến mãi nạp tính theo TỔNG TIỀN NẠP CỘNG DỒN (người dùng 2026-11-20: "mốc tích lũy đi chung với mốc khuyến mãi"; chốt: KM theo tổng nạp
-- cộng dồn, mỗi mốc KM 1 lần, đơn nạp không còn cộng KM riêng).
--   • Tổng đã nạp (VND) = mọi FC admin cộng lý do 'admin' (nạp theo bill + FC gốc của đơn nạp) quy ra tiền theo tỉ giá lúc nạp (fco_topup_vnd),
--     giống cột Đã nạp (VND) của admin. Mốc = bảng fco_topup_tiers (min_vnd, bonus_fc) — chính các mốc khuyến mãi admin đang sửa.
--   • Qua mốc → người chơi bấm Nhận trên thanh ở trang nạp: cộng bonus_fc của mốc (lý do 'topup_bonus', không tính doanh thu / Top Đặc Huấn),
--     mỗi mốc mỗi người 1 lần (sổ fco_topup_tier_claims).
--   • Đơn nạp tạo mới không còn KM riêng (bonus_fc = 0); đơn đang chờ cũng bỏ KM. Ai đã được KM theo đơn trước đây thì mốc đó tính là đã nhận.
--   • Bỏ "Mốc nạp tích luỹ" kèm quà gói (202611200003) vì đã gộp vào đây.
-- Chạy sau 202611200002_fco_topup_orders.sql (có hay chưa chạy 202611200003 đều được). Chạy lại được.

create table if not exists public.fco_topup_tier_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  min_vnd bigint not null,
  bonus_fc bigint not null default 0,
  claimed_at timestamptz not null default now(),
  primary key (user_id, min_vnd)
);
alter table public.fco_topup_tier_claims enable row level security;
revoke all on public.fco_topup_tier_claims from public, anon, authenticated;

-- Ai đã nhận KM theo đơn ở mốc nào thì mốc đó coi như đã nhận (không nhận KM lần hai).
insert into public.fco_topup_tier_claims (user_id, min_vnd, bonus_fc, claimed_at)
select o.user_id, o.tier_vnd, max(o.bonus_fc), min(o.decided_at) from public.fco_topup_orders o
where o.status = 'approved' and o.bonus_fc > 0 and o.tier_vnd is not null
group by o.user_id, o.tier_vnd
on conflict do nothing;
-- Đơn chưa duyệt: bỏ KM theo đơn (KM giờ nhận trên thanh tích luỹ).
update public.fco_topup_orders set bonus_fc = 0, tier_vnd = null where status in ('pending', 'paid') and bonus_fc > 0;

create or replace function public.fco_topup_total_vnd(p_uid uuid) returns bigint language sql stable security definer set search_path = '' as $$
  select greatest(coalesce(sum(public.fco_topup_vnd(l.delta, l.created_at)), 0), 0)::bigint from public.fco_fc_ledger l where l.user_id = p_uid and l.reason = 'admin'
$$;

-- Tạo đơn: chỉ FC gốc, không KM riêng.
create or replace function public.fco_topup_order_create(p_vnd bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); rate integer := public.fco_topup_rate_now(); o public.fco_topup_orders;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; new_code text; i integer;
begin
  if p_vnd is null or p_vnd < 5000 or p_vnd > 50000000 or p_vnd % 1000 <> 0 then raise exception 'FCO_TOPUP_BAD_AMOUNT' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('fco_topup_order:' || uid::text));
  if (select count(*) from public.fco_topup_orders where user_id = uid and status in ('pending', 'paid')) >= 5 then
    raise exception 'FCO_TOPUP_TOO_MANY' using errcode = 'P0001';
  end if;
  for attempt in 1..10 loop
    new_code := 'FCO';
    for i in 1..6 loop new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1); end loop;
    exit when not exists (select 1 from public.fco_topup_orders where code = new_code);
  end loop;
  insert into public.fco_topup_orders (code, user_id, vnd, base_fc, bonus_fc, tier_vnd)
  values (new_code, uid, p_vnd, floor(p_vnd * 1000.0 / rate)::bigint, 0, null)
  returning * into o;
  return public.fco_topup_order_json(o);
end;
$$;

-- Thanh KM tích luỹ của người chơi: tổng đã nạp (VND) + từng mốc (số tiền, FC KM, đã nhận chưa).
create or replace function public.fco_topup_tiers_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return jsonb_build_object('totalVnd', public.fco_topup_total_vnd(uid),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('vnd', t.min_vnd, 'bonus', t.bonus_fc,
        'claimed', exists (select 1 from public.fco_topup_tier_claims c where c.user_id = uid and c.min_vnd = t.min_vnd)) order by t.min_vnd)
      from public.fco_topup_tiers t), '[]'::jsonb));
end;
$$;

create or replace function public.fco_topup_tier_claim(p_vnd bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); t public.fco_topup_tiers;
begin
  select * into t from public.fco_topup_tiers x where x.min_vnd = p_vnd;
  if not found then raise exception 'FCO_MILESTONE_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  if public.fco_topup_total_vnd(uid) < t.min_vnd then raise exception 'FCO_MILESTONE_NOT_REACHED' using errcode = 'P0001'; end if;
  insert into public.fco_topup_tier_claims (user_id, min_vnd, bonus_fc) values (uid, t.min_vnd, t.bonus_fc) on conflict do nothing;
  if not found then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  if t.bonus_fc > 0 then
    perform public.fco_apply_fc(uid, t.bonus_fc, 'topup_bonus', jsonb_build_object('note', 'Khuyến mãi mốc nạp ' || public.fco_inv_money(t.min_vnd) || 'đ'));
  end if;
  return jsonb_build_object('vnd', t.min_vnd, 'bonus', t.bonus_fc, 'wallet', public.fco_wallet_json(uid));
end;
$$;

-- Bỏ phần "Mốc nạp tích luỹ" kèm quà gói (202611200003) nếu đã chạy.
drop function if exists public.fco_topup_milestones_me();
drop function if exists public.fco_topup_milestone_claim(bigint);
drop function if exists public.fco_admin_topup_milestones_save(jsonb);
drop function if exists public.fco_admin_topup_milestones();
drop function if exists public.fco_topup_total(uuid);
drop table if exists public.fco_topup_milestone_claims;
drop table if exists public.fco_topup_milestones;

revoke all on function public.fco_topup_total_vnd(uuid) from public, anon, authenticated;
revoke all on function public.fco_topup_tiers_me(), public.fco_topup_tier_claim(bigint), public.fco_topup_order_create(bigint) from public, anon;
grant execute on function public.fco_topup_tiers_me(), public.fco_topup_tier_claim(bigint), public.fco_topup_order_create(bigint) to authenticated;

commit;
