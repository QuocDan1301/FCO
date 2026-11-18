begin;

-- Mức lương đội hình 310 → 330 (người dùng 2026-11-18: "Tăng lương đội hình lên 330").
--   fco_ranked_play: tổng lương 11 cầu thủ ra sân (kho máy chủ) vượt 330 thì báo FCO_RANKED_WAGE (trước 310, 202611120006).
--   Hàm chép nguyên bản đang chạy (202611160006_fco_gold_extra.sql: giữ 'gx', 'faces'), chỉ đổi mốc lương.
-- Game: src/squad.ts SQUAD_WAGE_CAP = 330. Chạy lại được.

CREATE OR REPLACE FUNCTION public.fco_ranked_play(p_team jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := public.fco_require_user(); d jsonb; me public.fco_ranked; s jsonb; card jsonb; base integer; claimed integer;
  slots jsonb := '[]'; uids text[] := '{}'; total integer := 0; wage_total integer := 0; my_ovr integer; v_formation text := left(coalesce(p_team->>'formation', ''), 12);
  opp public.fco_ranked; od jsonb; opp_name text; me_r jsonb; opp_r jsonb; edge double precision; opp_ovr integer; opp_slots jsonb; opp_points integer; bot boolean := false;
  bot_roles constant text[] := array['LW', 'ST', 'RW', 'LCM', 'CM', 'RCM', 'LB', 'LCB', 'RCB', 'RB', 'GK'];
  bot_names constant text[] := array['FC Sấm Sét', 'Hoàng Kim United', 'Rồng Xanh FC', 'Thép Đỏ', 'Bão Tố Athletic', 'Sao Bắc Đẩu', 'Lốc Xoáy FC', 'Đại Bàng Vàng',
    'Mũi Tên Bạc', 'Hổ Mang City', 'Ngựa Ô FC', 'Phượng Lửa'];
  d_ovr double precision; gm integer; go integer; goals jsonb := '[]'; minute integer; scorer integer; assist integer;
  expected double precision; result double precision; delta integer; pts integer; seed integer := floor(random() * 2147483647)::integer;
  finals integer[]; idx integer := 0; items jsonb; bot_avg integer; bot_n integer;
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
  -- 202611140016: OVR từng ô do máy chủ tự tính (vị trí + team color CLB / quốc gia / mùa + màu cấp thẻ + 5 đội hình), đúng như game.
  select jsonb_agg(jsonb_build_object('pid', (k.c->>'playerId')::integer, 'lv', (k.c->>'level')::integer, 'label', t.s->>'role') order by t.o) into items
    from jsonb_array_elements(p_team->'slots') with ordinality t(s, o) cross join lateral (select public.fco_inv_card(d, t.s->>'uid') as c) k;
  finals := public.fco_ranked_final_ovrs(items);
  for s in select value from jsonb_array_elements(p_team->'slots') loop
    idx := idx + 1;
    if s->>'uid' is null or s->>'uid' = any(uids) then raise exception 'FCO_RANKED_TEAM' using errcode = '22023'; end if;
    uids := uids || (s->>'uid');
    card := public.fco_inv_card(d, s->>'uid');
    if card is null then raise exception 'FCO_RANKED_CARD' using errcode = 'P0001'; end if;
    base := public.fco_inv_ovr((card->>'playerId')::integer, (card->>'level')::integer);
    if base is null then raise exception 'FCO_CATALOG_MISSING' using errcode = 'P0001'; end if;
    wage_total := wage_total + coalesce((select c.wage from public.fco_cat_players c where c.id = (card->>'playerId')::integer), 0);
    if jsonb_typeof(s->'ovr') <> 'number' or jsonb_typeof(s->'x') <> 'number' or jsonb_typeof(s->'y') <> 'number' then raise exception 'FCO_RANKED_TEAM' using errcode = '22023'; end if;
    -- 202611140016: bỏ số OVR game gửi; máy chủ tự tính (finals). Chưa đồng bộ dữ liệu mới (thiếu luật) thì như cũ: kẹp tối đa gốc +17.
    claimed := coalesce(finals[idx], least(greatest(round((s->>'ovr')::numeric)::integer, 1), base + 17));
    if finals is not null and round((s->>'ovr')::numeric) > claimed + 2 then
      perform public.fco_flag(uid, 'ranked_ovr', jsonb_build_object('player', (card->>'playerId')::integer, 'claimed', round((s->>'ovr')::numeric), 'max', claimed));
    end if;
    slots := slots || jsonb_build_array(jsonb_build_object('uid', s->>'uid', 'role', left(coalesce(s->>'role', 'CM'), 4), 'ovr', claimed,
      'x', least(greatest((s->>'x')::numeric, 0), 100), 'y', least(greatest((s->>'y')::numeric, 0), 100),
      'pid', (card->>'playerId')::integer, 'pos', (select c.pos from public.fco_cat_players c where c.id = (card->>'playerId')::integer)));
    total := total + claimed;
  end loop;
  -- Mức lương đội hình (squad.ts SQUAD_WAGE_CAP): vượt thì không được đá GLXH.
  if wage_total > 330 then raise exception 'FCO_RANKED_WAGE' using errcode = 'P0001'; end if;
  my_ovr := round(total / 11.0);
  -- Chỉ số cầu thủ (202611130001): sức công / thủ của đội, mỗi ô ghi kèm att / cre / def / pace / gk.
  me_r := public.fco_team_rating(slots);
  slots := public.fco_rate_slots(slots);

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
    -- Cầu thủ + cấp thẻ của đối thủ (lấy từ kho máy chủ; thẻ đã bán thì không có), không gửi mã thẻ.
    select data into od from public.fco_game_saves where user_id = opp.user_id;
    select jsonb_agg(jsonb_build_object('role', x->>'role', 'ovr', x->'ovr', 'x', x->'x', 'y', x->'y')
        || coalesce((select jsonb_build_object('pid', (c->>'playerId')::integer, 'lv', (c->>'level')::integer, 'pos', (select cp.pos from public.fco_cat_players cp where cp.id = (c->>'playerId')::integer),
                       'gx', coalesce((select jsonb_agg(e.value order by e.key) from jsonb_each_text(case when jsonb_typeof(c->'gold') = 'object' then c->'gold' else '{}'::jsonb end) e), '[]'::jsonb))
                     from (select public.fco_inv_card(od, x->>'uid') as c) k where k.c is not null), '{}'::jsonb) order by o) into opp_slots
      from jsonb_array_elements(opp.team) with ordinality t(x, o);
  else
    bot := true;
    opp_name := bot_names[1 + floor(random() * array_length(bot_names, 1))::integer];
    -- 202611140016: đội máy mạnh theo ĐIỂM xếp hạng (không theo OVR mình): OVR trung bình đội của người chơi thật ±200 điểm
    -- (từ 3 người, 30 ngày), chưa đủ thì 115 + (điểm − 1000) / 20; ±3 ngẫu nhiên. Đội hình mạnh hơn mặt bằng hạng thì dễ thắng máy hơn.
    select round(avg(r.team_ovr))::integer, count(*)::integer into bot_avg, bot_n from public.fco_ranked r
     where r.user_id <> uid and r.team_ovr is not null and r.updated_at > now() - interval '30 days' and abs(r.points - me.points) <= 200;
    opp_ovr := least(180, greatest(60, coalesce(case when bot_n >= 3 then bot_avg end, 115 + (me.points - 1000) / 20) + floor(random() * 7)::integer - 3));
    opp_points := greatest(0, me.points + floor(random() * 101)::integer - 50);
    select jsonb_agg(jsonb_build_object('role', r, 'ovr', opp_ovr) order by o) into opp_slots from unnest(bot_roles) with ordinality t(r, o);
  end if;

  opp_r := public.fco_team_rating(opp_slots);
  opp_slots := public.fco_rate_slots(opp_slots);
  -- Chênh chỉ số (dư công + dư thủ so với OVR đội của hai bên), chặn ±8: số bàn kỳ vọng × e^(±0,03 × chênh) (tối đa ~±27%).
  edge := least(8, greatest(-8, ((me_r->>'attack')::double precision - my_ovr + (me_r->>'defense')::double precision - my_ovr)
    - ((opp_r->>'attack')::double precision - opp_ovr + (opp_r->>'defense')::double precision - opp_ovr)));

  -- Kết quả: số bàn kỳ vọng mỗi bên theo chênh lệch OVR đội. Cân bằng (202611120003): mỗi 25 OVR ≈ ×e (trước 10),
  -- đội mạnh hơn vẫn nhiều cơ hội thắng hơn nhưng đội yếu hơn có thể lật kèo.
  d_ovr := my_ovr - opp_ovr;
  gm := public.fco_ranked_poisson(least(4.2, greatest(.35, 1.35 * exp(d_ovr / 25) * exp(.03 * edge))));
  go := public.fco_ranked_poisson(least(4.2, greatest(.35, 1.35 * exp(-d_ovr / 25) * exp(-.03 * edge))));
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
    'me', jsonb_build_object('ovr', my_ovr, 'formation', v_formation, 'slots', slots, 'attack', round((me_r->>'attack')::numeric, 1), 'defense', round((me_r->>'defense')::numeric, 1), 'club', public.fco_club_logo(uid), 'effect', public.fco_name_effect(uid)),
    'opp', jsonb_build_object('name', opp_name, 'ovr', opp_ovr, 'bot', bot, 'attack', round((opp_r->>'attack')::numeric, 1), 'defense', round((opp_r->>'defense')::numeric, 1), 'club', case when bot then null else public.fco_club_logo(opp.user_id) end, 'effect', case when bot then null else public.fco_name_effect(opp.user_id) end,
      'formation', case when bot then '4-3-3' else opp.formation end, 'slots', opp_slots,
      'faces', case when bot then null else public.fco_public_faces(opp.user_id, (select array_agg((x->>'pid')::integer) from jsonb_array_elements(opp_slots) x where x ? 'pid')) end)));
  update public.fco_ranked set last_match_at = now(), updated_at = now() where user_id = uid;

  return (select match from public.fco_ranked_pending where user_id = uid) || jsonb_build_object('minSeconds', 140, 'elapsed', 0);
end;
$function$;

commit;
