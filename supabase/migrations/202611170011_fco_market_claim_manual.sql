begin;

-- Nhận hàng chợ bằng tay (2026-11-17, người dùng): mua / bán thành công thì CHƯA vào kho — thẻ mua được và BP bán được nằm chờ ở
-- TTCN › Lịch sử chuyển nhượng, người chơi bấm "Nhận tất cả" (thẻ) / "Nhận tất cả" (BP) mới nhận. Hai nút chỉ hiện khi có phần chờ.
--   • fco_mkt_deliveries thêm kind ('buy' = thẻ mua được, 'sell' = BP bán được, 'refund' = BP trả lại) và order_id (lệnh sinh ra phần này).
--     BP trả lại (lệnh mua hết hạn, BP giữ dư khi khớp giá thấp hơn) vẫn tự cộng như cũ — không phải mua / bán thành công.
--   • Hệ thống bán (+1, hàng phôi) cũng ghi thành lệnh mua đã khớp + phần chờ nhận (trước đây thẻ vào kho ngay).
--   • fco_mkt_claim (game gọi định kỳ): chỉ tự nhận BP trả lại, trả thêm pending {cards, bp, sells} để game hiện nút.
--   • fco_mkt_take(p_kind 'buy' | 'sell'): nhận hết thẻ chờ / BP chờ.
--   • fco_mkt_mine: thêm pending (lệnh còn phần chờ nhận) và claimBp; lệnh còn phần chờ luôn được trả về dù cũ.
-- Cần game bản mới. Chạy sau 202611170010. Chạy lại được.

alter table public.fco_mkt_deliveries add column if not exists kind text not null default 'sell';
alter table public.fco_mkt_deliveries add column if not exists order_id bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fco_mkt_deliveries_kind_check') then
    alter table public.fco_mkt_deliveries add constraint fco_mkt_deliveries_kind_check check (kind in ('buy', 'sell', 'refund'));
  end if;
end $$;
update public.fco_mkt_deliveries set kind = 'buy' where claimed_at is null and card is not null and kind <> 'buy';
update public.fco_mkt_deliveries set kind = 'refund' where claimed_at is null and card is null and title like 'Hết hạn lệnh mua%' and kind <> 'refund';
create index if not exists fco_mkt_deliveries_order on public.fco_mkt_deliveries (order_id) where claimed_at is null;

-- Khớp lệnh: người mua chờ nhận thẻ (kind buy), BP giữ dư trả ngay (refund), người bán chờ nhận BP sau thuế (kind sell).
create or replace function public.fco_mkt_fill(p_sell public.fco_mkt_orders, p_buy public.fco_mkt_orders, p_at bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare fee bigint := floor(p_at * coalesce(p_sell.tax, 0) / 100)::bigint; label text := public.fco_mkt_label(p_sell.player_id, p_sell.level);
begin
  update public.fco_mkt_orders set status = 'filled', closed_at = now(), fill_price = p_at, counterparty = p_buy.user_id where id = p_sell.id;
  update public.fco_mkt_orders set status = 'filled', closed_at = now(), fill_price = p_at, counterparty = p_sell.user_id where id = p_buy.id;
  insert into public.fco_mkt_deliveries (user_id, card, bp, kind, order_id, title, detail) values
    (p_buy.user_id, (p_sell.card - 'received') || jsonb_build_object('received', public.fco_now_ms(), 'fromMarket', true), 0, 'buy', p_buy.id,
      'Nhận thẻ · ' || label, 'Khớp lệnh mua · OVR ' || public.fco_inv_ovr(p_sell.player_id, p_sell.level) || ' · Giá ' || public.fco_inv_money(p_at) || ' BP'),
    (p_sell.user_id, null, p_at - fee, 'sell', p_sell.id,
      'Nhận BP · ' || label, 'Khớp lệnh bán · Giá ' || public.fco_inv_money(p_at) || ' BP · Phí ' || public.fco_inv_num(coalesce(p_sell.tax, 0)) || '%: '
        || public.fco_inv_money(fee) || ' BP · +' || public.fco_inv_money(p_at - fee) || ' BP');
  if p_buy.price > p_at then
    insert into public.fco_mkt_deliveries (user_id, bp, kind, order_id, title, detail) values (p_buy.user_id, p_buy.price - p_at, 'refund', p_buy.id,
      'Trả BP giữ dư · ' || label, 'Khớp giá ' || public.fco_inv_money(p_at) || ' BP thấp hơn giá đặt ' || public.fco_inv_money(p_buy.price) || ' BP · +' || public.fco_inv_money(p_buy.price - p_at) || ' BP');
  end if;
end;
$$;

-- Như 202611170002: hệ thống nhận lệnh bán quá hạn (người bán chờ nhận BP), lệnh mua hết hạn trả BP (tự cộng).
create or replace function public.fco_mkt_settle() returns void language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_mkt_orders; mr jsonb := public.fco_mkt_rules(); fee bigint;
begin
  for r in select * from public.fco_mkt_orders where status = 'open' and side = 'sell'
      and created_at < now() - make_interval(secs => (mr->>'systemAfterSec')::integer) order by created_at limit 300 for update skip locked loop
    fee := floor(r.price * coalesce(r.tax, 0) / 100)::bigint;
    update public.fco_mkt_orders set status = 'system', closed_at = now(), fill_price = r.price where id = r.id;
    insert into public.fco_mkt_deliveries (user_id, bp, kind, order_id, title, detail) values (r.user_id, r.price - fee, 'sell', r.id,
      'Nhận BP · ' || public.fco_mkt_label(r.player_id, r.level), 'Hệ thống mua sau ' || ((mr->>'systemAfterSec')::integer / 60) || ' phút treo · Giá '
        || public.fco_inv_money(r.price) || ' BP · Phí ' || public.fco_inv_num(coalesce(r.tax, 0)) || '%: ' || public.fco_inv_money(fee) || ' BP · +' || public.fco_inv_money(r.price - fee) || ' BP');
  end loop;
  for r in select * from public.fco_mkt_orders where status = 'open' and side = 'buy'
      and created_at < now() - make_interval(hours => (mr->>'buyTtlHours')::integer) order by created_at limit 300 for update skip locked loop
    update public.fco_mkt_orders set status = 'expired', closed_at = now() where id = r.id;
    insert into public.fco_mkt_deliveries (user_id, bp, kind, order_id, title, detail) values (r.user_id, r.price, 'refund', r.id,
      'Hết hạn lệnh mua · ' || public.fco_mkt_label(r.player_id, r.level), 'Không khớp sau ' || (mr->>'buyTtlHours') || ' giờ · Trả lại ' || public.fco_inv_money(r.price) || ' BP');
  end loop;
end;
$$;

-- Cộng phần chờ loại p_kinds của p_uid vào bản lưu d (đã khoá). Trả {data, texts}.
create or replace function public.fco_mkt_apply_kinds(p_uid uuid, p_data jsonb, p_kinds text[]) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_mkt_deliveries; d jsonb := p_data; texts jsonb := '[]';
begin
  for r in select * from public.fco_mkt_deliveries where user_id = p_uid and claimed_at is null and kind = any(p_kinds) order by id for update skip locked loop
    if r.card is not null then d := d || jsonb_build_object('cards', jsonb_build_array(r.card) || coalesce(d->'cards', '[]')); end if;
    d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) + coalesce(r.bp, 0));
    d := public.fco_inv_history(d, 'market', r.title, r.detail);
    update public.fco_mkt_deliveries set claimed_at = now() where id = r.id;
    texts := texts || to_jsonb(r.title || case when r.bp > 0 and r.card is null then ' (+' || public.fco_inv_money(r.bp) || ' BP)' else '' end);
  end loop;
  return jsonb_build_object('data', d, 'texts', texts);
end;
$$;
-- Các hàm chợ gọi cuối lượt: giờ chỉ tự cộng BP trả lại; thẻ mua được / BP bán được chờ người chơi bấm nhận.
create or replace function public.fco_mkt_apply(p_uid uuid, p_data jsonb) returns jsonb language sql volatile security definer set search_path = '' as $$
  select public.fco_mkt_apply_kinds(p_uid, p_data, array['refund'])
$$;
-- Phần đang chờ nhận: số thẻ, tổng BP, số lần bán.
create or replace function public.fco_mkt_pending(p_uid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('cards', count(*) filter (where kind = 'buy'), 'bp', coalesce(sum(bp) filter (where kind = 'sell'), 0), 'sells', count(*) filter (where kind = 'sell'))
  from public.fco_mkt_deliveries where user_id = p_uid and claimed_at is null
$$;
revoke all on function public.fco_mkt_fill(public.fco_mkt_orders, public.fco_mkt_orders, bigint), public.fco_mkt_settle(), public.fco_mkt_apply(uuid, jsonb),
  public.fco_mkt_apply_kinds(uuid, jsonb, text[]), public.fco_mkt_pending(uuid) from public, anon, authenticated;

-- Game gọi định kỳ: xử lý lệnh tới hạn, tự cộng BP trả lại, báo phần đang chờ nhận (pending).
create or replace function public.fco_mkt_claim() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); d jsonb; applied jsonb; saved jsonb := null; texts jsonb := '[]';
begin
  perform public.fco_mkt_settle();
  if exists (select 1 from public.fco_mkt_deliveries where user_id = uid and claimed_at is null and kind = 'refund') and public.fco_inv_server_owned(uid) then
    d := public.fco_inv_lock(uid);
    applied := public.fco_mkt_apply(uid, d);
    texts := applied->'texts';
    saved := public.fco_inv_store(uid, applied->'data');
  end if;
  return jsonb_build_object('texts', texts, 'save', saved, 'pending', public.fco_mkt_pending(uid));
end;
$$;

-- Nút "Nhận tất cả": p_kind 'buy' = mọi thẻ đang chờ, 'sell' = mọi BP bán được đang chờ (kèm BP trả lại nếu có).
create or replace function public.fco_mkt_take(p_kind text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); d jsonb; applied jsonb;
begin
  if p_kind is null or p_kind not in ('buy', 'sell') then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  perform public.fco_mkt_settle();
  if not exists (select 1 from public.fco_mkt_deliveries where user_id = uid and claimed_at is null and kind in (p_kind, 'refund')) then
    return jsonb_build_object('texts', '[]'::jsonb, 'save', null, 'pending', public.fco_mkt_pending(uid));
  end if;
  d := public.fco_inv_lock(uid);
  applied := public.fco_mkt_apply_kinds(uid, d, array[p_kind, 'refund']);
  return jsonb_build_object('texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'), 'pending', public.fco_mkt_pending(uid));
end;
$$;
grant execute on function public.fco_mkt_take(text) to authenticated;
revoke execute on function public.fco_mkt_take(text) from public, anon;

-- Hệ thống bán một thẻ cho p_uid: ghi lệnh mua đã khớp + phần chờ nhận (thẻ chưa vào kho). Trả id lệnh.
create or replace function public.fco_mkt_system_sale(p_uid uuid, p_player integer, p_level integer, p_price bigint) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare oid bigint;
begin
  insert into public.fco_mkt_orders (user_id, side, player_id, level, price, status, closed_at, fill_price)
    values (p_uid, 'buy', p_player, p_level, p_price, 'filled', now(), p_price) returning id into oid;
  insert into public.fco_mkt_deliveries (user_id, card, bp, kind, order_id, title, detail) values
    (p_uid, public.fco_inv_new_card(p_player, p_level, true), 0, 'buy', oid, 'Nhận thẻ · ' || public.fco_mkt_label(p_player, p_level),
      'Hệ thống bán · OVR ' || public.fco_inv_ovr(p_player, p_level) || ' · Giá ' || public.fco_inv_money(p_price) || ' BP');
  return oid;
end;
$$;
revoke all on function public.fco_mkt_system_sale(uuid, integer, integer, bigint) from public, anon, authenticated;

-- Như 202611170004, phần hệ thống bán đổi sang chờ nhận (fco_mkt_system_sale).
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
    d := public.fco_inv_history(d, 'market', 'Đặt mua · ' || label, 'Giá ' || public.fco_inv_money(p_price) || ' BP (đang giữ) · Hết hạn sau ' || (mr->>'buyTtlHours') || ' giờ thì trả lại BP');
  end if;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('matched', s.id is not null, 'system', false, 'price', coalesce(s.price, p_price), 'order', o.id, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

-- Như 202611170008, phần hệ thống bán đổi sang chờ nhận (fco_mkt_system_sale).
create or replace function public.fco_mkt_bulk_buy(p_catalog text, p_player integer, p_level integer, p_count integer, p_max bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb;
  s public.fco_mkt_orders; o public.fco_mkt_orders; offer jsonb; sys bigint; m bigint; q integer; taken integer;
  bought integer := 0; spent bigint := 0; bal bigint; label text; applied jsonb;
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
      perform public.fco_mkt_system_sale(uid, p_player, p_level, sys);
      d := d || jsonb_build_object('balance', bal - sys);
      bought := bought + 1; spent := spent + sys;
    elsif s.id is not null then
      if bal < s.price then exit; end if;
      d := d || jsonb_build_object('balance', bal - s.price);
      insert into public.fco_mkt_orders (user_id, side, player_id, level, price) values (uid, 'buy', p_player, p_level, s.price) returning * into o;
      perform public.fco_mkt_fill(s, o, s.price);
      bought := bought + 1; spent := spent + s.price;
    else
      exit;
    end if;
  end loop;
  if bought = 0 then raise exception 'FCO_NO_SELLER' using errcode = 'P0001'; end if;
  delete from public.fco_mkt_sys_sold where minute < public.fco_mkt_minute() - 10;
  d := public.fco_inv_history(d, 'market', 'Mua · ' || bought || ' × ' || label, 'Tổng ' || public.fco_inv_money(spent) || ' BP · −' || public.fco_inv_money(spent) || ' BP · Thẻ chờ nhận ở TTCN');
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('bought', bought, 'spent', spent, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

-- Lịch sử chuyển nhượng: lệnh đang treo, lệnh còn phần chờ nhận (pending, claimBp = BP chờ nhận của lệnh bán), lệnh đóng 3 ngày qua.
create or replace function public.fco_mkt_mine() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'side', s.side, 'playerId', s.player_id, 'level', s.level, 'price', s.price, 'tax', s.tax,
    'status', s.status, 'fillPrice', s.fill_price, 'createdAt', (extract(epoch from s.created_at) * 1000)::bigint,
    'closedAt', (extract(epoch from s.closed_at) * 1000)::bigint, 'pending', s.pend > 0, 'claimBp', s.pend_bp) order by s.status <> 'open', s.created_at desc), '[]')
  from (
    select o.*, coalesce(p.n, 0) as pend, coalesce(p.bp, 0) as pend_bp
    from public.fco_mkt_orders o
    left join lateral (select count(*) as n, sum(bp) filter (where kind = 'sell') as bp from public.fco_mkt_deliveries
      where order_id = o.id and user_id = uid and claimed_at is null and kind in ('buy', 'sell')) p on true
    where o.user_id = uid and (o.status = 'open' or coalesce(p.n, 0) > 0 or o.closed_at > now() - interval '3 days')
    order by o.status <> 'open', coalesce(p.n, 0) = 0, o.created_at desc limit 200) s);
end;
$$;

commit;
