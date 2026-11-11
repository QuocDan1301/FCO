-- Star Point (STP) và 4 gói Star Point (2026-11-11, sau 202611110006).
--   · fco_wallets.stp: số STP của người chơi, chỉ máy chủ đổi (sổ cái fco_stp_ledger). Nguồn nhận STP (nhiệm vụ) sẽ thêm sau;
--     hiện admin cộng / trừ bằng fco_admin_credit_stp (Quản trị FC → Tài khoản).
--   · fco_stp_packages: 4 gói Siêu cấp / Cao cấp / Tinh anh / Tân binh. Mua 1 gói nhận ĐỦ mọi vật phẩm trong danh sách:
--     gói cầu thủ {pack,count}, BP {bp}, phiếu giảm thuế {voucher,count}. Giá và vật phẩm phải khớp src/stp.ts (tests/stp.test.ts).
--   · Phiếu giảm giá thuế các mùa 10 / 20 / 30%: nằm trong bản lưu (taxVouchers, phần máy chủ giữ như thẻ / BP / gói),
--     dùng cho một lần bán (fco_inv_sell p_voucher): trừ thẳng số điểm % vào thuế bán, không dưới 0.
--   · Khi máy chủ chưa giữ kho (game chưa bật / chưa đồng bộ) fco_stp_buy chỉ trừ STP, game tự cộng vật phẩm như quà Bi Lắc.
--   Sau khi deploy: admin Đồng bộ dữ liệu ở Kho thẻ (có 20 gói stp-* mới).
begin;

alter table public.fco_wallets add column stp bigint not null default 0 check (stp >= 0);

create table public.fco_stp_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta bigint not null,
  balance bigint not null,
  reason text not null,
  detail jsonb not null default '{}',
  actor uuid,
  created_at timestamptz not null default now()
);
create index fco_stp_ledger_user on public.fco_stp_ledger(user_id, created_at desc);
alter table public.fco_stp_ledger enable row level security;

create table public.fco_stp_packages (
  id text primary key,
  name text not null,
  price bigint not null check (price > 0),
  sort integer not null,
  items jsonb not null
);
alter table public.fco_stp_packages enable row level security;
insert into public.fco_stp_packages(id, name, price, sort, items) values
  ('ultimate', 'Gói STP Siêu cấp', 100, 1, '[{"pack":"stp-u-110","count":1},{"pack":"stp-u-117","count":1},{"pack":"stp-u-hg","count":1},{"pack":"stp-u-111","count":1},{"pack":"stp-u-cum","count":1},{"pack":"stp-u-118","count":1},{"voucher":30,"count":1},{"bp":75000000}]'),
  ('super', 'Gói STP Cao cấp', 50, 2, '[{"pack":"stp-s-110","count":1},{"pack":"stp-s-tp200","count":1},{"pack":"stp-s-118","count":1},{"pack":"stp-s-108","count":1},{"pack":"stp-s-108b","count":1},{"pack":"stp-s-all","count":1},{"pack":"stp-pw-all","count":1},{"voucher":20,"count":1},{"bp":55000000}]'),
  ('challenge', 'Gói STP Tinh anh', 30, 3, '[{"pack":"stp-c-ep120","count":1},{"pack":"stp-c-bld","count":1},{"pack":"stp-c-106","count":1},{"pack":"stp-c-118","count":1},{"voucher":10,"count":1},{"bp":35000000}]'),
  ('rookie', 'Gói STP Tân binh', 15, 4, '[{"pack":"stp-r-wg119","count":1},{"pack":"stp-r-104","count":1},{"pack":"stp-pw-all","count":1},{"pack":"stp-r-ts119","count":1},{"voucher":10,"count":1},{"bp":15000000}]');

-- Cộng / trừ STP kèm một dòng sổ cái (thiếu thì báo FCO_NOT_ENOUGH_STP). Gọi sau fco_wallet_lock.
create function public.fco_apply_stp(p_uid uuid, p_delta bigint, p_reason text, p_detail jsonb default '{}', p_actor uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare b bigint;
begin
  if p_delta = 0 then select stp into b from public.fco_wallets where user_id = p_uid; return b; end if;
  update public.fco_wallets set stp = stp + p_delta, updated_at = now()
  where user_id = p_uid and stp + p_delta >= 0 returning stp into b;
  if not found then raise exception 'FCO_NOT_ENOUGH_STP' using errcode = 'P0001'; end if;
  insert into public.fco_stp_ledger(user_id, delta, balance, reason, detail, actor) values (p_uid, p_delta, b, p_reason, coalesce(p_detail, '{}'), p_actor);
  return b;
end;
$$;

-- Như 202611110004, thêm Star Point.
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
    'tier', w.account_tier,
    'effect', case when w.account_tier = 'premium' then w.name_effect end,
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

-- Số phiếu giảm thuế pct (10 / 20 / 30) trong bản lưu, và đặt lại số phiếu (0 thì bỏ mục đó).
create function public.fco_inv_voucher(p_data jsonb, p_pct integer) returns bigint language sql immutable set search_path = '' as $$
  select coalesce(case when jsonb_typeof(p_data->'taxVouchers'->(p_pct::text)) = 'number' then (p_data->'taxVouchers'->>(p_pct::text))::bigint end, 0)
$$;
create function public.fco_inv_set_voucher(p_data jsonb, p_pct integer, p_count bigint) returns jsonb language sql immutable set search_path = '' as $$
  select p_data || jsonb_build_object('taxVouchers',
    case when p_count > 0 then (case when jsonb_typeof(p_data->'taxVouchers') = 'object' then p_data->'taxVouchers' else '{}'::jsonb end) || jsonb_build_object(p_pct::text, p_count)
         else (case when jsonb_typeof(p_data->'taxVouchers') = 'object' then p_data->'taxVouchers' else '{}'::jsonb end) - (p_pct::text) end)
$$;

-- Như 202611100013, thêm phiếu giảm thuế {voucher, count}.
create or replace function public.fco_inv_grant(p_uid uuid, p_rewards jsonb, p_type text, p_title text, p_detail text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; r jsonb; bp bigint := 0;
begin
  if not public.fco_inv_server_owned(p_uid) then return null; end if;
  d := public.fco_inv_lock(p_uid);
  for r in select value from jsonb_array_elements(coalesce(p_rewards, '[]')) loop
    if r ? 'jackpot' or r ? 'fc' then continue; end if;
    if r ? 'bp' then bp := bp + (r->>'bp')::bigint;
    elsif r ? 'pack' then d := public.fco_inv_set_stock(d, r->>'pack', public.fco_inv_stock(d, r->>'pack') + (r->>'count')::bigint);
    elsif r ? 'voucher' then d := public.fco_inv_set_voucher(d, (r->>'voucher')::integer, public.fco_inv_voucher(d, (r->>'voucher')::integer) + (r->>'count')::bigint);
    end if;
  end loop;
  d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) + bp);
  d := public.fco_inv_history(d, p_type, p_title, p_detail);
  return public.fco_inv_store(p_uid, d);
end;
$$;

-- Như 202611110002, thêm phiếu giảm thuế vào phần máy chủ giữ.
create or replace function public.fco_inv_merge(p_server jsonb, p_client jsonb) returns jsonb language sql stable set search_path = '' as $$
  select p_client - 'fc' - 'stp' || jsonb_build_object(
    'cards', coalesce(p_server->'cards', '[]'),
    'balance', coalesce(p_server->'balance', '0'),
    'unopened', coalesce(p_server->'unopened', '{}'),
    'opened', coalesce(p_server->'opened', '0'),
    'upgrades', coalesce(p_server->'upgrades', '0'),
    'taxVouchers', case when jsonb_typeof(p_server->'taxVouchers') = 'object' then p_server->'taxVouchers' else '{}'::jsonb end,
    'history', coalesce((
      select jsonb_agg(e order by t desc, k)
      from (
        select e, t, k from (
          select distinct on (e->>'id') e, coalesce((e->>'time')::double precision, 0) as t, e->>'id' as k
          from (
            select e, 0 as src from jsonb_array_elements(case when jsonb_typeof(p_server->'history') = 'array' then p_server->'history' else '[]'::jsonb end) e
            union all
            select e, 1 from jsonb_array_elements(case when jsonb_typeof(p_client->'history') = 'array' then p_client->'history' else '[]'::jsonb end) e
          ) u where jsonb_typeof(e) = 'object'
          order by e->>'id', src
        ) d order by t desc, k limit 200
      ) top), '[]'))
  || case when jsonb_typeof(p_server->'profile') = 'object' or jsonb_typeof(p_client->'profile') = 'object'
       then jsonb_build_object('profile',
         (case when jsonb_typeof(p_client->'profile') = 'object' then p_client->'profile' else '{}'::jsonb end)
         || (case when jsonb_typeof(p_server->'profile') = 'object' then jsonb_strip_nulls(p_server->'profile') else '{}'::jsonb end))
       else '{}'::jsonb end
$$;
revoke all on function public.fco_inv_merge(jsonb, jsonb) from public, anon, authenticated;

-- Như 202611100013; tài khoản mới khi đã bắt buộc cũng bắt đầu không có phiếu giảm thuế. Bỏ "stp" như "fc" (ví máy chủ giữ).
create or replace function public.fco_commit_save(p_data jsonb, p_revision bigint, p_merge boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := public.fco_require_account();
  saved public.fco_game_saves;
  previous jsonb;
  merge boolean := coalesce(p_merge, false) or coalesce((select enforced from public.fco_inventory where id = 1), false);
begin
  if p_revision is null or p_revision < 0 or p_data is null or jsonb_typeof(p_data) <> 'object'
    or p_data->>'version' is distinct from '1' or jsonb_typeof(p_data->'cards') is distinct from 'array'
    or octet_length(p_data::text) > 10000000 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  p_data := p_data - 'fc' - 'stp';
  if merge then
    select data into previous from public.fco_game_saves where user_id = owner_id for update;
    if found then
      p_data := public.fco_inv_merge(previous, p_data);
      update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now() where user_id = owner_id returning * into saved;
    else
      if coalesce((select enforced from public.fco_inventory where id = 1), false) then
        p_data := p_data || '{"cards": [], "balance": 0, "unopened": {}, "opened": 0, "upgrades": 0, "taxVouchers": {}}'::jsonb;
      end if;
      insert into public.fco_game_saves(user_id, revision, data) values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
    end if;
  elsif p_revision = 0 then
    insert into public.fco_game_saves(user_id, revision, data)
    values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
  else
    select data into previous from public.fco_game_saves where user_id = owner_id and revision = p_revision for update;
    update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'FCO_SAVE_CONFLICT' using errcode = 'P0001'; end if;
  perform public.fco_audit_save(owner_id, saved.revision, previous, saved.data);
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$$;

-- Như 202611100013, thêm p_voucher: phiếu giảm thuế 10 / 20 / 30 cho cả lượt bán này (trừ thẳng điểm %, không dưới 0), bớt 1 phiếu.
drop function public.fco_inv_sell(text, jsonb);
create function public.fco_inv_sell(p_catalog text, p_items jsonb, p_voucher integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  item jsonb; card jsonb; price bigint; asked bigint; band integer := (rules->>'sellBand')::integer; tax double precision := public.fco_inv_tax(uid, rules);
  total bigint := 0; fees bigint := 0; uids text[] := '{}'; n integer; first jsonb; tail text;
begin
  if p_voucher is not null then
    if p_voucher not in (10, 20, 30) then raise exception 'FCO_BAD_VOUCHER' using errcode = '22023'; end if;
    if public.fco_inv_voucher(d, p_voucher) < 1 then raise exception 'FCO_NO_VOUCHER' using errcode = 'P0001'; end if;
    tax := greatest(0, tax - p_voucher);
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

-- Mua một gói Star Point: trừ giá STP (máy chủ lấy giá, không nhận từ trình duyệt), cộng mọi vật phẩm vào kho khi máy chủ giữ kho
-- (save trong kết quả); ngược lại save = null và game tự cộng 'items'. Lịch sử loại 'gift' (kiểm tra bất thường nhận cả BP lẫn gói tăng),
-- đúng chữ như stpHistoryTitle / stpHistoryDetail trong src/stp.ts.
create function public.fco_stp_buy(p_package text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); pkg public.fco_stp_packages; save jsonb;
  packs bigint; bp bigint; vouchers text; detail text;
begin
  select * into pkg from public.fco_stp_packages where id = p_package;
  if not found then raise exception 'FCO_STP_PACKAGE' using errcode = '22023'; end if;
  -- Khoá ví trước bản lưu (cùng thứ tự với Shop / Bi Lắc).
  perform public.fco_wallet_lock(uid);
  perform public.fco_apply_stp(uid, -pkg.price, 'shop', jsonb_build_object('package', pkg.id));
  select coalesce(sum((r->>'count')::bigint), 0) into packs from jsonb_array_elements(pkg.items) r where r ? 'pack';
  select coalesce(sum((r->>'bp')::bigint), 0) into bp from jsonb_array_elements(pkg.items) r where r ? 'bp';
  select string_agg((r->>'count') || ' phiếu giảm thuế ' || (r->>'voucher') || '%', ', ' order by o) into vouchers
    from jsonb_array_elements(pkg.items) with ordinality x(r, o) where r ? 'voucher';
  detail := concat_ws(', ', case when packs > 0 then packs || ' gói cầu thủ' end, vouchers, case when bp > 0 then public.fco_inv_money(bp) || ' BP' end)
    || ' · −' || public.fco_inv_money(pkg.price) || ' STP';
  save := public.fco_inv_grant(uid, pkg.items, 'gift', 'Mua ' || pkg.name, detail);
  return jsonb_build_object('wallet', public.fco_wallet_json(uid), 'save', save, 'items', pkg.items);
end;
$$;

-- Admin cộng / trừ STP cho một tài khoản (tên đăng nhập hoặc email).
create function public.fco_admin_credit_stp(p_login text, p_amount bigint, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); login text := lower(trim(coalesce(p_login, ''))); target uuid; b bigint;
begin
  if login = '' then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
  select id into target from auth.users where lower(email) = case when position('@' in login) > 0 then login else login || '@players.fco.invalid' end;
  if target is null then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(target);
  b := public.fco_apply_stp(target, p_amount, 'admin', jsonb_build_object('note', left(coalesce(p_note, ''), 200)), admin_id);
  return jsonb_build_object('login', login, 'stp', b);
end;
$$;

revoke all on function
  public.fco_apply_stp(uuid, bigint, text, jsonb, uuid), public.fco_inv_voucher(jsonb, integer), public.fco_inv_set_voucher(jsonb, integer, bigint),
  public.fco_inv_sell(text, jsonb, integer), public.fco_stp_buy(text), public.fco_admin_credit_stp(text, bigint, text)
from public, anon, authenticated;
grant execute on function public.fco_inv_sell(text, jsonb, integer), public.fco_stp_buy(text), public.fco_admin_credit_stp(text, bigint, text) to authenticated;

commit;
