begin;

-- Hàng phôi là NHÓM GIÁ 1 (2026-11-17, người dùng sửa: "hàng phôi là nhóm 1"). 202611170004 lỡ cho hệ thống treo bán nhóm 3 — nhóm đắt nhất
-- (Pelé, Zidane, Ronaldo…). Nay: hệ thống treo bán cầu thủ NHÓM 1 ở mọi cấp, mỗi phút 100–150 thẻ +1, × 0,68 mỗi cấp (+13 ≈ 1), giá tham chiếu.
-- Nhóm 2 / 3: hệ thống chỉ bán +1, không giới hạn (như 202611170003). Chạy sau 202611170004. Chạy lại được.

create or replace function public.fco_mkt_sys_offer(p_player integer, p_level integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g integer; price bigint; m bigint := public.fco_mkt_minute(); q integer;
begin
  if public.fco_trade_locked(p_player) then return null; end if;
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

commit;
