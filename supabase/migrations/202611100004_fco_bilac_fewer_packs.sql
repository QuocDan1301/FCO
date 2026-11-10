-- Bi Lắc: giảm tiếp tỉ lệ nhận gói ngon trong bảng quà (2026-11-10, sau 202611100002). Danh sách quà và tỉ lệ bóng không đổi.
-- 1. Hàng có gói (CLB x3, Thẻ x3, CLB x2, Thẻ x2, Khác nhau): trọng số dốc hơn, vẫn tăng dần trái → phải (món trái ngon nhất, hiếm nhất).
-- 2. Hàng x3 CLB và Thẻ (gói ngon nhất) chỉ giữ 25 % số lần 3 bóng trùng nhau (trước 40 %); còn lại thành x2 như cũ.
--    CLB x3 ~0,88 % → ~0,55 %, Thẻ x3 ~1,44 % → ~0,90 % mỗi lượt. BP x3 giữ 40 %, FC x3 giữ 10 %, Special x3 không đổi.
--    Điểm trung bình mỗi lượt ~1,83 → ~1,81 (1 vòng 1.250 điểm ≈ 690 lượt thay vì ≈ 680).
begin;

update public.fco_bilac_rows set weights = case id
  when 'club3' then '{4,26,120,850}'::integer[]                 -- 26UP chỉ định 30 · 40 · 50 · 60          (trước 10 · 50 · 190 · 750)
  when 'card3' then '{4,26,120,850}'::integer[]                 -- 113+ · 112+ · 111+ · 110+                (trước 10 · 50 · 190 · 750)
  when 'club2' then '{2,10,38,100,250,600}'::integer[]          -- Top Price 60 · 125 · 150 · 175 · 200 · 225 (trước 5 · 25 · 70 · 150 · 280 · 470)
  when 'card2' then '{2,10,38,100,250,600}'::integer[]          -- WB All · 108+ LWBBG · 38M · 108+ LWB · 33M · 108+ LWBB (trước như CLB x2)
  when 'mixed' then '{1,5,14,30,60,120,220,550}'::integer[]     -- ICONTM · 34M · BLD/GRU/CU/24EP · 30M · 116+ mix · 25M · 117+ mix · 20M
                                                                 --   (trước 2 · 10 · 25 · 50 · 100 · 170 · 250 · 393)
  else weights end;

-- Như 202611090013, x3 CLB / Thẻ chỉ giữ 25 %.
-- Như 202611090009, đổi mốc 10.000 → 13.000.
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
    -- x3 (trừ Special) chỉ giữ: BP 40 %, CLB / Thẻ 25 %, FC 10 %: còn lại lăn lại quả thứ 3 tới khi khác ô → thành hàng x2.
    if balls[1] = balls[2] and balls[2] = balls[3] and balls[1] <> 'special' and random() >= (case balls[1] when 'fc' then 0.1 when 'bp' then 0.4 else 0.25 end) then
      loop balls[3] := public.fco_bilac_roll(); exit when balls[3] <> balls[1]; end loop;
    end if;
    -- Quỹ từ 13.000 FC và vòng này đã có Giải Phụ: thêm cơ hội ra Special x3 (Giải Đặc Biệt), tăng theo áp lực quỹ như bot.
    if j.pot >= 13000 and mini_done and not (balls[1] = 'special' and balls[2] = 'special' and balls[3] = 'special')
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
