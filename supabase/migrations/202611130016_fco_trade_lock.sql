begin;

-- Khóa giao dịch mùa EL và TSUBASA (2026-11-13, người dùng): thẻ các mùa này không mua / bán được ở TTCN (fco_inv_buy / fco_inv_sell báo
-- FCO_TRADE_LOCKED); vẫn nhận từ gói / sự kiện, đá, đập thẻ bình thường. Game chặn cùng mùa (src/market.ts TRADE_LOCKED_TIERS).
-- Mùa theo khoảng id cầu thủ: EL 4085–4176, TSUBASA 4177–4194. Khóa thêm mùa: insert một dòng. Chạy lại được.

create table if not exists public.fco_trade_locks (
  label text primary key,
  first_id integer not null,
  last_id integer not null check (last_id >= first_id)
);
alter table public.fco_trade_locks enable row level security;
revoke all on public.fco_trade_locks from anon, authenticated;
insert into public.fco_trade_locks (label, first_id, last_id) values ('EL', 4085, 4176), ('TSUBASA', 4177, 4194)
  on conflict (label) do update set first_id = excluded.first_id, last_id = excluded.last_id;

create or replace function public.fco_trade_locked(p_player integer) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fco_trade_locks where p_player between first_id and last_id)
$$;
revoke all on function public.fco_trade_locked(integer) from public, anon, authenticated;

-- Như 202611100013, chặn mùa khóa giao dịch.
create or replace function public.fco_inv_buy(p_catalog text, p_player integer, p_level integer, p_count integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  price bigint; fresh jsonb := '[]'; card jsonb; name text; ovr integer;
begin
  if p_count is null or p_count < 1 or p_count > 100 or p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
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

-- Như 202611120011, chặn mùa khóa giao dịch.
create or replace function public.fco_inv_sell(p_catalog text, p_items jsonb, p_voucher integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  item jsonb; card jsonb; price bigint; asked bigint; band integer := (rules->>'sellBand')::integer; tax double precision := public.fco_inv_tax(uid, rules);
  total bigint := 0; fees bigint := 0; uids text[] := '{}'; n integer; first jsonb; tail text;
begin
  if p_voucher is not null then
    if p_voucher not in (10, 20, 30) then raise exception 'FCO_BAD_VOUCHER' using errcode = '22023'; end if;
    if public.fco_inv_voucher(d, p_voucher) < 1 then raise exception 'FCO_NO_VOUCHER' using errcode = 'P0001'; end if;
    -- Premium / Luxury không cộng dồn: thuế = mức thấp hơn giữa thuế Premium và thuế chung trừ phiếu. Phiếu không giảm thêm thì không cho dùng (khỏi mất phiếu).
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
    if price is null then raise exception 'FCO_NO_PRICE' using errcode = 'P0001'; end if;
    if jsonb_typeof(item->'price') <> 'number' or (item->>'price')::numeric <> floor((item->>'price')::numeric) then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
    asked := (item->>'price')::bigint;
    if asked < ceil(price::double precision * (100 - band) / 100) or asked > floor(price::double precision * (100 + band) / 100) then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
    total := total + asked;
    fees := fees + floor(asked * tax / 100)::bigint;
    first := coalesce(first, card);
  end loop;
  d := d || jsonb_build_object(
    'cards', (select coalesce(jsonb_agg(c order by o), '[]') from jsonb_array_elements(d->'cards') with ordinality x(c, o) where not (c->>'uid' = any(uids))),
    'balance', coalesce((d->>'balance')::bigint, 0) + total - fees);
  tail := 'Phí ' || public.fco_inv_num(tax) || '%' || case when p_voucher is not null then ' (phiếu −' || p_voucher || '%)' else '' end
    || ': ' || public.fco_inv_money(fees) || ' BP · +' || public.fco_inv_money(total - fees) || ' BP';
  d := case when n = 1
    then public.fco_inv_history(d, 'market', 'Bán · ' || public.fco_inv_name((first->>'playerId')::integer) || ' +' || (first->>'level'),
      'OVR ' || public.fco_inv_ovr((first->>'playerId')::integer, (first->>'level')::integer) || ' · Giá ' || public.fco_inv_money(total) || ' BP · ' || tail)
    else public.fco_inv_history(d, 'market', 'Bán hàng loạt · ' || n || ' cầu thủ', 'Tổng giá ' || public.fco_inv_money(total) || ' BP · ' || tail) end;
  return jsonb_build_object('sold', n, 'total', total, 'fees', fees, 'proceeds', total - fees, 'tax', tax, 'save', public.fco_inv_store(uid, d));
end;
$$;

commit;
