begin;

-- Nhiệm vụ cày chay (2026-11-15, sau 202611150005_fco_vqtg_top_rewards.sql). Chạy lại được.
-- Người chơi không nạp vẫn có quà bằng cách chơi: nhiệm vụ HẰNG NGÀY (làm mới 0h giờ VN) và HẰNG TUẦN (làm mới 0h thứ Hai),
-- thưởng gói cầu thủ. Máy chủ tự đếm:
--   · ranked_win / ranked_unbeaten: trận GLXH đã tính điểm (trigger trên fco_ranked_matches). Bỏ trận bị xử thua 0–3 nên không
--     lợi dụng được; mỗi trận thật kéo dài ≥ 140 giây.
--   · penalty_hit: mỗi lượt Penalty thành công (sút vào / bắt được — chuỗi tăng; trigger trên fco_penalty_runs).
--   · upgrade_ok: mỗi lần đập thẻ thành công trên kho máy chủ (fco_stp_mission_upgrade, gọi từ fco_inv_upgrade).
--   · daily_claim: mỗi lần nhận thưởng một nhiệm vụ ngày (tính cho nhiệm vụ tuần).
-- Đổi nhiệm vụ / quà: sửa bảng fco_grind_defs (gói phải có trong catalog đã đồng bộ). 2026-11-15: người dùng nâng quà 2 lần ("ngon hơn 1 tí", "ngon hơn nữa").

create table if not exists public.fco_grind_defs (
  id text primary key,
  period text not null check (period in ('day', 'week')),
  kind text not null,
  goal integer not null check (goal > 0),
  rewards jsonb not null check (jsonb_typeof(rewards) = 'array'),
  title text not null,
  hint text not null default '',
  ord integer not null default 0
);
create table if not exists public.fco_grind_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  period text not null,
  pkey date not null,           -- ngày (giờ VN) hoặc thứ Hai đầu tuần
  n integer not null default 0,
  primary key (user_id, kind, period, pkey)
);
create table if not exists public.fco_grind_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  pkey date not null,
  at timestamptz not null default now(),
  primary key (user_id, id, pkey)
);
alter table public.fco_grind_defs enable row level security;
alter table public.fco_grind_progress enable row level security;
alter table public.fco_grind_claims enable row level security;
revoke all on public.fco_grind_defs, public.fco_grind_progress, public.fco_grind_claims from anon, authenticated;

insert into public.fco_grind_defs (id, period, kind, goal, rewards, title, hint, ord) values
  ('d_win3',      'day',  'ranked_win',      3,   '[{"pack":"stp-c-106","count":1}]',   'Thắng 3 trận GLXH',                      'Trận Giả lập xếp hạng thắng sau 90 phút', 1),
  ('d_unbeaten5', 'day',  'ranked_unbeaten', 5,   '[{"pack":"stp-c-106ld","count":1}]', 'Không thua 5 trận GLXH',                 'Thắng hoặc hoà; bỏ trận tính là thua', 2),
  ('d_pen20',     'day',  'penalty_hit',     20,  '[{"pack":"stp-u-118","count":1}]',   '20 lượt thành công trong Penalty',      'Cộng dồn cả ngày: mỗi quả sút vào hoặc bắt được', 3),
  ('d_up10',      'day',  'upgrade_ok',      10,  '[{"pack":"stp-pw-all","count":1}]',  'Đập thẻ thành công 10 lần',              'Cầu thủ bất kì, cấp bất kì', 4),
  ('w_win20',     'week', 'ranked_win',      20,  '[{"pack":"stp-u-111","count":1}]',   'Thắng 20 trận GLXH trong tuần',          'Cộng dồn từ thứ Hai', 11),
  ('w_pen150',    'week', 'penalty_hit',     150, '[{"pack":"stp-u-hg","count":1}]',    '150 lượt thành công Penalty trong tuần', 'Cộng dồn từ thứ Hai', 12),
  ('w_up60',      'week', 'upgrade_ok',      60,  '[{"pack":"ms-100-2","count":1}]',    'Đập thẻ thành công 60 lần trong tuần',   'Cộng dồn từ thứ Hai', 13),
  ('w_daily20',   'week', 'daily_claim',     20,  '[{"pack":"stp-u-117","count":1}]',   'Nhận 20 phần thưởng nhiệm vụ ngày',      'Mỗi ngày có 4 nhiệm vụ ngày', 14)
on conflict (id) do update set period = excluded.period, kind = excluded.kind, goal = excluded.goal, rewards = excluded.rewards,
  title = excluded.title, hint = excluded.hint, ord = excluded.ord;

-- Thứ Hai đầu tuần (giờ VN) của một ngày.
create or replace function public.fco_grind_week(p_day date) returns date language sql immutable set search_path = '' as $$
  select p_day - (extract(isodow from p_day)::integer - 1)
$$;

-- Cộng tiến độ (ngày + tuần). Loại chưa có nhiệm vụ nào thì bỏ qua để khỏi ghi đĩa thừa.
create or replace function public.fco_grind_bump(p_uid uuid, p_kind text, p_n integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare today date := public.fco_today();
begin
  if p_uid is null or p_n is null or p_n <= 0 then return; end if;
  insert into public.fco_grind_progress as g (user_id, kind, period, pkey, n)
  select p_uid, p_kind, d.period, case d.period when 'day' then today else public.fco_grind_week(today) end, p_n
  from (select distinct period from public.fco_grind_defs where kind = p_kind) d
  on conflict (user_id, kind, period, pkey) do update set n = g.n + excluded.n;
end;
$$;

create or replace function public.fco_grind_ranked() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.goals_for > new.goals_against then perform public.fco_grind_bump(new.user_id, 'ranked_win', 1); end if;
  if new.goals_for >= new.goals_against then perform public.fco_grind_bump(new.user_id, 'ranked_unbeaten', 1); end if;
  return new;
end;
$$;
drop trigger if exists fco_grind_ranked on public.fco_ranked_matches;
create trigger fco_grind_ranked after insert on public.fco_ranked_matches for each row execute function public.fco_grind_ranked();

create or replace function public.fco_grind_penalty() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_grind_bump(new.user_id, 'penalty_hit', new.streak - old.streak);
  return new;
end;
$$;
drop trigger if exists fco_grind_penalty on public.fco_penalty_runs;
create trigger fco_grind_penalty after update of streak on public.fco_penalty_runs
  for each row when (new.streak > old.streak) execute function public.fco_grind_penalty();

-- Như 202611140018, thêm đếm nhiệm vụ cày.
create or replace function public.fco_stp_mission_upgrade(p_uid uuid, p_player integer, p_level integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare ovr integer := public.fco_inv_ovr(p_player, p_level);
begin
  insert into public.fco_stp_missions(user_id, day, mission)
  select p_uid, public.fco_today(), d.id from public.fco_stp_mission_defs d
  where d.kind = 'upgrade' and p_level >= d.level and public.fco_inv_name(p_player) = any(d.names)
  on conflict do nothing;
  -- BXH "Đập +8 nhiều nhất" (202611140005): đập thành công lên đúng +8 → ghi cầu thủ (mỗi cầu thủ một lần / HLV).
  if p_level = 8 then
    perform public.fco_rank_round_tick();  -- 202611140018: hết vòng thì chốt trước khi ghi lượt +8 mới
    insert into public.fco_plus8(user_id, player_id) values (p_uid, p_player) on conflict do nothing;
  end if;
  -- 202611150006: nhiệm vụ cày (ngày / tuần) đếm mọi lần đập thành công.
  perform public.fco_grind_bump(p_uid, 'upgrade_ok', 1);
  if ovr > public.fco_live_min_ovr() then
    perform public.fco_live_post(p_uid, 'upgrade', '🔥 Chúc mừng HLV ' || public.fco_public_name(p_uid) || ' đập thành công ' || public.fco_inv_name(p_player)
      || ' lên +' || p_level || ' · OVR ' || ovr || '!');
  end if;
end;
$$;

-- Bảng nhiệm vụ cày của người chơi (chỉ đọc, không khóa / ghi: gọi mỗi lần mở bảng / đổi màn).
create or replace function public.fco_grind_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); today date := public.fco_today(); week date := public.fco_grind_week(public.fco_today());
begin
  return jsonb_build_object('day', today, 'week', week,
    'missions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'period', d.period, 'kind', d.kind, 'goal', d.goal, 'rewards', d.rewards,
        'title', d.title, 'hint', d.hint,
        'progress', least(d.goal, coalesce((select g.n from public.fco_grind_progress g where g.user_id = uid and g.kind = d.kind and g.period = d.period
                      and g.pkey = case d.period when 'day' then today else week end), 0)),
        'claimed', exists (select 1 from public.fco_grind_claims c where c.user_id = uid and c.id = d.id and c.pkey = case d.period when 'day' then today else week end))
      order by d.ord) from public.fco_grind_defs d), '[]'::jsonb));
end;
$$;

-- Nhận thưởng: đủ tiến độ, mỗi nhiệm vụ một lần mỗi kỳ. Kho ở máy chủ thì cộng thẳng vào kho, không thì gửi vào Quà từ Admin (game tự nhận).
create or replace function public.fco_grind_claim(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); d public.fco_grind_defs; today date := public.fco_today(); k date; have integer; save jsonb;
begin
  select * into d from public.fco_grind_defs where id = p_id;
  if not found then raise exception 'FCO_MISSION_UNKNOWN' using errcode = '22023'; end if;
  k := case d.period when 'day' then today else public.fco_grind_week(today) end;
  perform public.fco_wallet_lock(uid);
  select n into have from public.fco_grind_progress where user_id = uid and kind = d.kind and period = d.period and pkey = k;
  if coalesce(have, 0) < d.goal then raise exception 'FCO_MISSION_NOT_DONE' using errcode = 'P0001'; end if;
  insert into public.fco_grind_claims(user_id, id, pkey) values (uid, d.id, k) on conflict do nothing;
  if not found then raise exception 'FCO_MISSION_CLAIMED' using errcode = 'P0001'; end if;
  if d.period = 'day' then perform public.fco_grind_bump(uid, 'daily_claim', 1); end if;
  if public.fco_inv_server_owned(uid) then
    save := public.fco_inv_grant(uid, d.rewards, 'gift', 'Nhiệm vụ · ' || d.title, 'Nhận ' || public.fco_inv_reward_text(d.rewards));
  else
    insert into public.fco_admin_gifts(user_id, rewards, note) values (uid, d.rewards, 'Nhiệm vụ · ' || d.title);
  end if;
  return jsonb_build_object('rewards', d.rewards, 'save', save, 'state', public.fco_grind_state());
end;
$$;

revoke all on function public.fco_grind_week(date), public.fco_grind_bump(uuid, text, integer), public.fco_grind_ranked(), public.fco_grind_penalty()
  from public, anon, authenticated;
revoke all on function public.fco_grind_state(), public.fco_grind_claim(text) from public, anon;
grant execute on function public.fco_grind_state(), public.fco_grind_claim(text) to authenticated;

commit;
