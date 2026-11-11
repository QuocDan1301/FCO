-- Tài khoản Premium (2026-11-11, sau 202611110012):
--   · Có hạn 1 tuần: admin đặt Premium = thêm 7 ngày (đang còn hạn thì cộng dồn từ ngày hết hạn). Hết hạn tự về Classic (mất hiệu ứng tên).
--     Tài khoản đang Premium trước migration này được tính 7 ngày kể từ lúc chạy.
--   · Giảm 65% thuế bán cầu thủ (40% → 14%), KHÔNG cộng dồn với giảm giá khác: bỏ qua gói SVIP Class / Premium trong Shop;
--     phiếu giảm thuế chỉ dùng được khi cho thuế thấp hơn 14% (phiếu 30%: 40 − 30 = 10%), khi đó lấy mức của phiếu thay cho Premium.
--   Khớp src/market.ts (PREMIUM_TAX_DISCOUNT, taxFor) — tests/premium.test.ts.
begin;

alter table public.fco_wallets add column account_tier_until timestamptz;
update public.fco_wallets set account_tier_until = now() + interval '7 days' where account_tier = 'premium';

-- Loại tài khoản đang có hiệu lực: Premium còn hạn, ngược lại Classic.
create function public.fco_account_tier(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select case when w.account_tier = 'premium' and w.account_tier_until > now() then 'premium' else 'classic' end
                   from public.fco_wallets w where w.user_id = p_uid), 'classic')
$$;

-- Như 202611110004: hiệu ứng chỉ hiện khi Premium còn hạn.
create or replace function public.fco_name_effect(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when public.fco_account_tier(w.user_id) = 'premium' then w.name_effect end from public.fco_wallets w where w.user_id = p_uid
$$;

create or replace function public.fco_set_name_effect(p_effect text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  perform public.fco_wallet_lock(uid);
  if p_effect is not null then
    if public.fco_account_tier(uid) <> 'premium' then raise exception 'FCO_PREMIUM_ONLY' using errcode = 'P0001'; end if;
    if p_effect not in ('gold', 'fire', 'ice', 'neon', 'galaxy') then raise exception 'FCO_BAD_EFFECT' using errcode = '22023'; end if;
  end if;
  update public.fco_wallets set name_effect = p_effect, updated_at = now() where user_id = uid;
  return public.fco_wallet_json(uid);
end;
$$;

-- Admin xem (p_tier null) hoặc đặt loại tài khoản. 'premium' = thêm 7 ngày (cộng dồn khi còn hạn); 'classic' = huỷ Premium ngay.
create or replace function public.fco_admin_account_tier(p_user uuid, p_tier text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.fco_wallets;
begin
  perform public.fco_require_admin();
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_tier is not null and p_tier not in ('classic', 'premium') then raise exception 'FCO_BAD_TIER' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(p_user);
  if p_tier = 'premium' then
    update public.fco_wallets set account_tier = 'premium',
      account_tier_until = greatest(coalesce(case when w.account_tier = 'premium' then w.account_tier_until end, now()), now()) + interval '7 days',
      updated_at = now() where user_id = p_user;
  elsif p_tier = 'classic' then
    update public.fco_wallets set account_tier = 'classic', account_tier_until = null, updated_at = now() where user_id = p_user;
  end if;
  select * into w from public.fco_wallets where user_id = p_user;
  return jsonb_build_object('tier', public.fco_account_tier(p_user),
    'until', case when public.fco_account_tier(p_user) = 'premium' then (extract(epoch from w.account_tier_until) * 1000)::bigint end);
end;
$$;

-- Như 202611100013: tài khoản Premium còn hạn trả 35% thuế chung (giảm 65%), không xét gói thành viên Shop (không cộng dồn).
create or replace function public.fco_inv_tax(p_uid uuid, p_rules jsonb) returns double precision language sql stable security definer set search_path = '' as $$
  select case when public.fco_account_tier(p_uid) = 'premium' then (p_rules->>'marketFee')::double precision * (100 - 65) / 100
  else (p_rules->>'marketFee')::double precision * (100 - coalesce((
    select max(v) from (
      select case when w.svip_until > now() then (p_rules->'membership'->>'svip')::double precision end as v from public.fco_wallets w where w.user_id = p_uid
      union all
      select case when w.premium_until > now() then (p_rules->'membership'->>'premium')::double precision end from public.fco_wallets w where w.user_id = p_uid
    ) s), 0)) / 100 end
$$;

-- Như 202611110007, thêm hạn Premium ('tierUntil') và loại tài khoản đang có hiệu lực.
create or replace function public.fco_wallet_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'fc', w.fc,
    'stp', w.stp,
    'dailyClaimed', w.daily is not distinct from public.fco_today(),
    'event', jsonb_build_object(
      'points', w.event_points, 'free', w.event_free,
      'paid', case when w.event_day = public.fco_today() then w.event_paid else 0 end,
      'missions', case when w.event_day = public.fco_today() then to_jsonb(w.event_missions) else '[]'::jsonb end),
    'checkin', case when w.checkin_date = public.fco_today()
      then jsonb_build_object('claimedToday', true, 'day', w.checkin_day, 'done', w.checkin_day)
      else jsonb_build_object('claimedToday', false, 'day', public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today()),
                              'done', public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today()) - 1) end,
    'bilac', jsonb_build_object('points', w.bilac_points, 'claimed', to_jsonb(w.bilac_claimed), 'freeToday', w.bilac_free_day is distinct from public.fco_today()),
    'membership', jsonb_build_object(
      'svip', (extract(epoch from w.svip_until) * 1000)::bigint,
      'premium', (extract(epoch from w.premium_until) * 1000)::bigint),
    'tier', public.fco_account_tier(w.user_id),
    'tierUntil', case when public.fco_account_tier(w.user_id) = 'premium' then (extract(epoch from w.account_tier_until) * 1000)::bigint end,
    'effect', public.fco_name_effect(w.user_id),
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

-- Như 202611110007; Premium dùng phiếu không cộng dồn (xem đầu file).
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
    -- Premium không cộng dồn: thuế = mức thấp hơn giữa thuế Premium và thuế chung trừ phiếu. Phiếu không giảm thêm thì không cho dùng (khỏi mất phiếu).
    if public.fco_account_tier(uid) = 'premium' then
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

revoke all on function public.fco_account_tier(uuid) from public, anon, authenticated;

commit;
