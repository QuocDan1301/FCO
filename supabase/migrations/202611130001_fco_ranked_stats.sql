-- GLXH: chỉ số cầu thủ ảnh hưởng kết quả + diễn biến (người dùng chốt 2026-11-13, mức vừa phải; sau 202611120014).
--   · Danh mục cầu thủ thêm vị trí sở trường (pos): game gửi phần tử thứ 8 khi admin bấm Đồng bộ dữ liệu (chưa đồng bộ thì 'CM').
--   · Chỉ số tính giống hệt game (src/player-stats.ts rawStats, src/ranked-ratings.ts): theo vị trí sở trường, OVR của ô và độ lệch
--     riêng theo mã cầu thủ (fco_stat_jitter = Math.imul… ở game). Trình duyệt không gửi chỉ số → không gian lận.
--   · Sức công / thủ đội (fco_team_rating); chênh = dư công + dư thủ hai đội, chặn ±8; số bàn kỳ vọng × e^(±0,03 × chênh).
--   · Người ghi bàn ưu tiên dứt điểm (att), kiến tạo ưu tiên chuyền (cre): trọng số × e^((chỉ số − OVR) / 12), chặn ±1,5.
--   · Trận trả kèm attack / defense hai đội và att / cre / def / pace / gk từng ô (game hiển thị + cầu thủ nhanh chạy nhanh hơn).
--   Sau khi chạy migration này và deploy game: admin bấm Đồng bộ dữ liệu để máy chủ có vị trí sở trường.
begin;

alter table public.fco_cat_players add column if not exists pos text not null default 'CM';
alter table public.fco_cat_players_next add column if not exists pos text not null default 'CM';

-- p_rows: [[id, tên, ovrs[13], giá[13], giá cố định, tỷ lệ bảo hiểm, lương, vị trí], ...]
create or replace function public.fco_admin_catalog_players(p_version text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.fco_require_admin();
  if p_version is distinct from (select staging from public.fco_inventory where id = 1) then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  insert into public.fco_cat_players_next(id, name, ovrs, prices, fixed, insurance, wage, pos)
  select (r->>0)::integer, r->>1,
    array(select v::integer from jsonb_array_elements_text(r->2) with ordinality x(v, o) order by o),
    array(select case when v = 'null' then null else v::bigint end from jsonb_array_elements_text(r->3) with ordinality x(v, o) order by o),
    (r->>4)::boolean, (r->>5)::double precision, greatest(0, coalesce((r->>6)::integer, 0)), left(coalesce(nullif(r->>7, ''), 'CM'), 4)
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ===== Chỉ số cầu thủ (khớp src/player-stats.ts) =====
create function public.fco_stat_profile(p_pos text) returns text language sql immutable set search_path = '' as $$
  select case when p_pos = 'GK' then 'gk'
              when p_pos in ('ST', 'CF', 'LS', 'RS') then 'st'
              when p_pos in ('LW', 'RW', 'LF', 'RF', 'LM', 'RM') then 'wing'
              when p_pos in ('CDM', 'LDM', 'RDM') then 'dm'
              when p_pos in ('LB', 'RB', 'LWB', 'RWB') then 'fb'
              when p_pos in ('CB', 'LCB', 'RCB', 'SW') then 'cb'
              else 'mid' end
$$;

create function public.fco_stat_names(p_profile text) returns text[] language sql immutable set search_path = '' as $$
  select case when p_profile = 'gk' then array['Đổ người', 'Bắt bóng', 'Phát bóng', 'Phản xạ', 'Chọn vị trí TM', 'Phản ứng', 'Tốc độ', 'Tăng tốc', 'Chuyền ngắn', 'Chuyền dài', 'Sức mạnh', 'Nhảy', 'Thể lực', 'Quyết đoán']::text[] else array['Tốc độ', 'Tăng tốc', 'Dứt điểm', 'Lực sút', 'Sút xa', 'Chọn vị trí', 'Vô-lê', 'Penalty', 'Chuyền ngắn', 'Tầm nhìn', 'Tạt bóng', 'Chuyền dài', 'Đá phạt', 'Rê bóng', 'Giữ bóng', 'Khéo léo', 'Thăng bằng', 'Phản ứng', 'Kèm người', 'Cắt bóng', 'Xoạc bóng', 'Sức mạnh', 'Thể lực', 'Quyết đoán', 'Đánh đầu', 'Nhảy']::text[] end
$$;

create function public.fco_stat_offsets(p_profile text) returns double precision[] language sql immutable set search_path = '' as $$
  select case p_profile
    when 'st' then array[6, 7, 10, 8, 4, 10, 6, 4, 0, -2, -6, -8, -4, 6, 6, 3, 1, 6, -26, -24, -28, 4, -2, -4, 4, 0]::double precision[]
    when 'wing' then array[10, 11, 4, 2, 1, 5, 0, 0, 3, 2, 4, -4, 0, 9, 8, 8, 6, 4, -24, -22, -26, -6, 2, -8, -12, -4]::double precision[]
    when 'mid' then array[1, 2, -1, 2, 4, 2, -2, 0, 9, 10, 2, 8, 3, 6, 7, 4, 3, 6, -12, -8, -12, -2, 6, -2, -10, -6]::double precision[]
    when 'dm' then array[-2, -2, -12, 2, -4, -8, -14, -8, 7, 4, -4, 7, -6, 0, 3, -2, 1, 5, 8, 11, 9, 7, 8, 9, 1, 2]::double precision[]
    when 'fb' then array[8, 8, -14, -4, -10, -6, -16, -10, 3, -2, 8, 1, -8, 2, 2, 4, 4, 2, 8, 7, 9, 0, 8, 3, -4, 0]::double precision[]
    when 'cb' then array[-3, -4, -24, -2, -14, -16, -24, -14, 2, -6, -12, 0, -16, -6, -2, -8, -2, 4, 14, 13, 15, 12, 4, 10, 13, 10]::double precision[]
    when 'gk' then array[14, 13, 6, 15, 13, 10, -14, -12, -4, 0, -6, -4, -10, -8]::double precision[]
    else array[1, 2, -1, 2, 4, 2, -2, 0, 9, 10, 2, 8, 3, 6, 7, 4, 3, 6, -12, -8, -12, -2, 6, -2, -10, -6]::double precision[] end
$$;

-- Nhân 32 bit không dấu (Math.imul ở game): dùng fco_u32_mul có sẵn từ 202611100013 (giá dao động).

-- Độ lệch −3…3 theo mã cầu thủ (khớp jitter ở src/player-stats.ts).
create function public.fco_stat_jitter(p_id integer, p_i integer) returns integer language plpgsql immutable set search_path = '' as $$
declare h bigint;
begin
  h := public.fco_u32_mul((p_id::bigint & 4294967295) # 2654435769, 2246822507) # public.fco_u32_mul(p_i + 1, 3266489909);
  h := h # (h >> 13);
  h := public.fco_u32_mul(h, 668265261);
  h := h # (h >> 15);
  return (h % 7)::integer - 3;
end;
$$;

-- Chỉ số chưa làm tròn (khớp rawStats): OVR + hệ số vị trí (trừ trung bình) + độ lệch (trừ trung bình).
create function public.fco_stat_values(p_id integer, p_pos text, p_overall double precision) returns double precision[]
language plpgsql immutable set search_path = '' as $$
declare offs double precision[] := public.fco_stat_offsets(public.fco_stat_profile(p_pos)); n integer; mo double precision := 0; mj double precision := 0;
  jit double precision[] := '{}'; out double precision[] := '{}';
begin
  n := array_length(offs, 1);
  for i in 1 .. n loop mo := mo + offs[i]; jit := jit || public.fco_stat_jitter(p_id, i - 1)::double precision; mj := mj + jit[i]; end loop;
  mo := mo / n; mj := mj / n;
  for i in 1 .. n loop out := out || ((p_overall + (offs[i] - mo)) + (jit[i] - mj)); end loop;
  return out;
end;
$$;

-- Trung bình các chỉ số trong p_want (theo thứ tự p_want); không có chỉ số nào thì p_fallback.
create function public.fco_stat_mean(p_names text[], p_values double precision[], p_want text[], p_fallback double precision) returns double precision
language plpgsql immutable set search_path = '' as $$
declare s double precision := 0; n integer := 0; k integer;
begin
  foreach k in array array(select coalesce(array_position(p_names, w), 0) from unnest(p_want) with ordinality u(w, o) order by o) loop
    if k > 0 then s := s + p_values[k]; n := n + 1; end if;
  end loop;
  return case when n > 0 then s / n else p_fallback end;
end;
$$;

-- Chỉ số một ô (khớp slotRating ở src/ranked-ratings.ts). Đội máy / thẻ không rõ: vị trí = ô, mã 0.
create function public.fco_slot_rating(p_pid integer, p_pos text, p_role text, p_ovr double precision) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare pos text := coalesce(nullif(p_pos, ''), p_role); names text[] := public.fco_stat_names(public.fco_stat_profile(coalesce(nullif(p_pos, ''), p_role)));
  vals double precision[] := public.fco_stat_values(coalesce(p_pid, 0), coalesce(nullif(p_pos, ''), p_role), p_ovr);
begin
  return jsonb_build_object(
    'att', public.fco_stat_mean(names, vals, array['Dứt điểm', 'Lực sút', 'Chọn vị trí', 'Sút xa', 'Vô-lê'], p_ovr - 15),
    'cre', public.fco_stat_mean(names, vals, array['Chuyền ngắn', 'Tầm nhìn', 'Chuyền dài', 'Tạt bóng', 'Rê bóng', 'Giữ bóng'], p_ovr - 15),
    'def', public.fco_stat_mean(names, vals, array['Kèm người', 'Cắt bóng', 'Xoạc bóng', 'Sức mạnh', 'Quyết đoán', 'Đánh đầu'], p_ovr - 15),
    'pace', public.fco_stat_mean(names, vals, array['Tốc độ', 'Tăng tốc'], p_ovr - 15),
    'gk', public.fco_stat_mean(names, vals, array['Đổ người', 'Bắt bóng', 'Phản xạ', 'Chọn vị trí TM'], p_ovr - 25));
end;
$$;

create function public.fco_role_line(p_role text) returns text language sql immutable set search_path = '' as $$
  select case when p_role = 'GK' then 'gk' when p_role ~ '(CB|LB|RB|WB|SW)$' then 'df' when p_role ~ '(ST|CF|LW|RW|LF|RF|LS|RS)$' then 'fw' else 'mf' end
$$;

-- Sức công / thủ đội (khớp teamRating).
create function public.fco_team_rating(p_slots jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare s jsonb; r jsonb; line text; a double precision := 0; aw double precision := 0; d double precision := 0; dw double precision := 0;
  att double precision; cre double precision; def double precision; pace double precision; gk double precision;
begin
  for s in select value from jsonb_array_elements(p_slots) with ordinality t(value, o) order by o loop
    r := public.fco_slot_rating((s->>'pid')::integer, s->>'pos', s->>'role', (s->>'ovr')::double precision);
    att := (r->>'att')::double precision; cre := (r->>'cre')::double precision; def := (r->>'def')::double precision;
    pace := (r->>'pace')::double precision; gk := (r->>'gk')::double precision;
    line := public.fco_role_line(s->>'role');
    if line = 'fw' then a := a + 3 * (.6 * att + .2 * cre + .2 * pace); aw := aw + 3; d := d + .3 * def; dw := dw + .3;
    elsif line = 'mf' then a := a + 2 * (.3 * att + .5 * cre + .2 * pace); aw := aw + 2; d := d + 1.5 * (.6 * def + .2 * pace + .2 * cre); dw := dw + 1.5;
    elsif line = 'df' then a := a + .5 * (.5 * cre + .5 * pace); aw := aw + .5; d := d + 3 * (.7 * def + .3 * pace); dw := dw + 3;
    else d := d + 3 * gk; dw := dw + 3;
    end if;
  end loop;
  return jsonb_build_object('attack', case when aw > 0 then a / aw else 0 end, 'defense', case when dw > 0 then d / dw else 0 end);
end;
$$;

-- Ghi kèm chỉ số (làm tròn 1 chữ số) vào từng ô của trận.
create function public.fco_rate_slots(p_slots jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(s || (select jsonb_object_agg(k, round(v::numeric, 1)) from jsonb_each_text(
           public.fco_slot_rating((s->>'pid')::integer, s->>'pos', s->>'role', (s->>'ovr')::double precision)) e(k, v)) order by o), '[]')
  from jsonb_array_elements(p_slots) with ordinality t(s, o)
$$;

-- Chọn người ghi bàn / kiến tạo: trọng số vị trí × (OVR/100)² × e^((att hoặc cre − OVR) / 12) (chặn ±1,5). Ô không có chỉ số (trận cũ): × 1.
create or replace function public.fco_ranked_pick_weight(p_slot jsonb, p_assist boolean) returns double precision language sql immutable set search_path = '' as $$
  select public.fco_ranked_weight(p_slot->>'role', p_assist) * power(coalesce((p_slot->>'ovr')::double precision, 100) / 100, 2)
    * exp(least(1.5, greatest(-1.5, (coalesce((p_slot->>(case when p_assist then 'cre' else 'att' end))::double precision, (p_slot->>'ovr')::double precision, 100)
      - coalesce((p_slot->>'ovr')::double precision, 100)) / 12)))
$$;

create or replace function public.fco_ranked_pick(p_slots jsonb, p_assist boolean, p_skip integer default -1) returns integer language plpgsql volatile set search_path = '' as $$
declare total double precision := 0; r double precision; s jsonb; i integer := 0; w double precision;
begin
  for s in select value from jsonb_array_elements(p_slots) loop
    if i <> p_skip then total := total + public.fco_ranked_pick_weight(s, p_assist); end if;
    i := i + 1;
  end loop;
  r := random() * total; i := 0;
  for s in select value from jsonb_array_elements(p_slots) loop
    if i <> p_skip then
      w := public.fco_ranked_pick_weight(s, p_assist);
      if r < w then return i; end if;
      r := r - w;
    end if;
    i := i + 1;
  end loop;
  return 0;
end;
$$;

-- Như 202611120012, thêm chỉ số cầu thủ.
create or replace function public.fco_ranked_play(p_team jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); d jsonb; me public.fco_ranked; s jsonb; card jsonb; base integer; claimed integer;
  slots jsonb := '[]'; uids text[] := '{}'; total integer := 0; wage_total integer := 0; my_ovr integer; v_formation text := left(coalesce(p_team->>'formation', ''), 12);
  opp public.fco_ranked; od jsonb; opp_name text; me_r jsonb; opp_r jsonb; edge double precision; opp_ovr integer; opp_slots jsonb; opp_points integer; bot boolean := false;
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
    wage_total := wage_total + coalesce((select c.wage from public.fco_cat_players c where c.id = (card->>'playerId')::integer), 0);
    if jsonb_typeof(s->'ovr') <> 'number' or jsonb_typeof(s->'x') <> 'number' or jsonb_typeof(s->'y') <> 'number' then raise exception 'FCO_RANKED_TEAM' using errcode = '22023'; end if;
    claimed := least(greatest(round((s->>'ovr')::numeric)::integer, 1), base + 17);
    slots := slots || jsonb_build_array(jsonb_build_object('uid', s->>'uid', 'role', left(coalesce(s->>'role', 'CM'), 4), 'ovr', claimed,
      'x', least(greatest((s->>'x')::numeric, 0), 100), 'y', least(greatest((s->>'y')::numeric, 0), 100),
      'pid', (card->>'playerId')::integer, 'pos', (select c.pos from public.fco_cat_players c where c.id = (card->>'playerId')::integer)));
    total := total + claimed;
  end loop;
  -- Mức lương đội hình (squad.ts SQUAD_WAGE_CAP): vượt thì không được đá GLXH.
  if wage_total > 310 then raise exception 'FCO_RANKED_WAGE' using errcode = 'P0001'; end if;
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
        || coalesce((select jsonb_build_object('pid', (c->>'playerId')::integer, 'lv', (c->>'level')::integer, 'pos', (select cp.pos from public.fco_cat_players cp where cp.id = (c->>'playerId')::integer))
                     from (select public.fco_inv_card(od, x->>'uid') as c) k where k.c is not null), '{}'::jsonb) order by o) into opp_slots
      from jsonb_array_elements(opp.team) with ordinality t(x, o);
  else
    bot := true;
    opp_name := bot_names[1 + floor(random() * array_length(bot_names, 1))::integer];
    opp_ovr := greatest(40, my_ovr + floor(random() * 9)::integer - 4);
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
      'formation', case when bot then '4-3-3' else opp.formation end, 'slots', opp_slots)));
  update public.fco_ranked set last_match_at = now(), updated_at = now() where user_id = uid;

  return (select match from public.fco_ranked_pending where user_id = uid) || jsonb_build_object('minSeconds', 140, 'elapsed', 0);
end;
$$;

revoke all on function public.fco_stat_profile(text), public.fco_stat_names(text), public.fco_stat_offsets(text),
  public.fco_stat_jitter(integer, integer), public.fco_stat_values(integer, text, double precision), public.fco_stat_mean(text[], double precision[], text[], double precision),
  public.fco_slot_rating(integer, text, text, double precision), public.fco_role_line(text), public.fco_team_rating(jsonb), public.fco_rate_slots(jsonb),
  public.fco_ranked_pick_weight(jsonb, boolean) from public, anon, authenticated;

commit;
