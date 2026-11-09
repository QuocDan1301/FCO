-- Quỹ jackpot: nâng mức quỹ dễ nổ từ 10.000 lên 15.000 FC (2026-11-09, sau 202611090011). Cả cơ chế dời lên 5.000 FC:
--   · Bot bắt đầu săn khi quỹ ≥ 15.000 FC (trước 10.000); áp lực quỹ tính từ 15.000: (1 + (quỹ − 15.000) / 5.000)².
--   · Quỹ chạm 25.000 FC thì chắc chắn có bot nổ Giải Đặc Biệt (trước 20.000).
--   · Giải Phụ thêm của bot chỉ khi quỹ còn ≥ 15.000 sau khi trả.
--   · Người chơi Bi Lắc: cơ hội Giải Đặc Biệt thêm mở khi quỹ ≥ 15.000 FC (và vòng đã có Giải Phụ).
--   Số bot (140), luật Giải Phụ trước, tỉ lệ bóng, giá lượt và mức quỹ sau khi nổ (2.000 FC) không đổi.
begin;

create or replace function public.fco_jackpot_pressure(p_pot bigint) returns double precision language sql immutable set search_path = '' as $$
  select power(1 + greatest(0, p_pot - 15000) / 5000.0, 2)
$$;

-- Như 202611090011, đổi mốc 10.000 → 15.000 và 20.000 → 25.000.
create or replace function public.fco_jackpot_tick() returns public.fco_jackpot
language plpgsql security definer set search_path = '' as $$
declare
  j public.fco_jackpot;
  steps bigint; run integer; gain integer; roll double precision; special double precision; mini_odds double precision;
  won_at timestamptz; amount bigint; kind text; mini_done boolean;
  hunters constant integer := 140; -- số bot cùng săn quỹ (trước 40)
begin
  select * into j from public.fco_jackpot where id = 1 for update;
  steps := floor(extract(epoch from (now() - j.at)) / 2);
  if steps <= 0 then return j; end if;
  j.at := j.at + make_interval(secs => steps * 2);
  run := least(steps, 1800);
  mini_odds := 1 - power(1 - .001, hunters);
  mini_done := public.fco_jackpot_mini_done(j.feed);
  for i in 0 .. run - 1 loop
    if j.speed > 0 then j.speed := j.speed - 1;
    elsif random() < .05 then j.speed := 10 + floor(random() * 20)::int;
    else j.speed := 0; end if;
    gain := case when j.speed > 0 then 80 + floor(random() * 121)::int else 8 + floor(random() * 17)::int end;
    j.pot := j.pot + gain;
    continue when j.pot < 15000;
    roll := random();
    special := case when j.pot >= 25000 then 1 else least(.9, 1 - power(1 - least(.05, .002 * public.fco_jackpot_pressure(j.pot)), hunters)) end;
    if not mini_done then
      -- Vòng này chưa ai trúng Giải Phụ: bot chưa săn Giải Đặc Biệt, cơ hội đó dành cho Giải Phụ.
      continue when roll >= special;
      kind := 'mini'; amount := floor(j.pot / 10); j.pot := j.pot - amount; mini_done := true;
    elsif roll < special then
      kind := 'special'; amount := j.pot; j.pot := 2000; mini_done := false;
    elsif roll < special + mini_odds and j.pot - floor(j.pot / 10) >= 15000 then
      kind := 'mini'; amount := floor(j.pot / 10); j.pot := j.pot - amount;
    else continue; end if;
    won_at := j.at - make_interval(secs => (run - 1 - i) * 2);
    j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_bot_name(), 'amount', amount, 'kind', kind,
      'time', (extract(epoch from won_at) * 1000)::bigint));
  end loop;
  update public.fco_jackpot set pot = j.pot, at = j.at, speed = j.speed, feed = j.feed where id = 1;
  return j;
end;
$$;

-- Như 202611090009, đổi mốc 10.000 → 15.000.
create or replace function public.fco_bilac_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot;
  price integer; balls text[]; top text; top_n integer; row_id text; row_points integer; row_rewards jsonb; row_weights integer[]; reward jsonb;
  plays jsonb := '[]'; fc_won bigint := 0; gained bigint := 0; share bigint; amount bigint; jp_kind text;
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
    -- x3 (trừ Special) chỉ giữ 40 % (FC x3 chỉ 10 %): còn lại lăn lại quả thứ 3 tới khi khác ô → thành hàng x2.
    if balls[1] = balls[2] and balls[2] = balls[3] and balls[1] <> 'special' and random() >= (case when balls[1] = 'fc' then 0.1 else 0.4 end) then
      loop balls[3] := public.fco_bilac_roll(); exit when balls[3] <> balls[1]; end loop;
    end if;
    -- Quỹ từ 15.000 FC và vòng này đã có Giải Phụ: thêm cơ hội ra Special x3 (Giải Đặc Biệt), tăng theo áp lực quỹ như bot.
    if j.pot >= 15000 and mini_done and not (balls[1] = 'special' and balls[2] = 'special' and balls[3] = 'special')
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
  return jsonb_build_object('plays', plays, 'paid', price, 'points', gained, 'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid));
end;
$$;

commit;
