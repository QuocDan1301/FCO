begin;

-- Hệ thống treo bán cả nhóm 3 từ +2 → +13 (2026-11-18, người dùng: "Các cầu thủ nhóm 3 thì cũng sẽ bán như các cầu thủ nhóm 2 nhưng ít hơn 2/3,
-- mùa TSUBASA và mùa EL không bán"). Lượng mỗi phút (cấp ≥ 2), theo nhóm giá của cầu thủ:
--   nhóm 1: (450 ± 50) × 0,68^(cấp−1) · nhóm 2: 2/3 lượng đó · nhóm 3: 2/3 của nhóm 2 = 4/9 nhóm 1 (tối thiểu 1 thẻ / phút).
-- +1 mọi nhóm vẫn không giới hạn. EL / TSUBASA không bán ở cấp nào (fco_mkt_no_system, 202611170010) — giữ nguyên.
-- Chạy sau 202611170015. Chạy lại được.

create or replace function public.fco_mkt_sys_qty(p_player integer, p_level integer, p_minute bigint) returns integer language sql stable security definer set search_path = '' as $$
  select greatest(1, floor((450 + 50 * public.fco_inv_swing(p_player, p_level, p_minute + 900000000)) * power(0.68, p_level - 1)
    * case coalesce((select grp from public.fco_cat_players where id = p_player), 0) when 2 then 2.0 / 3 when 3 then 4.0 / 9 else 1 end))::integer
$$;
revoke all on function public.fco_mkt_sys_qty(integer, integer, bigint) from public, anon, authenticated;

-- Như 202611170015, thêm nhóm 3 ở cấp ≥ 2.
create or replace function public.fco_mkt_sys_offer(p_player integer, p_level integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g integer; price bigint; m bigint := public.fco_mkt_minute(); q integer;
begin
  if public.fco_trade_locked(p_player) or public.fco_mkt_no_system(p_player) then return null; end if;
  select grp into g from public.fco_cat_players where id = p_player;
  if not found then return null; end if;
  price := public.fco_inv_price(p_player, p_level);
  if price is null or price <= 0 then return null; end if;
  if p_level = 1 then return jsonb_build_object('price', price, 'left', null); end if;
  if coalesce(g, 0) in (1, 2, 3) then
    q := public.fco_mkt_sys_qty(p_player, p_level, m);
    return jsonb_build_object('price', price, 'left', greatest(0, q - coalesce((select sold from public.fco_mkt_sys_sold where player_id = p_player and level = p_level and minute = m), 0)));
  end if;
  return null;
end;
$$;
revoke all on function public.fco_mkt_sys_offer(integer, integer) from public, anon, authenticated;

commit;