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
