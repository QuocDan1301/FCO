-- Penalty đối kháng kiểu LUÂN PHIÊN (người dùng 2026-11-24: "PvP theo kiểu 1 người làm thủ môn, 1 người sút luân phiên"; thay cách cả hai cùng
-- sút + cùng bắt mỗi lượt của 202611240006).
--   · Mỗi quả chỉ MỘT người sút, người kia làm thủ môn; hai người đổi vai luân phiên (quả 1 người A sút, quả 2 người B sút, …). Người sút trước
--     do máy chủ chọn theo trận (id chẵn → người tạo trận / người chờ ghép sút trước, lẻ → người vào sau).
--   · Mỗi quả hai bên cùng chọn bí mật: người sút chọn điểm sút + kiểu sút, thủ môn chọn hướng bay người; đủ hai bên mới tính (tỉ lệ như cũ).
--   · Mỗi người 5 quả (10 quả). Thắng sớm khi đối thủ không thể gỡ dù sút hết số quả còn lại. Hoà sau 10 quả → luân lưu: mỗi cặp 2 quả, sau
--     một cặp mà khác tỉ số thì kết thúc; tối đa 30 quả, quá thì hoà. Mỗi quả 20 giây, hết giờ máy tự chọn; rời / mất kết nối 45 giây = thua.
--   · fco_pvp_pick(p_id, p_round, p_shot, p_dive): người sút chỉ cần p_shot, thủ môn chỉ cần p_dive (phần kia bỏ qua, gửi null được).
--   Khớp src/pvp.ts (PVP_RULES, shooterOf) — tests/pvp.test.ts, supabase/tests/fco-pvp.pglite.mjs. Chạy SAU 202611240008_fco_pvp_test_mode.sql.
--   Trận đang đá dở lúc chạy file này (chỉ có ở chế độ thử nghiệm) bị huỷ. Chạy lại được.
begin;

update public.fco_pvp_matches set status = 'cancelled', finished_at = now(), deadline = null where status = 'playing' and rounds <> '[]'::jsonb
  and not (rounds->0 ? 'shooter');

create or replace function public.fco_pvp_rules() returns jsonb language sql immutable set search_path = '' as $$
  select '{"kicks": 5, "maxKicks": 30, "roundSeconds": 20, "graceSeconds": 3, "awaySeconds": 45, "queueSeconds": 20, "k": 24, "start": 1000}'::jsonb
$$;

-- Người sút quả thứ p_n (1 hoặc 2): id trận chẵn → người 1 sút quả lẻ.
create or replace function public.fco_pvp_shooter(p_id bigint, p_n integer) returns integer language sql immutable set search_path = '' as $$
  select case when (p_id % 2 = 0) = (p_n % 2 = 1) then 1 else 2 end
$$;

-- Tính quả hiện tại khi đủ hai lựa chọn; chuyển quả hoặc kết thúc.
create or replace function public.fco_pvp_resolve(p_id bigint) returns public.fco_pvp_matches
language plpgsql volatile security definer set search_path = '' as $$
declare m public.fco_pvp_matches; rules jsonb := public.fco_pvp_rules(); k integer := (rules->>'kicks')::integer; s integer; o text;
  sp jsonb; kp jsonb; t1 integer; t2 integer;
begin
  select * into m from public.fco_pvp_matches where id = p_id;
  if m.status <> 'playing' or m.pick1 is null or m.pick2 is null then return m; end if;
  s := public.fco_pvp_shooter(m.id, m.round);
  sp := case when s = 1 then m.pick1 else m.pick2 end;  -- người sút
  kp := case when s = 1 then m.pick2 else m.pick1 end;  -- thủ môn
  o := public.fco_pvp_kick(sp->'shot', kp->'dive');
  update public.fco_pvp_matches set
    rounds = rounds || jsonb_build_array(jsonb_build_object('r', m.round, 'shooter', s, 'shot', sp->'shot', 'dive', kp->'dive', 'o', o,
      'auto', jsonb_build_object('shot', coalesce((sp->>'auto')::boolean, false), 'dive', coalesce((kp->>'auto')::boolean, false)))),
    score1 = score1 + (s = 1 and o = 'goal')::integer, score2 = score2 + (s = 2 and o = 'goal')::integer, pick1 = null, pick2 = null
   where id = p_id returning * into m;
  -- Số quả mỗi người đã sút sau m.round quả.
  t1 := (select count(*) from generate_series(1, m.round) g where public.fco_pvp_shooter(m.id, g) = 1); t2 := m.round - t1;
  if m.round <= 2 * k then
    if m.score1 > m.score2 + (k - t2) or m.score2 > m.score1 + (k - t1) then
      return public.fco_pvp_finish(p_id, case when m.score1 > m.score2 then m.p1 else m.p2 end, 'score');
    end if;
  elsif m.round % 2 = 0 and m.score1 <> m.score2 then
    return public.fco_pvp_finish(p_id, case when m.score1 > m.score2 then m.p1 else m.p2 end, 'score');
  end if;
  if m.round >= (rules->>'maxKicks')::integer then return public.fco_pvp_finish(p_id, null, 'draw'); end if;
  update public.fco_pvp_matches set round = round + 1, deadline = now() + make_interval(secs => (rules->>'roundSeconds')::integer)
   where id = p_id returning * into m;
  return m;
end;
$$;

-- Trận nhìn từ phía p_uid: mỗi quả ghi ai sút (me / opp); 'iShoot' = quả hiện tại mình sút.
create or replace function public.fco_pvp_json(m public.fco_pvp_matches, p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when m.id is null then null else jsonb_build_object(
    'id', m.id, 'mode', m.mode, 'status', m.status, 'code', case when m.mode = 'room' and m.p1 = p_uid then m.code end,
    'round', m.round, 'now', (extract(epoch from now()) * 1000)::bigint,
    'deadline', (extract(epoch from m.deadline) * 1000)::bigint,
    'iShoot', m.round > 0 and public.fco_pvp_shooter(m.id, m.round) = case when m.p1 = p_uid then 1 else 2 end,
    'score', case when m.p1 = p_uid then jsonb_build_array(m.score1, m.score2) else jsonb_build_array(m.score2, m.score1) end,
    'picked', case when m.p1 = p_uid then m.pick1 is not null else m.pick2 is not null end,
    'oppPicked', case when m.p1 = p_uid then m.pick2 is not null else m.pick1 is not null end,
    'rounds', coalesce((select jsonb_agg(jsonb_build_object('r', x->'r',
        'shooter', case when (x->>'shooter')::integer = case when m.p1 = p_uid then 1 else 2 end then 'me' else 'opp' end,
        'shot', x->'shot', 'dive', x->'dive', 'o', x->>'o') order by n)
      from jsonb_array_elements(m.rounds) with ordinality t(x, n) where x ? 'shooter'), '[]'::jsonb),
    'opponent', case when (case when m.p1 = p_uid then m.p2 else m.p1 end) is null then null else jsonb_build_object(
      'name', public.fco_public_name(case when m.p1 = p_uid then m.p2 else m.p1 end),
      'club', public.fco_club_logo(case when m.p1 = p_uid then m.p2 else m.p1 end),
      'points', coalesce((select k.points from public.fco_pvp_ranks k where k.user_id = case when m.p1 = p_uid then m.p2 else m.p1 end), (public.fco_pvp_rules()->>'start')::integer)) end,
    'winner', case when m.status <> 'done' then null when m.winner is null then 'draw' when m.winner = p_uid then 'me' else 'opp' end,
    'reason', m.reason, 'delta', case when m.p1 = p_uid then m.delta1 else m.delta2 end) end
$$;

-- Chọn cho quả hiện tại: người sút gửi p_shot, thủ môn gửi p_dive.
create or replace function public.fco_pvp_pick(p_id bigint, p_round integer, p_shot jsonb, p_dive jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches; pick jsonb; me integer; shooting boolean; ok boolean;
begin
  -- Giá trị gửi lên (nếu có) phải nằm trong khung thành, kiểm tra trước mọi thứ.
  if (p_shot is not null and jsonb_typeof(p_shot) <> 'null' and not coalesce(jsonb_typeof(p_shot->'x') = 'number' and jsonb_typeof(p_shot->'y') = 'number'
        and abs((p_shot->>'x')::double precision) <= 1 and (p_shot->>'y')::double precision between 0 and 1
        and coalesce(p_shot->>'kind', 'normal') in ('normal', 'curl', 'power', 'trivela'), false))
     or (p_dive is not null and jsonb_typeof(p_dive) <> 'null' and not coalesce(jsonb_typeof(p_dive->'x') = 'number' and jsonb_typeof(p_dive->'y') = 'number'
        and abs((p_dive->>'x')::double precision) <= 1 and (p_dive->>'y')::double precision between 0 and 1, false)) then
    raise exception 'FCO_PVP_BAD_PICK' using errcode = '22023';
  end if;
  m := public.fco_pvp_touch(p_id, uid);
  select * into m from public.fco_pvp_matches where id = p_id for update;
  if m.status <> 'playing' or m.round <> p_round then return public.fco_pvp_json(m, uid); end if;
  me := case when m.p1 = uid then 1 else 2 end;
  shooting := public.fco_pvp_shooter(m.id, m.round) = me;
  if shooting then
    ok := jsonb_typeof(p_shot->'x') = 'number' and jsonb_typeof(p_shot->'y') = 'number' and abs((p_shot->>'x')::double precision) <= 1
      and (p_shot->>'y')::double precision between 0 and 1 and coalesce(p_shot->>'kind', 'normal') in ('normal', 'curl', 'power', 'trivela');
    pick := jsonb_build_object('shot', jsonb_build_object('x', round((p_shot->>'x')::numeric, 3), 'y', round((p_shot->>'y')::numeric, 3), 'kind', coalesce(p_shot->>'kind', 'normal')));
  else
    ok := jsonb_typeof(p_dive->'x') = 'number' and jsonb_typeof(p_dive->'y') = 'number' and abs((p_dive->>'x')::double precision) <= 1
      and (p_dive->>'y')::double precision between 0 and 1;
    pick := jsonb_build_object('dive', jsonb_build_object('x', round((p_dive->>'x')::numeric, 3), 'y', round((p_dive->>'y')::numeric, 3)));
  end if;
  if not coalesce(ok, false) then raise exception 'FCO_PVP_BAD_PICK' using errcode = '22023'; end if;
  if me = 1 and m.pick1 is null then update public.fco_pvp_matches set pick1 = pick where id = p_id;
  elsif me = 2 and m.pick2 is null then update public.fco_pvp_matches set pick2 = pick where id = p_id; end if;
  m := public.fco_pvp_resolve(p_id);
  return public.fco_pvp_json(m, uid);
end;
$$;

revoke all on function public.fco_pvp_rules(), public.fco_pvp_shooter(bigint, integer), public.fco_pvp_resolve(bigint),
  public.fco_pvp_json(public.fco_pvp_matches, uuid) from public, anon, authenticated;
revoke all on function public.fco_pvp_pick(bigint, integer, jsonb, jsonb) from public, anon;
grant execute on function public.fco_pvp_pick(bigint, integer, jsonb, jsonb) to authenticated;

commit;