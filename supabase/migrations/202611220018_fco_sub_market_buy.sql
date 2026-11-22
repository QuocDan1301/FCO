-- Acc phụ mua được cầu thủ (2026-11-22, người dùng: "acc phụ mua được cầu thủ"; sau 202611220017_fco_sub_accounts.sql).
--   · Acc phụ mua được thẻ HỆ THỐNG BÁN ở TTCN (mua 1 thẻ / mua nhiều), giá hệ thống như mọi người.
--   · Không khớp lệnh bán của người chơi thật (BP của acc phụ không chảy sang người chơi), không đặt lệnh mua chờ.
--   · Không trừ vào số lượng hệ thống bán mỗi phút (người chơi thật không bị mất lượt mua).
--   · Bán thẻ / đặt mua vẫn chặn. Hệ thống không bán thì báo FCO_SUB_MARKET.
--   fco_mkt_buy / fco_mkt_bulk_buy: chép nguyên bản 202611170017_fco_market_band_clamp.sql, chỉ thêm nhánh acc phụ.
-- Chạy lại được.
begin;

-- Lệnh của acc phụ: chỉ cho dòng ghi nhận "hệ thống bán" (buy, filled); lệnh chờ / bán vẫn chặn.
create or replace function public.fco_sub_block_market() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.fco_is_sub(new.user_id) and not (new.side = 'buy' and new.status = 'filled') then
    raise exception 'FCO_SUB_MARKET' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.fco_sub_block_market() from public, anon, authenticated;
drop trigger if exists a_fco_sub_block on public.fco_mkt_orders;
create trigger a_fco_sub_block before insert on public.fco_mkt_orders for each row execute function public.fco_sub_block_market();

create or replace function public.fco_mkt_buy(p_catalog text, p_player integer, p_level integer, p_price bigint, p_direct boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb; mr jsonb := public.fco_mkt_rules();
  s public.fco_mkt_orders; o public.fco_mkt_orders; applied jsonb; label text; offer jsonb; sys bigint; m bigint; q integer; taken integer; oid bigint; at bigint; sub boolean;
begin
  if p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  perform public.fco_mkt_check_price(p_player, p_level, p_price, (rules->>'sellBand')::integer);
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  sub := public.fco_is_sub(uid);
  if coalesce((d->>'balance')::bigint, 0) < p_price then raise exception 'FCO_NOT_ENOUGH_BP' using errcode = 'P0001'; end if;
  label := public.fco_mkt_label(p_player, p_level);
  select * into s from public.fco_mkt_orders where status = 'open' and side = 'sell' and player_id = p_player and level = p_level
    and price <= p_price and user_id <> uid and not sub order by price, created_at limit 1 for update skip locked;
  offer := public.fco_mkt_sys_offer(p_player, p_level);
  sys := (offer->>'price')::bigint;
  if sys is not null and p_price >= sys and (s.id is null or s.price > sys) and (sub or offer->'left' = 'null'::jsonb or (offer->>'left')::integer > 0) then
    if offer->'left' <> 'null'::jsonb and not sub then
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
  -- Acc phụ: không đặt lệnh chờ, không khớp lệnh bán của người chơi.
  if sub then raise exception 'FCO_SUB_MARKET' using errcode = 'P0001'; end if;
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

create or replace function public.fco_mkt_bulk_buy(p_catalog text, p_player integer, p_level integer, p_count integer, p_max bigint, p_direct boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb;
  s public.fco_mkt_orders; o public.fco_mkt_orders; offer jsonb; sys bigint; m bigint; q integer; taken integer;
  bought integer := 0; spent bigint := 0; bal bigint; label text; applied jsonb; ids bigint[] := '{}'; hi bigint; at bigint; sub boolean;
begin
  if p_count is null or p_count < 1 or p_count > 10 or p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if p_max is null or p_max < 1 then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  sub := public.fco_is_sub(uid);
  label := public.fco_mkt_label(p_player, p_level);
  hi := public.fco_mkt_clamp(p_player, p_level, 9000000000000000000);
  for i in 1 .. p_count loop
    bal := coalesce((d->>'balance')::bigint, 0);
    select * into s from public.fco_mkt_orders where status = 'open' and side = 'sell' and player_id = p_player and level = p_level
      and price <= least(p_max, hi) and user_id <> uid and not sub order by price, created_at limit 1 for update skip locked;
    at := case when s.id is not null then public.fco_mkt_clamp(p_player, p_level, s.price) end;
    if at is not null and at > p_max then s := null; at := null; end if;
    offer := public.fco_mkt_sys_offer(p_player, p_level);
    sys := (offer->>'price')::bigint;
    if sys is not null and (sys > p_max or (not sub and offer->'left' <> 'null'::jsonb and (offer->>'left')::integer <= 0)) then sys := null; end if;
    if sys is not null and s.id is not null and at <= sys then sys := null; end if;
    if sys is not null then
      if bal < sys then exit; end if;
      if offer->'left' <> 'null'::jsonb and not sub then
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
  if bought = 0 and sub then raise exception 'FCO_SUB_MARKET' using errcode = 'P0001'; end if;
  if bought = 0 then raise exception 'FCO_NO_SELLER' using errcode = 'P0001'; end if;
  delete from public.fco_mkt_sys_sold where minute < public.fco_mkt_minute() - 10;
  d := public.fco_inv_history(d, 'market', 'Mua · ' || bought || ' × ' || label, 'Tổng ' || public.fco_inv_money(spent) || ' BP · −' || public.fco_inv_money(spent) || ' BP' || case when p_direct then ' · Thẻ đã vào kho' else ' · Thẻ chờ nhận ở TTCN' end);
  if p_direct then d := public.fco_mkt_apply_orders(uid, d, ids); end if;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('bought', bought, 'spent', spent, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

commit;
