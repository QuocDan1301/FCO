begin;

-- Cờ tỷ phú · ĐUA TOP (2026-11-22, người dùng): xếp theo ĐIỂM TÍCH LŨY kiếm được trong từng đợt, chia 2 đợt:
--   · Đợt 1: từ 0h 21/11/2026 đến 23h 26/11/2026 (giờ VN).
--   · Đợt 2: từ 0h 27/11/2026 đến 23h 29/11/2026.
--   Điểm kiếm ngoài 2 khung giờ trên (23h–24h 26/11, sau 23h 29/11) không tính đua top (vẫn tính quà mốc).
-- Top 5 mỗi đợt; bằng điểm thì ai đạt số điểm đó trước xếp trên (như Đua top VQTG). Hết giờ đợt nào thì lần gọi đầu tiên sau đó
-- (lượt chơi / xem bảng) chốt Top 5 (bỏ tài khoản đang khoá), gửi quà hạng (fco_ctp_race_rewards — ĐANG TRỐNG, chờ người dùng gửi danh
-- sách) vào "Quà từ Admin" và đăng tin LIVE. Chỉ chốt 1 lần; người thắng lưu ở fco_ctp_races.winners để gửi quà sau nếu chốt trước khi có quà.
-- Đổi giờ: update public.fco_ctp_races set starts_at = ..., ends_at = ... where round = N and settled_at is null;
-- Chạy SAU 202611220004_fco_ctp_draft.sql. Chạy lại được.

create table if not exists public.fco_ctp_races (
  round smallint primary key check (round between 1 and 9),
  starts_at timestamptz not null, ends_at timestamptz not null,
  settled_at timestamptz, winners jsonb not null default '[]'
);
create table if not exists public.fco_ctp_race_points (
  round smallint not null references public.fco_ctp_races(round) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  reached_at timestamptz not null default now(),
  primary key (round, user_id)
);
create index if not exists fco_ctp_race_points_rank on public.fco_ctp_race_points(round, points desc, reached_at);
create table if not exists public.fco_ctp_race_rewards (
  round smallint not null, rank smallint not null check (rank between 1 and 5),
  rewards jsonb not null default '[]' check (jsonb_typeof(rewards) = 'array'), note text not null default '',
  primary key (round, rank)
);
alter table public.fco_ctp_races enable row level security;
alter table public.fco_ctp_race_points enable row level security;
alter table public.fco_ctp_race_rewards enable row level security;
revoke all on public.fco_ctp_races, public.fco_ctp_race_points, public.fco_ctp_race_rewards from anon, authenticated;
insert into public.fco_ctp_races (round, starts_at, ends_at) values
  (1, '2026-11-21 00:00+07', '2026-11-26 23:00+07'),
  (2, '2026-11-27 00:00+07', '2026-11-29 23:00+07')
on conflict (round) do nothing;
insert into public.fco_ctp_race_rewards (round, rank) select r, k from generate_series(1, 2) r, generate_series(1, 5) k on conflict do nothing;

-- Cộng điểm vào đợt đang diễn ra (nếu có).
create or replace function public.fco_ctp_race_add(p_uid uuid, p_points integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r smallint;
begin
  if coalesce(p_points, 0) <= 0 then return; end if;
  select round into r from public.fco_ctp_races where settled_at is null and now() >= starts_at and now() < ends_at order by round limit 1;
  if r is null then return; end if;
  insert into public.fco_ctp_race_points (round, user_id, points, reached_at) values (r, p_uid, p_points, now())
  on conflict (round, user_id) do update set points = public.fco_ctp_race_points.points + excluded.points, reached_at = now();
end;
$$;

-- Chốt các đợt đã hết giờ (mỗi đợt 1 lần).
create or replace function public.fco_ctp_race_tick() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_ctp_races; t record; who text; rw jsonb; list jsonb;
begin
  -- Đường nhanh: không có đợt nào hết giờ mà chưa chốt thì chỉ đọc.
  if not exists (select 1 from public.fco_ctp_races where settled_at is null and now() >= ends_at) then return; end if;
  for r in select * from public.fco_ctp_races where settled_at is null and now() >= ends_at order by round for update skip locked loop
    list := '[]';
    for t in select p.user_id, p.points, row_number() over (order by p.points desc, p.reached_at, p.user_id)::integer as rn
             from public.fco_ctp_race_points p join auth.users u on u.id = p.user_id
             where p.round = r.round and p.points > 0 and coalesce(u.banned_until, '-infinity') < now()
             order by p.points desc, p.reached_at, p.user_id limit 5 loop
      who := public.fco_public_name(t.user_id);
      select rewards into rw from public.fco_ctp_race_rewards where round = r.round and rank = t.rn;
      if rw is not null and jsonb_array_length(rw) > 0 then
        insert into public.fco_admin_gifts(user_id, rewards, note) values (t.user_id, rw, 'Quà Top ' || t.rn || ' Đua top Cờ tỷ phú đợt ' || r.round);
      end if;
      list := list || jsonb_build_object('rank', t.rn, 'uid', t.user_id, 'name', who, 'points', t.points, 'gifted', rw is not null and jsonb_array_length(rw) > 0);
      perform public.fco_live_post(t.user_id, 'rank_prize', '🏆 Chúc mừng HLV ' || who || ' đạt Top ' || t.rn || ' Đua top Cờ tỷ phú đợt ' || r.round || '!', null);
    end loop;
    update public.fco_ctp_races set settled_at = now(), winners = list where round = r.round;
  end loop;
end;
$$;

-- Bảng đua top cả 2 đợt: Top 5, điểm / hạng của người xem, quà từng hạng.
create or replace function public.fco_ctp_top() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); out jsonb := '[]'; r public.fco_ctp_races; mine public.fco_ctp_race_points; top jsonb; my_rank integer;
begin
  perform public.fco_ctp_race_tick();
  for r in select * from public.fco_ctp_races order by round loop
    select * into mine from public.fco_ctp_race_points where round = r.round and user_id = uid;
    if r.settled_at is not null then
      top := coalesce((select jsonb_agg(jsonb_build_object('rank', (x->>'rank')::integer, 'name', x->>'name', 'points', (x->>'points')::integer,
               'mine', (x->>'uid')::uuid = uid, 'effect', public.fco_name_effect((x->>'uid')::uuid), 'club', public.fco_club_logo((x->>'uid')::uuid))
               order by (x->>'rank')::integer) from jsonb_array_elements(r.winners) x), '[]');
      my_rank := (select (x->>'rank')::integer from jsonb_array_elements(r.winners) x where (x->>'uid')::uuid = uid);
    else
      top := coalesce((select jsonb_agg(jsonb_build_object('rank', t.rn, 'name', public.fco_public_name(t.user_id), 'points', t.points,
               'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id), 'club', public.fco_club_logo(t.user_id)) order by t.rn)
             from (select p.user_id, p.points, row_number() over (order by p.points desc, p.reached_at, p.user_id) as rn
                   from public.fco_ctp_race_points p join auth.users u on u.id = p.user_id
                   where p.round = r.round and p.points > 0 and coalesce(u.banned_until, '-infinity') < now()
                   order by p.points desc, p.reached_at, p.user_id limit 5) t), '[]');
      my_rank := case when mine.points > 0 then 1 + (select count(*) from public.fco_ctp_race_points o join auth.users u on u.id = o.user_id
                   where o.round = r.round and coalesce(u.banned_until, '-infinity') < now()
                     and (o.points > mine.points or (o.points = mine.points and o.user_id <> uid
                          and (o.reached_at < mine.reached_at or (o.reached_at = mine.reached_at and o.user_id < uid))))) end;
    end if;
    out := out || jsonb_build_object('round', r.round, 'startsAt', (extract(epoch from r.starts_at) * 1000)::bigint, 'endsAt', (extract(epoch from r.ends_at) * 1000)::bigint,
      'ended', r.settled_at is not null, 'top', top, 'me', jsonb_build_object('points', coalesce(mine.points, 0), 'rank', my_rank),
      'rewards', (select jsonb_agg(jsonb_build_object('rank', rank, 'rewards', rewards, 'note', note) order by rank) from public.fco_ctp_race_rewards where round = r.round));
  end loop;
  return jsonb_build_object('rounds', out);
end;
$$;

-- Như 202611220003, chốt đợt đua trước khi cộng điểm và cộng điểm đua top theo điểm lượt này.
create or replace function public.fco_ctp_apply(p_uid uuid, o jsonb, p_count integer, p_mode text, p_price integer, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  rules jsonb := public.fco_ctp_rules(); j public.fco_jackpot; p jsonb; reward jsonb; amount bigint; plays jsonb := '[]'; grants jsonb := '[]';
  fc_won bigint := 0; granted jsonb; w public.fco_wallets; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- 202611220005: hết giờ đợt đua thì chốt bảng TRƯỚC khi lượt này cộng điểm.
  perform public.fco_ctp_race_tick();
  j := public.fco_jackpot_tick();
  for p in select value from jsonb_array_elements(o->'plays') loop
    if not coalesce((p->>'bonus')::boolean, false) then j.pot := j.pot + (rules->>'potPerPlay')::bigint; end if;
    reward := p->'reward';
    if jsonb_typeof(reward) = 'object' and reward ? 'jackpot' then
      if reward->>'jackpot' = 'special' then amount := j.pot; j.pot := 2000; else amount := floor(j.pot / 10); j.pot := j.pot - amount; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', reward->>'jackpot');
      p := jsonb_set(p, '{reward}', reward);
      j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_public_name(p_uid), 'uid', p_uid, 'amount', amount, 'kind', reward->>'jackpot', 'time', now_ms));
    end if;
    if jsonb_typeof(reward) = 'object' then
      if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
      grants := grants || jsonb_build_array(reward);
    end if;
    plays := plays || jsonb_build_array(p);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set ctp_pos = (o->>'pos')::integer, ctp_points = ctp_points + (o->>'ptsWon')::integer, ctp_free = ctp_free + (o->>'freeWon')::integer,
    ctp_lucky = (o->>'lucky')::integer, ctp_jp_at = (o->>'jpAt')::timestamptz, ctp_jp_prev = (o->>'jpPrev')::timestamptz,
    ctp_mini_at = (o->>'miniAt')::timestamptz, ctp_mini_prev = (o->>'miniPrev')::timestamptz
    where user_id = p_uid returning * into w;
  perform public.fco_ctp_race_add(p_uid, (o->>'ptsWon')::integer);
  if fc_won > 0 then perform public.fco_apply_fc(p_uid, fc_won, 'ctp_win', jsonb_build_object('count', p_count)); end if;
  granted := public.fco_inv_grant(p_uid, grants, 'event',
    'Cờ tỷ phú · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end || coalesce(p_note, ''),
    coalesce(nullif(public.fco_inv_reward_text(grants), ''), 'Không có quà') || ' · +' || (o->>'ptsWon') || ' điểm'
      || case when (o->>'freeWon')::integer > 0 then ' · +' || (o->>'freeWon') || ' lượt miễn phí' else '' end
      || case when p_price > 0 then ' · −' || public.fco_inv_money(p_price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', p_price, 'pos', w.ctp_pos, 'points', w.ctp_points, 'free', w.ctp_free, 'lucky', w.ctp_lucky,
    'jackpot', public.fco_jackpot_view(j, p_uid), 'wallet', public.fco_wallet_json(p_uid), 'save', granted);
end;
$$;

-- Như 202611220004, reset xoá điểm đua top Cờ tỷ phú.
create or replace function public.fco_admin_account_reset(p_user uuid, p_reset_fc boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); w public.fco_wallets; old_data jsonb; remaining bigint;
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_reset_fc is null then raise exception 'Invalid reset option' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(p_user);
  remaining := case when p_reset_fc then 0 else w.fc end;
  update public.fco_wallets set fc = remaining, event_points = 0, event_free = 0, event_paid = 0, event_missions = '{}',
    bilac_points = 0, bilac_claimed = '{}', checkin_day = 0,
    vqtg_pos = 0, vqtg_picks = 0, vqtg_tickets = 0, vqtg_tickets_at = null, vqtg_claimed = '{}',
    ctp_pos = 28, ctp_points = 0, ctp_free = 0, ctp_lucky = 1, ctp_claimed = '{}', ctp_card_chance = 0, ctp_card_luck = 0, ctp_badges = 0, ctp_draft_count = 0, updated_at = now()
  where user_id = p_user;
  select data into old_data from public.fco_game_saves where user_id = p_user for update;
  -- Chưa có bản lưu thì không có gì để xoá; lần đầu vào game sẽ tự tạo bản trống.
  if found then
    update public.fco_game_saves set revision = revision + 1, updated_at = now(), data =
      jsonb_build_object('version', 1, 'balance', 0, 'cards', '[]'::jsonb, 'history', '[]'::jsonb, 'unopened', '{}'::jsonb, 'daily', '', 'opened', 0, 'upgrades', 0,
        'sound', coalesce(old_data->'sound', 'false'::jsonb), 'reduced', coalesce(old_data->'reduced', 'false'::jsonb))
      || jsonb_strip_nulls(jsonb_build_object('reset', old_data->'reset', 'bpReset', old_data->'bpReset', 'quick', old_data->'quick', 'light', old_data->'light', 'codes', old_data->'codes'))
    where user_id = p_user;
  end if;
  delete from public.fco_ranks where user_id = p_user;
  delete from public.fco_ctp_pending where user_id = p_user;
  delete from public.fco_ctp_race_points where user_id = p_user;
  insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, actor)
  values (p_user, remaining - w.fc, remaining, 'reset', jsonb_build_object('resetFc', p_reset_fc), admin_id);
  return jsonb_build_object('reset', true, 'fc', remaining);
end;
$$;

revoke all on function public.fco_ctp_race_add(uuid, integer), public.fco_ctp_race_tick() from public, anon, authenticated;
revoke all on function public.fco_ctp_top() from public, anon;
grant execute on function public.fco_ctp_top() to authenticated;

commit;
