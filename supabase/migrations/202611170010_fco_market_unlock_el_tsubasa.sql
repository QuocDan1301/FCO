begin;

-- Mở giao dịch mùa EL (id 4085–4176) và TSUBASA (4177–4194) (2026-11-17, người dùng: "Mở giao dịch các cầu thủ mùa EL và TSUBASA
-- nhưng không có bán ở cộng 1"): người chơi treo bán / đặt mua với nhau như mùa khác, nhưng HỆ THỐNG KHÔNG BÁN thẻ của hai mùa này
-- ở bất kỳ cấp nào (không +1, không hàng phôi). Treo bán 3 phút chưa ai mua thì hệ thống vẫn nhận như mọi thẻ.
--   • Bỏ khoá trong fco_trade_locks (202611170005). CHÚ Ý: chạy lại 202611170005 sẽ khoá lại hai mùa này → chạy lại file này sau đó.
--   • Mùa không có hệ thống bán ghi ở fco_mkt_no_system; fco_mkt_sys_offer và fco_inv_buy kiểm tra bảng này.
-- Chạy sau 202611170005 và 202611170006. Chạy lại được.

delete from public.fco_trade_locks where label in ('EL', 'TSUBASA');

create table if not exists public.fco_mkt_no_system (
  label text primary key,
  first_id integer not null,
  last_id integer not null check (last_id >= first_id)
);
alter table public.fco_mkt_no_system enable row level security;
revoke all on public.fco_mkt_no_system from anon, authenticated;
insert into public.fco_mkt_no_system (label, first_id, last_id) values ('EL', 4085, 4176), ('TSUBASA', 4177, 4194)
  on conflict (label) do update set first_id = excluded.first_id, last_id = excluded.last_id;

create or replace function public.fco_mkt_no_system(p_player integer) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fco_mkt_no_system where p_player between first_id and last_id)
$$;
revoke all on function public.fco_mkt_no_system(integer) from public, anon, authenticated;

-- Như 202611170006, thêm: mùa trong fco_mkt_no_system thì hệ thống không bán.
create or replace function public.fco_mkt_sys_offer(p_player integer, p_level integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g integer; price bigint; m bigint := public.fco_mkt_minute(); q integer;
begin
  if public.fco_trade_locked(p_player) or public.fco_mkt_no_system(p_player) then return null; end if;
  select grp into g from public.fco_cat_players where id = p_player;
  if not found then return null; end if;
  price := public.fco_inv_price(p_player, p_level);
  if price is null or price <= 0 then return null; end if;
  if coalesce(g, 0) = 1 then
    q := public.fco_mkt_sys_qty(p_player, p_level, m);
    return jsonb_build_object('price', price, 'left', greatest(0, q - coalesce((select sold from public.fco_mkt_sys_sold where player_id = p_player and level = p_level and minute = m), 0)));
  end if;
  if p_level = 1 then return jsonb_build_object('price', price, 'left', null); end if;
  return null;
end;
$$;
revoke all on function public.fco_mkt_sys_offer(integer, integer) from public, anon, authenticated;

-- Như 202611170002 (hệ thống chỉ bán +1), thêm: mùa không có hệ thống bán → FCO_NO_SYSTEM_SALE.
create or replace function public.fco_inv_buy(p_catalog text, p_player integer, p_level integer, p_count integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  price bigint; fresh jsonb := '[]'; card jsonb; name text; ovr integer;
begin
  if p_count is null or p_count < 1 or p_count > 100 or p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if p_level <> 1 then raise exception 'FCO_SYSTEM_PLUS1' using errcode = 'P0001'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  if public.fco_mkt_no_system(p_player) then raise exception 'FCO_NO_SYSTEM_SALE' using errcode = 'P0001'; end if;
  price := public.fco_inv_price(p_player, p_level);
  if price is null then raise exception 'FCO_NO_PRICE' using errcode = 'P0001'; end if;
  if coalesce((d->>'balance')::bigint, 0) < price * p_count then raise exception 'FCO_NOT_ENOUGH_BP' using errcode = 'P0001'; end if;
  name := public.fco_inv_name(p_player); ovr := public.fco_inv_ovr(p_player, p_level);
  for i in 1 .. p_count loop
    card := public.fco_inv_new_card(p_player, p_level, true);
    fresh := jsonb_build_array(card) || fresh;
    d := public.fco_inv_history(d, 'market', 'Mua · ' || name || ' +' || p_level, 'OVR ' || ovr || ' · Giá ' || public.fco_inv_money(price) || ' BP · −' || public.fco_inv_money(price) || ' BP');
  end loop;
  d := d || jsonb_build_object('cards', fresh || coalesce(d->'cards', '[]'), 'balance', coalesce((d->>'balance')::bigint, 0) - price * p_count);
  return jsonb_build_object('cards', fresh, 'price', price, 'save', public.fco_inv_store(uid, d));
end;
$$;

commit;