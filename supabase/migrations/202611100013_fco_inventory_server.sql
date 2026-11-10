-- Kho thẻ do máy chủ giữ (2026-11-10, chống gian lận đập thẻ / mở gói / BP). Chạy sau 202611100012.
--   Bản lưu vẫn nằm ở fco_game_saves.data, nhưng 5 phần "được bảo vệ" chỉ máy chủ được đổi: cards, balance (BP), unopened (gói chưa mở),
--   opened, upgrades. Máy chủ mở gói, đập thẻ, mua / bán, mua gói Shop, xoá thẻ và cộng quà (Bi Lắc, gift code, điểm danh, admin tặng)
--   qua các hàm fco_inv_* bên dưới; trình duyệt chỉ gửi cài đặt, đội hình, khoá thẻ… (fco_commit_save gộp, giữ nguyên phần được bảo vệ).
--   Lịch sử (history) gộp theo id từ cả hai phía, không mất dòng nào.
--   Dữ liệu cầu thủ / giá / gói / luật đập do game gửi lên (admin bấm Đồng bộ ở Quản trị FC, src/inventory-catalog.ts) vào fco_cat_*;
--   mỗi thao tác gửi kèm mã phiên bản dữ liệu, khác bản đã đồng bộ thì báo FCO_CATALOG_STALE.
--   Bật dần: chạy migration này → deploy game → admin Đồng bộ → admin bật "Bắt buộc" (fco_inventory.enforced).
--   Trước khi bật, game bản mới chỉ dùng máy chủ khi mã dữ liệu khớp và tự đánh dấu bản lưu inv = 1; game bản cũ chạy như trước.
begin;

create table public.fco_inventory (
  id integer primary key default 1 check (id = 1),
  enforced boolean not null default false,
  version text,
  rules jsonb,
  synced_at timestamptz,
  synced_by uuid references auth.users(id) on delete set null,
  staging text
);
insert into public.fco_inventory(id) values (1);

create table public.fco_cat_players (
  id integer primary key,
  name text not null,
  ovrs integer[] not null,
  prices bigint[] not null,
  fixed boolean not null,
  insurance double precision not null
);
create table public.fco_cat_packs (
  id text primary key,
  name text not null,
  label text not null,
  price bigint not null,
  shop boolean not null,
  choose boolean not null,
  available boolean not null,
  players integer[] not null,
  weights double precision[] not null,
  levels integer[] not null,
  level_weights double precision[] not null,
  draft integer[] not null,
  draft_size integer not null,
  draft_level integer not null
);
create table public.fco_cat_players_next (like public.fco_cat_players including all);
create table public.fco_cat_packs_next (like public.fco_cat_packs including all);
alter table public.fco_inventory enable row level security;
alter table public.fco_cat_players enable row level security;
alter table public.fco_cat_packs enable row level security;
alter table public.fco_cat_players_next enable row level security;
alter table public.fco_cat_packs_next enable row level security;
revoke all on public.fco_inventory, public.fco_cat_players, public.fco_cat_packs, public.fco_cat_players_next, public.fco_cat_packs_next from public, anon, authenticated;

-- ===== Hàm nội bộ =====

create function public.fco_now_ms() returns bigint language sql stable set search_path = '' as $$
  select (extract(epoch from now()) * 1000)::bigint
$$;

-- Số kiểu money() của game: 1.234 / 12.5M / 1.25B.
create function public.fco_inv_short(p numeric) returns text language sql immutable set search_path = '' as $$
  select rtrim(rtrim(round(p, 2)::text, '0'), '.')
$$;
create function public.fco_inv_money(p_n bigint) returns text language sql immutable set search_path = '' as $$
  select case when abs(p_n) >= 1000000000 then public.fco_inv_short(p_n / 1000000000.0) || 'B'
              when abs(p_n) >= 1000000 then public.fco_inv_short(p_n / 1000000.0) || 'M'
              else regexp_replace(p_n::text, '(\d)(?=(\d{3})+$)', '\1.', 'g') end
$$;
-- Số thực gọn: 28 / 2.5.
create function public.fco_inv_num(p double precision) returns text language sql immutable set search_path = '' as $$
  select case when p = floor(p) then (p::bigint)::text else rtrim(rtrim(round(p::numeric, 6)::text, '0'), '.') end
$$;

-- Nhân 32 bit như Math.imul (trên số không dấu 0…2^32−1).
create function public.fco_u32_mul(a bigint, b bigint) returns bigint language sql immutable set search_path = '' as $$
  select ((a * (b & 65535)) + (((a * (b >> 16)) & 65535) << 16)) & 4294967295
$$;
-- Độ lệch giá −1…1 của một thẻ ở một kỳ: đúng priceSwing trong src/market.ts.
create function public.fco_inv_swing(p_player bigint, p_level bigint, p_period bigint) returns double precision language plpgsql immutable set search_path = '' as $$
declare h bigint := 2166136261; v bigint;
begin
  foreach v in array array[p_player, p_level, p_period] loop
    h := public.fco_u32_mul(h # (v & 4294967295), 1540483477);
    h := h # (h >> 15);
  end loop;
  h := public.fco_u32_mul(h # (h >> 13), 3266489909);
  return (h # (h >> 16))::double precision / 2147483647 - 1;
end;
$$;
-- Giá dao động quanh giá chuẩn, giữ 3 chữ số có nghĩa, không ra ngoài biên ±swing%: đúng swungPrice trong src/market.ts.
create function public.fco_inv_swung(p_base bigint, p_swing double precision, p_percent integer) returns bigint language plpgsql immutable set search_path = '' as $$
declare b double precision := p_base; lo double precision; hi double precision; raw double precision; unit double precision; digits integer;
begin
  lo := ceil(b * (100 - p_percent) / 100);
  hi := floor(b * (100 + p_percent) / 100);
  raw := b * (1 + p_swing * p_percent / 100);
  digits := length(floor(raw)::bigint::text) - 1;
  unit := power(10::double precision, greatest(0, digits - 2));
  return least(hi, greatest(lo, floor(raw / unit + 0.5) * unit))::bigint;
end;
$$;

create function public.fco_inv_rules() returns jsonb language sql stable security definer set search_path = '' as $$
  select rules from public.fco_inventory where id = 1
$$;

-- Giá thẻ lúc p_at (mặc định bây giờ), null = chưa có giá: đúng priceAt trong src/market.ts.
create function public.fco_inv_price(p_player integer, p_level integer, p_at timestamptz default now()) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb := public.fco_inv_rules(); p public.fco_cat_players; base bigint; period bigint;
begin
  select * into p from public.fco_cat_players where id = p_player;
  if not found or p_level < 1 or p_level > coalesce(array_length(p.prices, 1), 0) then return null; end if;
  base := p.prices[p_level];
  if base is null or base = 0 or base = (r->>'flatPrice')::bigint or p.fixed then return base; end if;
  period := floor(((extract(epoch from p_at) * 1000) - (r->>'priceEpoch')::double precision) / (r->>'pricePeriodMs')::double precision);
  return public.fco_inv_swung(base, public.fco_inv_swing(p_player, p_level, period), (r->>'priceSwing')::integer);
end;
$$;

create function public.fco_inv_ovr(p_player integer, p_level integer) returns integer language sql stable security definer set search_path = '' as $$
  select ovrs[p_level] from public.fco_cat_players where id = p_player
$$;
create function public.fco_inv_name(p_player integer) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select name from public.fco_cat_players where id = p_player), '#' || p_player)
$$;

-- Chọn theo trọng số (chỉ số 1…n).
create function public.fco_inv_pick(p_weights double precision[]) returns integer language plpgsql volatile set search_path = '' as $$
declare total double precision := 0; acc double precision := 0; r double precision; n integer := coalesce(array_length(p_weights, 1), 0);
begin
  if n = 0 then raise exception 'FCO_PACK_EMPTY' using errcode = 'P0001'; end if;
  for i in 1 .. n loop total := total + p_weights[i]; end loop;
  r := random() * total;
  for i in 1 .. n loop acc := acc + p_weights[i]; if r < acc then return i; end if; end loop;
  return n;
end;
$$;

-- Bộ dữ liệu đã đồng bộ và khớp mã phiên bản game gửi: trả về luật.
create function public.fco_inv_check(p_catalog text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.fco_inventory;
begin
  select * into c from public.fco_inventory where id = 1;
  if c.version is null then raise exception 'FCO_CATALOG_MISSING' using errcode = 'P0001'; end if;
  if p_catalog is distinct from c.version then raise exception 'FCO_CATALOG_STALE' using errcode = 'P0001'; end if;
  return c.rules;
end;
$$;

create function public.fco_inv_lock(p_uid uuid) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb;
begin
  select data into d from public.fco_game_saves where user_id = p_uid for update;
  if not found then raise exception 'FCO_NO_SAVE' using errcode = 'P0001'; end if;
  return d;
end;
$$;
create function public.fco_inv_store(p_uid uuid, p_data jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare rev bigint; d jsonb;
begin
  update public.fco_game_saves set data = p_data - 'fc', revision = revision + 1, updated_at = now() where user_id = p_uid returning revision, data into rev, d;
  return jsonb_build_object('revision', rev, 'data', d);
end;
$$;

-- Thêm một dòng lịch sử lên đầu (giữ 200 dòng như game).
create function public.fco_inv_history(p_data jsonb, p_type text, p_title text, p_detail text, p_success boolean default null) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare entry jsonb := jsonb_build_object('id', gen_random_uuid()::text, 'time', public.fco_now_ms(), 'type', p_type, 'title', p_title, 'detail', p_detail)
  || case when p_success is null then '{}'::jsonb else jsonb_build_object('success', p_success) end;
  merged jsonb;
begin
  select coalesce(jsonb_agg(e order by o), '[]') into merged from (
    select entry as e, 0::bigint as o
    union all
    select x.e, x.o from jsonb_array_elements(case when jsonb_typeof(p_data->'history') = 'array' then p_data->'history' else '[]'::jsonb end) with ordinality x(e, o) where x.o < 200
  ) s;
  return jsonb_set(p_data, '{history}', merged);
end;
$$;

create function public.fco_inv_stock(p_data jsonb, p_pack text) returns bigint language sql immutable set search_path = '' as $$
  select coalesce(case when jsonb_typeof(p_data->'unopened'->p_pack) = 'number' then (p_data->'unopened'->>p_pack)::bigint end, 0)
$$;
create function public.fco_inv_set_stock(p_data jsonb, p_pack text, p_count bigint) returns jsonb language sql immutable set search_path = '' as $$
  select p_data || jsonb_build_object('unopened', (case when jsonb_typeof(p_data->'unopened') = 'object' then p_data->'unopened' else '{}'::jsonb end) || jsonb_build_object(p_pack, p_count))
$$;
create function public.fco_inv_card(p_data jsonb, p_uid text) returns jsonb language sql immutable set search_path = '' as $$
  select c from jsonb_array_elements(case when jsonb_typeof(p_data->'cards') = 'array' then p_data->'cards' else '[]'::jsonb end) c where c->>'uid' = p_uid limit 1
$$;
create function public.fco_inv_locked(p_data jsonb, p_uid text) returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_data->'locked') = 'array' and (p_data->'locked') ? p_uid
$$;
create function public.fco_inv_new_card(p_player integer, p_level integer, p_market boolean default false) returns jsonb language sql volatile set search_path = '' as $$
  select jsonb_build_object('uid', gen_random_uuid()::text, 'playerId', p_player, 'level', p_level, 'received', public.fco_now_ms())
    || case when p_market then '{"fromMarket": true}'::jsonb else '{}'::jsonb end
$$;
-- Thẻ tốt nhất trong danh sách (OVR cao nhất, bằng thì thẻ đứng trước): "Tên +cấp · OVR n".
create function public.fco_inv_best(p_cards jsonb) returns text language sql stable security definer set search_path = '' as $$
  select public.fco_inv_name((c->>'playerId')::integer) || ' +' || (c->>'level') || ' · OVR ' || public.fco_inv_ovr((c->>'playerId')::integer, (c->>'level')::integer)
  from jsonb_array_elements(p_cards) with ordinality x(c, o)
  order by public.fco_inv_ovr((c->>'playerId')::integer, (c->>'level')::integer) desc, o limit 1
$$;

-- Máy chủ giữ kho của tài khoản này: đã bật bắt buộc, hoặc game bản mới đã đánh dấu inv = 1 trong bản lưu.
create function public.fco_inv_server_owned(p_uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enforced from public.fco_inventory where id = 1), false)
      or coalesce((select data->>'inv' = '1' from public.fco_game_saves where user_id = p_uid), false)
$$;

-- Tóm tắt quà như game: Giải Đặc Biệt / Giải Phụ, gói (x n), FC, BP.
create function public.fco_inv_reward_text(p_rewards jsonb) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(t, ', ' order by k, n), '') from (
    select 0 as k, 0 as n, case when r->>'jackpot' = 'special' then 'Giải Đặc Biệt' else 'Giải Phụ' end || coalesce(' ' || public.fco_inv_money((r->>'fc')::bigint) || ' FC', '') as t
      from jsonb_array_elements(p_rewards) r where r ? 'jackpot'
    union all
    select 1, min(o), coalesce((select name from public.fco_cat_packs where id = p), p) || case when sum(c) > 1 then ' x ' || sum(c) else '' end
      from (select r->>'pack' as p, (r->>'count')::bigint as c, o from jsonb_array_elements(p_rewards) with ordinality x(r, o) where r ? 'pack') s group by p
    union all
    select 2, 0, public.fco_inv_money(sum((r->>'fc')::bigint)::bigint) || ' FC' from jsonb_array_elements(p_rewards) r where r ? 'fc' and not r ? 'jackpot' having count(*) > 0
    union all
    select 3, 0, public.fco_inv_money(sum((r->>'bp')::bigint)::bigint) || ' BP' from jsonb_array_elements(p_rewards) r where r ? 'bp' having count(*) > 0
  ) parts
$$;

-- Cộng BP / gói của quà vào kho (FC và jackpot máy chủ đã cộng vào ví) kèm một dòng lịch sử.
-- Chỉ khi máy chủ giữ kho (fco_inv_server_owned); ngược lại trả null để game bản cũ tự cộng như trước.
create function public.fco_inv_grant(p_uid uuid, p_rewards jsonb, p_type text, p_title text, p_detail text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; r jsonb; bp bigint := 0;
begin
  if not public.fco_inv_server_owned(p_uid) then return null; end if;
  d := public.fco_inv_lock(p_uid);
  for r in select value from jsonb_array_elements(coalesce(p_rewards, '[]')) loop
    if r ? 'jackpot' or r ? 'fc' then continue; end if;
    if r ? 'bp' then bp := bp + (r->>'bp')::bigint;
    elsif r ? 'pack' then d := public.fco_inv_set_stock(d, r->>'pack', public.fco_inv_stock(d, r->>'pack') + (r->>'count')::bigint);
    end if;
  end loop;
  d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) + bp);
  d := public.fco_inv_history(d, p_type, p_title, p_detail);
  return public.fco_inv_store(p_uid, d);
end;
$$;

-- ===== Thao tác của người chơi =====

-- Mở gói. p_count có giá trị: mở đúng p_count gói của gói duy nhất trong p_packs (thiếu thì báo lỗi).
-- p_count null: mở hết các gói đã chọn trong kho, tối đa maxOpen thẻ một lượt (như openSelectedPacks; bỏ gói chỉ định / gói hỏng).
-- Mỗi thẻ: chọn cầu thủ theo tỷ lệ gói rồi chọn cấp, đúng packOdds trong game.
create function public.fco_inv_open(p_catalog text, p_packs text[], p_count integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  max_open integer := (rules->>'maxOpen')::integer; pk public.fco_cat_packs; pack_id text; seen text[] := '{}';
  stock bigint; n integer; total integer := 0; fresh jsonb; all_cards jsonb := '[]'; first_pack text; card jsonb;
begin
  if p_packs is null or coalesce(array_length(p_packs, 1), 0) = 0 then raise exception 'FCO_NO_PACKS' using errcode = 'P0001'; end if;
  if p_count is not null and (array_length(p_packs, 1) <> 1 or p_count < 1 or p_count > max_open) then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  foreach pack_id in array p_packs loop
    exit when total >= max_open;
    continue when pack_id = any(seen);
    seen := seen || pack_id;
    select * into pk from public.fco_cat_packs where id = pack_id;
    if not found or not pk.available then
      if p_count is not null then raise exception 'FCO_PACK_UNAVAILABLE' using errcode = 'P0001'; end if;
      continue;
    end if;
    if pk.choose then
      if p_count is not null then raise exception 'FCO_CHOOSE_PACK' using errcode = 'P0001'; end if;
      continue;
    end if;
    stock := public.fco_inv_stock(d, pack_id);
    if p_count is not null then
      if p_count > stock then raise exception 'FCO_NOT_ENOUGH_PACKS' using errcode = 'P0001'; end if;
      n := p_count;
    else n := least(stock, max_open - total); end if;
    continue when n < 1;
    fresh := '[]';
    for i in 1 .. n loop
      card := public.fco_inv_new_card(pk.players[public.fco_inv_pick(pk.weights)], pk.levels[public.fco_inv_pick(pk.level_weights)]);
      fresh := fresh || jsonb_build_array(card);
    end loop;
    d := public.fco_inv_set_stock(d, pack_id, stock - n);
    d := d || jsonb_build_object('cards', fresh || coalesce(d->'cards', '[]'), 'opened', coalesce((d->>'opened')::bigint, 0) + n);
    d := public.fco_inv_history(d, 'pack', 'Mở ' || n || ' ' || pk.label, public.fco_inv_best(fresh));
    all_cards := all_cards || fresh;
    total := total + n;
    first_pack := coalesce(first_pack, pack_id);
  end loop;
  if total = 0 then raise exception 'FCO_NO_PACKS' using errcode = 'P0001'; end if;
  return jsonb_build_object('cards', all_cards, 'pack', first_pack, 'save', public.fco_inv_store(uid, d));
end;
$$;

-- Gói chỉ định: người chơi chọn đúng draft_size cầu thủ trong danh sách của gói; mỗi gói nhận ngẫu nhiên 1 người, cùng cấp của gói.
create function public.fco_inv_open_draft(p_catalog text, p_pack text, p_players integer[], p_count integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  pk public.fco_cat_packs; stock bigint; fresh jsonb := '[]'; best text; size integer;
begin
  select * into pk from public.fco_cat_packs where id = p_pack;
  if not found or not pk.available then raise exception 'FCO_PACK_UNAVAILABLE' using errcode = 'P0001'; end if;
  if not pk.choose then raise exception 'FCO_NOT_CHOOSE_PACK' using errcode = 'P0001'; end if;
  if p_count is null or p_count < 1 or p_count > (rules->>'maxOpen')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  stock := public.fco_inv_stock(d, p_pack);
  if p_count > stock then raise exception 'FCO_NOT_ENOUGH_PACKS' using errcode = 'P0001'; end if;
  size := pk.draft_size;
  if coalesce(array_length(p_players, 1), 0) <> size or (select count(distinct x) from unnest(p_players) x) <> size
     or exists (select 1 from unnest(p_players) x where not x = any(pk.draft)) then
    raise exception 'FCO_BAD_DRAFT' using errcode = 'P0001';
  end if;
  for i in 1 .. p_count loop
    fresh := fresh || jsonb_build_array(public.fco_inv_new_card(p_players[1 + least(size - 1, floor(random() * size)::integer)], pk.draft_level));
  end loop;
  best := public.fco_inv_best(fresh);
  d := public.fco_inv_set_stock(d, p_pack, stock - p_count);
  d := d || jsonb_build_object('cards', fresh || coalesce(d->'cards', '[]'), 'opened', coalesce((d->>'opened')::bigint, 0) + p_count);
  d := public.fco_inv_history(d, 'pack', case when p_count > 1 then 'Mở ' || p_count || ' ' || pk.label else 'Mở ' || pk.name end,
    case when p_count > 1 then 'Tốt nhất: ' else '' end || best || ' · Ngẫu nhiên 1 trong ' || size || ' cầu thủ đã chọn' || case when p_count > 1 then ' mỗi gói' else '' end);
  return jsonb_build_object('cards', fresh, 'pack', p_pack, 'save', public.fco_inv_store(uid, d));
end;
$$;

-- Số vạch một phôi theo chênh OVR (phôi − thẻ chính): đúng materialGauge trong src/game.ts (OVR là số nguyên).
create function public.fco_inv_gauge(p_rules jsonb, p_target integer, p_material integer) returns double precision language plpgsql immutable set search_path = '' as $$
declare diff integer := p_material - p_target; below integer; n integer := jsonb_array_length(p_rules->'gaugeBelow');
begin
  if diff >= 0 then
    return least(5, round((case when diff <= 10 then 1 + diff * (p_rules->>'gaugeStep')::numeric else 2.5 + (diff - 10) * 0.5 end), 3)::double precision);
  end if;
  below := least(-diff, n - 1);
  return round((p_rules->'gaugeBelow'->>below)::numeric, 3)::double precision;
end;
$$;

-- Đập thẻ: năng lượng phôi → tỷ lệ (đúng upgradeInfo) → roll thành công / mức rớt (dropWeights) → bảo vệ (thẻ từ protectMin, phí theo
-- giá thẻ × tỷ lệ bảo hiểm × mức %) → khôi phục (thẻ từ restoreMin, chỉ phôi bản sao). Như upgradeWithProtection trong game.
create function public.fco_inv_upgrade(p_catalog text, p_target text, p_materials text[], p_protect integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  target jsonb; mat jsonb; m text; t_player integer; t_level integer; t_ovr integer; max_level integer := (rules->>'maxLevel')::integer;
  total double precision := 0; energy double precision; base double precision; chance double precision; rate double precision;
  pct integer := coalesce(p_protect, 0); price bigint; cost bigint := 0; power double precision := 0; keep integer := 1; restore_chance integer := 0;
  success boolean; drop_to integer; shielded boolean := false; restored integer; new_level integer; weights jsonb; left_w double precision; w jsonb;
  transition text; name text; result jsonb; cards jsonb;
begin
  target := public.fco_inv_card(d, p_target);
  if target is null or (target->>'level')::integer >= max_level then raise exception 'FCO_BAD_TARGET' using errcode = 'P0001'; end if;
  if p_materials is null or coalesce(array_length(p_materials, 1), 0) not between 1 and 5
     or (select count(distinct x) from unnest(p_materials) x) <> array_length(p_materials, 1) or p_target = any(p_materials) then
    raise exception 'FCO_BAD_MATERIALS' using errcode = 'P0001';
  end if;
  t_player := (target->>'playerId')::integer; t_level := (target->>'level')::integer; t_ovr := public.fco_inv_ovr(t_player, t_level);
  if t_ovr is null then raise exception 'FCO_UNKNOWN_PLAYER' using errcode = 'P0001'; end if;
  foreach m in array p_materials loop
    mat := public.fco_inv_card(d, m);
    if mat is null then raise exception 'FCO_MATERIAL_MISSING' using errcode = 'P0001'; end if;
    if public.fco_inv_locked(d, m) then raise exception 'FCO_MATERIAL_LOCKED' using errcode = 'P0001'; end if;
    total := total + floor(public.fco_inv_gauge(rules, t_ovr, public.fco_inv_ovr((mat->>'playerId')::integer, (mat->>'level')::integer)) * 200 + 0.5) / 10;
    -- Khôi phục: chỉ phôi cùng mã cầu thủ (cùng mùa) đóng góp.
    if t_level >= (rules->>'restoreMin')::integer and (mat->>'playerId')::integer = t_player then
      if (mat->>'level')::integer >= t_level then power := power + 1; keep := greatest(keep, t_level);
      elsif (mat->>'level')::integer = t_level - 1 then power := power + .85; keep := greatest(keep, t_level);
      else power := power + case when (mat->>'level')::integer >= 3 then .5 else .2 end; keep := greatest(keep, (rules->>'restoreMin')::integer); end if;
    end if;
  end loop;
  energy := floor(least(100, total) * 10 + 0.5) / 10;
  base := (rules->'chances'->>t_level)::double precision;
  chance := floor(base * energy + 0.5) / 100;
  rate := least(100, floor(chance * 1000 + 0.5) / 1000);
  restore_chance := least(100, floor(power * 100 + 0.5)::integer);
  if pct > 0 then
    if pct > 100 or pct % 10 <> 0 then raise exception 'FCO_BAD_PROTECTION' using errcode = '22023'; end if;
    if t_level < (rules->>'protectMin')::integer then raise exception 'FCO_PROTECTION_LEVEL' using errcode = 'P0001'; end if;
    price := public.fco_inv_price(t_player, t_level);
    if price is null then raise exception 'FCO_NO_PRICE' using errcode = 'P0001'; end if;
    cost := floor(floor(price * (select insurance from public.fco_cat_players where id = t_player) + 0.5) * pct / 100 + 0.5)::bigint;
    if coalesce((d->>'balance')::bigint, 0) < cost then raise exception 'FCO_NOT_ENOUGH_BP' using errcode = 'P0001'; end if;
  end if;
  success := random() * 100 < rate;
  if not success then
    weights := coalesce(rules->'dropWeights'->(t_level::text), '[[1, 100]]'::jsonb);
    left_w := random() * (select sum((x->>1)::double precision) from jsonb_array_elements(weights) x);
    for w in select value from jsonb_array_elements(weights) loop
      drop_to := (w->>0)::integer;
      exit when left_w < (w->>1)::double precision;
      left_w := left_w - (w->>1)::double precision;
    end loop;
    shielded := pct > 0 and random() * 100 < pct;
    if not shielded and restore_chance > 0 and random() * 100 < restore_chance and keep > drop_to then restored := keep; end if;
  end if;
  new_level := case when success then t_level + 1 when shielded then t_level else coalesce(restored, drop_to) end;
  select coalesce(jsonb_agg(case when c->>'uid' = p_target then jsonb_set(c, '{level}', to_jsonb(new_level)) else c end order by o), '[]') into cards
    from jsonb_array_elements(d->'cards') with ordinality x(c, o) where not (c->>'uid' = any(p_materials));
  name := public.fco_inv_name(t_player);
  transition := case when shielded then '+' || t_level || ' → giữ nguyên +' || t_level || ' · Bảo vệ nâng cấp'
                     when restored is not null then '+' || t_level || ' → +' || drop_to || ' → +' || new_level || ' · Khôi phục cấp thẻ'
                     else '+' || t_level || ' → +' || new_level end;
  d := d || jsonb_build_object('cards', cards, 'balance', coalesce((d->>'balance')::bigint, 0) - cost, 'upgrades', coalesce((d->>'upgrades')::bigint, 0) + 1);
  d := public.fco_inv_history(d, 'upgrade', case when success then 'Thành công · ' else 'Thất bại · ' end || name,
    transition || ' · ' || array_length(p_materials, 1) || ' nguyên liệu' || case when pct > 0 then ' · Bảo vệ ' || pct || '%' else '' end
    || case when cost > 0 then ' · −' || public.fco_inv_money(cost) || ' BP' else '' end, success);
  if success then
    insert into public.fco_ranks as r (user_id, best_ovr, best_player, best_level, best_at)
    values (uid, public.fco_inv_ovr(t_player, new_level), t_player, new_level, now())
    on conflict (user_id) do update set best_ovr = excluded.best_ovr, best_player = excluded.best_player, best_level = excluded.best_level, best_at = excluded.best_at
    where excluded.best_ovr > r.best_ovr;
  end if;
  result := jsonb_build_object('success', success, 'card', jsonb_set(target, '{level}', to_jsonb(new_level)), 'before', t_level,
    'drop', case when success then null else drop_to end, 'restored', restored, 'shielded', shielded, 'cost', cost, 'rate', rate, 'energy', energy,
    'restoreChance', restore_chance, 'keep', keep);
  return result || jsonb_build_object('save', public.fco_inv_store(uid, d));
end;
$$;

-- Thuế bán (%) của tài khoản: thuế chung, giảm theo gói thành viên còn hạn (gói giảm nhiều nhất).
create function public.fco_inv_tax(p_uid uuid, p_rules jsonb) returns double precision language sql stable security definer set search_path = '' as $$
  select (p_rules->>'marketFee')::double precision * (100 - coalesce((
    select max(v) from (
      select case when w.svip_until > now() then (p_rules->'membership'->>'svip')::double precision end as v from public.fco_wallets w where w.user_id = p_uid
      union all
      select case when w.premium_until > now() then (p_rules->'membership'->>'premium')::double precision end from public.fco_wallets w where w.user_id = p_uid
    ) s), 0)) / 100
$$;

-- Bán: mỗi thẻ một giá tự đặt trong ±sellBand% quanh giá thị trường, trừ thuế từng thẻ (sellCards trong src/market.ts).
create function public.fco_inv_sell(p_catalog text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  item jsonb; card jsonb; price bigint; asked bigint; band integer := (rules->>'sellBand')::integer; tax double precision := public.fco_inv_tax(uid, rules);
  total bigint := 0; fees bigint := 0; uids text[] := '{}'; n integer; first jsonb; tail text;
begin
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
  tail := 'Phí ' || public.fco_inv_num(tax) || '%: ' || public.fco_inv_money(fees) || ' BP · +' || public.fco_inv_money(total - fees) || ' BP';
  d := case when n = 1
    then public.fco_inv_history(d, 'market', 'Bán · ' || public.fco_inv_name((first->>'playerId')::integer) || ' +' || (first->>'level'),
      'OVR ' || public.fco_inv_ovr((first->>'playerId')::integer, (first->>'level')::integer) || ' · Giá ' || public.fco_inv_money(total) || ' BP · ' || tail)
    else public.fco_inv_history(d, 'market', 'Bán hàng loạt · ' || n || ' cầu thủ', 'Tổng giá ' || public.fco_inv_money(total) || ' BP · ' || tail) end;
  return jsonb_build_object('sold', n, 'total', total, 'fees', fees, 'proceeds', total - fees, 'tax', tax, 'save', public.fco_inv_store(uid, d));
end;
$$;

-- Mua thẻ ở chợ theo giá thị trường (p_count thẻ giống nhau, đủ BP cho cả lượt mới mua).
create function public.fco_inv_buy(p_catalog text, p_player integer, p_level integer, p_count integer default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  price bigint; fresh jsonb := '[]'; card jsonb; name text; ovr integer;
begin
  if p_count is null or p_count < 1 or p_count > 100 or p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
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

-- Mua gói trong Shop bằng FC: giá gói lấy từ bộ dữ liệu (không nhận giá từ trình duyệt), gói vào kho vật phẩm.
create function public.fco_inv_shop(p_catalog text, p_pack text, p_count integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); pk public.fco_cat_packs; d jsonb; cost bigint;
begin
  select * into pk from public.fco_cat_packs where id = p_pack;
  if not found or not pk.shop or not pk.available then raise exception 'FCO_PACK_UNAVAILABLE' using errcode = 'P0001'; end if;
  if p_count is null or p_count < 1 or p_count > (rules->>'maxOpen')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  cost := pk.price * p_count;
  -- Khoá ví trước bản lưu (cùng thứ tự với Bi Lắc / gift code) để hai giao dịch không chờ nhau mãi.
  perform public.fco_wallet_lock(uid);
  d := public.fco_inv_lock(uid);
  perform public.fco_apply_fc(uid, -cost, 'shop', jsonb_build_object('pack', p_pack, 'count', p_count));
  d := public.fco_inv_set_stock(d, p_pack, public.fco_inv_stock(d, p_pack) + p_count);
  d := public.fco_inv_history(d, 'shop', 'Mua ' || p_count || ' ' || pk.name, 'Đã thêm vào kho vật phẩm · −' || public.fco_inv_money(cost) || ' FC · Không thu thêm phí khi mở');
  return jsonb_build_object('wallet', public.fco_wallet_json(uid), 'save', public.fco_inv_store(uid, d));
end;
$$;

-- Xoá thẻ khỏi kho (thẻ khoá thì không xoá được).
create function public.fco_inv_release(p_uids text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); d jsonb := public.fco_inv_lock(uid); u text;
begin
  if p_uids is null or coalesce(array_length(p_uids, 1), 0) not between 1 and 500 then raise exception 'FCO_CARD_MISSING' using errcode = 'P0001'; end if;
  foreach u in array p_uids loop
    if public.fco_inv_card(d, u) is null then raise exception 'FCO_CARD_MISSING' using errcode = 'P0001'; end if;
    if public.fco_inv_locked(d, u) then raise exception 'FCO_CARD_LOCKED' using errcode = 'P0001'; end if;
  end loop;
  d := d || jsonb_build_object('cards', (select coalesce(jsonb_agg(c order by o), '[]') from jsonb_array_elements(d->'cards') with ordinality x(c, o) where not (c->>'uid' = any(p_uids))));
  return jsonb_build_object('save', public.fco_inv_store(uid, d));
end;
$$;

-- Nhận mọi quà admin đang chờ vào kho (FC đã cộng lúc admin tặng). Chỉ dùng khi máy chủ giữ kho.
create function public.fco_inv_claim_gifts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); g public.fco_admin_gifts; texts jsonb := '[]'; fc boolean := false; saved jsonb; t text;
begin
  if not public.fco_inv_server_owned(uid) then raise exception 'FCO_INVENTORY_LOCAL' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  for g in select * from public.fco_admin_gifts where user_id = uid and claimed_at is null order by id for update loop
    t := public.fco_inv_reward_text(g.rewards);
    saved := public.fco_inv_grant(uid, g.rewards, 'gift', 'Quà từ Admin', 'Nhận ' || t || case when g.note <> '' then ' · ' || g.note else '' end);
    update public.fco_admin_gifts set claimed_at = now() where id = g.id;
    texts := texts || to_jsonb(t);
    fc := fc or exists (select 1 from jsonb_array_elements(g.rewards) r where r ? 'fc');
  end loop;
  return jsonb_build_object('texts', texts, 'fc', fc, 'save', saved);
end;
$$;

-- Trạng thái kho trên máy chủ cho game: đã bắt buộc chưa, mã bộ dữ liệu đang dùng.
create function public.fco_inventory_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enforced', enforced, 'version', version, 'syncedAt', (extract(epoch from synced_at) * 1000)::bigint)
  from public.fco_inventory where id = 1
$$;

-- ===== Admin: đồng bộ bộ dữ liệu (begin → players / packs từng phần → commit) và bật bắt buộc =====

create function public.fco_admin_catalog_begin(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  if p_version is null or p_version !~ '^[0-9a-f]{64}$' then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  delete from public.fco_cat_players_next;
  delete from public.fco_cat_packs_next;
  update public.fco_inventory set staging = p_version where id = 1;
end;
$$;

-- p_rows: [[id, tên, ovrs[13], giá[13], giá cố định, tỷ lệ bảo hiểm], ...]
create function public.fco_admin_catalog_players(p_version text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.fco_require_admin();
  if p_version is distinct from (select staging from public.fco_inventory where id = 1) then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  insert into public.fco_cat_players_next(id, name, ovrs, prices, fixed, insurance)
  select (r->>0)::integer, r->>1,
    array(select v::integer from jsonb_array_elements_text(r->2) with ordinality x(v, o) order by o),
    array(select case when v = 'null' then null else v::bigint end from jsonb_array_elements_text(r->3) with ordinality x(v, o) order by o),
    (r->>4)::boolean, (r->>5)::double precision
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.fco_admin_catalog_packs(p_version text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.fco_require_admin();
  if p_version is distinct from (select staging from public.fco_inventory where id = 1) then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  insert into public.fco_cat_packs_next(id, name, label, price, shop, choose, available, players, weights, levels, level_weights, draft, draft_size, draft_level)
  select r->>'id', r->>'name', r->>'label', (r->>'price')::bigint, (r->>'shop')::boolean, (r->>'choose')::boolean, (r->>'available')::boolean,
    array(select v::integer from jsonb_array_elements_text(r->'players') with ordinality x(v, o) order by o),
    array(select v::double precision from jsonb_array_elements_text(r->'weights') with ordinality x(v, o) order by o),
    array(select v::integer from jsonb_array_elements_text(r->'levels') with ordinality x(v, o) order by o),
    array(select v::double precision from jsonb_array_elements_text(r->'levelWeights') with ordinality x(v, o) order by o),
    array(select v::integer from jsonb_array_elements_text(r->'draft') with ordinality x(v, o) order by o),
    (r->>'draftSize')::integer, (r->>'draftLevel')::integer
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Thay bộ dữ liệu đang dùng bằng bản vừa gửi (đủ số cầu thủ / gói như game báo) trong một giao dịch.
create function public.fco_admin_catalog_commit(p_version text, p_rules jsonb, p_players integer, p_packs integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin();
begin
  if p_version is distinct from (select staging from public.fco_inventory where id = 1) or jsonb_typeof(p_rules) <> 'object'
     or (select count(*) from public.fco_cat_players_next) <> p_players or (select count(*) from public.fco_cat_packs_next) <> p_packs then
    raise exception 'FCO_CATALOG_INVALID' using errcode = '22023';
  end if;
  delete from public.fco_cat_players;
  delete from public.fco_cat_packs;
  insert into public.fco_cat_players select * from public.fco_cat_players_next;
  insert into public.fco_cat_packs select * from public.fco_cat_packs_next;
  delete from public.fco_cat_players_next;
  delete from public.fco_cat_packs_next;
  update public.fco_inventory set version = p_version, rules = p_rules, synced_at = now(), synced_by = admin_id, staging = null where id = 1;
  return public.fco_inventory_state();
end;
$$;

create function public.fco_admin_inventory_enforce(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  if p_enabled is null then raise exception 'Invalid state' using errcode = '22023'; end if;
  if p_enabled and (select version from public.fco_inventory where id = 1) is null then raise exception 'FCO_CATALOG_MISSING' using errcode = 'P0001'; end if;
  update public.fco_inventory set enforced = p_enabled where id = 1;
  return public.fco_inventory_state();
end;
$$;

-- ===== Bản lưu: gộp thay vì ghi đè khi máy chủ giữ kho =====

-- Giữ phần được bảo vệ của bản trên máy chủ, lấy phần còn lại từ trình duyệt; lịch sử gộp theo id (mới nhất trước, 200 dòng).
create function public.fco_inv_merge(p_server jsonb, p_client jsonb) returns jsonb language sql stable set search_path = '' as $$
  select p_client - 'fc' || jsonb_build_object(
    'cards', coalesce(p_server->'cards', '[]'),
    'balance', coalesce(p_server->'balance', '0'),
    'unopened', coalesce(p_server->'unopened', '{}'),
    'opened', coalesce(p_server->'opened', '0'),
    'upgrades', coalesce(p_server->'upgrades', '0'),
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
$$;

-- Như 202611080011, thêm p_merge (game bản mới đang để máy chủ giữ kho) và chế độ bắt buộc:
--   gộp (fco_inv_merge) thay vì ghi đè, không so revision (phần được bảo vệ luôn lấy từ máy chủ nên không còn hai bản thẻ khác nhau).
--   Tài khoản mới khi đã bắt buộc: kho bắt đầu trống, không nhận thẻ / BP từ trình duyệt.
drop function public.fco_commit_save(jsonb, bigint);
create function public.fco_commit_save(p_data jsonb, p_revision bigint, p_merge boolean default false)
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
  p_data := p_data - 'fc';
  if merge then
    select data into previous from public.fco_game_saves where user_id = owner_id for update;
    if found then
      p_data := public.fco_inv_merge(previous, p_data);
      update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now() where user_id = owner_id returning * into saved;
    else
      if coalesce((select enforced from public.fco_inventory where id = 1), false) then
        p_data := p_data || '{"cards": [], "balance": 0, "unopened": {}, "opened": 0, "upgrades": 0}'::jsonb;
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
revoke all on function public.fco_commit_save(jsonb, bigint, boolean) from public, anon;
grant execute on function public.fco_commit_save(jsonb, bigint, boolean) to authenticated;

-- Như 202611100012, thêm cộng BP / gói vào kho khi máy chủ giữ kho ('save' trong kết quả).
create or replace function public.fco_bilac_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot;
  price integer; balls text[]; top text; top_n integer; row_id text; row_points integer; row_rewards jsonb; row_weights integer[]; reward jsonb;
  plays jsonb := '[]'; fc_won bigint := 0; gained bigint := 0; share bigint; amount bigint; jp_kind text; granted jsonb;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint; mini_done boolean;
begin
  if p_mode = 'fc' then
    price := case p_count when 1 then 20 when 10 then 190 when 50 then 900 end;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  elsif p_mode = 'free' then
    if p_count is distinct from 1 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    price := 0;
  else raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  if p_mode = 'free' then
    if w.bilac_free_day is not distinct from public.fco_today() then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
    update public.fco_wallets set bilac_free_day = public.fco_today() where user_id = uid;
  else
    perform public.fco_apply_fc(uid, -price, 'bilac', jsonb_build_object('count', p_count));
  end if;
  j := public.fco_jackpot_tick();
  mini_done := public.fco_jackpot_mini_done(j.feed);
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    balls := array[public.fco_bilac_roll(), public.fco_bilac_roll(), public.fco_bilac_roll()];
    -- x3 (trừ Special) chỉ giữ: CLB 2 %, BP 6 %, Thẻ 13 %, FC 10 %: còn lại lăn lại quả thứ 3 tới khi khác ô → thành hàng x2.
    if balls[1] = balls[2] and balls[2] = balls[3] and balls[1] <> 'special' and random() >= (case balls[1] when 'club' then 0.02 when 'bp' then 0.06 when 'card' then 0.13 else 0.1 end) then
      loop balls[3] := public.fco_bilac_roll(); exit when balls[3] <> balls[1]; end loop;
    end if;
    -- Quỹ từ 10.000 FC: thêm cơ hội ra Special x3 (Giải Đặc Biệt), tăng theo áp lực quỹ như bot (áp lực = 1 khi quỹ < 13.000).
    if j.pot >= 10000 and not (balls[1] = 'special' and balls[2] = 'special' and balls[3] = 'special')
       and random() < least(.0025, .0002 * public.fco_jackpot_pressure(j.pot)) then
      balls := array['special', 'special', 'special'];
    end if;
    select b, count(*) into top, top_n from unnest(balls) b group by b order by count(*) desc, min(array_position(balls, b)) limit 1;
    select r.id, r.points, r.rewards, r.weights into row_id, row_points, row_rewards, row_weights from public.fco_bilac_rows r
      where (top_n = 3 and r.kind = 'triple' and r.symbol = top) or (top_n = 2 and r.kind = 'pair' and r.symbol = top) or (top_n = 1 and r.kind = 'mixed');
    reward := row_rewards -> public.fco_bilac_pick(jsonb_array_length(row_rewards), row_weights);
    if reward ? 'jackpot' then
      jp_kind := reward->>'jackpot';
      if jp_kind = 'special' then
        -- Vòng này chưa ai trúng Giải Phụ: Giải Phụ nổ trước (bot), người chơi nhận phần quỹ còn lại.
        if not mini_done then
          amount := floor(j.pot / 10); j.pot := j.pot - amount;
          j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_bot_name(), 'amount', amount, 'kind', 'mini', 'time', now_ms - 1));
        end if;
        amount := j.pot; j.pot := 2000; mini_done := false;
      else amount := floor(j.pot / 10); j.pot := j.pot - amount; mini_done := true; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', jp_kind);
      j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', jp_kind, 'time', now_ms));
    end if;
    if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
    gained := gained + row_points;
    plays := plays || jsonb_build_object('balls', to_jsonb(balls), 'row', row_id, 'points', row_points, 'reward', reward);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set bilac_points = bilac_points + gained where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'bilac_win', jsonb_build_object('count', p_count)); end if;
  -- Máy chủ giữ kho: cộng BP / gói vào bản lưu ngay (game bản cũ tự cộng khi save = null).
  granted := public.fco_inv_grant(uid, (select jsonb_agg(p->'reward') from jsonb_array_elements(plays) p), 'event',
    'Bi Lắc · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end,
    public.fco_inv_reward_text((select jsonb_agg(p->'reward') from jsonb_array_elements(plays) p)) || ' · +' || gained || ' điểm' || case when price > 0 then ' · −' || public.fco_inv_money(price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', price, 'points', gained, 'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

-- Như 202611100003, thêm cộng BP / gói vào kho khi máy chủ giữ kho ('save' trong kết quả).
create or replace function public.fco_bilac_claim(p_index integer, p_choice integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; m public.fco_bilac_milestones;
  opts jsonb; round_size bigint; reached bigint; done integer; rewards jsonb; fc bigint; claimed integer[]; granted jsonb;
begin
  w := public.fco_wallet_lock(uid);
  select * into m from public.fco_bilac_milestones where idx = p_index;
  if not found then raise exception 'FCO_MILESTONE_UNKNOWN' using errcode = '22023'; end if;
  select max(points) into round_size from public.fco_bilac_milestones;
  reached := case when w.bilac_points < m.points then 0 when m.once then 1 else 1 + (w.bilac_points - m.points) / round_size end;
  done := coalesce(w.bilac_claimed[p_index + 1], 0);
  if reached = 0 then raise exception 'FCO_MILESTONE_LOCKED' using errcode = 'P0001'; end if;
  if done >= reached then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  opts := coalesce(m.options, jsonb_build_array(m.rewards));
  if jsonb_array_length(opts) = 1 then rewards := opts -> 0;
  elsif p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(opts) then raise exception 'FCO_MILESTONE_CHOICE' using errcode = '22023';
  else rewards := opts -> p_choice; end if;
  claimed := array(select case when i = p_index + 1 then done + 1 else coalesce(w.bilac_claimed[i], 0) end
                   from generate_series(1, greatest(coalesce(array_upper(w.bilac_claimed, 1), 0), p_index + 1)) i order by i);
  update public.fco_wallets set bilac_claimed = claimed where user_id = uid;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(rewards) r where r ? 'fc';
  if fc > 0 then perform public.fco_apply_fc(uid, fc, 'bilac_milestone', jsonb_build_object('index', p_index)); end if;
  granted := public.fco_inv_grant(uid, rewards, 'event', 'Bi Lắc · Quà mốc điểm', public.fco_inv_reward_text(rewards));
  return jsonb_build_object('rewards', rewards, 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

-- Như 202611070001, thêm cộng BP / gói vào kho khi máy chủ giữ kho.
create or replace function public.fco_redeem_gift(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); g public.fco_gift_codes; fc bigint; granted jsonb;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'FCO_GIFT_INVALID' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  select * into g from public.fco_gift_codes where hash = p_hash;
  if not found then raise exception 'FCO_GIFT_INVALID' using errcode = 'P0001'; end if;
  if g.expires is not null and public.fco_today() > g.expires then raise exception 'FCO_GIFT_EXPIRED' using errcode = 'P0001'; end if;
  insert into public.fco_gift_redemptions(user_id, hash) values (uid, p_hash) on conflict do nothing;
  if not found then raise exception 'FCO_GIFT_USED' using errcode = 'P0001'; end if;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(g.rewards) r where r ? 'fc';
  perform public.fco_apply_fc(uid, fc, 'gift', jsonb_build_object('hint', g.hint));
  granted := public.fco_inv_grant(uid, g.rewards, 'gift', 'Gift code ' || g.hint, 'Nhận ' || public.fco_inv_reward_text(g.rewards));
  return jsonb_build_object('rewards', g.rewards, 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

-- Như 202611090006, thêm gói ngày 7 của điểm danh (src/checkin.ts: the-moment) vào kho khi máy chủ giữ kho.
create or replace function public.fco_claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; next smallint; bonus integer; granted jsonb;
begin
  w := public.fco_wallet_lock(uid);
  if w.daily is not distinct from public.fco_today() then raise exception 'FCO_DAILY_CLAIMED' using errcode = 'P0001'; end if;
  next := public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today());
  update public.fco_wallets set daily = public.fco_today(), checkin_day = next, checkin_date = public.fco_today() where user_id = uid;
  perform public.fco_apply_fc(uid, 500, 'daily');
  bonus := (array[200, 350, 500, 650, 800, 1000, 0])[next];
  if bonus > 0 then perform public.fco_apply_fc(uid, bonus, 'checkin', jsonb_build_object('day', next)); end if;
  if next = 7 then
    granted := public.fco_inv_grant(uid, '[{"pack": "the-moment", "count": 1}]', 'gift', 'Điểm danh ngày 7',
      '+500 FC + điểm danh ngày 7: ' || public.fco_inv_reward_text('[{"pack": "the-moment", "count": 1}]'));
  end if;
  return public.fco_wallet_json(uid) || jsonb_build_object('save', granted);
end;
$$;

-- Như 202611070001; khi đã bắt buộc thì game bản cũ (tự thêm gói vào bản lưu) không mua được nữa, tránh mất FC mà không có gói.
create or replace function public.fco_spend_fc(p_amount bigint, p_reason text, p_detail jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if coalesce((select enforced from public.fco_inventory where id = 1), false) then raise exception 'FCO_UPDATE_REQUIRED' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
  if p_reason is distinct from 'shop' then raise exception 'FCO_BAD_REASON' using errcode = '22023'; end if;
  perform public.fco_wallet_lock(uid);
  perform public.fco_apply_fc(uid, -p_amount, p_reason, coalesce(p_detail, '{}'));
  return public.fco_wallet_json(uid);
end;
$$;

-- Như 202611080001; khi máy chủ giữ kho, kỷ lục đập thẻ do fco_inv_upgrade ghi, không nhận số trình duyệt gửi.
create or replace function public.fco_rank_upgrade(p_ovr integer, p_player integer, p_level integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if public.fco_inv_server_owned(uid) then return; end if;
  if p_ovr is null or p_ovr not between 1 and 999 or p_player is null or p_player < 1 or p_level is null or p_level not between 1 and 30 then
    raise exception 'FCO_RANK_INVALID' using errcode = 'P0001';
  end if;
  insert into public.fco_ranks as r (user_id, best_ovr, best_player, best_level, best_at) values (uid, p_ovr, p_player, p_level, now())
  on conflict (user_id) do update set best_ovr = excluded.best_ovr, best_player = excluded.best_player, best_level = excluded.best_level, best_at = excluded.best_at
  where excluded.best_ovr > r.best_ovr;
end;
$$;

-- ===== Quyền =====
revoke all on function
  public.fco_now_ms(), public.fco_inv_short(numeric), public.fco_inv_money(bigint), public.fco_inv_num(double precision),
  public.fco_u32_mul(bigint, bigint), public.fco_inv_swing(bigint, bigint, bigint), public.fco_inv_swung(bigint, double precision, integer),
  public.fco_inv_rules(), public.fco_inv_price(integer, integer, timestamptz), public.fco_inv_ovr(integer, integer), public.fco_inv_name(integer),
  public.fco_inv_pick(double precision[]), public.fco_inv_check(text), public.fco_inv_lock(uuid), public.fco_inv_store(uuid, jsonb),
  public.fco_inv_history(jsonb, text, text, text, boolean), public.fco_inv_stock(jsonb, text), public.fco_inv_set_stock(jsonb, text, bigint),
  public.fco_inv_card(jsonb, text), public.fco_inv_locked(jsonb, text), public.fco_inv_new_card(integer, integer, boolean), public.fco_inv_best(jsonb),
  public.fco_inv_server_owned(uuid), public.fco_inv_reward_text(jsonb), public.fco_inv_grant(uuid, jsonb, text, text, text),
  public.fco_inv_gauge(jsonb, integer, integer), public.fco_inv_tax(uuid, jsonb), public.fco_inv_merge(jsonb, jsonb),
  public.fco_inv_open(text, text[], integer), public.fco_inv_open_draft(text, text, integer[], integer),
  public.fco_inv_upgrade(text, text, text[], integer), public.fco_inv_sell(text, jsonb), public.fco_inv_buy(text, integer, integer, integer),
  public.fco_inv_shop(text, text, integer), public.fco_inv_release(text[]), public.fco_inv_claim_gifts(), public.fco_inventory_state(),
  public.fco_admin_catalog_begin(text), public.fco_admin_catalog_players(text, jsonb), public.fco_admin_catalog_packs(text, jsonb),
  public.fco_admin_catalog_commit(text, jsonb, integer, integer), public.fco_admin_inventory_enforce(boolean)
from public, anon, authenticated;
grant execute on function
  public.fco_inv_open(text, text[], integer), public.fco_inv_open_draft(text, text, integer[], integer),
  public.fco_inv_upgrade(text, text, text[], integer), public.fco_inv_sell(text, jsonb), public.fco_inv_buy(text, integer, integer, integer),
  public.fco_inv_shop(text, text, integer), public.fco_inv_release(text[]), public.fco_inv_claim_gifts(), public.fco_inventory_state(),
  public.fco_admin_catalog_begin(text), public.fco_admin_catalog_players(text, jsonb), public.fco_admin_catalog_packs(text, jsonb),
  public.fco_admin_catalog_commit(text, jsonb, integer, integer), public.fco_admin_inventory_enforce(boolean)
to authenticated;

commit;
