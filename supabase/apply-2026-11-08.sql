-- GỘP CÁC MIGRATION NGÀY 2026-11-08 — dán toàn bộ file này vào Supabase → SQL Editor → Run (một lần).
-- Chạy lại cũng không lỗi (đã đổi sang "if not exists" / "create or replace"). Cần chạy SAU các migration trước đó
-- (202610300001 … 202611070007; 202611070008 không bắt buộc vì 202611080002 thay thế).
-- Gồm: bảng xếp hạng HLV · quà điểm danh mới · tỉ lệ quà Bi Lắc · cơ hội Giải Đặc Biệt khi quỹ ≥ 10.000 FC.

-- ===================== 202611080001_fco_ranks.sql =====================
-- Bảng xếp hạng HLV (2026-11-08): mục "BXH" trên thanh menu dưới, hai bảng top 10.
--   · Đập thẻ OVR cao nhất: kỷ lục OVR của thẻ vừa đập THÀNH CÔNG (game gửi lên sau mỗi lần đập thành công); chỉ ghi khi
--     cao hơn kỷ lục cũ, nên bán / đập rớt thẻ sau đó không làm mất kỷ lục. Kèm cầu thủ + cấp để hiện thẻ.
--   · Giá trị đội hình: tổng giá 11 cầu thủ đá chính của đội hình đang dùng (số "Giá trị ĐH" ở màn Đội hình),
--     game gửi lên mỗi khi số này đổi.
-- OVR / giá thẻ chỉ tính được trong game (dữ liệu cầu thủ, bảng giá ở src/), nên máy chủ tin số game gửi — như bản lưu.
-- Tên HLV che bớt như bảng tin jackpot (fco_public_name). Chỉ tài khoản đăng nhập gọi được.
begin;

create table if not exists public.fco_ranks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  best_ovr integer not null default 0 check (best_ovr between 0 and 999),
  best_player integer,
  best_level smallint,
  best_at timestamptz,
  squad_value bigint not null default 0 check (squad_value between 0 and 1000000000000000000),
  squad_at timestamptz
);
create index if not exists fco_ranks_ovr on public.fco_ranks(best_ovr desc, best_at);
create index if not exists fco_ranks_squad on public.fco_ranks(squad_value desc, squad_at);
alter table public.fco_ranks enable row level security;
revoke all on public.fco_ranks from anon, authenticated;

-- Đập thành công: ghi kỷ lục nếu cao hơn kỷ lục cũ (bằng thì giữ người đạt trước).
create or replace function public.fco_rank_upgrade(p_ovr integer, p_player integer, p_level integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if p_ovr is null or p_ovr not between 1 and 999 or p_player is null or p_player < 1 or p_level is null or p_level not between 1 and 30 then
    raise exception 'FCO_RANK_INVALID' using errcode = 'P0001';
  end if;
  insert into public.fco_ranks as r (user_id, best_ovr, best_player, best_level, best_at) values (uid, p_ovr, p_player, p_level, now())
  on conflict (user_id) do update set best_ovr = excluded.best_ovr, best_player = excluded.best_player, best_level = excluded.best_level, best_at = excluded.best_at
  where excluded.best_ovr > r.best_ovr;
end;
$$;

-- Giá trị đội hình đang dùng: thay bằng số mới (lên hay xuống đều ghi).
create or replace function public.fco_rank_squad(p_value bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if p_value is null or p_value not between 0 and 1000000000000000000 then raise exception 'FCO_RANK_INVALID' using errcode = 'P0001'; end if;
  insert into public.fco_ranks as r (user_id, squad_value, squad_at) values (uid, p_value, now())
  on conflict (user_id) do update set squad_value = excluded.squad_value, squad_at = excluded.squad_at
  where r.squad_value is distinct from excluded.squad_value;
end;
$$;

-- Hai bảng top 10 + hạng của người xem (null nếu chưa có số).
create or replace function public.fco_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); me public.fco_ranks;
begin
  select * into me from public.fco_ranks where user_id = uid;
  return jsonb_build_object(
    'ovr', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'ovr', t.best_ovr, 'playerId', t.best_player,
                       'level', t.best_level, 'mine', t.user_id = uid) order by t.best_ovr desc, t.best_at)
                     from (select * from public.fco_ranks where best_ovr > 0 order by best_ovr desc, best_at limit 10) t), '[]'::jsonb),
    'squad', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'value', t.squad_value, 'mine', t.user_id = uid)
                       order by t.squad_value desc, t.squad_at)
                     from (select * from public.fco_ranks where squad_value > 0 order by squad_value desc, squad_at limit 10) t), '[]'::jsonb),
    'me', jsonb_build_object(
      'ovr', case when coalesce(me.best_ovr, 0) > 0 then me.best_ovr end,
      'ovrRank', case when coalesce(me.best_ovr, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                 where o.best_ovr > me.best_ovr or (o.best_ovr = me.best_ovr and o.best_at < me.best_at)) end,
      'squad', case when coalesce(me.squad_value, 0) > 0 then me.squad_value end,
      'squadRank', case when coalesce(me.squad_value, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                   where o.squad_value > me.squad_value or (o.squad_value = me.squad_value and o.squad_at < me.squad_at)) end));
end;
$$;

revoke all on function public.fco_rank_upgrade(integer, integer, integer), public.fco_rank_squad(bigint), public.fco_leaderboard() from public, anon;
grant execute on function public.fco_rank_upgrade(integer, integer, integer), public.fco_rank_squad(bigint), public.fco_leaderboard() to authenticated;

commit;

-- ===================== 202611080002_fco_checkin_v3.sql =====================
-- Điểm danh 7 ngày đổi quà (2026-11-08):
--   ngày 1: 200 FC · 2: 350 FC · 3: 500 FC · 4: 650 FC · 5: 800 FC · 6: 1.000 FC · 7: gói ITM All 122+ (the-moment)
-- (thay 200 / 400 / 700 / 1.000 / 1.300 / 1.600 / 2.000 FC của 202611070008_fco_checkin_fc.sql).
-- FC máy chủ cộng (sổ cái lý do 'checkin'); gói ngày 7 do trình duyệt thêm vào kho theo src/checkin.ts (bảng quà phải khớp).
-- Vẫn +1.000 FC quà mỗi ngày như cũ; chuỗi ngày giữ nguyên.
begin;

create or replace function public.fco_claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; next smallint; bonus integer;
begin
  w := public.fco_wallet_lock(uid);
  if w.daily is not distinct from public.fco_today() then raise exception 'FCO_DAILY_CLAIMED' using errcode = 'P0001'; end if;
  next := public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today());
  update public.fco_wallets set daily = public.fco_today(), checkin_day = next, checkin_date = public.fco_today() where user_id = uid;
  perform public.fco_apply_fc(uid, 1000, 'daily');
  bonus := (array[200, 350, 500, 650, 800, 1000, 0])[next];
  if bonus > 0 then perform public.fco_apply_fc(uid, bonus, 'checkin', jsonb_build_object('day', next)); end if;
  return public.fco_wallet_json(uid);
end;
$$;

commit;

-- ===================== 202611080003_fco_bilac_weights.sql =====================
-- Bi Lắc: tỉ lệ quà theo giá trị (2026-11-08). Trước đây mỗi món trong một hàng có xác suất bằng nhau.
-- 1. Quả bóng FC hiếm hơn: tỉ lệ mỗi quả CLB 24 · FC 12 · Special 6 · BP 30 · Thẻ 28 (trước 22 · 20 · 6 · 26 · 26),
--    nên hàng FC x3 / x2 ít ra hơn (x3: 0,8 % → 0,17 %; x2: 9,6 % → 3,8 %).
-- 2. Trong mỗi hàng, quà càng giá trị càng khó trúng; quà FC thấp nhất. fco_bilac_rows.weights cùng thứ tự với rewards
--    (null = chia đều). Tổng trọng số mỗi hàng = 100 nên mỗi số là phần trăm của món đó khi đã trúng hàng.
--    Giá trị so theo giá gói (src/packs.json) / số BP; gói ICONTM (ALL) coi là quý nhất hàng "khác nhau".
begin;

update public.fco_bilac_symbols set weight = case id when 'club' then 24 when 'fc' then 12 when 'special' then 6 when 'bp' then 30 when 'card' then 28 end;

alter table public.fco_bilac_rows add column if not exists weights integer[];
update public.fco_bilac_rows set weights = case id
  when 'special3' then '{100}'::integer[]
  when 'fc3'      then '{5,12,28,55}'::integer[]               -- 3000 · 2000 · 1500 · 1000 FC
  when 'club3'    then '{8,17,30,45}'::integer[]               -- 26UP chỉ định 30 · 40 · 50 · 60
  when 'bp3'      then '{8,17,30,45}'::integer[]               -- 400M · 350M · 300M · 250M BP
  when 'card3'    then '{8,17,30,45}'::integer[]               -- 113+ · 112+ · 111+ · 110+
  when 'special2' then '{100}'::integer[]
  when 'fc2'      then '{1,4,18,9,28,40}'::integer[]           -- 1800 FC · 400 FC · 240M BP · 200 FC · 150M BP · gói 109+
  when 'club2'    then '{6,12,16,19,22,25}'::integer[]         -- Top Price 60 · 125 · 150 · 175 · 200 · 225
  when 'bp2'      then '{4,11,15,19,23,28}'::integer[]         -- 330M · 50M · 45M · 40M · 35M · 32M BP
  when 'card2'    then '{22,11,8,21,14,24}'::integer[]         -- WB All · 108+ LWBBG · 38M · 108+ LWB · 33M · 108+ LWBB
  when 'mixed'    then '{2,6,8,11,20,14,22,17}'::integer[]     -- ICONTM · 34M · BLD/GRU/CU/24EP · 30M · 116+ mix · 25M · 117+ mix · 20M
end;
alter table public.fco_bilac_rows drop constraint if exists fco_bilac_rows_weights_check;
alter table public.fco_bilac_rows add constraint fco_bilac_rows_weights_check
  check (weights is null or (array_length(weights, 1) = jsonb_array_length(rewards) and 0 < all(weights)));

-- Chọn vị trí quà (0-based) theo trọng số; không có trọng số thì chia đều.
create or replace function public.fco_bilac_pick(p_count integer, p_weights integer[]) returns integer language plpgsql volatile set search_path = '' as $$
declare total integer; r double precision; acc integer := 0;
begin
  if p_weights is null or array_length(p_weights, 1) is distinct from p_count then return floor(random() * p_count)::int; end if;
  select sum(w) into total from unnest(p_weights) w;
  r := random() * total;
  for i in 1 .. p_count loop
    acc := acc + p_weights[i];
    if r < acc then return i - 1; end if;
  end loop;
  return p_count - 1;
end;
$$;
revoke all on function public.fco_bilac_pick(integer, integer[]) from public, anon, authenticated;

-- Như 202611070005, chỉ đổi cách chọn quà trong hàng sang fco_bilac_pick.
create or replace function public.fco_bilac_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot;
  price integer; balls text[]; top text; top_n integer; row_id text; row_points integer; row_rewards jsonb; row_weights integer[]; reward jsonb;
  plays jsonb := '[]'; fc_won bigint := 0; gained bigint := 0; share bigint; amount bigint; jp_kind text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
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
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    balls := array[public.fco_bilac_roll(), public.fco_bilac_roll(), public.fco_bilac_roll()];
    select b, count(*) into top, top_n from unnest(balls) b group by b order by count(*) desc, min(array_position(balls, b)) limit 1;
    select r.id, r.points, r.rewards, r.weights into row_id, row_points, row_rewards, row_weights from public.fco_bilac_rows r
      where (top_n = 3 and r.kind = 'triple' and r.symbol = top) or (top_n = 2 and r.kind = 'pair' and r.symbol = top) or (top_n = 1 and r.kind = 'mixed');
    reward := row_rewards -> public.fco_bilac_pick(jsonb_array_length(row_rewards), row_weights);
    if reward ? 'jackpot' then
      jp_kind := reward->>'jackpot';
      if jp_kind = 'special' then amount := j.pot; j.pot := 2000; else amount := floor(j.pot / 10); j.pot := j.pot - amount; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', jp_kind);
      j.feed := (jsonb_build_array(jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', jp_kind, 'time', now_ms)) || j.feed);
      j.feed := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(j.feed) with ordinality as t(e, n) where n <= 10);
    end if;
    if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
    gained := gained + row_points;
    plays := plays || jsonb_build_object('balls', to_jsonb(balls), 'row', row_id, 'points', row_points, 'reward', reward);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set bilac_points = bilac_points + gained where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'bilac_win', jsonb_build_object('count', p_count)); end if;
  return jsonb_build_object('plays', plays, 'paid', price, 'points', gained, 'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid));
end;
$$;

commit;

-- ===================== 202611080004_fco_bilac_harder.sql =====================
-- Bi Lắc: quà giá trị cao khó trúng hơn nữa (2026-11-08, sau 202611080003).
-- 1. Trọng số trong mỗi hàng đổi sang thang phần nghìn (tổng 1000), dốc hơn: quà đắt nhất hàng còn 0,5–3 %.
-- 2. Hàng x3 (trừ Special x3) chỉ giữ 40 % số lần 3 bóng trùng nhau; còn lại quả thứ 3 lăn lại sang ô khác (thành x2).
--    Tỉ lệ ra hàng x3 thường: ~6,4 % → ~2,6 % mỗi lượt. Tỉ lệ bóng giữ như 202611080003 (CLB 24 · FC 12 · Special 6 · BP 30 · Thẻ 28).
begin;

update public.fco_bilac_rows set weights = case id
  when 'special3' then '{1000}'::integer[]
  when 'fc3'      then '{10,70,220,700}'::integer[]                  -- 3000 · 2000 · 1500 · 1000 FC
  when 'club3'    then '{30,100,250,620}'::integer[]                 -- 26UP chỉ định 30 · 40 · 50 · 60
  when 'bp3'      then '{30,100,250,620}'::integer[]                 -- 400M · 350M · 300M · 250M BP
  when 'card3'    then '{30,100,250,620}'::integer[]                 -- 113+ · 112+ · 111+ · 110+
  when 'special2' then '{1000}'::integer[]
  when 'fc2'      then '{5,25,100,40,300,530}'::integer[]            -- 1800 FC · 400 FC · 240M BP · 200 FC · 150M BP · gói 109+
  when 'club2'    then '{20,60,110,180,260,370}'::integer[]          -- Top Price 60 · 125 · 150 · 175 · 200 · 225
  when 'bp2'      then '{10,60,110,180,270,370}'::integer[]          -- 330M · 50M · 45M · 40M · 35M · 32M BP
  when 'card2'    then '{250,70,30,230,120,300}'::integer[]          -- WB All · 108+ LWBBG · 38M · 108+ LWB · 33M · 108+ LWBB
  when 'mixed'    then '{5,35,50,90,270,130,300,120}'::integer[]     -- ICONTM · 34M · BLD/GRU/CU/24EP · 30M · 116+ mix · 25M · 117+ mix · 20M
end;

-- Như 202611080003, thêm bước giảm hàng x3.
create or replace function public.fco_bilac_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot;
  price integer; balls text[]; top text; top_n integer; row_id text; row_points integer; row_rewards jsonb; row_weights integer[]; reward jsonb;
  plays jsonb := '[]'; fc_won bigint := 0; gained bigint := 0; share bigint; amount bigint; jp_kind text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
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
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    balls := array[public.fco_bilac_roll(), public.fco_bilac_roll(), public.fco_bilac_roll()];
    -- x3 (trừ Special) chỉ giữ 40 %: còn lại lăn lại quả thứ 3 tới khi khác ô → thành hàng x2.
    if balls[1] = balls[2] and balls[2] = balls[3] and balls[1] <> 'special' and random() >= 0.4 then
      loop balls[3] := public.fco_bilac_roll(); exit when balls[3] <> balls[1]; end loop;
    end if;
    select b, count(*) into top, top_n from unnest(balls) b group by b order by count(*) desc, min(array_position(balls, b)) limit 1;
    select r.id, r.points, r.rewards, r.weights into row_id, row_points, row_rewards, row_weights from public.fco_bilac_rows r
      where (top_n = 3 and r.kind = 'triple' and r.symbol = top) or (top_n = 2 and r.kind = 'pair' and r.symbol = top) or (top_n = 1 and r.kind = 'mixed');
    reward := row_rewards -> public.fco_bilac_pick(jsonb_array_length(row_rewards), row_weights);
    if reward ? 'jackpot' then
      jp_kind := reward->>'jackpot';
      if jp_kind = 'special' then amount := j.pot; j.pot := 2000; else amount := floor(j.pot / 10); j.pot := j.pot - amount; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', jp_kind);
      j.feed := (jsonb_build_array(jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', jp_kind, 'time', now_ms)) || j.feed);
      j.feed := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(j.feed) with ordinality as t(e, n) where n <= 10);
    end if;
    if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
    gained := gained + row_points;
    plays := plays || jsonb_build_object('balls', to_jsonb(balls), 'row', row_id, 'points', row_points, 'reward', reward);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set bilac_points = bilac_points + gained where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'bilac_win', jsonb_build_object('count', p_count)); end if;
  return jsonb_build_object('plays', plays, 'paid', price, 'points', gained, 'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid));
end;
$$;

commit;

-- ===================== 202611080005_fco_bilac_less_fc.sql =====================
-- Bi Lắc: giảm tỉ lệ trúng quà FC (2026-11-08, sau 202611080004). Danh sách quà không đổi, chỉ đổi tỉ lệ.
-- 1. Bóng FC 12 → 6: CLB 26 · FC 6 · Special 6 · BP 32 · Thẻ 30 (FC x2 ~3,8 % → ~1 % mỗi lượt).
-- 2. FC x3 chỉ giữ 10 % số lần 3 bóng FC (các x3 khác vẫn 40 %, Special x3 giữ nguyên).
-- 3. Trong hàng FC x2 / FC x3, món FC hiếm hơn (thang phần nghìn).
-- Tổng quà FC từ bảng quà: ~0,34 % → ~0,02 % mỗi lượt (≈ 1 lần / 5.000 lượt). Giải Đặc Biệt / Giải Phụ không đổi.
begin;

update public.fco_bilac_symbols set weight = case id when 'club' then 26 when 'fc' then 6 when 'special' then 6 when 'bp' then 32 when 'card' then 30 end;

update public.fco_bilac_rows set weights = case id
  when 'fc3' then '{5,35,160,800}'::integer[]               -- 3000 · 2000 · 1500 · 1000 FC
  when 'fc2' then '{1,4,120,10,320,545}'::integer[]         -- 1800 FC · 400 FC · 240M BP · 200 FC · 150M BP · gói 109+
  else weights end;

-- Như 202611080004, FC x3 chỉ giữ 10 %.
create or replace function public.fco_bilac_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot;
  price integer; balls text[]; top text; top_n integer; row_id text; row_points integer; row_rewards jsonb; row_weights integer[]; reward jsonb;
  plays jsonb := '[]'; fc_won bigint := 0; gained bigint := 0; share bigint; amount bigint; jp_kind text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
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
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    balls := array[public.fco_bilac_roll(), public.fco_bilac_roll(), public.fco_bilac_roll()];
    -- x3 (trừ Special) chỉ giữ 40 % (FC x3 chỉ 10 %): còn lại lăn lại quả thứ 3 tới khi khác ô → thành hàng x2.
    if balls[1] = balls[2] and balls[2] = balls[3] and balls[1] <> 'special' and random() >= (case when balls[1] = 'fc' then 0.1 else 0.4 end) then
      loop balls[3] := public.fco_bilac_roll(); exit when balls[3] <> balls[1]; end loop;
    end if;
    select b, count(*) into top, top_n from unnest(balls) b group by b order by count(*) desc, min(array_position(balls, b)) limit 1;
    select r.id, r.points, r.rewards, r.weights into row_id, row_points, row_rewards, row_weights from public.fco_bilac_rows r
      where (top_n = 3 and r.kind = 'triple' and r.symbol = top) or (top_n = 2 and r.kind = 'pair' and r.symbol = top) or (top_n = 1 and r.kind = 'mixed');
    reward := row_rewards -> public.fco_bilac_pick(jsonb_array_length(row_rewards), row_weights);
    if reward ? 'jackpot' then
      jp_kind := reward->>'jackpot';
      if jp_kind = 'special' then amount := j.pot; j.pot := 2000; else amount := floor(j.pot / 10); j.pot := j.pot - amount; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', jp_kind);
      j.feed := (jsonb_build_array(jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', jp_kind, 'time', now_ms)) || j.feed);
      j.feed := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(j.feed) with ordinality as t(e, n) where n <= 10);
    end if;
    if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
    gained := gained + row_points;
    plays := plays || jsonb_build_object('balls', to_jsonb(balls), 'row', row_id, 'points', row_points, 'reward', reward);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set bilac_points = bilac_points + gained where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'bilac_win', jsonb_build_object('count', p_count)); end if;
  return jsonb_build_object('plays', plays, 'paid', price, 'points', gained, 'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid));
end;
$$;

commit;

-- ===================== 202611080006_fco_bilac_rare_fc.sql =====================
-- Bi Lắc: giảm tiếp FC (2026-11-08, sau 202611080005). Danh sách quà không đổi, chỉ đổi tỉ lệ bóng.
-- Bóng FC 6 → 3 và Special 6 → 3 (Giải Phụ / Giải Đặc Biệt trả FC từ quỹ jackpot): CLB 27 · FC 3 · Special 3 · BP 34 · Thẻ 33.
--   Giải Phụ (2 Special): ~1 % → ~0,26 % mỗi lượt (≈ 1 / 380 lượt); Giải Đặc Biệt (3 Special): ~0,02 % → ~0,003 % (≈ 1 / 37.000 lượt).
--   Quà FC từ hàng FC x2 / x3: ~0,018 % → ~0,004 % mỗi lượt (≈ 1 / 25.000 lượt).
begin;
update public.fco_bilac_symbols set weight = case id when 'club' then 27 when 'fc' then 3 when 'special' then 3 when 'bp' then 34 when 'card' then 33 end;
commit;

-- ===================== 202611080007_fco_bilac_jackpot_chance.sql =====================
-- Bi Lắc: người chơi cạnh tranh Giải Đặc Biệt với bot (2026-11-08, sau 202611080006).
-- Khi quỹ ≥ 10.000 FC, mỗi lượt có thêm cơ hội ra Special x3 = min(0,5 %, 0,04 % × áp lực quỹ), áp lực = (1 + (quỹ − 10.000) / 5.000)²
-- (cùng hàm fco_jackpot_pressure bot dùng):
--   10.000 FC: 0,04 % (≈ 1 / 2.500 lượt) · 12.500: 0,09 % · 15.000: 0,16 % · 17.500: 0,25 % · 20.000: 0,36 % (≈ 1 / 280 lượt).
-- Dưới 10.000 FC giữ như cũ (chỉ ~0,003 % từ bóng Special). Cách quỹ tăng và bot trúng không đổi.
begin;

-- Như 202611080005, thêm cơ hội Giải Đặc Biệt khi quỹ ≥ 10.000.
create or replace function public.fco_bilac_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot;
  price integer; balls text[]; top text; top_n integer; row_id text; row_points integer; row_rewards jsonb; row_weights integer[]; reward jsonb;
  plays jsonb := '[]'; fc_won bigint := 0; gained bigint := 0; share bigint; amount bigint; jp_kind text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
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
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    balls := array[public.fco_bilac_roll(), public.fco_bilac_roll(), public.fco_bilac_roll()];
    -- x3 (trừ Special) chỉ giữ 40 % (FC x3 chỉ 10 %): còn lại lăn lại quả thứ 3 tới khi khác ô → thành hàng x2.
    if balls[1] = balls[2] and balls[2] = balls[3] and balls[1] <> 'special' and random() >= (case when balls[1] = 'fc' then 0.1 else 0.4 end) then
      loop balls[3] := public.fco_bilac_roll(); exit when balls[3] <> balls[1]; end loop;
    end if;
    -- Quỹ từ 10.000 FC: thêm cơ hội ra Special x3 (Giải Đặc Biệt), tăng theo áp lực quỹ như bot (fco_jackpot_pressure).
    if j.pot >= 10000 and not (balls[1] = 'special' and balls[2] = 'special' and balls[3] = 'special')
       and random() < least(.005, .0004 * public.fco_jackpot_pressure(j.pot)) then
      balls := array['special', 'special', 'special'];
    end if;
    select b, count(*) into top, top_n from unnest(balls) b group by b order by count(*) desc, min(array_position(balls, b)) limit 1;
    select r.id, r.points, r.rewards, r.weights into row_id, row_points, row_rewards, row_weights from public.fco_bilac_rows r
      where (top_n = 3 and r.kind = 'triple' and r.symbol = top) or (top_n = 2 and r.kind = 'pair' and r.symbol = top) or (top_n = 1 and r.kind = 'mixed');
    reward := row_rewards -> public.fco_bilac_pick(jsonb_array_length(row_rewards), row_weights);
    if reward ? 'jackpot' then
      jp_kind := reward->>'jackpot';
      if jp_kind = 'special' then amount := j.pot; j.pot := 2000; else amount := floor(j.pot / 10); j.pot := j.pot - amount; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', jp_kind);
      j.feed := (jsonb_build_array(jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', jp_kind, 'time', now_ms)) || j.feed);
      j.feed := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(j.feed) with ordinality as t(e, n) where n <= 10);
    end if;
    if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
    gained := gained + row_points;
    plays := plays || jsonb_build_object('balls', to_jsonb(balls), 'row', row_id, 'points', row_points, 'reward', reward);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set bilac_points = bilac_points + gained where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'bilac_win', jsonb_build_object('count', p_count)); end if;
  return jsonb_build_object('plays', plays, 'paid', price, 'points', gained, 'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid));
end;
$$;

commit;
