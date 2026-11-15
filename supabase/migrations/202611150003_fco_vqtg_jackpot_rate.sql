begin;

-- Vòng Quanh Thế Giới: giảm tỷ lệ Giải Đặc Biệt (2026-11-15). Chạy SAU 202611150002_fco_vqtg_race_settle.sql. Chạy lại được.
-- 0,96 % → 0,6 % mỗi lần dừng ô 14 (vẫn cố định, không tăng theo quỹ; mỗi tài khoản tối đa 1 lần / 24 giờ như 202611150001).
-- Ô 14 được dừng ~6,75 % số lượt → trung bình 1 lần trúng / ~2.500 lượt (~44.000 FC), trước là ~1.550 lượt (~28.000 FC).
-- Mini Jackpot (ô 10) giữ nguyên 6 %.

create or replace function public.fco_vqtg_play(p_count integer, p_mode text, p_pick integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot; rules jsonb := public.fco_vqtg_rules();
  t_kind text; t_rewards jsonb; t_weights integer[];
  price integer; share bigint; pos integer; roll integer; dest integer; reward jsonb; extra jsonb; amount bigint; jp_kind text;
  picks integer; got_pick integer := 0; got_tickets integer := 0; t_gain integer; plays jsonb := '[]'; grants jsonb := '[]'; fc_won bigint := 0; granted jsonb;
  r double precision; jp_at timestamptz; mini_at timestamptz; mini_feed jsonb; mini bigint; special_chance double precision; hit text; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
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
        -- 202611150001: mỗi tài khoản trúng Mini Jackpot tối đa 1 lần / 24 giờ.
        if (mini_at is null or mini_at <= now() - interval '24 hours') and random() < (rules->>'bpChance')::double precision then
          hit := 'mini'; mini_at := now();
        end if;
      else
        -- 202611150001: tỷ lệ CỐ ĐỊNH 0,96 % mỗi lần dừng ô 14 (giữ mức gấp 3 của 202611140019 nhưng KHÔNG tăng theo áp lực quỹ:
        -- quỹ ≥ 15.000 FC thì mỗi lượt 18 FC lời trung bình 19–134 FC → người chơi canh quỹ cao spam lượt). Mỗi tài khoản trúng
        -- Giải Đặc Biệt tối đa 1 lần / 24 giờ.
        -- 202611150003: người dùng giảm 0,96 % → 0,6 % (≈ 1 lần / 2.500 lượt quay khi quỹ ≥ 10.000 FC).
        if (jp_at is null or jp_at <= now() - interval '24 hours') and random() < .006 then hit := 'special'; jp_at := now(); end if;
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
  update public.fco_wallets set vqtg_pos = pos, vqtg_picks = picks, vqtg_tickets = vqtg_tickets + got_tickets, vqtg_jp_at = jp_at, vqtg_mini_at = mini_at
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

commit;
