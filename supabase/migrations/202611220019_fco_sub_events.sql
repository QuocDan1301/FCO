-- Acc phụ chơi được sự kiện Cờ tỷ phú (2026-11-23, người dùng: "Thiết lập acc phụ có thể chơi sự kiện"; sau 202611220018_fco_sub_market_buy.sql).
--   · Acc phụ lắc xúc xắc (FC / lượt miễn phí), nhận quà ô, quà mốc, Thẻ Cơ Hội / Khí Vận, Tuyển chọn như người chơi.
--   · KHÔNG đụng jackpot chung: không góp quỹ, không trúng Ultimate / Mini (quân không dừng ô 7 / 21), không lên bảng tin jackpot.
--   · Điểm đua top Cờ tỷ phú vẫn không ghi (trigger a_fco_sub_skip trên fco_ctp_race_points từ 202611220017).
--   · VQTG / Bi Lắc (đang ẩn) vẫn chặn acc phụ.
--   fco_ctp_play chép nguyên bản 202611220003_fco_ctp_cards.sql, fco_ctp_apply chép nguyên bản 202611220005_fco_ctp_race.sql; chỉ thêm nhánh acc phụ.
-- Chạy lại được.
begin;

drop trigger if exists a_fco_sub_block on public.fco_ctp_pending;
drop trigger if exists a_fco_sub_block_event on public.fco_wallets;
create trigger a_fco_sub_block_event before update of vqtg_pos, bilac_points on public.fco_wallets
  for each row execute function public.fco_sub_block_event();

create or replace function public.fco_ctp_play(p_count integer, p_mode text, p_chance boolean default false, p_exclude text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; rules jsonb := public.fco_ctp_rules(); price integer; ex text[]; pot bigint; a jsonb; b jsonb; note text;
begin
  if not public.fco_ctp_open() then raise exception 'FCO_EVENT_CLOSED' using errcode = 'P0001'; end if;
  if p_mode not in ('fc', 'free') then raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  if exists (select 1 from public.fco_ctp_pending where user_id = uid) then raise exception 'FCO_CTP_PENDING' using errcode = 'P0001'; end if;
  if p_mode = 'fc' then
    select (p->>'price')::integer into price from jsonb_array_elements(rules->'prices') p where (p->>'count')::integer = p_count;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    if p_count = 1 and not w.ctp_first_done then price := (rules->>'firstPrice')::integer; end if;
  else
    if p_count is null or p_count not between 1 and 100 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    if w.ctp_free < p_count then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
    price := 0;
  end if;
  if coalesce(p_chance, false) and w.ctp_card_chance < 1 then raise exception 'FCO_CTP_NO_CARD' using errcode = 'P0001'; end if;
  if p_exclude is not null then
    ex := array(select distinct x from unnest(p_exclude) x);
    if coalesce(array_length(ex, 1), 0) <> 3 or exists (select 1 from unnest(ex) x where not exists (select 1 from public.fco_ctp_rails r where r.id = x)) then
      raise exception 'FCO_CTP_BAD_EXCLUDE' using errcode = '22023';
    end if;
    if w.ctp_card_luck < 1 then raise exception 'FCO_CTP_NO_CARD' using errcode = 'P0001'; end if;
  end if;
  if price > 0 then perform public.fco_apply_fc(uid, -price, 'ctp', jsonb_build_object('count', p_count, 'chance', coalesce(p_chance, false), 'luck', ex is not null)); end if;
  update public.fco_wallets set ctp_free = ctp_free - case when p_mode = 'free' then p_count else 0 end,
    ctp_first_done = ctp_first_done or p_mode = 'fc',
    ctp_card_chance = ctp_card_chance - case when coalesce(p_chance, false) then 1 else 0 end,
    ctp_card_luck = ctp_card_luck - case when ex is not null then 1 else 0 end
    where user_id = uid;
  note := case when coalesce(p_chance, false) then ' · Thẻ Cơ Hội' else '' end || case when ex is not null then ' · Thẻ Khí Vận' else '' end;
  select j.pot into pot from public.fco_jackpot j where j.id = 1;
  -- Acc phụ (202611220019): quỹ coi như âm → không bao giờ đủ mức nổ Ultimate / Mini, quân không dừng ô 7 / 21.
  if public.fco_is_sub(uid) then pot := -1000000000000000; end if;
  a := public.fco_ctp_sim(p_count, w.ctp_pos, w.ctp_lucky, pot, w.ctp_jp_at, w.ctp_jp_prev, w.ctp_mini_at, w.ctp_mini_prev, ex);
  if coalesce(p_chance, false) then
    b := public.fco_ctp_sim(p_count, w.ctp_pos, w.ctp_lucky, pot, w.ctp_jp_at, w.ctp_jp_prev, w.ctp_mini_at, w.ctp_mini_prev, ex);
    insert into public.fco_ctp_pending (user_id, count, mode, price, exclude, outcomes) values (uid, p_count, p_mode, price, ex, jsonb_build_array(a, b));
    return jsonb_build_object('pending', public.fco_ctp_pending_view(uid), 'paid', price, 'wallet', public.fco_wallet_json(uid));
  end if;
  return public.fco_ctp_apply(uid, a, p_count, p_mode, price, note);
end;
$$;

create or replace function public.fco_ctp_apply(p_uid uuid, o jsonb, p_count integer, p_mode text, p_price integer, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  rules jsonb := public.fco_ctp_rules(); j public.fco_jackpot; p jsonb; reward jsonb; amount bigint; plays jsonb := '[]'; grants jsonb := '[]';
  fc_won bigint := 0; granted jsonb; sub boolean := public.fco_is_sub(p_uid); w public.fco_wallets; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- 202611220005: hết giờ đợt đua thì chốt bảng TRƯỚC khi lượt này cộng điểm.
  perform public.fco_ctp_race_tick();
  j := public.fco_jackpot_tick();
  for p in select value from jsonb_array_elements(o->'plays') loop
    if not sub and not coalesce((p->>'bonus')::boolean, false) then j.pot := j.pot + (rules->>'potPerPlay')::bigint; end if;
    reward := p->'reward';
    if not sub and jsonb_typeof(reward) = 'object' and reward ? 'jackpot' then
      if reward->>'jackpot' = 'special' then amount := j.pot; j.pot := 2000; else amount := floor(j.pot / 10); j.pot := j.pot - amount; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', reward->>'jackpot');
      p := jsonb_set(p, '{reward}', reward);
      j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_public_name(p_uid), 'uid', p_uid, 'amount', amount, 'kind', reward->>'jackpot', 'time', now_ms));
    end if;
    if jsonb_typeof(reward) = 'object' then
      if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
      grants := grants || jsonb_build_array(reward);
    end if;
    plays := plays || jsonb_build_array(p);
  end loop;
  -- Acc phụ không góp quỹ, không trúng, không lên bảng tin jackpot.
  if not sub then update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1; end if;
  update public.fco_wallets set ctp_pos = (o->>'pos')::integer, ctp_points = ctp_points + (o->>'ptsWon')::integer, ctp_free = ctp_free + (o->>'freeWon')::integer,
    ctp_lucky = (o->>'lucky')::integer, ctp_jp_at = (o->>'jpAt')::timestamptz, ctp_jp_prev = (o->>'jpPrev')::timestamptz,
    ctp_mini_at = (o->>'miniAt')::timestamptz, ctp_mini_prev = (o->>'miniPrev')::timestamptz
    where user_id = p_uid returning * into w;
  perform public.fco_ctp_race_add(p_uid, (o->>'ptsWon')::integer);
  if fc_won > 0 then perform public.fco_apply_fc(p_uid, fc_won, 'ctp_win', jsonb_build_object('count', p_count)); end if;
  granted := public.fco_inv_grant(p_uid, grants, 'event',
    'Cờ tỷ phú · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end || coalesce(p_note, ''),
    coalesce(nullif(public.fco_inv_reward_text(grants), ''), 'Không có quà') || ' · +' || (o->>'ptsWon') || ' điểm'
      || case when (o->>'freeWon')::integer > 0 then ' · +' || (o->>'freeWon') || ' lượt miễn phí' else '' end
      || case when p_price > 0 then ' · −' || public.fco_inv_money(p_price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', p_price, 'pos', w.ctp_pos, 'points', w.ctp_points, 'free', w.ctp_free, 'lucky', w.ctp_lucky,
    'jackpot', public.fco_jackpot_view(j, p_uid), 'wallet', public.fco_wallet_json(p_uid), 'save', granted);
end;
$$;

commit;
