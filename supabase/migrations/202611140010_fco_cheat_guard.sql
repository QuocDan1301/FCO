begin;

-- Chống hack / cheat (2026-11-14, người dùng: "Update mạnh cơ chế chống hack cheat, cập nhật trang quản trị và đưa ra 1 nút riêng").
-- Sổ nghi vấn fco_cheat_flags: mỗi (HLV, loại) một dòng đếm số lần - chỉ ghi khi có dấu hiệu gian lận nên người chơi thật gần như không tốn ghi.
--   squad_value : game khai giá trị đội hình cao hơn hẳn số máy chủ tự tính (202611140009).
--   ranked_ovr  : GLXH khai OVR cầu thủ vượt mức tối đa có thể (gốc +17).
--   views_spam  : gửi lượt xem thẻ dồn dập (< 5 giây).
--   save_tamper : kho máy chủ bắt buộc mà bản lưu gửi lên có BP / gói / thẻ vượt xa máy chủ (máy chủ vẫn giữ số của mình).
--   gift_guess  : nhập sai gift code; sai 10 lần / 10 phút thì khoá thử code 10 phút (FCO_GIFT_TOO_MANY).
-- Admin: fco_admin_cheat_flags (danh sách nghi vấn), fco_admin_cheat_review (đã xem), fco_admin_guard_summary (huy hiệu nút Chống gian lận).
-- Chạy lại được.

create table if not exists public.fco_cheat_flags (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  hits integer not null default 0,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  detail jsonb,
  window_at timestamptz not null default now(),
  window_hits integer not null default 0,
  reviewed_at timestamptz,
  primary key (user_id, kind)
);
create index if not exists fco_cheat_flags_last on public.fco_cheat_flags (last_at desc);
alter table public.fco_cheat_flags enable row level security;
revoke all on public.fco_cheat_flags from public, anon, authenticated;

-- Ghi một lần nghi vấn; trả số lần trong cửa sổ 10 phút hiện tại.
create or replace function public.fco_flag(p_uid uuid, p_kind text, p_detail jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if p_uid is null then return 0; end if;
  insert into public.fco_cheat_flags as f (user_id, kind, hits, detail, window_at, window_hits) values (p_uid, p_kind, 1, p_detail, now(), 1)
  on conflict (user_id, kind) do update set hits = f.hits + 1, last_at = now(), detail = coalesce(excluded.detail, f.detail),
    window_hits = case when f.window_at < now() - interval '10 minutes' then 1 else f.window_hits + 1 end,
    window_at = case when f.window_at < now() - interval '10 minutes' then now() else f.window_at end
  returning window_hits into n;
  return n;
end;
$$;
revoke all on function public.fco_flag(uuid, text, jsonb) from public, anon, authenticated;

-- Giá trị đội hình: như 202611140009, thêm ghi sổ khi số game gửi cao hơn hẳn số thật (chênh > 25 % + 1 triệu BP).
create or replace function public.fco_rank_squad(p_value bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); v bigint;
begin
  if p_value is null or p_value not between 0 and 1000000000000000000 then raise exception 'FCO_RANK_INVALID' using errcode = 'P0001'; end if;
  v := public.fco_squad_value(uid);
  if v is null then return; end if;
  if p_value > v * 1.25 + 1000000 then perform public.fco_flag(uid, 'squad_value', jsonb_build_object('claimed', p_value, 'real', v)); end if;
  insert into public.fco_ranks as r (user_id, squad_value, squad_at) values (uid, v, now())
  on conflict (user_id) do update set squad_value = excluded.squad_value, squad_at = excluded.squad_at
  where r.squad_value is distinct from excluded.squad_value;
end;
$$;

create or replace function public.fco_ranked_play(p_team jsonb)
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
    -- 202611140010: OVR khai vượt mức tối đa có thể (gốc +17) = game bị sửa -> ghi sổ nghi vấn (vẫn kẹp như cũ).
    if round((s->>'ovr')::numeric) > base + 17 then
      perform public.fco_flag(uid, 'ranked_ovr', jsonb_build_object('player', (card->>'playerId')::integer, 'claimed', round((s->>'ovr')::numeric), 'max', base + 17));
    end if;
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
$function$;

create or replace function public.fco_heartbeat(p_device text DEFAULT NULL::text, p_views jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := public.fco_require_user(); prev timestamptz; add integer; v_ip text := public.fco_request_ip();
begin
  if p_device is not null and p_device ~ '^[0-9a-f-]{36}$' then
    insert into public.fco_devices as d (user_id, device, ip) values (uid, p_device, v_ip)
    on conflict (user_id, device, ip) do update set last_seen = now() where d.last_seen < now() - interval '10 minutes';
  end if;
  -- Lượt xem thẻ (202611140004): game gom trên máy, gửi kèm heartbeat {"<id cầu thủ>": số lần}; tối đa 20 cầu thủ, mỗi cầu thủ tính tối đa 3
  -- lần mỗi lượt gửi (chống bấm spam). Một câu upsert, chỉ khi có lượt xem.
  select last_seen into prev from public.fco_presence where user_id = uid;
  -- 202611140009: chỉ tính lượt xem khi lần báo trước cách ít nhất 20 giây (game gửi 60 giây / lần), gọi dồn dập không thổi phồng Tâm điểm.
  -- 202611140010: gửi lượt xem dồn dập (< 5 giây, game gửi 60 giây / lần) -> ghi sổ nghi vấn.
  if jsonb_typeof(p_views) = 'object' and prev is not null and now() - prev < interval '5 seconds' then
    perform public.fco_flag(uid, 'views_spam', jsonb_build_object('gapMs', (extract(epoch from now() - prev) * 1000)::integer));
  end if;
  if jsonb_typeof(p_views) = 'object' and prev is not null and now() - prev >= interval '20 seconds' then
    insert into public.fco_player_views as v (day, player_id, views)
    select public.fco_today(), k::integer, least(greatest((p_views->>k)::integer, 0), 3)
      from (select k from jsonb_object_keys(p_views) k where k ~ '^[0-9]{1,6}$' and jsonb_typeof(p_views->k) = 'number' limit 20) t
     where least(greatest((p_views->>k)::integer, 0), 3) > 0
    on conflict (day, player_id) do update set views = v.views + excluded.views;
  end if;
  select last_seen into prev from public.fco_presence where user_id = uid for update;
  if prev is null then
    insert into public.fco_presence(user_id) values (uid) on conflict (user_id) do nothing;
    return;
  end if;
  add := least(greatest(floor(extract(epoch from now() - prev)), 0), 90)::integer;
  update public.fco_presence set last_seen = now(), play_seconds = play_seconds + add where user_id = uid;
  if add > 0 then
    insert into public.fco_play_days(user_id, day, seconds) values (uid, public.fco_today(), add)
    on conflict (user_id, day) do update set seconds = public.fco_play_days.seconds + excluded.seconds;
  end if;
  -- Dọn dữ liệu thiết bị cũ (thỉnh thoảng, khoảng 1/200 lượt).
  if random() < .005 then
    delete from public.fco_devices where last_seen < now() - interval '90 days';
    delete from public.fco_device_claims where at < now() - interval '90 days' and kind not like 'gift:%';
    perform public.fco_player_views_cleanup();
  end if;
end;
$function$;

create or replace function public.fco_commit_save(p_data jsonb, p_revision bigint, p_merge boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  owner_id uuid := public.fco_require_account();
  saved public.fco_game_saves;
  previous jsonb;
  merge boolean := coalesce(p_merge, false) or coalesce((select enforced from public.fco_inventory where id = 1), false);
begin
  if p_revision is null or p_revision < 0 or p_data is null or jsonb_typeof(p_data) <> 'object'
    or p_data->>'version' is distinct from '1' or jsonb_typeof(p_data->'cards') is distinct from 'array'
    or octet_length(p_data::text) > 10000000 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  p_data := p_data - 'fc' - 'stp';
  if merge then
    -- So trước KHÔNG khóa (202611140003): gửi lại giống hệt bản đang có thì trả luôn, khỏi khóa dòng (khóa dòng cũng ghi đĩa).
    select * into saved from public.fco_game_saves where user_id = owner_id;
    -- 202611140010: kho máy chủ bắt buộc mà bản gửi lên có BP / gói / thẻ vượt xa máy chủ = sửa bản lưu (máy chủ vẫn giữ số của mình) -> ghi sổ.
    -- Kiểm trước bước "giống bản cũ" vì bản bị sửa chỉ khác phần máy chủ giữ nên sẽ trả về sớm ở đó.
    if found and coalesce((select enforced from public.fco_inventory where id = 1), false) and (
         coalesce((p_data->>'balance')::numeric, 0) > coalesce((saved.data->>'balance')::numeric, 0) * 10 + 10000000000
      or (select coalesce(sum(case when jsonb_typeof(v) = 'number' then v::text::numeric else 0 end), 0) from jsonb_each(case when jsonb_typeof(p_data->'unopened') = 'object' then p_data->'unopened' else '{}'::jsonb end) e(k, v)) > (select coalesce(sum(case when jsonb_typeof(v) = 'number' then v::text::numeric else 0 end), 0) from jsonb_each(case when jsonb_typeof(saved.data->'unopened') = 'object' then saved.data->'unopened' else '{}'::jsonb end) e(k, v)) + 100
      or jsonb_array_length(case when jsonb_typeof(p_data->'cards') = 'array' then p_data->'cards' else '[]'::jsonb end) > jsonb_array_length(case when jsonb_typeof(saved.data->'cards') = 'array' then saved.data->'cards' else '[]'::jsonb end) + 200) then
      perform public.fco_flag(owner_id, 'save_tamper', jsonb_build_object('bp', p_data->'balance', 'serverBp', saved.data->'balance',
        'cards', jsonb_array_length(case when jsonb_typeof(p_data->'cards') = 'array' then p_data->'cards' else '[]'::jsonb end), 'serverCards', jsonb_array_length(case when jsonb_typeof(saved.data->'cards') = 'array' then saved.data->'cards' else '[]'::jsonb end)));
    end if;
    if found and public.fco_inv_merge(saved.data, p_data - 'fc' - 'stp') = saved.data then
      return jsonb_build_object('revision', saved.revision, 'data', saved.data);
    end if;
    saved := null;
    select data into previous from public.fco_game_saves where user_id = owner_id for update;
    if found then
      p_data := public.fco_inv_merge(previous, p_data);
      -- Gộp xong giống hệt bản đang có (game gửi lại sau một thao tác kho, chỉ khác FC / phần máy chủ giữ): không ghi lại.
      if p_data = previous then
        select * into saved from public.fco_game_saves where user_id = owner_id;
        return jsonb_build_object('revision', saved.revision, 'data', saved.data);
      end if;
      update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now() where user_id = owner_id returning * into saved;
    else
      if coalesce((select enforced from public.fco_inventory where id = 1), false) then
        p_data := p_data || '{"cards": [], "balance": 0, "unopened": {}, "opened": 0, "upgrades": 0, "taxVouchers": {}}'::jsonb;
      end if;
      insert into public.fco_game_saves(user_id, revision, data) values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
    end if;
  elsif p_revision = 0 then
    insert into public.fco_game_saves(user_id, revision, data)
    values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
  else
    select data into previous from public.fco_game_saves where user_id = owner_id and revision = p_revision for update;
    update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'FCO_SAVE_CONFLICT' using errcode = 'P0001'; end if;
  perform public.fco_audit_save(owner_id, saved.revision, previous, saved.data);
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$function$;

create or replace function public.fco_redeem_gift(p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := public.fco_require_user(); g public.fco_gift_codes; fc bigint; granted jsonb;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'FCO_GIFT_INVALID' using errcode = 'P0001'; end if;
  -- 202611140010: chống dò code - sai 10 lần trong 10 phút thì khoá thử code 10 phút (chỉ đọc sổ, không ghi).
  if exists (select 1 from public.fco_cheat_flags f where f.user_id = uid and f.kind = 'gift_guess' and f.window_at > now() - interval '10 minutes' and f.window_hits >= 10) then
    raise exception 'FCO_GIFT_TOO_MANY' using errcode = 'P0001';
  end if;
  perform public.fco_wallet_lock(uid);
  select * into g from public.fco_gift_codes where hash = p_hash;
  -- Code sai: ghi lần thử rồi trả lỗi dạng dữ liệu (raise sẽ huỷ luôn lần ghi). Game đổi {error} thành thông báo.
  if not found then
    perform public.fco_flag(uid, 'gift_guess', null);
    return jsonb_build_object('error', 'FCO_GIFT_INVALID');
  end if;
  if g.expires is not null and public.fco_today() > g.expires then raise exception 'FCO_GIFT_EXPIRED' using errcode = 'P0001'; end if;
  insert into public.fco_gift_redemptions(user_id, hash) values (uid, p_hash) on conflict do nothing;
  if not found then raise exception 'FCO_GIFT_USED' using errcode = 'P0001'; end if;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(g.rewards) r where r ? 'fc';
  perform public.fco_apply_fc(uid, fc, 'gift', jsonb_build_object('hint', g.hint));
  granted := public.fco_inv_grant(uid, g.rewards, 'gift', 'Gift code ' || g.hint, 'Nhận ' || public.fco_inv_reward_text(g.rewards));
  return jsonb_build_object('rewards', g.rewards, 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$function$;

-- Danh sách nghi vấn cho admin: gom theo HLV, có lần mới chưa xem lên trước; p_all = cả nhóm đã xem.
create or replace function public.fco_admin_cheat_flags(p_all boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.fco_require_admin();
  select coalesce(jsonb_agg(r order by (r->>'fresh')::boolean desc, (r->>'last')::bigint desc), '[]') into result from (
    select jsonb_build_object('user', f.user_id, 'login', public.fco_login_name(u.email), 'name', public.fco_public_name(f.user_id),
        'locked', coalesce(u.banned_until > now(), false),
        'fresh', bool_or(f.reviewed_at is null or f.last_at > f.reviewed_at),
        'last', (extract(epoch from max(f.last_at)) * 1000)::bigint,
        'kinds', jsonb_agg(jsonb_build_object('kind', f.kind, 'hits', f.hits, 'last', (extract(epoch from f.last_at) * 1000)::bigint, 'detail', f.detail,
          'fresh', f.reviewed_at is null or f.last_at > f.reviewed_at) order by f.last_at desc)) as r
      from public.fco_cheat_flags f join auth.users u on u.id = f.user_id
     group by f.user_id, u.email, u.banned_until
    having p_all or bool_or(f.reviewed_at is null or f.last_at > f.reviewed_at)
     order by max(f.last_at) desc limit 300) t;
  return result;
end;
$$;

create or replace function public.fco_admin_cheat_review(p_user uuid, p_kind text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  update public.fco_cheat_flags set reviewed_at = now() where user_id = p_user and (p_kind is null or kind = p_kind);
  return public.fco_admin_cheat_flags(false);
end;
$$;

-- Tóm tắt cho nút Chống gian lận (đọc nhẹ, game admin hỏi vài phút một lần): HLV nghi vấn mới, bất thường bản lưu chưa xem, kho bắt buộc chưa.
create or replace function public.fco_admin_guard_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  return jsonb_build_object(
    'suspects', (select count(distinct user_id) from public.fco_cheat_flags where reviewed_at is null or last_at > reviewed_at),
    'anomalies', (select count(*) from public.fco_save_audit where not reviewed),
    'enforced', coalesce((select enforced from public.fco_inventory where id = 1), false),
    'version', (select version from public.fco_inventory where id = 1));
end;
$$;
revoke all on function public.fco_admin_cheat_flags(boolean), public.fco_admin_cheat_review(uuid, text), public.fco_admin_guard_summary() from public, anon;
grant execute on function public.fco_admin_cheat_flags(boolean), public.fco_admin_cheat_review(uuid, text), public.fco_admin_guard_summary() to authenticated;

commit;
