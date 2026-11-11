-- Sút phạt đền: thêm kiểu sút (2026-11-11, sau 202611110005). Kiểu sút khớp src/penalty.ts (SHOT_KINDS, saveChance, missChance).
--   normal  Thường : như cũ.
--   curl    Xoáy   : sát cột càng khó bắt (−12% × |x|), sút giữa khung (|x| < 0,3) dễ bắt hơn (+6%).
--   power   Căng   : thủ môn phản xạ chậm (−12%); ngắm cao trên 75% có thể vọt xà ((y − 0,75) × 120%, tối đa 30%).
--   trivela Trivela: khó bắt hơn (−8%); sát cột (|x| > 0,8) có thể dội cột ((|x| − 0,8) × 100%, tối đa 20%).
--   Tỷ lệ bắt nằm trong 10% … 95%. Vọt xà / dội cột cũng là hết lượt (không tính bàn).
--   Game bản cũ gọi fco_penalty_shoot(x, y) vẫn chạy như kiểu Thường.
begin;

-- "if exists" + xoá cả bản mới: chạy lại file này không báo lỗi.
drop function if exists public.fco_penalty_shoot(double precision, double precision);
drop function if exists public.fco_penalty_save_chance(double precision, double precision, integer);
drop function if exists public.fco_penalty_shoot(double precision, double precision, text);
drop function if exists public.fco_penalty_save_chance(double precision, double precision, integer, text);
drop function if exists public.fco_penalty_miss_chance(double precision, double precision, text);

create function public.fco_penalty_save_chance(p_x double precision, p_y double precision, p_streak integer, p_kind text default 'normal') returns double precision
language sql immutable set search_path = '' as $$
  select least(.95, greatest(.10,
    greatest(.15, .8 - .45 * abs(p_x) - .15 * p_y - .05 * abs(p_x) * p_y) + least(.15, .01 * greatest(0, p_streak))
    + case p_kind
        when 'curl' then -.12 * abs(p_x) + case when abs(p_x) < .3 then .06 else 0 end
        when 'power' then -.12
        when 'trivela' then -.08
        else 0 end))
$$;

create function public.fco_penalty_miss_chance(p_x double precision, p_y double precision, p_kind text default 'normal') returns double precision
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'power' then least(.3, greatest(0, (p_y - .75) * 1.2))
    when 'trivela' then least(.2, greatest(0, abs(p_x) - .8))
    else 0 end
$$;

-- Như 202611110005, thêm p_kind và trường hợp sút hỏng (miss = 'bar' vọt xà / 'post' dội cột).
create function public.fco_penalty_shoot(p_x double precision, p_y double precision, p_kind text default 'normal') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); r public.fco_penalty_runs; kind text := coalesce(p_kind, 'normal');
  saved boolean := false; missed text; goal boolean; kx double precision; ky double precision; best integer;
begin
  if p_x is null or p_y is null or p_x::text in ('NaN', 'Infinity', '-Infinity') or p_y::text in ('NaN', 'Infinity', '-Infinity') or abs(p_x) > 1 or p_y < 0 or p_y > 1 then
    raise exception 'FCO_PENALTY_BAD_AIM' using errcode = '22023';
  end if;
  if kind not in ('normal', 'curl', 'power', 'trivela') then raise exception 'FCO_PENALTY_BAD_KIND' using errcode = '22023'; end if;
  select * into r from public.fco_penalty_runs where user_id = uid for update;
  if not found or not r.active then raise exception 'FCO_PENALTY_NO_RUN' using errcode = 'P0001'; end if;
  if r.last_shot is not null and now() - r.last_shot < interval '800 milliseconds' then raise exception 'FCO_PENALTY_TOO_FAST' using errcode = 'P0001'; end if;
  if random() < public.fco_penalty_miss_chance(p_x, p_y, kind) then
    missed := case when kind = 'trivela' then 'post' else 'bar' end;
  else
    saved := random() < public.fco_penalty_save_chance(p_x, p_y, r.streak, kind);
  end if;
  goal := not saved and missed is null;
  if saved then
    kx := greatest(-1, least(1, p_x + (random() - .5) * .2)); ky := greatest(0, least(1, p_y + (random() - .5) * .2));
  else
    kx := case when abs(p_x) > .35 then -sign(p_x) * (.3 + random() * .6) else (case when random() < .5 then -1 else 1 end) * (.55 + random() * .4) end;
    ky := random() * .7;
  end if;
  if goal then
    update public.fco_penalty_runs set streak = streak + 1, last_shot = now() where user_id = uid returning * into r;
    insert into public.fco_ranks as k (user_id, penalty_best, penalty_at) values (uid, r.streak, now())
    on conflict (user_id) do update set penalty_best = excluded.penalty_best, penalty_at = excluded.penalty_at where excluded.penalty_best > k.penalty_best;
  else
    update public.fco_penalty_runs set active = false, last_shot = now() where user_id = uid;
  end if;
  best := public.fco_penalty_best(uid);
  return jsonb_build_object('goal', goal, 'saved', saved, 'miss', missed, 'kind', kind, 'streak', r.streak, 'best', best,
    'keeper', jsonb_build_object('x', round(kx::numeric, 3), 'y', round(ky::numeric, 3)), 'over', not goal);
end;
$$;

revoke all on function public.fco_penalty_save_chance(double precision, double precision, integer, text), public.fco_penalty_miss_chance(double precision, double precision, text) from public, anon, authenticated;
revoke all on function public.fco_penalty_shoot(double precision, double precision, text) from public, anon;
grant execute on function public.fco_penalty_shoot(double precision, double precision, text) to authenticated;

commit;
