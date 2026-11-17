begin;

-- Vá lỗ hổng chợ (2026-11-17, soát bảo mật): lệnh đặt mua không hết hạn (202611170014) nên có thể nằm ở giá cũ. Giá tham chiếu giảm
-- (mỗi 5 giờ ±10%, hoặc admin đổi giá) thì người bán khớp vào lệnh đó ở giá cũ — vượt xa khung ±10% hiện tại (thử trên bản sao: giá
-- tham chiếu 379.688, khung tối đa 417.656, khớp 835.312) → chuyển BP giữa các tài khoản clone vượt khung.
-- Nay giá khớp luôn được kẹp vào khung ±sellBand% của giá tham chiếu LÚC KHỚP (fco_mkt_clamp):
--   • lệnh mua cũ giá cao hơn khung → khớp ở mức trần, người mua được trả lại phần dư;
--   • lệnh bán cũ giá thấp hơn khung → khớp ở mức sàn (người bán nhận nhiều hơn giá treo);
--   • lệnh bán cũ giá cao hơn khung → không bị mua (Mua hàng loạt bỏ qua; Đặt mua vốn không vượt khung).
-- Chạy sau 202611170016. Chạy lại được.

create or replace function public.fco_mkt_clamp(p_player integer, p_level integer, p_price bigint) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare ref bigint := public.fco_inv_price(p_player, p_level); band integer := coalesce((public.fco_inv_rules()->>'sellBand')::integer, 10);
begin
  if ref is null or ref <= 0 then return p_price; end if;
  return least(greatest(p_price, ceil(ref::double precision * (100 - band) / 100)::bigint), floor(ref::double precision * (100 + band) / 100)::bigint);
end;
$$;
revoke all on function public.fco_mkt_clamp(integer, integer, bigint) from public, anon, authenticated;

-- Như 202611170011, giá khớp kẹp vào khung hiện tại.
create or replace function public.fco_mkt_fill(p_sell public.fco_mkt_orders, p_buy public.fco_mkt_orders, p_at bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare at bigint := public.fco_mkt_clamp(p_sell.player_id, p_sell.level, p_at); fee bigint; label text := public.fco_mkt_label(p_sell.player_id, p_sell.level);
begin
  -- Giá khớp luôn trong khung ±sellBand% của giá tham chiếu lúc khớp (lệnh cũ không vượt khung khi giá đã đổi).
  if at > p_buy.price then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
  fee := floor(at * coalesce(p_sell.tax, 0) / 100)::bigint;
  update public.fco_mkt_orders set status = 'filled', closed_at = now(), fill_price = at, counterparty = p_buy.user_id where id = p_sell.id;
  update public.fco_mkt_orders set status = 'filled', closed_at = now(), fill_price = at, counterparty = p_sell.user_id where id = p_buy.id;
  insert into public.fco_mkt_deliveries (user_id, card, bp, kind, order_id, title, detail) values
    (p_buy.user_id, (p_sell.card - 'received') || jsonb_build_object('received', public.fco_now_ms(), 'fromMarket', true), 0, 'buy', p_buy.id,
      'Nhận thẻ · ' || label, 'Khớp lệnh mua · OVR ' || public.fco_inv_ovr(p_sell.player_id, p_sell.level) || ' · Giá ' || public.fco_inv_money(at) || ' BP'),
    (p_sell.user_id, null, at - fee, 'sell', p_sell.id,
      'Nhận BP · ' || label, 'Khớp lệnh bán · Giá ' || public.fco_inv_money(at) || ' BP · Phí ' || public.fco_inv_num(coalesce(p_sell.tax, 0)) || '%: '
        || public.fco_inv_money(fee) || ' BP · +' || public.fco_inv_money(at - fee) || ' BP');
  if p_buy.price > at then
    insert into public.fco_mkt_deliveries (user_id, bp, kind, order_id, title, detail) values (p_buy.user_id, p_buy.price - at, 'refund', p_buy.id,
      'Trả BP giữ dư · ' || label, 'Khớp giá ' || public.fco_inv_money(at) || ' BP thấp hơn giá đặt ' || public.fco_inv_money(p_buy.price) || ' BP · +' || public.fco_inv_money(p_buy.price - at) || ' BP');
  end if;
end;
$$;
revoke all on function public.fco_mkt_fill(public.fco_mkt_orders, public.fco_mkt_orders, bigint) from public, anon, authenticated;

-- Như 202611170015, giá khớp với lệnh bán = giá đã kẹp.
create or replace function public.fco_mkt_buy(p_catalog text, p_player integer, p_level integer, p_price bigint, p_direct boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb; mr jsonb := public.fco_mkt_rules();
  s public.fco_mkt_orders; o public.fco_mkt_orders; applied jsonb; label text; offer jsonb; sys bigint; m bigint; q integer; taken integer; oid bigint; at bigint;
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
  offer := public.fco_mkt_sys_offer(p_player, p_level);
  sys := (offer->>'price')::bigint;
  if sys is not null and p_price >= sys and (s.id is null or s.price > sys) and (offer->'left' = 'null'::jsonb or (offer->>'left')::integer > 0) then
    if offer->'left' <> 'null'::jsonb then
      m := public.fco_mkt_minute(); q := public.fco_mkt_sys_qty(p_player, p_level, m);
      insert into public.fco_mkt_sys_sold (player_id, level, minute, sold) values (p_player, p_level, m, 1)
        on conflict (player_id, level, minute) do update set sold = public.fco_mkt_sys_sold.sold + 1 where public.fco_mkt_sys_sold.sold < q
        returning sold into taken;
      if taken is null then sys := null; end if;
      delete from public.fco_mkt_sys_sold where minute < m - 10;
    end if;
    if sys is not null then
      oid := public.fco_mkt_system_sale(uid, p_player, p_level, sys);
      d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) - sys);
      d := public.fco_inv_history(d, 'market', 'Mua · ' || label, 'Hệ thống bán · Giá ' || public.fco_inv_money(sys) || ' BP · −' || public.fco_inv_money(sys) || ' BP' || case when p_direct then ' · Thẻ đã vào kho' else ' · Thẻ chờ nhận ở TTCN' end);
      if p_direct then d := public.fco_mkt_apply_orders(uid, d, array[oid]); end if;
      applied := public.fco_mkt_apply(uid, d);
      return jsonb_build_object('matched', true, 'system', true, 'price', sys, 'order', oid, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
    end if;
  end if;
  if (select count(*) from public.fco_mkt_orders where user_id = uid and side = 'buy' and status = 'open') >= (mr->>'maxOpenBuy')::integer and s.id is null then
    raise exception 'FCO_TOO_MANY_ORDERS' using errcode = 'P0001';
  end if;
  d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) - p_price);
  insert into public.fco_mkt_orders (user_id, side, player_id, level, price) values (uid, 'buy', p_player, p_level, p_price) returning * into o;
  if s.id is not null then
    at := public.fco_mkt_clamp(p_player, p_level, s.price);
    perform public.fco_mkt_fill(s, o, at);
    d := public.fco_inv_history(d, 'market', 'Mua · ' || label, 'Khớp lệnh bán · Giá ' || public.fco_inv_money(at) || ' BP' || case when p_direct then ' · Thẻ đã vào kho' else ' · Thẻ chờ nhận ở TTCN' end);
    if p_direct then d := public.fco_mkt_apply_orders(uid, d, array[o.id]); end if;
  else
    d := public.fco_inv_history(d, 'market', 'Đặt mua · ' || label, 'Giá ' || public.fco_inv_money(p_price) || ' BP (đang giữ) · Không hết hạn, huỷ ở TTCN thì trả lại BP');
  end if;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('matched', s.id is not null, 'system', false, 'price', coalesce(at, p_price), 'order', o.id, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

-- Như 202611170015, bỏ qua lệnh bán cao hơn khung, giá khớp = giá đã kẹp.
create or replace function public.fco_mkt_bulk_buy(p_catalog text, p_player integer, p_level integer, p_count integer, p_max bigint, p_direct boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb;
  s public.fco_mkt_orders; o public.fco_mkt_orders; offer jsonb; sys bigint; m bigint; q integer; taken integer;
  bought integer := 0; spent bigint := 0; bal bigint; label text; applied jsonb; ids bigint[] := '{}'; hi bigint; at bigint;
begin
  if p_count is null or p_count < 1 or p_count > 10 or p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if p_max is null or p_max < 1 then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  label := public.fco_mkt_label(p_player, p_level);
  hi := public.fco_mkt_clamp(p_player, p_level, 9000000000000000000);
  for i in 1 .. p_count loop
    bal := coalesce((d->>'balance')::bigint, 0);
    select * into s from public.fco_mkt_orders where status = 'open' and side = 'sell' and player_id = p_player and level = p_level
      and price <= least(p_max, hi) and user_id <> uid order by price, created_at limit 1 for update skip locked;
    at := case when s.id is not null then public.fco_mkt_clamp(p_player, p_level, s.price) end;
    if at is not null and at > p_max then s := null; at := null; end if;
    offer := public.fco_mkt_sys_offer(p_player, p_level);
    sys := (offer->>'price')::bigint;
    if sys is not null and (sys > p_max or (offer->'left' <> 'null'::jsonb and (offer->>'left')::integer <= 0)) then sys := null; end if;
    if sys is not null and s.id is not null and at <= sys then sys := null; end if;
    if sys is not null then
      if bal < sys then exit; end if;
      if offer->'left' <> 'null'::jsonb then
        m := public.fco_mkt_minute(); q := public.fco_mkt_sys_qty(p_player, p_level, m); taken := null;
        insert into public.fco_mkt_sys_sold (player_id, level, minute, sold) values (p_player, p_level, m, 1)
          on conflict (player_id, level, minute) do update set sold = public.fco_mkt_sys_sold.sold + 1 where public.fco_mkt_sys_sold.sold < q
          returning sold into taken;
        if taken is null then sys := null; end if;
      end if;
    end if;
    if sys is not null then
      ids := ids || public.fco_mkt_system_sale(uid, p_player, p_level, sys);
      d := d || jsonb_build_object('balance', bal - sys);
      bought := bought + 1; spent := spent + sys;
    elsif s.id is not null then
      if bal < at then exit; end if;
      d := d || jsonb_build_object('balance', bal - at);
      insert into public.fco_mkt_orders (user_id, side, player_id, level, price) values (uid, 'buy', p_player, p_level, at) returning * into o;
      perform public.fco_mkt_fill(s, o, at);
      ids := ids || o.id;
      bought := bought + 1; spent := spent + at;
    else
      exit;
    end if;
  end loop;
  if bought = 0 then raise exception 'FCO_NO_SELLER' using errcode = 'P0001'; end if;
  delete from public.fco_mkt_sys_sold where minute < public.fco_mkt_minute() - 10;
  d := public.fco_inv_history(d, 'market', 'Mua · ' || bought || ' × ' || label, 'Tổng ' || public.fco_inv_money(spent) || ' BP · −' || public.fco_inv_money(spent) || ' BP' || case when p_direct then ' · Thẻ đã vào kho' else ' · Thẻ chờ nhận ở TTCN' end);
  if p_direct then d := public.fco_mkt_apply_orders(uid, d, ids); end if;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('bought', bought, 'spent', spent, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

commit;
