begin;

-- Chợ giữa người chơi (2026-11-17, người dùng): người chơi mua / bán thẻ với nhau qua lệnh đặt bán và đặt mua.
--   • Hệ thống chỉ còn BÁN thẻ +1 (fco_inv_buy chặn cấp khác: FCO_SYSTEM_PLUS1). Cấp +2 trở lên chỉ có qua chợ.
--   • Không bán thẳng cho hệ thống nữa (fco_inv_sell báo FCO_SELL_VIA_MARKET). Bán = treo lệnh bán; treo 3 phút mà chưa ai mua thì
--     hệ thống nhận đúng giá đã treo (trừ thuế như cũ).
--   • Giá mọi lệnh trong ±sellBand% (10%) quanh giá tham chiếu (giá hệ thống fco_inv_price lúc đặt) → khó dùng chợ để chuyển BP
--     giữa các tài khoản clone.
--   • Lệnh mua giữ BP ngay khi đặt, hết hạn sau 24 giờ thì trả lại BP. Lệnh bán giữ thẻ ngay khi đặt (thẻ rời kho).
--   • Hai lệnh khớp (giá mua ≥ giá bán, khác người) thì giao dịch theo giá của lệnh đang chờ sẵn trên chợ.
--   • Mọi khoản trả cho người KHÔNG gọi hàm (người bán nhận BP, người mua nhận thẻ, trả BP lệnh hết hạn…) vào fco_mkt_deliveries;
--     game của người đó nhận qua fco_mkt_claim (gọi định kỳ) — không khoá bản lưu của người khác. Người gọi hàm nhận ngay trong lượt đó.
--   • Không cần lịch chạy: mọi hàm chợ đều xử lý lệnh tới hạn trước (fco_mkt_settle).
-- Cần game bản mới (src/market-orders.ts). Chạy lại được.

create table if not exists public.fco_mkt_orders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  player_id integer not null,
  level integer not null check (level between 1 and 20),
  price bigint not null check (price > 0),
  tax double precision,           -- lệnh bán: thuế % của người bán, chốt lúc đặt (đã trừ phiếu)
  card jsonb,                     -- lệnh bán: thẻ đang giữ
  status text not null default 'open' check (status in ('open', 'filled', 'system', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  fill_price bigint,
  counterparty uuid
);
create index if not exists fco_mkt_orders_book on public.fco_mkt_orders (player_id, level, side, price) where status = 'open';
create index if not exists fco_mkt_orders_due on public.fco_mkt_orders (side, created_at) where status = 'open';
create index if not exists fco_mkt_orders_user on public.fco_mkt_orders (user_id, created_at desc);

create table if not exists public.fco_mkt_deliveries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card jsonb,
  bp bigint not null default 0,
  title text not null,
  detail text not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists fco_mkt_deliveries_open on public.fco_mkt_deliveries (user_id) where claimed_at is null;

alter table public.fco_mkt_orders enable row level security;
alter table public.fco_mkt_deliveries enable row level security;
revoke all on public.fco_mkt_orders, public.fco_mkt_deliveries from public, anon, authenticated;

-- ===== Hàm nội bộ =====

create or replace function public.fco_mkt_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('systemAfterSec', 180, 'buyTtlHours', 24, 'maxOpenSell', 100, 'maxOpenBuy', 50)
$$;

-- Giá đặt phải là số nguyên trong ±band% quanh giá tham chiếu lúc này.
create or replace function public.fco_mkt_check_price(p_player integer, p_level integer, p_price bigint, p_band integer) returns void
language plpgsql stable security definer set search_path = '' as $$
declare ref bigint := public.fco_inv_price(p_player, p_level);
begin
  if ref is null or ref = 0 then raise exception 'FCO_NO_PRICE' using errcode = 'P0001'; end if;
  if p_price is null or p_price < ceil(ref::double precision * (100 - p_band) / 100) or p_price > floor(ref::double precision * (100 + p_band) / 100) then
    raise exception 'FCO_BAD_PRICE' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.fco_mkt_label(p_player integer, p_level integer) returns text language sql stable security definer set search_path = '' as $$
  select public.fco_inv_name(p_player) || ' +' || p_level
$$;

-- Khớp một lệnh bán với một lệnh mua theo giá p_at: đóng hai lệnh, ghi phần nhận của người mua (thẻ + phần BP giữ dư) và người bán (BP sau thuế).
create or replace function public.fco_mkt_fill(p_sell public.fco_mkt_orders, p_buy public.fco_mkt_orders, p_at bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare fee bigint := floor(p_at * coalesce(p_sell.tax, 0) / 100)::bigint; label text := public.fco_mkt_label(p_sell.player_id, p_sell.level);
begin
  update public.fco_mkt_orders set status = 'filled', closed_at = now(), fill_price = p_at, counterparty = p_buy.user_id where id = p_sell.id;
  update public.fco_mkt_orders set status = 'filled', closed_at = now(), fill_price = p_at, counterparty = p_sell.user_id where id = p_buy.id;
  insert into public.fco_mkt_deliveries (user_id, card, bp, title, detail) values
    (p_buy.user_id, (p_sell.card - 'received') || jsonb_build_object('received', public.fco_now_ms(), 'fromMarket', true), greatest(0, p_buy.price - p_at),
      'Mua · ' || label, 'Khớp lệnh mua · OVR ' || public.fco_inv_ovr(p_sell.player_id, p_sell.level) || ' · Giá ' || public.fco_inv_money(p_at) || ' BP'
        || case when p_buy.price > p_at then ' · Trả lại ' || public.fco_inv_money(p_buy.price - p_at) || ' BP giữ dư' else '' end),
    (p_sell.user_id, null, p_at - fee,
      'Bán · ' || label, 'Khớp lệnh bán · Giá ' || public.fco_inv_money(p_at) || ' BP · Phí ' || public.fco_inv_num(coalesce(p_sell.tax, 0)) || '%: '
        || public.fco_inv_money(fee) || ' BP · +' || public.fco_inv_money(p_at - fee) || ' BP');
end;
$$;

-- Xử lý lệnh tới hạn: lệnh bán treo quá systemAfterSec → hệ thống nhận đúng giá treo (trừ thuế); lệnh mua quá buyTtlHours → trả BP.
-- Mỗi lượt tối đa 300 lệnh, lệnh đang bị lượt khác giữ thì bỏ qua (skip locked).
create or replace function public.fco_mkt_settle() returns void language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_mkt_orders; mr jsonb := public.fco_mkt_rules(); fee bigint;
begin
  for r in select * from public.fco_mkt_orders where status = 'open' and side = 'sell'
      and created_at < now() - make_interval(secs => (mr->>'systemAfterSec')::integer) order by created_at limit 300 for update skip locked loop
    fee := floor(r.price * coalesce(r.tax, 0) / 100)::bigint;
    update public.fco_mkt_orders set status = 'system', closed_at = now(), fill_price = r.price where id = r.id;
    insert into public.fco_mkt_deliveries (user_id, bp, title, detail) values (r.user_id, r.price - fee,
      'Bán · ' || public.fco_mkt_label(r.player_id, r.level), 'Hệ thống mua sau ' || ((mr->>'systemAfterSec')::integer / 60) || ' phút treo · Giá '
        || public.fco_inv_money(r.price) || ' BP · Phí ' || public.fco_inv_num(coalesce(r.tax, 0)) || '%: ' || public.fco_inv_money(fee) || ' BP · +' || public.fco_inv_money(r.price - fee) || ' BP');
  end loop;
  for r in select * from public.fco_mkt_orders where status = 'open' and side = 'buy'
      and created_at < now() - make_interval(hours => (mr->>'buyTtlHours')::integer) order by created_at limit 300 for update skip locked loop
    update public.fco_mkt_orders set status = 'expired', closed_at = now() where id = r.id;
    insert into public.fco_mkt_deliveries (user_id, bp, title, detail) values (r.user_id, r.price,
      'Hết hạn lệnh mua · ' || public.fco_mkt_label(r.player_id, r.level), 'Không khớp sau ' || (mr->>'buyTtlHours') || ' giờ · Trả lại ' || public.fco_inv_money(r.price) || ' BP');
  end loop;
end;
$$;

-- Cộng phần đang chờ của p_uid vào bản lưu d (đã khoá): thẻ, BP, mỗi phần một dòng lịch sử. Trả {data, texts}.
create or replace function public.fco_mkt_apply(p_uid uuid, p_data jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_mkt_deliveries; d jsonb := p_data; texts jsonb := '[]';
begin
  for r in select * from public.fco_mkt_deliveries where user_id = p_uid and claimed_at is null order by id for update skip locked loop
    if r.card is not null then d := d || jsonb_build_object('cards', jsonb_build_array(r.card) || coalesce(d->'cards', '[]')); end if;
    d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) + coalesce(r.bp, 0));
    d := public.fco_inv_history(d, 'market', r.title, r.detail);
    update public.fco_mkt_deliveries set claimed_at = now() where id = r.id;
    texts := texts || to_jsonb(r.title || case when r.bp > 0 and r.card is null then ' (+' || public.fco_inv_money(r.bp) || ' BP)' else '' end);
  end loop;
  return jsonb_build_object('data', d, 'texts', texts);
end;
$$;

revoke all on function public.fco_mkt_rules(), public.fco_mkt_check_price(integer, integer, bigint, integer), public.fco_mkt_label(integer, integer),
  public.fco_mkt_fill(public.fco_mkt_orders, public.fco_mkt_orders, bigint), public.fco_mkt_settle(), public.fco_mkt_apply(uuid, jsonb) from public, anon, authenticated;

-- ===== Hàm game gọi =====

-- Treo bán (một hoặc nhiều thẻ, mỗi thẻ một giá) — thay fco_inv_sell. Phiếu giảm thuế dùng như bán cũ, chốt thuế vào lệnh.
-- Có lệnh mua giá ≥ giá treo (của người khác) thì khớp ngay theo giá lệnh mua đó.
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

-- Đặt mua 1 thẻ p_player +p_level giá tối đa p_price. Có lệnh bán giá ≤ p_price (của người khác) thì mua ngay theo giá lệnh bán rẻ nhất;
-- không thì giữ p_price BP và treo lệnh mua (24 giờ).
create or replace function public.fco_mkt_buy(p_catalog text, p_player integer, p_level integer, p_price bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb; mr jsonb := public.fco_mkt_rules();
  s public.fco_mkt_orders; o public.fco_mkt_orders; applied jsonb; label text;
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
  return jsonb_build_object('matched', s.id is not null, 'price', coalesce(s.price, p_price), 'order', o.id, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

-- Huỷ lệnh đang treo của mình: lệnh bán trả thẻ về kho, lệnh mua trả BP.
create or replace function public.fco_mkt_cancel(p_order bigint) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); d jsonb; o public.fco_mkt_orders; label text;
begin
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  select * into o from public.fco_mkt_orders where id = p_order and user_id = uid and status = 'open' for update;
  if not found then raise exception 'FCO_ORDER_CLOSED' using errcode = 'P0001'; end if;
  update public.fco_mkt_orders set status = 'cancelled', closed_at = now() where id = o.id;
  label := public.fco_mkt_label(o.player_id, o.level);
  if o.side = 'sell' then
    d := d || jsonb_build_object('cards', jsonb_build_array(o.card) || coalesce(d->'cards', '[]'));
    d := public.fco_inv_history(d, 'market', 'Huỷ treo bán · ' || label, 'Thẻ đã về kho');
  else
    d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) + o.price);
    d := public.fco_inv_history(d, 'market', 'Huỷ lệnh mua · ' || label, 'Trả lại ' || public.fco_inv_money(o.price) || ' BP');
  end if;
  return jsonb_build_object('save', public.fco_inv_store(uid, d));
end;
$$;

-- Game gọi định kỳ: xử lý lệnh tới hạn rồi nhận phần đang chờ của mình. Không có gì thì không ghi bản lưu (save = null).
create or replace function public.fco_mkt_claim() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); d jsonb; applied jsonb;
begin
  perform public.fco_mkt_settle();
  if not exists (select 1 from public.fco_mkt_deliveries where user_id = uid and claimed_at is null) or not public.fco_inv_server_owned(uid) then
    return jsonb_build_object('texts', '[]'::jsonb, 'save', null);
  end if;
  d := public.fco_inv_lock(uid);
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

-- Sổ lệnh một cầu thủ: mỗi cấp giá mua cao nhất / số lệnh mua, giá bán thấp nhất / số lệnh bán (lệnh đang treo, cả của mình).
create or replace function public.fco_mkt_book(p_player integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('level', level, 'bid', bid, 'bids', bids, 'ask', ask, 'asks', asks) order by level), '[]')
  from (
    select level,
      max(price) filter (where side = 'buy') as bid, count(*) filter (where side = 'buy') as bids,
      min(price) filter (where side = 'sell') as ask, count(*) filter (where side = 'sell') as asks
    from public.fco_mkt_orders where player_id = p_player and status = 'open' group by level
  ) s
$$;

-- Sổ lệnh chi tiết một thẻ (cầu thủ + cấp): 5 mức giá mua cao nhất / 5 mức giá bán thấp nhất (gộp theo giá, kèm số lệnh)
-- và số lần khớp 2 giờ qua (cả hệ thống nhận) — cửa sổ Bán / Đặt mua hiện bảng này.
create or replace function public.fco_mkt_depth(p_player integer, p_level integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'bids', coalesce((select jsonb_agg(jsonb_build_object('price', price, 'count', n) order by price desc) from (
      select price, count(*) as n from public.fco_mkt_orders where player_id = p_player and level = p_level and side = 'buy' and status = 'open'
      group by price order by price desc limit 5) b), '[]'),
    'asks', coalesce((select jsonb_agg(jsonb_build_object('price', price, 'count', n) order by price) from (
      select price, count(*) as n from public.fco_mkt_orders where player_id = p_player and level = p_level and side = 'sell' and status = 'open'
      group by price order by price limit 5) a), '[]'),
    'volume', (select count(*) from public.fco_mkt_orders where player_id = p_player and level = p_level and side = 'sell'
      and status in ('filled', 'system') and closed_at > now() - interval '2 hours'))
$$;
-- Lệnh của tôi: đang treo + đã đóng trong 3 ngày (mới nhất trước, tối đa 100).
create or replace function public.fco_mkt_mine() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'side', side, 'playerId', player_id, 'level', level, 'price', price, 'tax', tax,
    'status', status, 'fillPrice', fill_price, 'createdAt', (extract(epoch from created_at) * 1000)::bigint,
    'closedAt', (extract(epoch from closed_at) * 1000)::bigint) order by status <> 'open', created_at desc), '[]')
  from (select * from public.fco_mkt_orders where user_id = uid and (status = 'open' or closed_at > now() - interval '3 days')
        order by status <> 'open', created_at desc limit 100) s);
end;
$$;

grant execute on function public.fco_mkt_sell(text, jsonb, integer), public.fco_mkt_buy(text, integer, integer, bigint), public.fco_mkt_cancel(bigint),
  public.fco_mkt_claim(), public.fco_mkt_book(integer), public.fco_mkt_depth(integer, integer), public.fco_mkt_mine() to authenticated;
revoke execute on function public.fco_mkt_sell(text, jsonb, integer), public.fco_mkt_buy(text, integer, integer, bigint), public.fco_mkt_cancel(bigint),
  public.fco_mkt_claim(), public.fco_mkt_book(integer), public.fco_mkt_depth(integer, integer), public.fco_mkt_mine() from public, anon;

-- ===== Hệ thống chỉ bán +1, không mua thẳng nữa =====

-- Như 202611130016, chỉ bán thẻ +1.
create or replace function public.fco_inv_buy(p_catalog text, p_player integer, p_level integer, p_count integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  price bigint; fresh jsonb := '[]'; card jsonb; name text; ovr integer;
begin
  if p_count is null or p_count < 1 or p_count > 100 or p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if p_level <> 1 then raise exception 'FCO_SYSTEM_PLUS1' using errcode = 'P0001'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  price := public.fco_inv_price(p_player, p_level);
  if price is null then raise exception 'FCO_NO_PRICE' using errcode = 'P0001'; end if;
  if coalesce((d->>'balance')::bigint, 0) < price * p_count then raise exception 'FCO_NOT_ENOUGH_BP' using errcode = 'P0001'; end if;
  name := public.fco_inv_name(p_player); ovr := public.fco_inv_ovr(p_player, p_level);
  for i in 1 .. p_count loop
    card := public.fco_inv_new_card(p_player, p_level, true);
    fresh := jsonb_build_array(card) || fresh;
    d := public.fco_inv_history(d, 'market', 'Mua · ' || name || ' +' || p_level, 'OVR ' || ovr || ' · Giá ' || public.fco_inv_money(price) || ' BP · −' || public.fco_inv_money(price) || ' BP');
  end loop;
  d := d || jsonb_build_object('cards', fresh || coalesce(d->'cards', '[]'), 'balance', coalesce((d->>'balance')::bigint, 0) - price * p_count);
  return jsonb_build_object('cards', fresh, 'price', price, 'save', public.fco_inv_store(uid, d));
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
