begin;

-- Bỏ "Bán cho hệ thống", treo bán quá 3 phút thì hệ thống tự mua (2026-11-18, người dùng: "bỏ cơ chế nút bán cho hệ thống, khi người chơi
-- bán cầu thủ tối đa 1 lần chỉ 150 cầu thủ, bán cho người chơi, cầu thủ nào quá 3p ko ai mua thì sẽ tự động bán cho hệ thống").
--   • Bán = treo lệnh cho người chơi (fco_mkt_sell). Có lệnh đặt mua giá ≥ giá treo thì khớp ngay; chưa ai mua sau systemAfterSec (180 giây)
--     thì hệ thống mua đúng giá treo, trừ thuế đã chốt lúc treo; BP chờ nhận ở TTCN › Lịch sử chuyển nhượng (kind 'sell', như 202611170011).
--     Bỏ luật hết hạn 24 giờ trả thẻ về kho (202611170012). Lệnh đặt mua vẫn không hết hạn (202611170014).
--   • fco_inv_sell (bán thẳng cho hệ thống, 202611170013) tắt lại: báo FCO_SELL_VIA_MARKET.
--   • Mỗi lần bán tối đa maxBulkSell thẻ (bộ dữ liệu game: MAX_BULK_SELL = 150 → cần đưa bản game mới + Đồng bộ dữ liệu);
--     số lệnh treo cùng lúc tối đa 300 (maxOpenSell) để bán đủ 150 thẻ một lần.
-- Chạy sau 202611180003. Chạy lại được.

create or replace function public.fco_mkt_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('systemAfterSec', 180, 'maxOpenSell', 300, 'maxOpenBuy', 50)
$$;
revoke all on function public.fco_mkt_rules() from public, anon, authenticated;

-- Lệnh bán treo quá systemAfterSec → hệ thống mua đúng giá treo (trừ thuế), người bán chờ nhận BP. Lệnh mua không hết hạn.
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
end;
$$;
revoke all on function public.fco_mkt_settle() from public, anon, authenticated;

-- Như 202611170012, dòng lịch sử: chưa ai mua sau 3 phút thì hệ thống nhận đúng giá treo.
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
      || ' · Chưa ai mua sau ' || ((mr->>'systemAfterSec')::integer / 60) || ' phút thì hệ thống nhận đúng giá treo');
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('placed', placed, 'matched', matched, 'tax', tax, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

-- Bán thẳng cho hệ thống đã bỏ: bán = treo lệnh (fco_mkt_sell).
create or replace function public.fco_inv_sell(p_catalog text, p_items jsonb, p_voucher integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  raise exception 'FCO_SELL_VIA_MARKET' using errcode = 'P0001';
end;
$$;

commit;
