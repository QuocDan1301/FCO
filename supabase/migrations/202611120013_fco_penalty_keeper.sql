-- Penalty: làm thủ môn (2026-11-12, sau 202611120012). Người chơi chọn vai cầu thủ sút hoặc thủ môn, đổi được sau mỗi lượt sút
-- (game chỉ cho đổi giữa hai lượt). Chuỗi dùng chung: sút vào hay bắt được (kể cả máy sút hỏng) đều +1, thất bại là hết lượt.
--   · fco_penalty_keep(x, y): người chơi chọn điểm bay người TRƯỚC, máy chủ mới tung cú sút của máy (40% góc trái, 40% góc phải,
--     20% giữa; độ cao, kiểu sút ngẫu nhiên) → không gian lận được. Máy sút hỏng 4% + rủi ro theo kiểu sút (fco_penalty_miss_chance).
--   · Tỷ lệ bắt (fco_penalty_keep_chance, khớp src/penalty.ts keepChance): theo khoảng cách điểm bay người tới điểm bóng, lệch ngang
--     tính nặng gấp đôi lệch dọc; tối đa 90%, tối thiểu 5%; chuỗi càng dài càng khó (−1% mỗi lượt, tối đa −15%).
--   · Kỷ lục, BXH, nhiệm vụ STP (trigger trên streak) dùng chung với vai sút. Tin LIVE Top 1 Penalty ghi "chuỗi N".
begin;

create function public.fco_penalty_keep_chance(p_kx double precision, p_ky double precision, p_sx double precision, p_sy double precision, p_streak integer)
returns double precision language sql immutable set search_path = '' as $$
  select greatest(.05, least(.9, 1 - .7 * sqrt(power(1.2 * (p_sx - p_kx), 2) + power(.6 * (p_sy - p_ky), 2))) - least(.15, .01 * greatest(0, p_streak)))
$$;

create function public.fco_penalty_keep(p_x double precision, p_y double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); r public.fco_penalty_runs; roll double precision; sx double precision; sy double precision;
  kind text; missed text; saved boolean := false; ok boolean; best integer;
begin
  if p_x is null or p_y is null or p_x::text in ('NaN', 'Infinity', '-Infinity') or p_y::text in ('NaN', 'Infinity', '-Infinity') or abs(p_x) > 1 or p_y < 0 or p_y > 1 then
    raise exception 'FCO_PENALTY_BAD_AIM' using errcode = '22023';
  end if;
  select * into r from public.fco_penalty_runs where user_id = uid for update;
  if not found or not r.active then raise exception 'FCO_PENALTY_NO_RUN' using errcode = 'P0001'; end if;
  if r.last_shot is not null and now() - r.last_shot < interval '800 milliseconds' then raise exception 'FCO_PENALTY_TOO_FAST' using errcode = 'P0001'; end if;
  roll := random();
  sx := case when roll < .4 then -(.45 + random() * .55) when roll < .8 then .45 + random() * .55 else (random() - .5) * .9 end;
  sy := random();
  kind := (array['normal', 'curl', 'power', 'trivela'])[1 + floor(random() * 4)::integer];
  if random() < .04 + public.fco_penalty_miss_chance(sx, sy, kind) then
    missed := case when kind = 'trivela' then 'post' when kind = 'power' then 'bar' when sy > .6 then 'bar' else 'post' end;
  else
    saved := random() < public.fco_penalty_keep_chance(p_x, p_y, sx, sy, r.streak);
  end if;
  ok := saved or missed is not null;
  if ok then
    update public.fco_penalty_runs set streak = streak + 1, last_shot = now() where user_id = uid returning * into r;
    insert into public.fco_ranks as k (user_id, penalty_best, penalty_at) values (uid, r.streak, now())
    on conflict (user_id) do update set penalty_best = excluded.penalty_best, penalty_at = excluded.penalty_at where excluded.penalty_best > k.penalty_best;
  else
    update public.fco_penalty_runs set active = false, last_shot = now() where user_id = uid;
  end if;
  best := public.fco_penalty_best(uid);
  return jsonb_build_object('saved', saved, 'miss', missed, 'goal', not ok, 'over', not ok, 'streak', r.streak, 'best', best,
    'shot', jsonb_build_object('x', round(sx::numeric, 3), 'y', round(sy::numeric, 3), 'kind', kind));
end;
$$;

-- Như 202611120008, tin Top 1 Penalty ghi "chuỗi N" (gồm cả bắt được).
create or replace function public.fco_live_ranks_top() returns trigger language plpgsql security definer set search_path = '' as $$
declare others bigint;
begin
  if new.best_ovr > 0 and (tg_op = 'INSERT' or new.best_ovr > old.best_ovr) then
    select coalesce(max(best_ovr), -1) into others from public.fco_ranks where user_id <> new.user_id;
    if new.best_ovr > others and (tg_op = 'INSERT' or old.best_ovr <= others) then
      perform public.fco_live_post(new.user_id, 'top:ovr', '👑 HLV ' || public.fco_public_name(new.user_id) || ' lên Top 1 BXH Đập thẻ OVR cao nhất (OVR ' || new.best_ovr || ')!', interval '6 hours');
    end if;
  end if;
  if new.squad_value > 0 and (tg_op = 'INSERT' or new.squad_value > old.squad_value) then
    select coalesce(max(squad_value), -1) into others from public.fco_ranks where user_id <> new.user_id;
    if new.squad_value > others and (tg_op = 'INSERT' or old.squad_value <= others) then
      perform public.fco_live_post(new.user_id, 'top:squad', '👑 HLV ' || public.fco_public_name(new.user_id) || ' lên Top 1 BXH Giá trị đội hình!', interval '6 hours');
    end if;
  end if;
  if new.penalty_best > 0 and (tg_op = 'INSERT' or new.penalty_best > old.penalty_best) then
    select coalesce(max(penalty_best), -1) into others from public.fco_ranks where user_id <> new.user_id;
    if new.penalty_best > others and (tg_op = 'INSERT' or old.penalty_best <= others) then
      perform public.fco_live_post(new.user_id, 'top:penalty', '👑 HLV ' || public.fco_public_name(new.user_id) || ' lên Top 1 BXH Penalty (chuỗi ' || new.penalty_best || ')!', interval '6 hours');
    end if;
  end if;
  return new;
end;
$$;

update public.fco_stp_mission_defs set title = 'Đạt chuỗi 20 trong Penalty' where id = 'penalty20';

revoke all on function public.fco_penalty_keep_chance(double precision, double precision, double precision, double precision, integer) from public, anon, authenticated;
revoke all on function public.fco_penalty_keep(double precision, double precision) from public, anon;
grant execute on function public.fco_penalty_keep(double precision, double precision) to authenticated;

commit;
