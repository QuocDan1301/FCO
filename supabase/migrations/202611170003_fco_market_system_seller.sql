begin;

-- Hệ thống là người bán thẻ +1 KHÔNG GIỚI HẠN ngay trên chợ (2026-11-17, người dùng: "không giới hạn, hiển thị ngay trên thị trường").
-- Chạy sau 202611170002_fco_player_market.sql. Đặt mua +1 (fco_mkt_buy) với giá ≥ giá hệ thống:
--   • có lệnh bán của người chơi rẻ hơn hoặc bằng giá hệ thống → mua của người chơi (như cũ);
--   • không thì mua ngay của hệ thống đúng giá tham chiếu (giữ dư thì không trừ), không treo lệnh.
-- Game hiện giá hệ thống trong sổ lệnh +1 với số lượng ∞. Chạy lại được.

-- Như 202611170002, thêm hệ thống bán +1.
create or replace function public.fco_mkt_buy(p_catalog text, p_player integer, p_level integer, p_price bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb; mr jsonb := public.fco_mkt_rules();
  s public.fco_mkt_orders; o public.fco_mkt_orders; applied jsonb; label text; sys bigint; card jsonb;
begin
  if p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  perform public.fco_mkt_check_price(p_player, p_level, p_price, (rules->>'sellBand')::integer);
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  if coalesce((d->>'balance')::bigint, 0) < p_price then raise exception 'FCO_NOT_ENOUGH_BP' using errcode = 'P0001'; end if;
  label := public.fco_mkt_label(p_player, p_level);
  select * into s from public.fco_mkt_orders where status = 'open' and side = 'sell' and player_id = p_player and level = p_level
    and price <= p_price and user_id <> uid order by price, created_at limit 1 for update skip locked;
  -- Hệ thống bán +1 không giới hạn theo giá tham chiếu; lệnh người chơi rẻ hơn hoặc bằng thì ưu tiên người chơi.
  sys := case when p_level = 1 then public.fco_inv_price(p_player, 1) end;
  if sys is not null and sys > 0 and p_price >= sys and (s.id is null or s.price > sys) then
    card := public.fco_inv_new_card(p_player, 1, true);
    d := d || jsonb_build_object('cards', jsonb_build_array(card) || coalesce(d->'cards', '[]'), 'balance', coalesce((d->>'balance')::bigint, 0) - sys);
    d := public.fco_inv_history(d, 'market', 'Mua · ' || label, 'Hệ thống bán · OVR ' || public.fco_inv_ovr(p_player, 1) || ' · Giá ' || public.fco_inv_money(sys) || ' BP · −' || public.fco_inv_money(sys) || ' BP');
    applied := public.fco_mkt_apply(uid, d);
    return jsonb_build_object('matched', true, 'system', true, 'price', sys, 'order', null, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
  end if;
  if (select count(*) from public.fco_mkt_orders where user_id = uid and side = 'buy' and status = 'open') >= (mr->>'maxOpenBuy')::integer and s.id is null then
    raise exception 'FCO_TOO_MANY_ORDERS' using errcode = 'P0001';
  end if;
  -- Giữ BP theo giá đặt; khớp thì phần dư (p_price − giá khớp) trả lại cùng thẻ trong phần nhận.
  d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) - p_price);
  insert into public.fco_mkt_orders (user_id, side, player_id, level, price) values (uid, 'buy', p_player, p_level, p_price) returning * into o;
  if s.id is not null then
    perform public.fco_mkt_fill(s, o, s.price);
  else
    d := public.fco_inv_history(d, 'market', 'Đặt mua · ' || label, 'Giá ' || public.fco_inv_money(p_price) || ' BP (đang giữ) · Hết hạn sau ' || (mr->>'buyTtlHours') || ' giờ thì trả lại BP');
  end if;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('matched', s.id is not null, 'system', false, 'price', coalesce(s.price, p_price), 'order', o.id, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

commit;
