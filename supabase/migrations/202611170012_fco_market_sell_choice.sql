begin;

-- Hai cách bán (2026-11-17, người dùng: "Thêm lựa chọn bán cho người chơi hoặc bán cho hệ thống, bán cho hệ thống thì nhận liền,
-- bán cho người chơi thì treo trong 24h"):
--   • Bán cho hệ thống (fco_inv_sell, mở lại): hệ thống mua ngay theo GIÁ THAM CHIẾU (không tự đặt giá), trừ thuế, BP cộng thẳng vào số dư.
--   • Bán cho người chơi (fco_mkt_sell): treo lệnh 24 giờ (sellTtlHours). Hết 24 giờ chưa ai mua thì lệnh hết hạn, thẻ tự về kho.
--     Bỏ việc hệ thống tự nhận lệnh treo sau 3 phút (systemAfterSec).
-- Cần game bản mới. Chạy sau 202611170011. Chạy lại được.

create or replace function public.fco_mkt_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('sellTtlHours', 24, 'buyTtlHours', 24, 'maxOpenSell', 100, 'maxOpenBuy', 50)
$$;
revoke all on function public.fco_mkt_rules() from public, anon, authenticated;

-- Lệnh bán quá sellTtlHours → hết hạn, thẻ về kho (refund, tự cộng); lệnh mua quá buyTtlHours → trả BP (refund).
create or replace function public.fco_mkt_settle() returns void language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_mkt_orders; mr jsonb := public.fco_mkt_rules();
begin
  for r in select * from public.fco_mkt_orders where status = 'open' and side = 'sell'
      and created_at < now() - make_interval(hours => (mr->>'sellTtlHours')::integer) order by created_at limit 300 for update skip locked loop
    update public.fco_mkt_orders set status = 'expired', closed_at = now() where id = r.id;
    insert into public.fco_mkt_deliveries (user_id, card, bp, kind, order_id, title, detail) values (r.user_id, r.card, 0, 'refund', r.id,
      'Hết hạn treo bán · ' || public.fco_mkt_label(r.player_id, r.level), 'Không ai mua sau ' || (mr->>'sellTtlHours') || ' giờ · Thẻ đã về kho');
  end loop;
  for r in select * from public.fco_mkt_orders where status = 'open' and side = 'buy'
      and created_at < now() - make_interval(hours => (mr->>'buyTtlHours')::integer) order by created_at limit 300 for update skip locked loop
    update public.fco_mkt_orders set status = 'expired', closed_at = now() where id = r.id;
    insert into public.fco_mkt_deliveries (user_id, bp, kind, order_id, title, detail) values (r.user_id, r.price, 'refund', r.id,
      'Hết hạn lệnh mua · ' || public.fco_mkt_label(r.player_id, r.level), 'Không khớp sau ' || (mr->>'buyTtlHours') || ' giờ · Trả lại ' || public.fco_inv_money(r.price) || ' BP');
  end loop;
end;
$$;
revoke all on function public.fco_mkt_settle() from public, anon, authenticated;

-- Như 202611170002, đổi dòng lịch sử: treo 24 giờ, chưa ai mua thì thẻ về kho.
create or replace function public.fco_mkt_sell(p_catalog text, p_items jsonb, p_voucher integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb; mr jsonb := public.fco_mkt_rules();
  item jsonb; card jsonb; asked bigint; band integer := (rules->>'sellBand')::integer; tax double precision;
  uids text[] := '{}'; n integer; placed integer := 0; matched integer := 0; o public.fco_mkt_orders; b public.fco_mkt_orders; applied jsonb;
begin
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  tax := public.fco_inv_tax(uid, rules);
  if p_voucher is not null then
    if p_voucher not in (10, 20, 30) then raise exception 'FCO_BAD_VOUCHER' using errcode = '22023'; end if;
    if public.fco_inv_voucher(d, p_voucher) < 1 then raise exception 'FCO_NO_VOUCHER' using errcode = 'P0001'; end if;
    if public.fco_account_tier(uid) in ('premium', 'luxury') then
      if greatest(0, (rules->>'marketFee')::double precision - p_voucher) >= tax then raise exception 'FCO_VOUCHER_USELESS' using errcode = 'P0001'; end if;
      tax := greatest(0, (rules->>'marketFee')::double precision - p_voucher);
    else
      tax := greatest(0, tax - p_voucher);
    end if;
    d := public.fco_inv_set_voucher(d, p_voucher, public.fco_inv_voucher(d, p_voucher) - 1);
  end if;
  n := case when jsonb_typeof(p_items) = 'array' then jsonb_array_length(p_items) else 0 end;
  if n < 1 or n > (rules->>'maxBulkSell')::integer then raise exception 'FCO_BAD_SELL' using errcode = '22023'; end if;
  if (select count(*) from public.fco_mkt_orders where user_id = uid and side = 'sell' and status = 'open') + n > (mr->>'maxOpenSell')::integer then
    raise exception 'FCO_TOO_MANY_ORDERS' using errcode = 'P0001';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'uid' = any(uids) then raise exception 'FCO_BAD_SELL' using errcode = '22023'; end if;
    uids := uids || (item->>'uid');
    card := public.fco_inv_card(d, item->>'uid');
    if card is null then raise exception 'FCO_CARD_MISSING' using errcode = 'P0001'; end if;
    if public.fco_inv_locked(d, item->>'uid') then raise exception 'FCO_CARD_LOCKED' using errcode = 'P0001'; end if;
    if public.fco_trade_locked((card->>'playerId')::integer) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
    if jsonb_typeof(item->'price') <> 'number' or (item->>'price')::numeric <> floor((item->>'price')::numeric) then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
    asked := (item->>'price')::bigint;
    perform public.fco_mkt_check_price((card->>'playerId')::integer, (card->>'level')::integer, asked, band);
    insert into public.fco_mkt_orders (user_id, side, player_id, level, price, tax, card)
      values (uid, 'sell', (card->>'playerId')::integer, (card->>'level')::integer, asked, tax, card) returning * into o;
    placed := placed + 1;
    select * into b from public.fco_mkt_orders where status = 'open' and side = 'buy' and player_id = o.player_id and level = o.level
      and price >= asked and user_id <> uid order by price desc, created_at limit 1 for update skip locked;
    if found then perform public.fco_mkt_fill(o, b, b.price); matched := matched + 1; end if;
  end loop;
  d := d || jsonb_build_object('cards', (select coalesce(jsonb_agg(c order by ord), '[]') from jsonb_array_elements(d->'cards') with ordinality x(c, ord) where not (c->>'uid' = any(uids))));
  d := public.fco_inv_history(d, 'market', 'Treo bán · ' || case when n = 1 then public.fco_mkt_label((card->>'playerId')::integer, (card->>'level')::integer) else n || ' cầu thủ' end,
    'Thuế ' || public.fco_inv_num(tax) || '%' || case when p_voucher is not null then ' (phiếu −' || p_voucher || '%)' else '' end
      || ' · Treo ' || (mr->>'sellTtlHours') || ' giờ, chưa ai mua thì thẻ về kho');
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('placed', placed, 'matched', matched, 'tax', tax, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

-- Bán cho hệ thống: nhận ngay theo giá tham chiếu (giá trong p_items bỏ qua), trừ thuế (phiếu giảm thuế như cũ), BP vào số dư luôn.
create or replace function public.fco_inv_sell(p_catalog text, p_items jsonb, p_voucher integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb;
  item jsonb; card jsonb; price bigint; tax double precision; total bigint := 0; fees bigint := 0; uids text[] := '{}'; n integer; first jsonb; tail text;
begin
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  tax := public.fco_inv_tax(uid, rules);
  if p_voucher is not null then
    if p_voucher not in (10, 20, 30) then raise exception 'FCO_BAD_VOUCHER' using errcode = '22023'; end if;
    if public.fco_inv_voucher(d, p_voucher) < 1 then raise exception 'FCO_NO_VOUCHER' using errcode = 'P0001'; end if;
    if public.fco_account_tier(uid) in ('premium', 'luxury') then
      if greatest(0, (rules->>'marketFee')::double precision - p_voucher) >= tax then raise exception 'FCO_VOUCHER_USELESS' using errcode = 'P0001'; end if;
      tax := greatest(0, (rules->>'marketFee')::double precision - p_voucher);
    else
      tax := greatest(0, tax - p_voucher);
    end if;
    d := public.fco_inv_set_voucher(d, p_voucher, public.fco_inv_voucher(d, p_voucher) - 1);
  end if;
  n := case when jsonb_typeof(p_items) = 'array' then jsonb_array_length(p_items) else 0 end;
  if n < 1 or n > (rules->>'maxBulkSell')::integer then raise exception 'FCO_BAD_SELL' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'uid' = any(uids) then raise exception 'FCO_BAD_SELL' using errcode = '22023'; end if;
    uids := uids || (item->>'uid');
    card := public.fco_inv_card(d, item->>'uid');
    if card is null then raise exception 'FCO_CARD_MISSING' using errcode = 'P0001'; end if;
    if public.fco_inv_locked(d, item->>'uid') then raise exception 'FCO_CARD_LOCKED' using errcode = 'P0001'; end if;
    if public.fco_trade_locked((card->>'playerId')::integer) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
    price := public.fco_inv_price((card->>'playerId')::integer, (card->>'level')::integer);
    if price is null or price <= 0 then raise exception 'FCO_NO_PRICE' using errcode = 'P0001'; end if;
    total := total + price;
    fees := fees + floor(price * tax / 100)::bigint;
    first := coalesce(first, card);
  end loop;
  d := d || jsonb_build_object(
    'cards', (select coalesce(jsonb_agg(c order by o), '[]') from jsonb_array_elements(d->'cards') with ordinality x(c, o) where not (c->>'uid' = any(uids))),
    'balance', coalesce((d->>'balance')::bigint, 0) + total - fees);
  tail := 'Phí ' || public.fco_inv_num(tax) || '%' || case when p_voucher is not null then ' (phiếu −' || p_voucher || '%)' else '' end
    || ': ' || public.fco_inv_money(fees) || ' BP · +' || public.fco_inv_money(total - fees) || ' BP';
  d := case when n = 1
    then public.fco_inv_history(d, 'market', 'Bán cho hệ thống · ' || public.fco_inv_name((first->>'playerId')::integer) || ' +' || (first->>'level'),
      'OVR ' || public.fco_inv_ovr((first->>'playerId')::integer, (first->>'level')::integer) || ' · Giá ' || public.fco_inv_money(total) || ' BP · ' || tail)
    else public.fco_inv_history(d, 'market', 'Bán cho hệ thống · ' || n || ' cầu thủ', 'Tổng giá ' || public.fco_inv_money(total) || ' BP · ' || tail) end;
  return jsonb_build_object('sold', n, 'total', total, 'fees', fees, 'proceeds', total - fees, 'tax', tax, 'save', public.fco_inv_store(uid, d));
end;
$$;

commit;
