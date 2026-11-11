-- Xếp hạng giả lập (2026-11-12, sau 202611120001). Người chơi bấm Tìm trận: máy chủ ghép đối thủ (đội hình người chơi thật có điểm gần,
-- không có thì đội máy), tính kết quả theo sức mạnh đội hình, cộng / trừ điểm xếp hạng (Elo). Game chỉ diễn lại trận (src/ranked-sim.ts)
-- đúng tỉ số, phút ghi bàn, cầu thủ ghi bàn / kiến tạo máy chủ đã quyết → không gian lận kết quả. Không giới hạn số trận (chỉ cách nhau >= 3 giây).
--   · Đội hình: game gửi 11 ô của bộ đội hình đang dùng (uid thẻ, vị trí, toạ độ, OVR theo vị trí + team color). Máy chủ kiểm tra thẻ có trong kho
--     của người chơi (lấy cầu thủ / cấp từ kho máy chủ, không tin trình duyệt) và chặn OVR không vượt OVR thẻ (bộ dữ liệu đã đồng bộ) + 17.
--   · Điểm bắt đầu 1000; bậc ở fco_ranked_tier, khớp src/ranked.ts (tests/ranked.test.ts). Chưa có quà (người dùng chọn làm sau).
begin;

create table public.fco_ranked (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 1000 check (points >= 0),
  wins integer not null default 0, draws integer not null default 0, losses integer not null default 0,
  team jsonb, team_ovr integer, formation text,
  last_match_at timestamptz, updated_at timestamptz not null default now()
);
create index fco_ranked_points on public.fco_ranked(points desc);
alter table public.fco_ranked enable row level security;

create table public.fco_ranked_matches (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  opponent text not null,
  goals_for integer not null, goals_against integer not null,
  delta integer not null, points integer not null
);
create index fco_ranked_matches_user on public.fco_ranked_matches(user_id, at desc);
alter table public.fco_ranked_matches enable row level security;

-- Bậc theo điểm (khớp RANKED_TIERS trong src/ranked.ts).
create function public.fco_ranked_tier(p_points integer) returns text language sql immutable set search_path = '' as $$
  select case when p_points >= 1900 then 'legend' when p_points >= 1700 then 'elite' when p_points >= 1500 then 'diamond'
              when p_points >= 1300 then 'platinum' when p_points >= 1100 then 'gold' when p_points >= 900 then 'silver' else 'bronze' end
$$;

-- Số bàn theo phân phối Poisson (Knuth), tối đa 9.
create function public.fco_ranked_poisson(p_lambda double precision) returns integer language plpgsql volatile set search_path = '' as $$
declare l double precision := exp(-p_lambda); k integer := 0; p double precision := 1;
begin
  loop
    p := p * random();
    exit when p <= l or k >= 9;
    k := k + 1;
  end loop;
  return k;
end;
$$;

-- Trọng số ghi bàn / kiến tạo theo vị trí.
create function public.fco_ranked_weight(p_role text, p_assist boolean) returns double precision language sql immutable set search_path = '' as $$
  select case when not p_assist then case
      when p_role in ('ST', 'CF', 'LS', 'RS') then 30 when p_role in ('LW', 'RW', 'LF', 'RF') then 20 when p_role in ('CAM', 'LAM', 'RAM') then 14
      when p_role in ('LM', 'RM') then 10 when p_role in ('CM', 'LCM', 'RCM') then 7 when p_role in ('CDM', 'LDM', 'RDM', 'LWB', 'RWB') then 4
      when p_role in ('LB', 'RB') then 3 when p_role in ('CB', 'LCB', 'RCB', 'SW') then 2 else 0 end
    else case
      when p_role in ('CAM', 'LAM', 'RAM') then 25 when p_role in ('LW', 'RW', 'LF', 'RF') then 22 when p_role in ('LM', 'RM') then 18
      when p_role in ('CM', 'LCM', 'RCM') then 15 when p_role in ('ST', 'CF', 'LS', 'RS') then 12 when p_role in ('LB', 'RB', 'LWB', 'RWB', 'CDM', 'LDM', 'RDM') then 8
      when p_role in ('CB', 'LCB', 'RCB', 'SW') then 3 else 1 end end
$$;

-- Chọn chỉ số ô (0…10) theo trọng số vị trí × (OVR/100)²; p_skip = ô không được chọn (người ghi bàn khi chọn kiến tạo).
create function public.fco_ranked_pick(p_slots jsonb, p_assist boolean, p_skip integer default -1) returns integer language plpgsql volatile set search_path = '' as $$
declare total double precision := 0; r double precision; s jsonb; i integer := 0; w double precision;
begin
  for s in select value from jsonb_array_elements(p_slots) loop
    if i <> p_skip then total := total + public.fco_ranked_weight(s->>'role', p_assist) * power(coalesce((s->>'ovr')::double precision, 100) / 100, 2); end if;
    i := i + 1;
  end loop;
  r := random() * total; i := 0;
  for s in select value from jsonb_array_elements(p_slots) loop
    if i <> p_skip then
      w := public.fco_ranked_weight(s->>'role', p_assist) * power(coalesce((s->>'ovr')::double precision, 100) / 100, 2);
      if r < w then return i; end if;
      r := r - w;
    end if;
    i := i + 1;
  end loop;
  return 0;
end;
$$;

create function public.fco_ranked_me(p_uid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('points', coalesce(r.points, 1000), 'tier', public.fco_ranked_tier(coalesce(r.points, 1000)),
    'wins', coalesce(r.wins, 0), 'draws', coalesce(r.draws, 0), 'losses', coalesce(r.losses, 0),
    'rank', case when r.user_id is not null and r.wins + r.draws + r.losses > 0 then 1 + (select count(*) from public.fco_ranked o where o.points > r.points and o.wins + o.draws + o.losses > 0) end)
  from (select 1) one left join public.fco_ranked r on r.user_id = p_uid
$$;

-- Trạng thái: của mình, top 20, 10 trận gần nhất.
create function public.fco_ranked_state() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return jsonb_build_object('me', public.fco_ranked_me(uid),
    'top', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'points', t.points, 'tier', public.fco_ranked_tier(t.points),
        'wins', t.wins, 'draws', t.draws, 'losses', t.losses, 'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id)) order by t.points desc, t.updated_at)
      from (select * from public.fco_ranked where wins + draws + losses > 0 order by points desc, updated_at limit 20) t), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('time', (extract(epoch from m.at) * 1000)::bigint, 'opponent', m.opponent,
        'for', m.goals_for, 'against', m.goals_against, 'delta', m.delta, 'points', m.points) order by m.at desc)
      from (select * from public.fco_ranked_matches where user_id = uid order by at desc limit 10) m), '[]'::jsonb));
end;
$$;

-- Đá một trận. p_team = { formation, slots: [{ uid, role, x, y, ovr } × 11] } của bộ đội hình đang dùng.
create function public.fco_ranked_play(p_team jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
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

  -- Kết quả: số bàn kỳ vọng mỗi bên theo chênh lệch OVR đội (mỗi 10 OVR ≈ ×e).
  d_ovr := my_ovr - opp_ovr;
  gm := public.fco_ranked_poisson(least(4.2, greatest(.35, 1.35 * exp(d_ovr / 10))));
  go := public.fco_ranked_poisson(least(4.2, greatest(.35, 1.35 * exp(-d_ovr / 10))));
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
    'me', jsonb_build_object('ovr', my_ovr, 'formation', v_formation, 'slots', slots),
    'opp', jsonb_build_object('name', opp_name, 'ovr', opp_ovr, 'bot', bot, 'formation', case when bot then '4-3-3' else opp.formation end, 'slots', opp_slots),
    'delta', delta, 'points', pts, 'tier', public.fco_ranked_tier(pts), 'state', public.fco_ranked_me(uid));
end;
$$;

revoke all on function public.fco_ranked_tier(integer), public.fco_ranked_poisson(double precision), public.fco_ranked_weight(text, boolean),
  public.fco_ranked_pick(jsonb, boolean, integer), public.fco_ranked_me(uuid) from public, anon, authenticated;
revoke all on function public.fco_ranked_state(), public.fco_ranked_play(jsonb) from public, anon;
grant execute on function public.fco_ranked_state(), public.fco_ranked_play(jsonb) to authenticated;

commit;
