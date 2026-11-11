-- GLXH: trận chạy theo thời gian thật, không tua / không dừng (2026-11-12, sau 202611120004).
--   · fco_ranked_play quyết định kết quả như trước nhưng chưa cộng / trừ điểm: lưu trận đang đá (kịch bản + giờ bắt đầu) ở fco_ranked_pending.
--   · Tải lại tab, tắt máy KHÔNG ảnh hưởng trận: mở lại GLXH khi trận chưa hết thì xem tiếp đúng thời điểm (fco_ranked_state 'live');
--     trận đã hết giờ (>= 140 giây) thì tự tính kết quả thật.
--   · Hết trận game gọi fco_ranked_finish (máy chủ chỉ nhận khi đã qua >= 140 giây → không tua / bỏ qua được).
--   · Chỉ khi người chơi bấm Bỏ trận (fco_ranked_abandon) mới bị xử thua 0 – 3.
begin;

create table public.fco_ranked_pending (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  goals_for integer not null, goals_against integer not null,
  opponent text not null, opp_points integer not null,
  team jsonb, team_ovr integer, formation text, match jsonb
);
alter table public.fco_ranked_pending enable row level security;

-- Tính điểm Elo một trận và ghi lịch sử (K = 32; thắng ít nhất +5, thua ít nhất −5; không dưới 0).
create function public.fco_ranked_settle(p_uid uuid, p_for integer, p_against integer, p_opponent text, p_opp_points integer,
  p_team jsonb, p_team_ovr integer, p_formation text) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me public.fco_ranked; expected double precision; result double precision; delta integer; pts integer;
begin
  select * into me from public.fco_ranked where user_id = p_uid for update;
  expected := 1 / (1 + power(10, (p_opp_points - me.points) / 400.0));
  result := case when p_for > p_against then 1 when p_for = p_against then .5 else 0 end;
  delta := round(32 * (result - expected));
  if result = 1 then delta := greatest(delta, 5); elsif result = 0 then delta := least(delta, -5); end if;
  pts := greatest(0, me.points + delta); delta := pts - me.points;
  update public.fco_ranked set points = pts, wins = wins + (result = 1)::integer, draws = draws + (result = .5)::integer, losses = losses + (result = 0)::integer,
    team = coalesce(p_team, team), team_ovr = coalesce(p_team_ovr, team_ovr), formation = coalesce(p_formation, formation), updated_at = now() where user_id = p_uid;
  insert into public.fco_ranked_matches(user_id, opponent, goals_for, goals_against, delta, points) values (p_uid, p_opponent, p_for, p_against, delta, pts);
  delete from public.fco_ranked_matches where user_id = p_uid and id not in (select id from public.fco_ranked_matches where user_id = p_uid order by at desc, id desc limit 30);
  return jsonb_build_object('delta', delta, 'points', pts, 'tier', public.fco_ranked_tier(pts), 'score', jsonb_build_array(p_for, p_against));
end;
$$;

-- Trận đang lưu: đã hết giờ (>= 140 giây) thì tính kết quả thật và trả false; còn đang diễn thì trả true; không có trận thì false.
create function public.fco_ranked_resolve(p_uid uuid) returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare p public.fco_ranked_pending;
begin
  select * into p from public.fco_ranked_pending where user_id = p_uid for update;
  if not found then return false; end if;
  if now() - p.started_at < interval '140 seconds' then return true; end if;
  delete from public.fco_ranked_pending where user_id = p_uid;
  perform public.fco_ranked_settle(p_uid, p.goals_for, p.goals_against, p.opponent, p.opp_points, p.team, p.team_ovr, p.formation);
  return false;
end;
$$;

-- Hết trận (game xem tới phút 90): trả kết quả. Chưa đủ 140 giây thì từ chối; trận đã được tính rồi (mở ở máy khác) thì trả lại kết quả đó.
create function public.fco_ranked_finish() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); p public.fco_ranked_pending; m public.fco_ranked_matches; result jsonb;
begin
  select * into p from public.fco_ranked_pending where user_id = uid for update;
  if found then
    if now() - p.started_at < interval '140 seconds' then raise exception 'FCO_RANKED_EARLY' using errcode = 'P0001'; end if;
    delete from public.fco_ranked_pending where user_id = uid;
    result := public.fco_ranked_settle(uid, p.goals_for, p.goals_against, p.opponent, p.opp_points, p.team, p.team_ovr, p.formation);
  else
    select * into m from public.fco_ranked_matches where user_id = uid order by at desc, id desc limit 1;
    if not found then raise exception 'FCO_RANKED_NO_MATCH' using errcode = 'P0001'; end if;
    result := jsonb_build_object('delta', m.delta, 'points', m.points, 'tier', public.fco_ranked_tier(m.points), 'score', jsonb_build_array(m.goals_for, m.goals_against));
  end if;
  return result || jsonb_build_object('state', public.fco_ranked_me(uid));
end;
$$;

-- Người chơi bấm Bỏ trận: xử thua 0 – 3 ngay.
create function public.fco_ranked_abandon() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); p public.fco_ranked_pending; result jsonb;
begin
  delete from public.fco_ranked_pending where user_id = uid returning * into p;
  if p.user_id is null then raise exception 'FCO_RANKED_NO_MATCH' using errcode = 'P0001'; end if;
  result := public.fco_ranked_settle(uid, 0, 3, p.opponent || ' (bỏ trận)', p.opp_points, null, null, null);
  return result || jsonb_build_object('state', public.fco_ranked_me(uid));
end;
$$;

-- Như 202611120004: tự tính trận đã hết giờ, trả trận đang diễn ('live') để xem tiếp.
create or replace function public.fco_ranked_state() returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  -- Trận đã hết giờ (người chơi tải lại / tắt máy giữa trận) thì tính kết quả thật; trận còn đang diễn thì trả về để xem tiếp.
  perform public.fco_ranked_resolve(uid);
  return jsonb_build_object('me', public.fco_ranked_me(uid), 'live', (select p.match || jsonb_build_object('minSeconds', 140,
      'elapsed', extract(epoch from now() - p.started_at)) from public.fco_ranked_pending p where p.user_id = uid),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'points', t.points, 'tier', public.fco_ranked_tier(t.points),
        'wins', t.wins, 'draws', t.draws, 'losses', t.losses, 'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id), 'club', public.fco_club_logo(t.user_id)) order by t.points desc, t.updated_at)
      from (select * from public.fco_ranked where wins + draws + losses > 0 order by points desc, updated_at limit 20) t), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('time', (extract(epoch from m.at) * 1000)::bigint, 'opponent', m.opponent,
        'for', m.goals_for, 'against', m.goals_against, 'delta', m.delta, 'points', m.points) order by m.at desc)
      from (select * from public.fco_ranked_matches where user_id = uid order by at desc limit 10) m), '[]'::jsonb));
end;
$$;

-- Như 202611120004: chưa tính điểm ngay, lưu trận đang đá.
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
  -- Trận trước: đang diễn thì không cho đá trận mới (game mở lại xem tiếp); đã hết giờ thì tính kết quả thật trước.
  if public.fco_ranked_resolve(uid) then raise exception 'FCO_RANKED_IN_PROGRESS' using errcode = 'P0001'; end if;
  select * into me from public.fco_ranked where user_id = uid;
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

  -- Chưa tính điểm: trận chạy ~150 giây theo đồng hồ máy chủ. Hết giờ mới tính (fco_ranked_finish / fco_ranked_resolve).
  insert into public.fco_ranked_pending(user_id, goals_for, goals_against, opponent, opp_points, team, team_ovr, formation, match)
  values (uid, gm, go, opp_name, opp_points, slots, my_ovr, v_formation, jsonb_build_object('seed', seed, 'score', jsonb_build_array(gm, go), 'goals', goals,
    'me', jsonb_build_object('ovr', my_ovr, 'formation', v_formation, 'slots', slots, 'club', public.fco_club_logo(uid)),
    'opp', jsonb_build_object('name', opp_name, 'ovr', opp_ovr, 'bot', bot, 'club', case when bot then null else public.fco_club_logo(opp.user_id) end,
      'formation', case when bot then '4-3-3' else opp.formation end, 'slots', opp_slots)));
  update public.fco_ranked set last_match_at = now(), updated_at = now() where user_id = uid;

  return (select match from public.fco_ranked_pending where user_id = uid) || jsonb_build_object('minSeconds', 140, 'elapsed', 0);
end;
$$;

revoke all on function public.fco_ranked_settle(uuid, integer, integer, text, integer, jsonb, integer, text), public.fco_ranked_resolve(uuid) from public, anon, authenticated;
revoke all on function public.fco_ranked_finish(), public.fco_ranked_abandon() from public, anon;
grant execute on function public.fco_ranked_finish(), public.fco_ranked_abandon() to authenticated;

commit;
