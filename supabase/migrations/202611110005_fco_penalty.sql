-- Mini game Sút phạt đền (2026-11-11, sau 202611110004): src/PenaltyPage.tsx, mục "Sút phạt" trên thanh dưới.
--   Vạch ngắm lắc qua lại trên khung thành, người chơi chỉnh độ cao rồi sút. Máy chủ quyết định thủ môn bắt hay không (trình duyệt chỉ gửi
--   điểm ngắm), mỗi quả vào +1 điểm, bị bắt thì hết lượt. Kỷ lục (chuỗi bàn dài nhất) ghi ngay sau mỗi bàn vào fco_ranks.penalty_best,
--   hiện ở BXH (bảng "Sút phạt đền").
--   Tỷ lệ bắt (fco_penalty_save_chance): giữa khung thấp ~80%, sát cột ~35%, góc trên ~15%; chuỗi càng dài thủ môn càng giỏi (+1% mỗi bàn,
--   tối đa +15%). Trình duyệt có thể gửi điểm ngắm tùy ý nên góc trên luôn còn ≥ 15% bị bắt; mỗi cú sút cách nhau tối thiểu 0,8 giây.
begin;

alter table public.fco_ranks
  add column penalty_best integer not null default 0 check (penalty_best >= 0),
  add column penalty_at timestamptz;
create index fco_ranks_penalty on public.fco_ranks(penalty_best desc, penalty_at);

create table public.fco_penalty_runs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  streak integer not null default 0,
  active boolean not null default false,
  last_shot timestamptz,
  started_at timestamptz not null default now()
);
alter table public.fco_penalty_runs enable row level security;
revoke all on public.fco_penalty_runs from public, anon, authenticated;

-- x: −1 (cột trái) … 1 (cột phải), y: 0 (sát đất) … 1 (xà ngang).
create function public.fco_penalty_save_chance(p_x double precision, p_y double precision, p_streak integer) returns double precision
language sql immutable set search_path = '' as $$
  select least(.95, greatest(.15, .8 - .45 * abs(p_x) - .15 * p_y - .05 * abs(p_x) * p_y) + least(.15, .01 * greatest(0, p_streak)))
$$;

create function public.fco_penalty_best(p_uid uuid) returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select penalty_best from public.fco_ranks where user_id = p_uid), 0)
$$;

-- Bắt đầu lượt mới (chuỗi về 0).
create function public.fco_penalty_start() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  insert into public.fco_penalty_runs as r (user_id, streak, active, last_shot, started_at) values (uid, 0, true, null, now())
  on conflict (user_id) do update set streak = 0, active = true, last_shot = null, started_at = now();
  return jsonb_build_object('streak', 0, 'best', public.fco_penalty_best(uid));
end;
$$;

-- Sút: máy chủ tung tỷ lệ bắt theo điểm ngắm và chuỗi hiện tại; trả hướng bay của thủ môn để game diễn hoạt.
create function public.fco_penalty_shoot(p_x double precision, p_y double precision) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); r public.fco_penalty_runs; chance double precision; saved boolean;
  kx double precision; ky double precision; best integer;
begin
  if p_x is null or p_y is null or p_x::text in ('NaN', 'Infinity', '-Infinity') or p_y::text in ('NaN', 'Infinity', '-Infinity') or abs(p_x) > 1 or p_y < 0 or p_y > 1 then
    raise exception 'FCO_PENALTY_BAD_AIM' using errcode = '22023';
  end if;
  select * into r from public.fco_penalty_runs where user_id = uid for update;
  if not found or not r.active then raise exception 'FCO_PENALTY_NO_RUN' using errcode = 'P0001'; end if;
  if r.last_shot is not null and now() - r.last_shot < interval '800 milliseconds' then raise exception 'FCO_PENALTY_TOO_FAST' using errcode = 'P0001'; end if;
  chance := public.fco_penalty_save_chance(p_x, p_y, r.streak);
  saved := random() < chance;
  if saved then
    -- Bay đúng hướng bóng (lệch nhẹ cho tự nhiên).
    kx := greatest(-1, least(1, p_x + (random() - .5) * .2)); ky := greatest(0, least(1, p_y + (random() - .5) * .2));
  else
    -- Bay sai hướng: phía còn lại của khung, hoặc đứng giữa nếu bóng đi sát cột.
    kx := case when abs(p_x) > .35 then -sign(p_x) * (.3 + random() * .6) else (case when random() < .5 then -1 else 1 end) * (.55 + random() * .4) end;
    ky := random() * .7;
  end if;
  if saved then
    update public.fco_penalty_runs set active = false, last_shot = now() where user_id = uid;
  else
    update public.fco_penalty_runs set streak = streak + 1, last_shot = now() where user_id = uid returning * into r;
    insert into public.fco_ranks as k (user_id, penalty_best, penalty_at) values (uid, r.streak, now())
    on conflict (user_id) do update set penalty_best = excluded.penalty_best, penalty_at = excluded.penalty_at where excluded.penalty_best > k.penalty_best;
  end if;
  best := public.fco_penalty_best(uid);
  return jsonb_build_object('goal', not saved, 'streak', case when saved then r.streak else r.streak end, 'best', best,
    'keeper', jsonb_build_object('x', round(kx::numeric, 3), 'y', round(ky::numeric, 3)), 'over', saved);
end;
$$;

-- Như 202611110004, thêm bảng Sút phạt đền (top 10 chuỗi bàn dài nhất) và hạng của người xem.
create or replace function public.fco_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); me public.fco_ranks;
begin
  select * into me from public.fco_ranks where user_id = uid;
  return jsonb_build_object(
    'ovr', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'ovr', t.best_ovr, 'playerId', t.best_player,
                       'level', t.best_level, 'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id)) order by t.best_ovr desc, t.best_at)
                     from (select * from public.fco_ranks where best_ovr > 0 order by best_ovr desc, best_at limit 10) t), '[]'::jsonb),
    'squad', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'value', t.squad_value, 'mine', t.user_id = uid,
                       'effect', public.fco_name_effect(t.user_id)) order by t.squad_value desc, t.squad_at)
                     from (select * from public.fco_ranks where squad_value > 0 order by squad_value desc, squad_at limit 10) t), '[]'::jsonb),
    'penalty', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'goals', t.penalty_best, 'mine', t.user_id = uid,
                       'effect', public.fco_name_effect(t.user_id)) order by t.penalty_best desc, t.penalty_at)
                     from (select * from public.fco_ranks where penalty_best > 0 order by penalty_best desc, penalty_at limit 10) t), '[]'::jsonb),
    'me', jsonb_build_object(
      'ovr', case when coalesce(me.best_ovr, 0) > 0 then me.best_ovr end,
      'ovrRank', case when coalesce(me.best_ovr, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                 where o.best_ovr > me.best_ovr or (o.best_ovr = me.best_ovr and o.best_at < me.best_at)) end,
      'squad', case when coalesce(me.squad_value, 0) > 0 then me.squad_value end,
      'squadRank', case when coalesce(me.squad_value, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                   where o.squad_value > me.squad_value or (o.squad_value = me.squad_value and o.squad_at < me.squad_at)) end,
      'penalty', case when coalesce(me.penalty_best, 0) > 0 then me.penalty_best end,
      'penaltyRank', case when coalesce(me.penalty_best, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                     where o.penalty_best > me.penalty_best or (o.penalty_best = me.penalty_best and o.penalty_at < me.penalty_at)) end));
end;
$$;

revoke all on function public.fco_penalty_save_chance(double precision, double precision, integer), public.fco_penalty_best(uuid) from public, anon, authenticated;
revoke all on function public.fco_penalty_start(), public.fco_penalty_shoot(double precision, double precision) from public, anon;
grant execute on function public.fco_penalty_start(), public.fco_penalty_shoot(double precision, double precision) to authenticated;

commit;
