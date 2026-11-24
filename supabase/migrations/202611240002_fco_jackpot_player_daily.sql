-- Người chơi trúng Giải Đặc Biệt tối đa 1 lần mỗi ngày (2026-11-24, người dùng: "giảm người chơi xuống 1 lần/ngày").
--   · Vòng Quanh Thế Giới (fco_vqtg_play, ô 14) và Cờ tỷ phú (fco_ctp_sim, ô Ultimate Prize): trước 2 lần / 24 giờ, nay 1 lần / ngày
--     (ngày theo giờ Việt Nam, đặt lại lúc 00:00 — cùng cách tính với bot ở 202611240001). Mini Jackpot giữ nguyên 2 lần / 24 giờ.
--   · Tỉ lệ trúng, số tiền, quỹ chung không đổi; chỉ đổi điều kiện "được trúng". Dùng lại cột vqtg_jp_at / ctp_jp_at (lần trúng gần nhất).
--   Chạy SAU 202611240001_fco_jackpot_daily_special.sql. Chạy lại được.
begin;

create or replace function public.fco_vqtg_play(p_count integer, p_mode text, p_pick integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot; rules jsonb := public.fco_vqtg_rules();
  t_kind text; t_rewards jsonb; t_weights integer[];
  price integer; share bigint; pos integer; roll integer; dest integer; reward jsonb; extra jsonb; amount bigint; jp_kind text;
  picks integer; got_pick integer := 0; got_tickets integer := 0; t_gain integer; plays jsonb := '[]'; grants jsonb := '[]'; fc_won bigint := 0; granted jsonb;
  r double precision; jp_at timestamptz; mini_at timestamptz; jp_prev timestamptz; mini_prev timestamptz; mini_feed jsonb; mini bigint; special_chance double precision; hit text; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- 202611150002: hết giờ Đua top thì chốt bảng TRƯỚC khi lượt này cộng vé.
  perform public.fco_vqtg_race_tick();
  if p_mode = 'fc' then
    select (p->>'price')::integer into price from jsonb_array_elements(rules->'prices') p where (p->>'count')::integer = p_count;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  elsif p_mode = 'free' then
    if p_count is distinct from 1 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    price := 0;
  else raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  if p_pick is not null and (p_count <> 1 or p_pick not between 1 and 6) then raise exception 'FCO_BAD_PICK' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  pos := w.vqtg_pos; picks := w.vqtg_picks; jp_at := w.vqtg_jp_at; mini_at := w.vqtg_mini_at;
  jp_prev := w.vqtg_jp_prev; mini_prev := w.vqtg_mini_prev;   -- lần trúng gần nhất và lần trước đó
  if p_pick is not null then
    if picks < 1 then raise exception 'FCO_NO_PICKS' using errcode = 'P0001'; end if;
    if (select kind from public.fco_vqtg_tiles where idx = (pos + p_pick - 1) % 16 + 1) in ('bp', 'jackpot') then
      raise exception 'FCO_PICK_BLOCKED' using errcode = 'P0001';
    end if;
    picks := picks - 1;
    price := 0;   -- Lượt dùng Chỉ định miễn phí (202611130018): không trừ FC, vẫn được vé.
  end if;
  if p_mode = 'free' and p_pick is null then
    if w.vqtg_free_day is not distinct from public.fco_today() then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
    update public.fco_wallets set vqtg_free_day = public.fco_today() where user_id = uid;
  elsif price > 0 then
    perform public.fco_apply_fc(uid, -price, 'vqtg', jsonb_build_object('count', p_count));
  end if;
  j := public.fco_jackpot_tick();
  select feed into mini_feed from public.fco_vqtg_state where id = 1 for update;
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    roll := coalesce(p_pick, 1 + floor(random() * 6)::integer);
    dest := (pos + roll - 1) % 16 + 1;
    -- Ô 10 (Mini Jackpot) / ô 14 (Giải Đặc Biệt): quay thưởng ngay khi số lắc rơi vào ô (mỗi lượt tối đa 1 lần, tỷ lệ như cũ).
    -- Chỉ TRÚNG mới được đứng ở ô đó (202611140007); trượt, hoặc quỹ Jackpot chưa tới 10.000 FC (202611130019), thì lắc lại tới khi
    -- ra ô khác, vé tính theo số lắc cuối. Chỉ định vốn không chọn được ô 10 / 14.
    hit := null;
    if p_pick is null and dest in (10, 14) and j.pot >= 10000 then
      if dest = 10 then
        -- 202611150004: mỗi tài khoản trúng Mini Jackpot tối đa 2 lần / 24 giờ (lần trúng trước-gần-nhất đã quá 24 giờ).
        if (mini_prev is null or mini_prev <= now() - interval '24 hours') and random() < (rules->>'bpChance')::double precision then
          hit := 'mini'; mini_prev := mini_at; mini_at := now();
        end if;
      else
        -- 202611150001: tỷ lệ CỐ ĐỊNH 0,96 % mỗi lần dừng ô 14 (giữ mức gấp 3 của 202611140019 nhưng KHÔNG tăng theo áp lực quỹ:
        -- quỹ ≥ 15.000 FC thì mỗi lượt 18 FC lời trung bình 19–134 FC → người chơi canh quỹ cao spam lượt). Mỗi tài khoản trúng
        -- Giải Đặc Biệt tối đa 1 lần / 24 giờ.
        -- 202611150003: người dùng giảm 0,96 % → 0,6 % (≈ 1 lần / 2.500 lượt quay khi quỹ ≥ 10.000 FC).
        -- 202611150004: tăng 0,6 % → 0,8 %, mỗi tài khoản trúng tối đa 2 lần / 24 giờ.
        if (jp_at is null or (jp_at at time zone 'Asia/Ho_Chi_Minh')::date < public.fco_today()) and random() < .008 then hit := 'special'; jp_prev := jp_at; jp_at := now(); end if;
      end if;
    end if;
    while p_pick is null and hit is null and dest in (10, 14) loop
      roll := 1 + floor(random() * 6)::integer;
      dest := (pos + roll - 1) % 16 + 1;
    end loop;
    t_gain := (rules->'rollTickets'->>(roll - 1))::integer;
    got_tickets := got_tickets + t_gain;
    select kind, rewards, weights into t_kind, t_rewards, t_weights from public.fco_vqtg_tiles where idx = dest;
    reward := null; extra := '{}';
    if t_kind = 'pick' then
      picks := picks + 1; got_pick := got_pick + 1; extra := '{"pick": 1}';
    elsif t_kind = 'bp' then
      -- Mini Jackpot: BP theo quỹ Jackpot FC hiện tại; trúng ở ô 10 không làm quỹ FC giảm.
      if hit = 'mini' then
        mini := j.pot * (rules->>'bpPerJackpotFc')::bigint;
        reward := jsonb_build_object('bp', mini); extra := '{"pool": true}';
        mini_feed := public.fco_jackpot_push(mini_feed, jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', mini, 'time', now_ms));
      else reward := public.fco_vqtg_tile_reward(t_rewards, t_weights); end if;
    elsif t_kind = 'jackpot' then
      -- Như Bi Lắc: từ 10.000 FC cơ hội Giải Đặc Biệt tăng theo áp lực quỹ (×16 vì ô này được dừng ~1/16 số lượt).
      -- Ô 14 chỉ có Giải Đặc Biệt (cả quỹ FC), không có Giải Phụ: mini jackpot của sự kiện này là quỹ BP ở ô 10.
      -- Đã quay thưởng lúc lắc (hit); tới được đây nghĩa là đã trúng.
      jp_kind := case when hit = 'special' then 'special' end;
      -- Jackpot nổ thì Mini Jackpot nổ cùng lúc nhưng về tay HLV khác (fco_vqtg_sync_mini ghi tin sau vòng lặp); người trúng Jackpot
      -- chỉ nhận FC. Cả hai về mức thấp (Mini Jackpot tính theo quỹ FC).
      if jp_kind = 'special' then amount := j.pot; j.pot := 2000; end if;
      if jp_kind is not null then
        reward := jsonb_build_object('fc', amount, 'jackpot', jp_kind);
        j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', jp_kind, 'time', now_ms));
      else reward := public.fco_vqtg_tile_reward(t_rewards, t_weights); end if;
    else
      reward := public.fco_vqtg_tile_reward(t_rewards, t_weights);
    end if;
    if reward is not null then
      if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
      grants := grants || jsonb_build_array(reward);
    end if;
    plays := plays || (jsonb_build_object('roll', roll, 'from', pos, 'to', dest, 'kind', t_kind, 'reward', reward, 'tickets', t_gain) || extra);
    pos := dest;
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_vqtg_state set feed = mini_feed where id = 1;
  mini_feed := public.fco_vqtg_sync_mini();
  update public.fco_wallets set vqtg_pos = pos, vqtg_picks = picks, vqtg_tickets = vqtg_tickets + got_tickets, vqtg_jp_at = jp_at, vqtg_mini_at = mini_at,
    vqtg_jp_prev = jp_prev, vqtg_mini_prev = mini_prev
    where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'vqtg_win', jsonb_build_object('count', p_count)); end if;
  granted := public.fco_inv_grant(uid, grants, 'event',
    'Vòng Quanh Thế Giới · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end || case when p_pick is not null then ' · chỉ định ' || p_pick else '' end,
    coalesce(nullif(public.fco_inv_reward_text(grants), ''), 'Không có quà') || ' · +' || got_tickets || ' vé' || case when got_pick > 0 then ' · +' || got_pick || ' Chỉ định' else '' end
      || case when price > 0 then ' · −' || public.fco_inv_money(price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', price, 'picks', picks, 'pos', pos, 'tickets', w.vqtg_tickets + got_tickets, 'bpPool', j.pot * (rules->>'bpPerJackpotFc')::bigint, 'miniFeed', public.fco_vqtg_mini_feed(mini_feed, uid),
    'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

create or replace function public.fco_ctp_sim(p_count integer, p_pos integer, p_lucky integer, p_pot bigint,
  p_jp_at timestamptz, p_jp_prev timestamptz, p_mini_at timestamptz, p_mini_prev timestamptz, p_exclude text[]) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  rules jsonb := public.fco_ctp_rules(); pos integer := p_pos; lucky integer := p_lucky; pot bigint := p_pot;
  jp_at timestamptz := p_jp_at; jp_prev timestamptz := p_jp_prev; mini_at timestamptz := p_mini_at; mini_prev timestamptz := p_mini_prev;
  moves integer; dbl boolean; next_dbl boolean; is_bonus boolean; roll integer; steps integer; dest integer; pts integer; kind text;
  shot jsonb; reward jsonb; extra jsonb; amount bigint; gain integer; old_lucky integer; win text; bonus integer := (rules->>'maxRollBonus')::integer;
  plays jsonb := '[]'; pts_won integer := 0; free_won integer := 0; jmin bigint := (rules->>'jackpotMin')::bigint;
begin
  for i in 1 .. p_count loop
    pot := pot + (rules->>'potPerPlay')::bigint;
    moves := 1; dbl := false; is_bonus := false;
    while moves > 0 loop
      moves := moves - 1; next_dbl := false;
      roll := 1 + floor(random() * 6)::integer;
      steps := roll + case when roll = 6 then bonus else 0 end;
      dest := (pos + steps - 1) % 28 + 1;
      kind := case dest when 7 then 'mini' when 14 then 'special' when 21 then 'ultimate' when 28 then 'lucky' else 'ball' end;
      -- Tới ô Ultimate (21) / Mini (7): quay trúng / trượt như cũ (tỷ lệ không đổi).
      win := null;
      if kind = 'ultimate' and pot >= jmin and (jp_at is null or (jp_at at time zone 'Asia/Ho_Chi_Minh')::date < public.fco_today())
         and random() < (rules->>'ultimateChance')::double precision then win := 'special';
      elsif kind = 'mini' and pot >= jmin and (mini_prev is null or mini_prev <= now() - interval '24 hours')
         and random() < (rules->>'miniChance')::double precision then win := 'mini';
      end if;
      -- Trượt thì KHÔNG dừng ở ô Jackpot: lắc lại trong các số không vào ô 7 / 21 (luôn còn ≥ 4 số vì 2 ô cách nhau 14).
      if kind in ('ultimate', 'mini') and win is null then
        select r into roll from generate_series(1, 6) r
          where (pos + r + case when r = 6 then bonus else 0 end - 1) % 28 + 1 not in (7, 21)
          order by random() limit 1;
        steps := roll + case when roll = 6 then bonus else 0 end;
        dest := (pos + steps - 1) % 28 + 1;
        kind := case dest when 14 then 'special' when 28 then 'lucky' else 'ball' end;
      end if;
      pts := (rules->'rollPoints'->>(roll - 1))::integer * case when dbl then 2 else 1 end;
      reward := null; extra := '{}'; shot := null;
      if kind = 'special' then
        moves := moves + 1; next_dbl := true;
      elsif win = 'special' then
        reward := jsonb_build_object('fc', pot, 'jackpot', 'special'); pot := 2000; jp_prev := jp_at; jp_at := now();
      elsif win = 'mini' then
        amount := floor(pot / 10); pot := pot - amount; mini_prev := mini_at; mini_at := now();
        reward := jsonb_build_object('fc', amount, 'jackpot', 'mini');
      else
        shot := public.fco_ctp_shot(dbl, p_exclude); reward := shot->'reward';
        extra := jsonb_build_object('rail', shot->>'rail', 'slot', (shot->>'slot')::integer);
        if kind = 'lucky' then
          old_lucky := lucky;
          -- Số đổ vào ô ≥ Số may mắn → 2 lượt, nhỏ hơn → 1 lượt; Số may mắn lần sau = chính số vừa đổ vào ô (202611220016).
          gain := case when roll >= lucky then (rules->>'luckyMore')::integer else (rules->>'luckyLess')::integer end;
          free_won := free_won + gain;
          lucky := roll;
          extra := extra || jsonb_build_object('free', gain, 'lucky', old_lucky);
        end if;
      end if;
      pts_won := pts_won + pts;
      plays := plays || (jsonb_build_object('roll', roll, 'steps', steps, 'from', pos, 'to', dest, 'kind', kind, 'reward', reward,
        'points', pts, 'double', dbl, 'bonus', is_bonus) || extra);
      pos := dest; dbl := next_dbl; is_bonus := next_dbl;
    end loop;
  end loop;
  return jsonb_build_object('plays', plays, 'pos', pos, 'lucky', lucky, 'ptsWon', pts_won, 'freeWon', free_won,
    'jpAt', jp_at, 'jpPrev', jp_prev, 'miniAt', mini_at, 'miniPrev', mini_prev);
end;
$$;

commit;
