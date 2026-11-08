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
