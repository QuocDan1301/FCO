-- Bi Lắc: tỉ lệ quà theo giá trị (2026-11-08). Trước đây mỗi món trong một hàng có xác suất bằng nhau.
-- 1. Quả bóng FC hiếm hơn: tỉ lệ mỗi quả CLB 24 · FC 12 · Special 6 · BP 30 · Thẻ 28 (trước 22 · 20 · 6 · 26 · 26),
--    nên hàng FC x3 / x2 ít ra hơn (x3: 0,8 % → 0,17 %; x2: 9,6 % → 3,8 %).
-- 2. Trong mỗi hàng, quà càng giá trị càng khó trúng; quà FC thấp nhất. fco_bilac_rows.weights cùng thứ tự với rewards
--    (null = chia đều). Tổng trọng số mỗi hàng = 100 nên mỗi số là phần trăm của món đó khi đã trúng hàng.
--    Giá trị so theo giá gói (src/packs.json) / số BP; gói ICONTM (ALL) coi là quý nhất hàng "khác nhau".
begin;

update public.fco_bilac_symbols set weight = case id when 'club' then 24 when 'fc' then 12 when 'special' then 6 when 'bp' then 30 when 'card' then 28 end;

alter table public.fco_bilac_rows add column weights integer[];
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
alter table public.fco_bilac_rows add constraint fco_bilac_rows_weights_check
  check (weights is null or (array_length(weights, 1) = jsonb_array_length(rewards) and 0 < all(weights)));

-- Chọn vị trí quà (0-based) theo trọng số; không có trọng số thì chia đều.
create function public.fco_bilac_pick(p_count integer, p_weights integer[]) returns integer language plpgsql volatile set search_path = '' as $$
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
