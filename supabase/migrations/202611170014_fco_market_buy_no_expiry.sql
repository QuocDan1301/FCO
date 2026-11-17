begin;

-- Lệnh đặt mua không hết hạn (2026-11-17, người dùng: "đặt mua không hết hạn"): lệnh mua treo tới khi khớp hoặc người chơi tự huỷ
-- (huỷ thì trả lại BP như cũ). Bỏ hạn lệnh mua khỏi fco_mkt_rules; lệnh bán cho người chơi vẫn hết hạn sau 24 giờ (thẻ về kho).
-- Chạy sau 202611170013. Chạy lại được.

create or replace function public.fco_mkt_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('sellTtlHours', 24, 'maxOpenSell', 100, 'maxOpenBuy', 50)
$$;
revoke all on function public.fco_mkt_rules() from public, anon, authenticated;

-- Như 202611170012, bỏ phần lệnh mua hết hạn.
create or replace function public.fco_mkt_settle() returns void language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_mkt_orders; mr jsonb := public.fco_mkt_rules();
begin
  for r in select * from public.fco_mkt_orders where status = 'open' and side = 'sell'
      and created_at < now() - make_interval(hours => (mr->>'sellTtlHours')::integer) order by created_at limit 300 for update skip locked loop
    update public.fco_mkt_orders set status = 'expired', closed_at = now() where id = r.id;
    insert into public.fco_mkt_deliveries (user_id, card, bp, kind, order_id, title, detail) values (r.user_id, r.card, 0, 'refund', r.id,
      'Hết hạn treo bán · ' || public.fco_mkt_label(r.player_id, r.level), 'Không ai mua sau ' || (mr->>'sellTtlHours') || ' giờ · Thẻ đã về kho');
  end loop;
end;
$$;
revoke all on function public.fco_mkt_settle() from public, anon, authenticated;

-- Như 202611170011, đổi dòng lịch sử đặt mua: không hết hạn.
create or replace function public.fco_mkt_buy(p_catalog text, p_player integer, p_level integer, p_price bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb; mr jsonb := public.fco_mkt_rules();
  s public.fco_mkt_orders; o public.fco_mkt_orders; applied jsonb; label text; offer jsonb; sys bigint; m bigint; q integer; taken integer; oid bigint;
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
      d := public.fco_inv_history(d, 'market', 'Mua · ' || label, 'Hệ thống bán · Giá ' || public.fco_inv_money(sys) || ' BP · −' || public.fco_inv_money(sys) || ' BP · Thẻ chờ nhận ở TTCN');
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
    perform public.fco_mkt_fill(s, o, s.price);
    d := public.fco_inv_history(d, 'market', 'Mua · ' || label, 'Khớp lệnh bán · Giá ' || public.fco_inv_money(s.price) || ' BP · Thẻ chờ nhận ở TTCN');
  else
    d := public.fco_inv_history(d, 'market', 'Đặt mua · ' || label, 'Giá ' || public.fco_inv_money(p_price) || ' BP (đang giữ) · Không hết hạn, huỷ ở TTCN thì trả lại BP');
  end if;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('matched', s.id is not null, 'system', false, 'price', coalesce(s.price, p_price), 'order', o.id, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

commit;
