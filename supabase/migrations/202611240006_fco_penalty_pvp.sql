-- PENALTY ĐỐI KHÁNG giữa người chơi (người dùng 2026-11-24: "mỗi trận 5 quả, có thể ghép ngẫu nhiên nếu có người đang ghép hoặc gửi mã phòng
-- cho người chơi khác nhập để vào, có bxh và quà riêng, quà tôi gửi sau").
--   · Vào trận: Ghép ngẫu nhiên (nối với người đang chờ ghép, chưa có thì mình thành người chờ) hoặc Tạo phòng (mã 6 ký tự) → người kia Nhập mã.
--   · Mỗi lượt cả hai CÙNG chọn bí mật: điểm sút (x −1…1, y 0…1, kiểu sút) và hướng bay người khi bắt quả của đối thủ. Máy chủ giữ kín lựa chọn,
--     đủ hai bên mới tính cả hai quả: sút hỏng = 3% + rủi ro kiểu sút (fco_penalty_miss_chance); cản phá theo khoảng cách điểm bay người tới điểm
--     bóng (fco_penalty_keep_chance, chuỗi 0) × hệ số kiểu sút. 5 lượt; thắng sớm khi đối thủ không thể gỡ; hoà sau 5 lượt thì đá luân lưu
--     từng lượt tới khi có cách biệt (tối đa 15 lượt, quá thì hoà).
--   · Mỗi lượt 20 giây; hết giờ (+3 giây) chưa chọn thì máy tự chọn ngẫu nhiên. Rời trận / mất kết nối quá 45 giây = thua.
--   · BXH đối kháng riêng (fco_pvp_ranks, Elo K=24, bắt đầu 1.000; thắng ít nhất +5, thua ít nhất −5) CHỈ tính trận ghép ngẫu nhiên — phòng mã
--     là giao hữu (chống tự đấu với acc quen để cày điểm). Quà BXH: người dùng gửi sau. Acc phụ không chơi được.
--   · Game hỏi trạng thái 1–2 giây/lần trong trận: chỉ đọc; ghi "còn online" tối đa 10 giây/lần, chỉ khoá dòng khi cần chốt lượt / xử thua.
--   Khớp src/pvp.ts — tests/pvp.test.ts, supabase/tests/fco-pvp.pglite.mjs. Chạy SAU 202611240005_fco_tier_auto_renew.sql. Chạy lại được.
begin;

create table if not exists public.fco_pvp_matches (
  id bigint generated always as identity primary key,
  code text unique,
  mode text not null check (mode in ('random', 'room')),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'done', 'cancelled')),
  p1 uuid not null references auth.users(id) on delete cascade,
  p2 uuid references auth.users(id) on delete cascade,
  p1_seen timestamptz not null default now(),
  p2_seen timestamptz,
  round integer not null default 0,
  score1 integer not null default 0,
  score2 integer not null default 0,
  pick1 jsonb,
  pick2 jsonb,
  rounds jsonb not null default '[]',
  deadline timestamptz,
  winner uuid,
  reason text,
  delta1 integer,
  delta2 integer,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists fco_pvp_matches_queue on public.fco_pvp_matches (mode, status, created_at);
create index if not exists fco_pvp_matches_p1 on public.fco_pvp_matches (p1, status);
create index if not exists fco_pvp_matches_p2 on public.fco_pvp_matches (p2, status);
alter table public.fco_pvp_matches enable row level security;
revoke all on public.fco_pvp_matches from public, anon, authenticated;

create table if not exists public.fco_pvp_ranks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists fco_pvp_ranks_points on public.fco_pvp_ranks (points desc, wins desc);
alter table public.fco_pvp_ranks enable row level security;
revoke all on public.fco_pvp_ranks from public, anon, authenticated;

-- Luật (khớp src/pvp.ts PVP_RULES).
create or replace function public.fco_pvp_rules() returns jsonb language sql immutable set search_path = '' as $$
  select '{"kicks": 5, "maxRounds": 15, "roundSeconds": 20, "graceSeconds": 3, "awaySeconds": 45, "queueSeconds": 20, "k": 24, "start": 1000}'::jsonb
$$;

-- Một quả: 'miss' sút hỏng / 'save' cản phá / 'goal' vào.
create or replace function public.fco_pvp_kick(p_shot jsonb, p_dive jsonb) returns text language plpgsql volatile set search_path = '' as $$
declare sx double precision := (p_shot->>'x')::double precision; sy double precision := (p_shot->>'y')::double precision;
  kind text := coalesce(p_shot->>'kind', 'normal'); save double precision;
begin
  if random() < .03 + public.fco_penalty_miss_chance(sx, sy, kind) then return 'miss'; end if;
  save := public.fco_penalty_keep_chance((p_dive->>'x')::double precision, (p_dive->>'y')::double precision, sx, sy, 0)
    * case kind when 'power' then .85 when 'trivela' then .92 when 'curl' then case when abs(sx) > .6 then .88 else 1.05 end else 1 end;
  return case when random() < least(.9, save) then 'save' else 'goal' end;
end;
$$;

-- Lựa chọn ngẫu nhiên (hết giờ chưa chọn).
create or replace function public.fco_pvp_random_pick() returns jsonb language sql volatile set search_path = '' as $$
  select jsonb_build_object('shot', jsonb_build_object('x', round((random() * 2 - 1)::numeric, 3), 'y', round(random()::numeric, 3), 'kind', 'normal'),
    'dive', jsonb_build_object('x', round((random() * 2 - 1)::numeric, 3), 'y', round(random()::numeric, 3)), 'auto', true)
$$;

-- Kết thúc trận: ghi người thắng, cộng / trừ điểm BXH (chỉ trận ghép ngẫu nhiên, bỏ acc phụ).
create or replace function public.fco_pvp_finish(p_id bigint, p_winner uuid, p_reason text) returns public.fco_pvp_matches
language plpgsql volatile security definer set search_path = '' as $$
declare m public.fco_pvp_matches; rules jsonb := public.fco_pvp_rules(); r1 integer; r2 integer; e1 double precision; s1 double precision; d1 integer; d2 integer;
begin
  select * into m from public.fco_pvp_matches where id = p_id;
  if m.status <> 'playing' then return m; end if;
  if m.mode = 'random' and not public.fco_is_sub(m.p1) and not public.fco_is_sub(m.p2) then
    insert into public.fco_pvp_ranks(user_id) values (m.p1), (m.p2) on conflict (user_id) do nothing;
    select points into r1 from public.fco_pvp_ranks where user_id = m.p1 for update;
    select points into r2 from public.fco_pvp_ranks where user_id = m.p2 for update;
    e1 := 1 / (1 + power(10, (r2 - r1) / 400.0));
    s1 := case when p_winner = m.p1 then 1 when p_winner = m.p2 then 0 else .5 end;
    d1 := round((rules->>'k')::integer * (s1 - e1));
    if s1 = 1 then d1 := greatest(d1, 5); elsif s1 = 0 then d1 := least(d1, -5); end if;
    d2 := -d1;
    update public.fco_pvp_ranks set points = greatest(0, points + d1), wins = wins + (s1 = 1)::integer, losses = losses + (s1 = 0)::integer,
      draws = draws + (s1 = .5)::integer, updated_at = now() where user_id = m.p1;
    update public.fco_pvp_ranks set points = greatest(0, points + d2), wins = wins + (s1 = 0)::integer, losses = losses + (s1 = 1)::integer,
      draws = draws + (s1 = .5)::integer, updated_at = now() where user_id = m.p2;
  end if;
  update public.fco_pvp_matches set status = 'done', winner = p_winner, reason = p_reason, delta1 = d1, delta2 = d2, finished_at = now(), deadline = null
   where id = p_id returning * into m;
  return m;
end;
$$;

-- Tính lượt hiện tại khi đã đủ hai lựa chọn; chuyển lượt hoặc kết thúc.
create or replace function public.fco_pvp_resolve(p_id bigint) returns public.fco_pvp_matches
language plpgsql volatile security definer set search_path = '' as $$
declare m public.fco_pvp_matches; rules jsonb := public.fco_pvp_rules(); o1 text; o2 text; kicks integer := (rules->>'kicks')::integer; left_ integer;
begin
  select * into m from public.fco_pvp_matches where id = p_id;
  if m.status <> 'playing' or m.pick1 is null or m.pick2 is null then return m; end if;
  o1 := public.fco_pvp_kick(m.pick1->'shot', m.pick2->'dive');   -- người 1 sút, người 2 bắt
  o2 := public.fco_pvp_kick(m.pick2->'shot', m.pick1->'dive');   -- người 2 sút, người 1 bắt
  update public.fco_pvp_matches set
    rounds = rounds || jsonb_build_array(jsonb_build_object('r', m.round, 'p1', m.pick1, 'p2', m.pick2, 'o1', o1, 'o2', o2)),
    score1 = score1 + (o1 = 'goal')::integer, score2 = score2 + (o2 = 'goal')::integer, pick1 = null, pick2 = null
   where id = p_id returning * into m;
  left_ := greatest(0, kicks - m.round);
  if (m.round <= kicks and (m.score1 > m.score2 + left_ or m.score2 > m.score1 + left_))
     or (m.round >= kicks and m.score1 <> m.score2) then
    return public.fco_pvp_finish(p_id, case when m.score1 > m.score2 then m.p1 else m.p2 end, 'score');
  end if;
  if m.round >= (rules->>'maxRounds')::integer then return public.fco_pvp_finish(p_id, null, 'draw'); end if;
  update public.fco_pvp_matches set round = round + 1, deadline = now() + make_interval(secs => (rules->>'roundSeconds')::integer)
   where id = p_id returning * into m;
  return m;
end;
$$;

-- Trận nhìn từ phía người chơi p_uid (giấu lựa chọn chưa tính của đối thủ).
create or replace function public.fco_pvp_json(m public.fco_pvp_matches, p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when m.id is null then null else jsonb_build_object(
    'id', m.id, 'mode', m.mode, 'status', m.status, 'code', case when m.mode = 'room' and m.p1 = p_uid then m.code end,
    'round', m.round, 'now', (extract(epoch from now()) * 1000)::bigint,
    'deadline', (extract(epoch from m.deadline) * 1000)::bigint,
    'score', case when m.p1 = p_uid then jsonb_build_array(m.score1, m.score2) else jsonb_build_array(m.score2, m.score1) end,
    'picked', case when m.p1 = p_uid then m.pick1 is not null else m.pick2 is not null end,
    'oppPicked', case when m.p1 = p_uid then m.pick2 is not null else m.pick1 is not null end,
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('r', x->'r',
        'myShot', x->case when m.p1 = p_uid then 'p1' else 'p2' end->'shot', 'myDive', x->case when m.p1 = p_uid then 'p1' else 'p2' end->'dive',
        'oppShot', x->case when m.p1 = p_uid then 'p2' else 'p1' end->'shot', 'oppDive', x->case when m.p1 = p_uid then 'p2' else 'p1' end->'dive',
        'mine', x->>case when m.p1 = p_uid then 'o1' else 'o2' end, 'theirs', x->>case when m.p1 = p_uid then 'o2' else 'o1' end) order by n)
      from jsonb_array_elements(m.rounds) with ordinality t(x, n)), '[]'::jsonb),
    'opponent', case when (case when m.p1 = p_uid then m.p2 else m.p1 end) is null then null else jsonb_build_object(
      'name', public.fco_public_name(case when m.p1 = p_uid then m.p2 else m.p1 end),
      'club', public.fco_club_logo(case when m.p1 = p_uid then m.p2 else m.p1 end),
      'points', coalesce((select k.points from public.fco_pvp_ranks k where k.user_id = case when m.p1 = p_uid then m.p2 else m.p1 end), (public.fco_pvp_rules()->>'start')::integer)) end,
    'winner', case when m.status <> 'done' then null when m.winner is null then 'draw' when m.winner = p_uid then 'me' else 'opp' end,
    'reason', m.reason, 'delta', case when m.p1 = p_uid then m.delta1 else m.delta2 end) end
$$;

-- Xử lý giờ: hết giờ lượt thì máy tự chọn cho bên chưa chọn; một bên mất kết nối quá lâu thì thua. Có khoá dòng (chỉ gọi khi cần).
create or replace function public.fco_pvp_tick(p_id bigint) returns public.fco_pvp_matches
language plpgsql volatile security definer set search_path = '' as $$
declare m public.fco_pvp_matches; rules jsonb := public.fco_pvp_rules(); away interval := make_interval(secs => (rules->>'awaySeconds')::integer);
begin
  select * into m from public.fco_pvp_matches where id = p_id for update;
  if m.status <> 'playing' then return m; end if;
  if m.p1_seen < now() - away and coalesce(m.p2_seen, now()) >= now() - away then return public.fco_pvp_finish(p_id, m.p2, 'away'); end if;
  if coalesce(m.p2_seen, m.started_at) < now() - away and m.p1_seen >= now() - away then return public.fco_pvp_finish(p_id, m.p1, 'away'); end if;
  if m.deadline is not null and now() > m.deadline + make_interval(secs => (rules->>'graceSeconds')::integer) then
    update public.fco_pvp_matches set pick1 = coalesce(pick1, public.fco_pvp_random_pick()), pick2 = coalesce(pick2, public.fco_pvp_random_pick())
     where id = p_id returning * into m;
    return public.fco_pvp_resolve(p_id);
  end if;
  return m;
end;
$$;

-- Ghi "còn online" (tối đa 10 giây/lần) và chốt giờ nếu cần.
create or replace function public.fco_pvp_touch(p_id bigint, p_uid uuid) returns public.fco_pvp_matches
language plpgsql volatile security definer set search_path = '' as $$
declare m public.fco_pvp_matches; rules jsonb := public.fco_pvp_rules(); me1 boolean;
begin
  select * into m from public.fco_pvp_matches where id = p_id;
  if not found or (m.p1 <> p_uid and m.p2 is distinct from p_uid) then raise exception 'FCO_PVP_NOT_FOUND' using errcode = 'P0001'; end if;
  me1 := m.p1 = p_uid;
  if m.status in ('waiting', 'playing') and (case when me1 then m.p1_seen else m.p2_seen end) is distinct from null
     and (case when me1 then m.p1_seen else m.p2_seen end) > now() - interval '10 seconds' then
    null;
  elsif m.status in ('waiting', 'playing') then
    update public.fco_pvp_matches set p1_seen = case when me1 then now() else p1_seen end, p2_seen = case when me1 then p2_seen else now() end
     where id = p_id returning * into m;
  end if;
  if m.status = 'playing' and ((m.deadline is not null and now() > m.deadline + make_interval(secs => (rules->>'graceSeconds')::integer))
     or least(m.p1_seen, coalesce(m.p2_seen, m.started_at)) < now() - make_interval(secs => (rules->>'awaySeconds')::integer)) then
    m := public.fco_pvp_tick(p_id);
  end if;
  return m;
end;
$$;

-- Trận đang chờ / đang đá của tôi.
create or replace function public.fco_pvp_mine(p_uid uuid) returns public.fco_pvp_matches language sql stable security definer set search_path = '' as $$
  select * from public.fco_pvp_matches where (p1 = p_uid or p2 = p_uid) and status in ('waiting', 'playing') order by id desc limit 1
$$;

-- ===== Người chơi =====
create or replace function public.fco_pvp_current() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches := public.fco_pvp_mine(uid);
begin
  if m.id is null then return null; end if;
  return public.fco_pvp_json(public.fco_pvp_touch(m.id, uid), uid);
end;
$$;

create or replace function public.fco_pvp_find() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches := public.fco_pvp_mine(uid); rules jsonb := public.fco_pvp_rules();
begin
  if public.fco_is_sub(uid) then raise exception 'FCO_SUB_ACCOUNT' using errcode = 'P0001', hint = 'pvp'; end if;
  if m.id is not null then return public.fco_pvp_json(m, uid); end if;
  perform pg_advisory_xact_lock(hashtext('fco_pvp_queue'));
  -- Người chờ đã rời (không còn hỏi trạng thái) thì huỷ chỗ chờ.
  update public.fco_pvp_matches set status = 'cancelled', finished_at = now()
   where mode = 'random' and status = 'waiting' and p1_seen < now() - make_interval(secs => (rules->>'queueSeconds')::integer);
  select * into m from public.fco_pvp_matches
   where mode = 'random' and status = 'waiting' and p1 <> uid and not public.fco_is_sub(p1)
   order by created_at limit 1 for update skip locked;
  if m.id is not null then
    update public.fco_pvp_matches set p2 = uid, p2_seen = now(), status = 'playing', round = 1, started_at = now(),
      deadline = now() + make_interval(secs => (rules->>'roundSeconds')::integer) where id = m.id returning * into m;
  else
    insert into public.fco_pvp_matches(mode, p1) values ('random', uid) returning * into m;
  end if;
  return public.fco_pvp_json(m, uid);
end;
$$;

create or replace function public.fco_pvp_room_create() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches := public.fco_pvp_mine(uid);
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text;
begin
  if public.fco_is_sub(uid) then raise exception 'FCO_SUB_ACCOUNT' using errcode = 'P0001', hint = 'pvp'; end if;
  if m.id is not null then raise exception 'FCO_PVP_BUSY' using errcode = 'P0001'; end if;
  for attempt in 1..20 loop
    c := ''; for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1); end loop;
    exit when not exists (select 1 from public.fco_pvp_matches where code = c);
  end loop;
  insert into public.fco_pvp_matches(mode, p1, code) values ('room', uid, c) returning * into m;
  return public.fco_pvp_json(m, uid);
end;
$$;

create or replace function public.fco_pvp_room_join(p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches := public.fco_pvp_mine(uid); rules jsonb := public.fco_pvp_rules();
begin
  if public.fco_is_sub(uid) then raise exception 'FCO_SUB_ACCOUNT' using errcode = 'P0001', hint = 'pvp'; end if;
  if m.id is not null then raise exception 'FCO_PVP_BUSY' using errcode = 'P0001'; end if;
  select * into m from public.fco_pvp_matches where code = upper(trim(coalesce(p_code, ''))) and mode = 'room' for update;
  if not found or m.status <> 'waiting' then raise exception 'FCO_PVP_NO_ROOM' using errcode = 'P0001'; end if;
  if m.p1 = uid then raise exception 'FCO_PVP_OWN_ROOM' using errcode = 'P0001'; end if;
  update public.fco_pvp_matches set p2 = uid, p2_seen = now(), status = 'playing', round = 1, started_at = now(), code = null,
    deadline = now() + make_interval(secs => (rules->>'roundSeconds')::integer) where id = m.id returning * into m;
  return public.fco_pvp_json(m, uid);
end;
$$;

create or replace function public.fco_pvp_state(p_id bigint) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return public.fco_pvp_json(public.fco_pvp_touch(p_id, uid), uid);
end;
$$;

create or replace function public.fco_pvp_pick(p_id bigint, p_round integer, p_shot jsonb, p_dive jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches; pick jsonb; ok boolean;
begin
  ok := jsonb_typeof(p_shot->'x') = 'number' and jsonb_typeof(p_shot->'y') = 'number' and jsonb_typeof(p_dive->'x') = 'number' and jsonb_typeof(p_dive->'y') = 'number'
    and abs((p_shot->>'x')::double precision) <= 1 and (p_shot->>'y')::double precision between 0 and 1
    and abs((p_dive->>'x')::double precision) <= 1 and (p_dive->>'y')::double precision between 0 and 1
    and coalesce(p_shot->>'kind', 'normal') in ('normal', 'curl', 'power', 'trivela');
  if not coalesce(ok, false) then raise exception 'FCO_PVP_BAD_PICK' using errcode = '22023'; end if;
  m := public.fco_pvp_touch(p_id, uid);
  select * into m from public.fco_pvp_matches where id = p_id for update;
  if m.status <> 'playing' or m.round <> p_round then return public.fco_pvp_json(m, uid); end if;
  pick := jsonb_build_object('shot', jsonb_build_object('x', round((p_shot->>'x')::numeric, 3), 'y', round((p_shot->>'y')::numeric, 3), 'kind', coalesce(p_shot->>'kind', 'normal')),
    'dive', jsonb_build_object('x', round((p_dive->>'x')::numeric, 3), 'y', round((p_dive->>'y')::numeric, 3)));
  if m.p1 = uid and m.pick1 is null then update public.fco_pvp_matches set pick1 = pick where id = p_id;
  elsif m.p2 = uid and m.pick2 is null then update public.fco_pvp_matches set pick2 = pick where id = p_id; end if;
  m := public.fco_pvp_resolve(p_id);
  return public.fco_pvp_json(m, uid);
end;
$$;

create or replace function public.fco_pvp_leave(p_id bigint) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches;
begin
  select * into m from public.fco_pvp_matches where id = p_id and (p1 = uid or p2 = uid) for update;
  if not found then raise exception 'FCO_PVP_NOT_FOUND' using errcode = 'P0001'; end if;
  if m.status = 'waiting' then
    update public.fco_pvp_matches set status = 'cancelled', finished_at = now() where id = p_id returning * into m;
  elsif m.status = 'playing' then
    m := public.fco_pvp_finish(p_id, case when m.p1 = uid then m.p2 else m.p1 end, 'leave');
  end if;
  return public.fco_pvp_json(m, uid);
end;
$$;

-- BXH đối kháng: top 50 (bỏ tài khoản đang khoá, acc phụ) + hạng của tôi.
create or replace function public.fco_pvp_board() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return jsonb_build_object(
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', rk, 'name', public.fco_public_name(user_id), 'club', public.fco_club_logo(user_id),
        'effect', public.fco_name_effect(user_id), 'points', points, 'wins', wins, 'losses', losses, 'draws', draws, 'mine', user_id = uid) order by rk)
      from (select k.*, row_number() over (order by k.points desc, k.wins desc, k.updated_at) as rk
            from public.fco_pvp_ranks k join auth.users u on u.id = k.user_id
            where k.wins + k.losses + k.draws > 0 and coalesce(u.banned_until, '-infinity') < now() and not public.fco_is_sub(k.user_id)) s where rk <= 50), '[]'::jsonb),
    'me', (select jsonb_build_object('points', k.points, 'wins', k.wins, 'losses', k.losses, 'draws', k.draws,
        'rank', (select count(*) + 1 from public.fco_pvp_ranks o where o.wins + o.losses + o.draws > 0 and (o.points > k.points or (o.points = k.points and o.wins > k.wins))))
      from public.fco_pvp_ranks k where k.user_id = uid));
end;
$$;

revoke all on function public.fco_pvp_rules(), public.fco_pvp_kick(jsonb, jsonb), public.fco_pvp_random_pick(), public.fco_pvp_finish(bigint, uuid, text),
  public.fco_pvp_resolve(bigint), public.fco_pvp_json(public.fco_pvp_matches, uuid), public.fco_pvp_tick(bigint), public.fco_pvp_touch(bigint, uuid),
  public.fco_pvp_mine(uuid) from public, anon, authenticated;
revoke all on function public.fco_pvp_current(), public.fco_pvp_find(), public.fco_pvp_room_create(), public.fco_pvp_room_join(text), public.fco_pvp_state(bigint),
  public.fco_pvp_pick(bigint, integer, jsonb, jsonb), public.fco_pvp_leave(bigint), public.fco_pvp_board() from public, anon;
grant execute on function public.fco_pvp_current(), public.fco_pvp_find(), public.fco_pvp_room_create(), public.fco_pvp_room_join(text), public.fco_pvp_state(bigint),
  public.fco_pvp_pick(bigint, integer, jsonb, jsonb), public.fco_pvp_leave(bigint), public.fco_pvp_board() to authenticated;

commit;