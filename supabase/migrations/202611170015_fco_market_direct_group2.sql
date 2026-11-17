begin;

-- (1) Mua ở màn đập thẻ vào thẳng kho (2026-11-17, người dùng: "Mua cầu thủ trong giao diện đập thì vào trực tiếp kho"):
--     fco_mkt_buy / fco_mkt_bulk_buy thêm p_direct (mặc định false). p_direct = true thì thẻ mua được NGAY trong lượt này (hệ thống bán
--     hoặc khớp lệnh bán sẵn có) vào kho luôn, không chờ nhận ở TTCN. Lệnh đặt mua chưa khớp thì khi khớp sau vẫn chờ nhận như thường.
-- (2) Hệ thống bán nhóm 2 như hàng phôi nhóm 1 (người dùng: "Cầu thủ nhóm 2 cũng được bán giống … nhưng số lượng ít hơn 1/3";
--     chọn: +1 nhóm 1 và nhóm 2 bán không giới hạn, nhóm 2 bớt 1/3 = 2/3 lượng nhóm 1):
--     • +1: mọi nhóm bán không giới hạn (nhóm 1 trước đây giới hạn 400–500 mỗi phút).
--     • +2 → +13: nhóm 1 mỗi phút (450 ± 50) × 0,68^(cấp−1); nhóm 2 = 2/3 lượng đó (tối thiểu 1); nhóm 3 không bán.
-- Cần game bản mới. Chạy sau 202611170014. Chạy lại được.

-- Lượng hệ thống treo bán mỗi phút (cấp ≥ 2) theo nhóm giá của cầu thủ.
create or replace function public.fco_mkt_sys_qty(p_player integer, p_level integer, p_minute bigint) returns integer language sql stable security definer set search_path = '' as $$
  select greatest(1, floor((450 + 50 * public.fco_inv_swing(p_player, p_level, p_minute + 900000000)) * power(0.68, p_level - 1)
    * case when coalesce((select grp from public.fco_cat_players where id = p_player), 0) = 2 then 2.0 / 3 else 1 end))::integer
$$;
revoke all on function public.fco_mkt_sys_qty(integer, integer, bigint) from public, anon, authenticated;

-- Hệ thống đang bán thẻ này không: {price, left} (left null = không giới hạn), null = không bán.
create or replace function public.fco_mkt_sys_offer(p_player integer, p_level integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g integer; price bigint; m bigint := public.fco_mkt_minute(); q integer;
begin
  if public.fco_trade_locked(p_player) or public.fco_mkt_no_system(p_player) then return null; end if;
  select grp into g from public.fco_cat_players where id = p_player;
  if not found then return null; end if;
  price := public.fco_inv_price(p_player, p_level);
  if price is null or price <= 0 then return null; end if;
  if p_level = 1 then return jsonb_build_object('price', price, 'left', null); end if;
  if coalesce(g, 0) in (1, 2) then
    q := public.fco_mkt_sys_qty(p_player, p_level, m);
    return jsonb_build_object('price', price, 'left', greatest(0, q - coalesce((select sold from public.fco_mkt_sys_sold where player_id = p_player and level = p_level and minute = m), 0)));
  end if;
  return null;
end;
$$;
revoke all on function public.fco_mkt_sys_offer(integer, integer) from public, anon, authenticated;

-- Cộng ngay thẻ chờ nhận của các lệnh p_orders (của p_uid) vào bản lưu d — dùng khi mua ở màn đập thẻ.
create or replace function public.fco_mkt_apply_orders(p_uid uuid, p_data jsonb, p_orders bigint[]) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_mkt_deliveries; d jsonb := p_data;
begin
  for r in select * from public.fco_mkt_deliveries where user_id = p_uid and claimed_at is null and kind = 'buy' and order_id = any(p_orders) order by id for update loop
    if r.card is not null then d := d || jsonb_build_object('cards', jsonb_build_array(r.card) || coalesce(d->'cards', '[]')); end if;
    d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) + coalesce(r.bp, 0));
    update public.fco_mkt_deliveries set claimed_at = now() where id = r.id;
  end loop;
  return d;
end;
$$;
revoke all on function public.fco_mkt_apply_orders(uuid, jsonb, bigint[]) from public, anon, authenticated;

drop function if exists public.fco_mkt_buy(text, integer, integer, bigint);
drop function if exists public.fco_mkt_bulk_buy(text, integer, integer, integer, bigint);

-- Như 202611170014, thêm p_direct.
create or replace function public.fco_mkt_buy(p_catalog text, p_player integer, p_level integer, p_price bigint, p_direct boolean default false) returns jsonb
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
    perform public.fco_mkt_fill(s, o, s.price);
    d := public.fco_inv_history(d, 'market', 'Mua · ' || label, 'Khớp lệnh bán · Giá ' || public.fco_inv_money(s.price) || ' BP' || case when p_direct then ' · Thẻ đã vào kho' else ' · Thẻ chờ nhận ở TTCN' end);
    if p_direct then d := public.fco_mkt_apply_orders(uid, d, array[o.id]); end if;
  else
    d := public.fco_inv_history(d, 'market', 'Đặt mua · ' || label, 'Giá ' || public.fco_inv_money(p_price) || ' BP (đang giữ) · Không hết hạn, huỷ ở TTCN thì trả lại BP');
  end if;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('matched', s.id is not null, 'system', false, 'price', coalesce(s.price, p_price), 'order', o.id, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;
grant execute on function public.fco_mkt_buy(text, integer, integer, bigint, boolean) to authenticated;
revoke execute on function public.fco_mkt_buy(text, integer, integer, bigint, boolean) from public, anon;

-- Như 202611170011, thêm p_direct.
create or replace function public.fco_mkt_bulk_buy(p_catalog text, p_player integer, p_level integer, p_count integer, p_max bigint, p_direct boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb;
  s public.fco_mkt_orders; o public.fco_mkt_orders; offer jsonb; sys bigint; m bigint; q integer; taken integer;
  bought integer := 0; spent bigint := 0; bal bigint; label text; applied jsonb; ids bigint[] := '{}';
begin
  if p_count is null or p_count < 1 or p_count > 10 or p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if p_max is null or p_max < 1 then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  label := public.fco_mkt_label(p_player, p_level);
  for i in 1 .. p_count loop
    bal := coalesce((d->>'balance')::bigint, 0);
    select * into s from public.fco_mkt_orders where status = 'open' and side = 'sell' and player_id = p_player and level = p_level
      and price <= p_max and user_id <> uid order by price, created_at limit 1 for update skip locked;
    offer := public.fco_mkt_sys_offer(p_player, p_level);
    sys := (offer->>'price')::bigint;
    if sys is not null and (sys > p_max or (offer->'left' <> 'null'::jsonb and (offer->>'left')::integer <= 0)) then sys := null; end if;
    if sys is not null and s.id is not null and s.price <= sys then sys := null; end if;
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
      if bal < s.price then exit; end if;
      d := d || jsonb_build_object('balance', bal - s.price);
      insert into public.fco_mkt_orders (user_id, side, player_id, level, price) values (uid, 'buy', p_player, p_level, s.price) returning * into o;
      perform public.fco_mkt_fill(s, o, s.price);
      ids := ids || o.id;
      bought := bought + 1; spent := spent + s.price;
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
grant execute on function public.fco_mkt_bulk_buy(text, integer, integer, integer, bigint, boolean) to authenticated;
revoke execute on function public.fco_mkt_bulk_buy(text, integer, integer, integer, bigint, boolean) from public, anon;

commit;
