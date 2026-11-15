begin;

-- GLXH chậm lại (2026-11-15): trận diễn 90 phút trong ~3,5 phút thật (trước ~2,5 phút) và nhịp chậm hơn (cầu thủ chạy, bóng lăn chậm ~22 %).
-- Máy chủ chỉ nhận kết quả khi trận đã qua >= 200 giây (trước 140 giây): game diễn 210 giây (MATCH_SECONDS trong src/ranked-sim.ts).
-- Chạy lại được. Chạy SAU 202611150006_fco_grind_missions.sql. Phải chạy CÙNG LÚC push bản game mới — game cũ (150 giây) gửi kết quả
-- sớm sẽ bị từ chối rồi tự thử lại cho tới khi đủ 200 giây (vẫn lưu được, chỉ chờ lâu hơn).

-- Như 202611140017 (chốt vòng BXH), đổi 140 → 200 giây.
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
  if now() - p.started_at < interval '200 seconds' then return true; end if;
  delete from public.fco_ranked_pending where user_id = p_uid;
  perform public.fco_ranked_settle(p_uid, p.goals_for, p.goals_against, p.opponent, p.opp_points, p.team, p.team_ovr, p.formation);
  return false;
end;
$function$;

-- Như 202611120005, đổi 140 → 200 giây.
create or replace function public.fco_ranked_finish() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); p public.fco_ranked_pending; m public.fco_ranked_matches; result jsonb;
begin
  select * into p from public.fco_ranked_pending where user_id = uid for update;
  if found then
    if now() - p.started_at < interval '200 seconds' then raise exception 'FCO_RANKED_EARLY' using errcode = 'P0001'; end if;
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

commit;
