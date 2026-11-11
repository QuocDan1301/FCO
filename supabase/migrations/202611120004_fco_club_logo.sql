-- Logo CLB do người chơi tự chọn (2026-11-12, sau 202611120003): dùng làm ảnh đại diện HLV (avatar, Thông tin HLV, BXH HLV)
-- và logo đội trong GLXH (bảng tỉ số, BXH GLXH). Lưu tên CLB (khoá trong src/clubLogos.json); game chỉ hiện khi có logo tương ứng.
begin;

alter table public.fco_wallets add column club_logo text check (club_logo is null or (char_length(club_logo) between 1 and 60 and club_logo !~ '[<>"\\]'));

create function public.fco_club_logo(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select club_logo from public.fco_wallets where user_id = p_uid
$$;

-- Người chơi chọn (p_club = tên CLB) hoặc bỏ (null) logo CLB.
create function public.fco_set_club_logo(p_club text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); c text := nullif(trim(coalesce(p_club, '')), '');
begin
  if c is not null and (char_length(c) > 60 or c ~ '[<>"\\]') then raise exception 'FCO_BAD_CLUB' using errcode = '22023'; end if;
  perform public.fco_wallet_lock(uid);
  update public.fco_wallets set club_logo = c, updated_at = now() where user_id = uid;
  return public.fco_wallet_json(uid);
end;
$$;

-- Như 202611110013, thêm logo CLB ('club').
create or replace function public.fco_wallet_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'fc', w.fc,
    'stp', w.stp,
    'dailyClaimed', w.daily is not distinct from public.fco_today(),
    'event', jsonb_build_object(
      'points', w.event_points, 'free', w.event_free,
      'paid', case when w.event_day = public.fco_today() then w.event_paid else 0 end,
      'missions', case when w.event_day = public.fco_today() then to_jsonb(w.event_missions) else '[]'::jsonb end),
    'checkin', case when w.checkin_date = public.fco_today()
      then jsonb_build_object('claimedToday', true, 'day', w.checkin_day, 'done', w.checkin_day)
      else jsonb_build_object('claimedToday', false, 'day', public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today()),
                              'done', public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today()) - 1) end,
    'bilac', jsonb_build_object('points', w.bilac_points, 'claimed', to_jsonb(w.bilac_claimed), 'freeToday', w.bilac_free_day is distinct from public.fco_today()),
    'membership', jsonb_build_object(
      'svip', (extract(epoch from w.svip_until) * 1000)::bigint,
      'premium', (extract(epoch from w.premium_until) * 1000)::bigint),
    'tier', public.fco_account_tier(w.user_id),
    'tierUntil', case when public.fco_account_tier(w.user_id) = 'premium' then (extract(epoch from w.account_tier_until) * 1000)::bigint end,
    'effect', public.fco_name_effect(w.user_id),
    'club', w.club_logo,
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

-- Như 202611110005, thêm logo CLB của từng HLV.
create or replace function public.fco_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); me public.fco_ranks;
begin
  select * into me from public.fco_ranks where user_id = uid;
  return jsonb_build_object(
    'ovr', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'ovr', t.best_ovr, 'playerId', t.best_player,
                       'level', t.best_level, 'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id), 'club', public.fco_club_logo(t.user_id)) order by t.best_ovr desc, t.best_at)
                     from (select * from public.fco_ranks where best_ovr > 0 order by best_ovr desc, best_at limit 10) t), '[]'::jsonb),
    'squad', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'value', t.squad_value, 'mine', t.user_id = uid,
                       'effect', public.fco_name_effect(t.user_id), 'club', public.fco_club_logo(t.user_id)) order by t.squad_value desc, t.squad_at)
                     from (select * from public.fco_ranks where squad_value > 0 order by squad_value desc, squad_at limit 10) t), '[]'::jsonb),
    'penalty', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'goals', t.penalty_best, 'mine', t.user_id = uid,
                       'effect', public.fco_name_effect(t.user_id), 'club', public.fco_club_logo(t.user_id)) order by t.penalty_best desc, t.penalty_at)
                     from (select * from public.fco_ranks where penalty_best > 0 order by penalty_best desc, penalty_at limit 10) t), '[]'::jsonb),
    'me', jsonb_build_object(
      'ovr', case when coalesce(me.best_ovr, 0) > 0 then me.best_ovr end,
      'ovrRank', case when coalesce(me.best_ovr, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                 where o.best_ovr > me.best_ovr or (o.best_ovr = me.best_ovr and o.best_at < me.best_at)) end,
      'squad', case when coalesce(me.squad_value, 0) > 0 then me.squad_value end,
      'squadRank', case when coalesce(me.squad_value, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                   where o.squad_value > me.squad_value or (o.squad_value = me.squad_value and o.squad_at < me.squad_at)) end,
      'penalty', case when coalesce(me.penalty_best, 0) > 0 then me.penalty_best end,
      'penaltyRank', case when coalesce(me.penalty_best, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                     where o.penalty_best > me.penalty_best or (o.penalty_best = me.penalty_best and o.penalty_at < me.penalty_at)) end));
end;
$$;

-- Như 202611120002, thêm logo CLB trên BXH GLXH.
create or replace function public.fco_ranked_state() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return jsonb_build_object('me', public.fco_ranked_me(uid),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'points', t.points, 'tier', public.fco_ranked_tier(t.points),
        'wins', t.wins, 'draws', t.draws, 'losses', t.losses, 'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id), 'club', public.fco_club_logo(t.user_id)) order by t.points desc, t.updated_at)
      from (select * from public.fco_ranked where wins + draws + losses > 0 order by points desc, updated_at limit 20) t), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('time', (extract(epoch from m.at) * 1000)::bigint, 'opponent', m.opponent,
        'for', m.goals_for, 'against', m.goals_against, 'delta', m.delta, 'points', m.points) order by m.at desc)
      from (select * from public.fco_ranked_matches where user_id = uid order by at desc limit 10) m), '[]'::jsonb));
end;
$$;

-- Như 202611120003, thêm logo CLB của hai đội.
create or replace function public.fco_ranked_play(p_team jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); d jsonb; me public.fco_ranked; s jsonb; card jsonb; base integer; claimed integer;
  slots jsonb := '[]'; uids text[] := '{}'; total integer := 0; my_ovr integer; v_formation text := left(coalesce(p_team->>'formation', ''), 12);
  opp public.fco_ranked; opp_name text; opp_ovr integer; opp_slots jsonb; opp_points integer; bot boolean := false;
  bot_roles constant text[] := array['LW', 'ST', 'RW', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK'];
  bot_names constant text[] := array['FC Sấm Sét', 'Hoàng Kim United', 'Rồng Xanh FC', 'Thép Đỏ', 'Bão Tố Athletic', 'Sao Bắc Đẩu', 'Lốc Xoáy FC', 'Đại Bàng Vàng',
    'Mũi Tên Bạc', 'Hổ Mang City', 'Ngựa Ô FC', 'Phượng Lửa'];
  d_ovr double precision; gm integer; go integer; goals jsonb := '[]'; minute integer; scorer integer; assist integer;
  expected double precision; result double precision; delta integer; pts integer; seed integer := floor(random() * 2147483647)::integer;
begin
  if jsonb_typeof(p_team->'slots') <> 'array' or jsonb_array_length(p_team->'slots') <> 11 then raise exception 'FCO_RANKED_TEAM' using errcode = '22023'; end if;
  insert into public.fco_ranked(user_id) values (uid) on conflict (user_id) do nothing;
  select * into me from public.fco_ranked where user_id = uid for update;
  if me.last_match_at is not null and now() - me.last_match_at < interval '3 seconds' then raise exception 'FCO_RANKED_TOO_FAST' using errcode = 'P0001'; end if;
  select data into d from public.fco_game_saves where user_id = uid;
  if d is null then raise exception 'FCO_NO_SAVE' using errcode = 'P0001'; end if;
  for s in select value from jsonb_array_elements(p_team->'slots') loop
    if s->>'uid' is null or s->>'uid' = any(uids) then raise exception 'FCO_RANKED_TEAM' using errcode = '22023'; end if;
    uids := uids || (s->>'uid');
    card := public.fco_inv_card(d, s->>'uid');
    if card is null then raise exception 'FCO_RANKED_CARD' using errcode = 'P0001'; end if;
    base := public.fco_inv_ovr((card->>'playerId')::integer, (card->>'level')::integer);
    if base is null then raise exception 'FCO_CATALOG_MISSING' using errcode = 'P0001'; end if;
    if jsonb_typeof(s->'ovr') <> 'number' or jsonb_typeof(s->'x') <> 'number' or jsonb_typeof(s->'y') <> 'number' then raise exception 'FCO_RANKED_TEAM' using errcode = '22023'; end if;
    claimed := least(greatest(round((s->>'ovr')::numeric)::integer, 1), base + 17);
    slots := slots || jsonb_build_array(jsonb_build_object('uid', s->>'uid', 'role', left(coalesce(s->>'role', 'CM'), 4), 'ovr', claimed,
      'x', least(greatest((s->>'x')::numeric, 0), 100), 'y', least(greatest((s->>'y')::numeric, 0), 100)));
    total := total + claimed;
  end loop;
  my_ovr := round(total / 11.0);

  -- Đối thủ: người chơi thật có đội hình, điểm gần (±150 rồi ±400), hoạt động trong 30 ngày, không bị khoá; không có thì đội máy.
  select r.* into opp from public.fco_ranked r join auth.users u on u.id = r.user_id
   where r.user_id <> uid and r.team is not null and r.updated_at > now() - interval '30 days' and coalesce(u.banned_until, '-infinity') < now()
     and abs(r.points - me.points) <= 150 order by random() limit 1;
  if opp.user_id is null then
    select r.* into opp from public.fco_ranked r join auth.users u on u.id = r.user_id
     where r.user_id <> uid and r.team is not null and r.updated_at > now() - interval '30 days' and coalesce(u.banned_until, '-infinity') < now()
       and abs(r.points - me.points) <= 400 order by random() limit 1;
  end if;
  if opp.user_id is not null then
    opp_name := public.fco_public_name(opp.user_id); opp_ovr := opp.team_ovr; opp_points := opp.points;
    select jsonb_agg(jsonb_build_object('role', x->>'role', 'ovr', x->'ovr', 'x', x->'x', 'y', x->'y') order by o) into opp_slots
      from jsonb_array_elements(opp.team) with ordinality t(x, o);
  else
    bot := true;
    opp_name := bot_names[1 + floor(random() * array_length(bot_names, 1))::integer];
    opp_ovr := greatest(40, my_ovr + floor(random() * 9)::integer - 4);
    opp_points := greatest(0, me.points + floor(random() * 101)::integer - 50);
    select jsonb_agg(jsonb_build_object('role', r, 'ovr', opp_ovr) order by o) into opp_slots from unnest(bot_roles) with ordinality t(r, o);
  end if;

  -- Kết quả: số bàn kỳ vọng mỗi bên theo chênh lệch OVR đội. Cân bằng (202611120003): mỗi 25 OVR ≈ ×e (trước 10),
  -- đội mạnh hơn vẫn nhiều cơ hội thắng hơn nhưng đội yếu hơn có thể lật kèo.
  d_ovr := my_ovr - opp_ovr;
  gm := public.fco_ranked_poisson(least(4.2, greatest(.35, 1.35 * exp(d_ovr / 25))));
  go := public.fco_ranked_poisson(least(4.2, greatest(.35, 1.35 * exp(-d_ovr / 25))));
  for i in 1 .. gm loop
    scorer := public.fco_ranked_pick(slots, false);
    assist := case when random() < .2 then null else public.fco_ranked_pick(slots, true, scorer) end;
    goals := goals || jsonb_build_array(jsonb_build_object('minute', 1 + floor(random() * 90)::integer, 'side', 'me', 'scorer', scorer, 'assist', assist));
  end loop;
  for i in 1 .. go loop
    scorer := public.fco_ranked_pick(opp_slots, false);
    assist := case when random() < .2 then null else public.fco_ranked_pick(opp_slots, true, scorer) end;
    goals := goals || jsonb_build_array(jsonb_build_object('minute', 1 + floor(random() * 90)::integer, 'side', 'opp', 'scorer', scorer, 'assist', assist));
  end loop;
  select coalesce(jsonb_agg(g order by (g->>'minute')::integer, o), '[]') into goals from jsonb_array_elements(goals) with ordinality t(g, o);

  -- Điểm Elo (K = 32); thắng ít nhất +5, thua ít nhất −5; không dưới 0.
  expected := 1 / (1 + power(10, (opp_points - me.points) / 400.0));
  result := case when gm > go then 1 when gm = go then .5 else 0 end;
  delta := round(32 * (result - expected));
  if result = 1 then delta := greatest(delta, 5); elsif result = 0 then delta := least(delta, -5); end if;
  pts := greatest(0, me.points + delta); delta := pts - me.points;
  update public.fco_ranked set points = pts, wins = wins + (result = 1)::integer, draws = draws + (result = .5)::integer, losses = losses + (result = 0)::integer,
    team = slots, team_ovr = my_ovr, formation = v_formation, last_match_at = now(), updated_at = now() where user_id = uid;
  insert into public.fco_ranked_matches(user_id, opponent, goals_for, goals_against, delta, points) values (uid, opp_name, gm, go, delta, pts);
  delete from public.fco_ranked_matches where user_id = uid and id not in (select id from public.fco_ranked_matches where user_id = uid order by at desc, id desc limit 30);

  return jsonb_build_object('seed', seed, 'score', jsonb_build_array(gm, go), 'goals', goals,
    'me', jsonb_build_object('ovr', my_ovr, 'formation', v_formation, 'slots', slots, 'club', public.fco_club_logo(uid)),
    'opp', jsonb_build_object('name', opp_name, 'ovr', opp_ovr, 'bot', bot, 'club', case when bot then null else public.fco_club_logo(opp.user_id) end, 'formation', case when bot then '4-3-3' else opp.formation end, 'slots', opp_slots),
    'delta', delta, 'points', pts, 'tier', public.fco_ranked_tier(pts), 'state', public.fco_ranked_me(uid));
end;
$$;

revoke all on function public.fco_club_logo(uuid) from public, anon, authenticated;
revoke all on function public.fco_set_club_logo(text) from public, anon;
grant execute on function public.fco_set_club_logo(text) to authenticated;

commit;
