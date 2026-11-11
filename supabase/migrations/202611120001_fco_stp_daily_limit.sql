-- Gói Star Point: mỗi gói mua được 1 lần mỗi ngày (2026-11-12, sau 202611110016). Ngày theo giờ Việt Nam (fco_today), làm mới lúc 00:00.
-- Giới hạn tính riêng từng gói (Siêu cấp, Cao cấp, Tinh anh, Tân binh). Game đọc danh sách gói đã mua hôm nay qua fco_stp_today
-- để khoá nút Mua (src/StpShop.tsx); máy chủ vẫn tự chặn (FCO_STP_DAILY_LIMIT).
begin;

create table public.fco_stp_purchases (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  package text not null references public.fco_stp_packages(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, day, package)
);
alter table public.fco_stp_purchases enable row level security;

-- Các gói người chơi đã mua hôm nay.
create function public.fco_stp_bought(p_uid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(package order by package), '[]'::jsonb) from public.fco_stp_purchases where user_id = p_uid and day = public.fco_today()
$$;
create function public.fco_stp_today() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return jsonb_build_object('day', public.fco_today(), 'bought', public.fco_stp_bought(uid));
end;
$$;

-- Như 202611110007, thêm giới hạn mỗi gói một lần mỗi ngày; kết quả có 'bought'.
create or replace function public.fco_stp_buy(p_package text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); pkg public.fco_stp_packages; save jsonb;
  packs bigint; bp bigint; vouchers text; detail text;
begin
  select * into pkg from public.fco_stp_packages where id = p_package;
  if not found then raise exception 'FCO_STP_PACKAGE' using errcode = '22023'; end if;
  -- Khoá ví trước bản lưu (cùng thứ tự với Shop / Bi Lắc).
  perform public.fco_wallet_lock(uid);
  -- Mỗi gói một lần mỗi ngày (giờ Việt Nam).
  insert into public.fco_stp_purchases(user_id, day, package) values (uid, public.fco_today(), pkg.id) on conflict do nothing;
  if not found then raise exception 'FCO_STP_DAILY_LIMIT' using errcode = 'P0001'; end if;
  perform public.fco_apply_stp(uid, -pkg.price, 'shop', jsonb_build_object('package', pkg.id));
  select coalesce(sum((r->>'count')::bigint), 0) into packs from jsonb_array_elements(pkg.items) r where r ? 'pack';
  select coalesce(sum((r->>'bp')::bigint), 0) into bp from jsonb_array_elements(pkg.items) r where r ? 'bp';
  select string_agg((r->>'count') || ' phiếu giảm thuế ' || (r->>'voucher') || '%', ', ' order by o) into vouchers
    from jsonb_array_elements(pkg.items) with ordinality x(r, o) where r ? 'voucher';
  detail := concat_ws(', ', case when packs > 0 then packs || ' gói cầu thủ' end, vouchers, case when bp > 0 then public.fco_inv_money(bp) || ' BP' end)
    || ' · −' || public.fco_inv_money(pkg.price) || ' STP';
  save := public.fco_inv_grant(uid, pkg.items, 'gift', 'Mua ' || pkg.name, detail);
  return jsonb_build_object('wallet', public.fco_wallet_json(uid), 'save', save, 'items', pkg.items, 'bought', public.fco_stp_bought(uid));
end;
$$;

revoke all on function public.fco_stp_bought(uuid) from public, anon, authenticated;
revoke all on function public.fco_stp_today() from public, anon;
grant execute on function public.fco_stp_today() to authenticated;

commit;
