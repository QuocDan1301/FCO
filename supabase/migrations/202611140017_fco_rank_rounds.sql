begin;

-- Vòng đua BXH GLXH + BXH Penalty (2026-11-14, người dùng): hộp quà Top 1 / 2 / 3 = 4.000 / 3.000 / 2.000 FC, đếm ngược tới 23:59 ngày
-- 15/11/2026 (giờ VN); hết giờ thì 2 BXH reset và bắt đầu vòng mới 7 ngày, cứ thế lặp lại.
-- fco_rank_round_tick: lần gọi đầu tiên sau giờ kết thúc (mở BXH, đá GLXH, bắt đầu Penalty) chốt vòng trong một giao dịch: trao FC cho Top 1–3
-- mỗi bảng (bỏ tài khoản đang khoá), ghi người thắng, đăng tin LIVE, reset (GLXH về 1.000 điểm, xoá thắng / hoà / thua; Penalty xoá kỷ lục),
-- dời mốc kết thúc thêm 7 ngày. Chưa hết giờ: chỉ đọc 1 dòng, không khoá / ghi. Chạy lại được.

create table if not exists public.fco_rank_round (
  id integer primary key default 1 check (id = 1),
  round integer not null,
  ends_at timestamptz not null,
  prizes integer[] not null default '{4000,3000,2000}',
  period interval not null default interval '7 days'
);
insert into public.fco_rank_round(id, round, ends_at) values (1, 1, timestamptz '2026-11-15 23:59:00+07') on conflict (id) do nothing;
alter table public.fco_rank_round enable row level security;
revoke all on public.fco_rank_round from public, anon, authenticated;

create table if not exists public.fco_rank_winners (
  round integer not null,
  board text not null check (board in ('ranked', 'penalty')),
  rank integer not null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  score integer not null,
  fc integer not null,
  at timestamptz not null default now(),
  primary key (round, board, rank)
);
alter table public.fco_rank_winners enable row level security;
revoke all on public.fco_rank_winners from public, anon, authenticated;

-- Trao một giải (một lần duy nhất mỗi vòng / bảng / hạng).
create or replace function public.fco_rank_prize(p_round integer, p_board text, p_rank integer, p_uid uuid, p_score integer, p_fc integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare who text := public.fco_public_name(p_uid);
begin
  insert into public.fco_rank_winners(round, board, rank, user_id, name, score, fc) values (p_round, p_board, p_rank, p_uid, who, p_score, coalesce(p_fc, 0))
  on conflict do nothing;
  if not found or coalesce(p_fc, 0) <= 0 then return; end if;
  perform public.fco_wallet_lock(p_uid);
  perform public.fco_apply_fc(p_uid, p_fc, 'rank_prize', jsonb_build_object('round', p_round, 'board', p_board, 'rank', p_rank));
  perform public.fco_live_post(p_uid, 'rank_prize', '🏆 Chúc mừng HLV ' || who || ' đạt Top ' || p_rank || ' BXH ' || case p_board when 'ranked' then 'GLXH' else 'Penalty' end
    || ' · nhận ' || public.fco_inv_money(p_fc) || ' FC!', null);
end;
$$;
revoke all on function public.fco_rank_prize(integer, text, integer, uuid, integer, integer) from public, anon, authenticated;

create or replace function public.fco_rank_round_tick() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_rank_round; t record; i integer;
begin
  if now() < coalesce((select ends_at from public.fco_rank_round where id = 1), 'infinity') then return; end if;
  select * into r from public.fco_rank_round where id = 1 for update;
  if not found then return; end if;
  while now() >= r.ends_at loop
    i := 0;
    for t in select x.user_id, x.points as score from public.fco_ranked x join auth.users u on u.id = x.user_id
              where x.wins + x.draws + x.losses > 0 and coalesce(u.banned_until, '-infinity') < now()
              order by x.points desc, x.updated_at limit 3 loop
      i := i + 1;
      perform public.fco_rank_prize(r.round, 'ranked', i, t.user_id, t.score, r.prizes[i]);
    end loop;
    i := 0;
    for t in select x.user_id, x.penalty_best as score from public.fco_ranks x join auth.users u on u.id = x.user_id
              where x.penalty_best > 0 and coalesce(u.banned_until, '-infinity') < now()
              order by x.penalty_best desc, x.penalty_at limit 3 loop
      i := i + 1;
      perform public.fco_rank_prize(r.round, 'penalty', i, t.user_id, t.score, r.prizes[i]);
    end loop;
    update public.fco_ranked set points = 1000, wins = 0, draws = 0, losses = 0 where wins + draws + losses > 0 or points <> 1000;
    update public.fco_ranks set penalty_best = 0, penalty_at = null where penalty_best > 0;
    r.round := r.round + 1;
    r.ends_at := r.ends_at + r.period;
  end loop;
  update public.fco_rank_round set round = r.round, ends_at = r.ends_at where id = 1;
end;
$$;
revoke all on function public.fco_rank_round_tick() from public, anon, authenticated;

-- Game hỏi khi mở BXH: vòng hiện tại, mốc kết thúc (ms), quà Top 1–3, người thắng vòng trước của 2 bảng. Hết giờ thì chốt vòng trước khi trả.
create or replace function public.fco_rank_round_state() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); r public.fco_rank_round;
begin
  perform public.fco_rank_round_tick();
  select * into r from public.fco_rank_round where id = 1;
  return jsonb_build_object('round', r.round, 'endsAt', (extract(epoch from r.ends_at) * 1000)::bigint, 'prizes', to_jsonb(r.prizes),
    'last', coalesce((select jsonb_object_agg(board, list) from (
        select board, jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'score', score, 'fc', fc, 'mine', user_id = uid) order by rank) as list
          from public.fco_rank_winners where round = r.round - 1 group by board) w), '{}'::jsonb));
end;
$$;
revoke all on function public.fco_rank_round_state() from public, anon;
grant execute on function public.fco_rank_round_state() to authenticated;

create or replace function public.fco_ranked_resolve(p_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.fco_ranked_pending;
begin
  perform public.fco_rank_round_tick();  -- 202611140017: hết vòng thì chốt quà + reset BXH trước khi tính trận
  select * into p from public.fco_ranked_pending where user_id = p_uid for update;
  if not found then return false; end if;
  if now() - p.started_at < interval '140 seconds' then return true; end if;
  delete from public.fco_ranked_pending where user_id = p_uid;
  perform public.fco_ranked_settle(p_uid, p.goals_for, p.goals_against, p.opponent, p.opp_points, p.team, p.team_ovr, p.formation);
  return false;
end;
$function$;

create or replace function public.fco_penalty_start()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := public.fco_require_user();
begin
  perform public.fco_rank_round_tick();  -- 202611140017
  insert into public.fco_penalty_runs as r (user_id, streak, active, last_shot, started_at) values (uid, 0, true, null, now())
  on conflict (user_id) do update set streak = 0, active = true, last_shot = null, started_at = now();
  return jsonb_build_object('streak', 0, 'best', public.fco_penalty_best(uid));
end;
$function$;

commit;
