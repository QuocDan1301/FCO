begin;

-- Thống kê người chơi cho admin: số tài khoản, đang online, giờ chơi, FC nạp.
-- Game (đã đăng nhập, tab đang hiện) gọi fco_heartbeat mỗi 60 giây. Máy chủ tự tính thời gian chơi: mỗi lần chỉ cộng
-- khoảng cách từ lần trước, tối đa 90 giây, nên gọi dồn dập không làm tăng giờ chơi. "Online" = có tín hiệu trong 2 phút.
-- FC nạp = tổng FC admin cộng / trừ ở mục Nạp FC (lý do 'admin' trong sổ cái); quà ngày, gift code, sự kiện không tính.
-- Khách (không đăng nhập) không được tính.

create table public.fco_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  play_seconds bigint not null default 0
);
create table public.fco_play_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  seconds integer not null default 0,
  primary key (user_id, day)
);
create index fco_presence_seen on public.fco_presence(last_seen desc);
create index fco_play_days_day on public.fco_play_days(day);
alter table public.fco_presence enable row level security;
alter table public.fco_play_days enable row level security;
revoke all on public.fco_presence, public.fco_play_days from anon, authenticated;

create function public.fco_heartbeat() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); prev timestamptz; add integer;
begin
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
end;
$$;

-- Tổng quan + danh sách người chơi (mới hoạt động trước). p_search lọc theo tên đăng nhập.
create function public.fco_admin_stats(p_search text default null, p_limit integer default 300) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  today date := public.fco_today();
  summary jsonb; players jsonb; days jsonb;
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform public.fco_require_admin();
  select jsonb_build_object(
    'registered', (select count(*) from auth.users),
    'registeredToday', (select count(*) from auth.users where (created_at at time zone 'Asia/Ho_Chi_Minh')::date = today),
    'registered7', (select count(*) from auth.users where (created_at at time zone 'Asia/Ho_Chi_Minh')::date > today - 7),
    'online', (select count(*) from public.fco_presence where last_seen > now() - interval '2 minutes'),
    'activeToday', (select count(*) from public.fco_play_days where day = today and seconds > 0),
    'active7', (select count(distinct user_id) from public.fco_play_days where day > today - 7 and seconds > 0),
    'playSecondsToday', (select coalesce(sum(seconds), 0) from public.fco_play_days where day = today),
    'playSeconds7', (select coalesce(sum(seconds), 0) from public.fco_play_days where day > today - 7),
    'playSecondsAll', (select coalesce(sum(play_seconds), 0) from public.fco_presence),
    'topupFcToday', (select coalesce(sum(delta), 0) from public.fco_fc_ledger where reason = 'admin' and (created_at at time zone 'Asia/Ho_Chi_Minh')::date = today),
    'topupFc7', (select coalesce(sum(delta), 0) from public.fco_fc_ledger where reason = 'admin' and (created_at at time zone 'Asia/Ho_Chi_Minh')::date > today - 7),
    'topupFc30', (select coalesce(sum(delta), 0) from public.fco_fc_ledger where reason = 'admin' and (created_at at time zone 'Asia/Ho_Chi_Minh')::date > today - 30),
    'topupFcAll', (select coalesce(sum(delta), 0) from public.fco_fc_ledger where reason = 'admin'),
    'payers', (select count(distinct user_id) from public.fco_fc_ledger where reason = 'admin' and delta > 0))
  into summary;
  -- 14 ngày gần nhất: người hoạt động, giờ chơi, FC nạp, đăng ký mới.
  select jsonb_agg(jsonb_build_object('day', d,
      'active', (select count(*) from public.fco_play_days p where p.day = d and p.seconds > 0),
      'seconds', (select coalesce(sum(seconds), 0) from public.fco_play_days p where p.day = d),
      'topupFc', (select coalesce(sum(delta), 0) from public.fco_fc_ledger l where l.reason = 'admin' and (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date = d),
      'registered', (select count(*) from auth.users u where (u.created_at at time zone 'Asia/Ho_Chi_Minh')::date = d)) order by d desc)
  into days from generate_series(today - 13, today, interval '1 day') as g(t), lateral (select g.t::date as d) x;
  select coalesce(jsonb_agg(row order by sort_key desc nulls last), '[]') into players from (
    select jsonb_build_object('login', split_part(u.email, '@', 1),
        'registered', (extract(epoch from u.created_at) * 1000)::bigint,
        'lastSeen', (extract(epoch from p.last_seen) * 1000)::bigint,
        'online', coalesce(p.last_seen > now() - interval '2 minutes', false),
        'playSeconds', coalesce(p.play_seconds, 0),
        'playSecondsToday', coalesce((select seconds from public.fco_play_days d where d.user_id = u.id and d.day = today), 0),
        'topupFc', coalesce((select sum(delta) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin'), 0),
        'fc', coalesce(w.fc, 0)) as row,
      coalesce(p.last_seen, u.created_at) as sort_key
    from auth.users u
    left join public.fco_presence p on p.user_id = u.id
    left join public.fco_wallets w on w.user_id = u.id
    where q is null or split_part(lower(u.email), '@', 1) like '%' || q || '%'
    order by coalesce(p.last_seen, u.created_at) desc
    limit least(greatest(coalesce(p_limit, 300), 1), 1000)) s;
  return jsonb_build_object('summary', summary, 'days', days, 'players', players, 'now', (extract(epoch from now()) * 1000)::bigint);
end;
$$;

revoke all on function public.fco_heartbeat(), public.fco_admin_stats(text, integer) from public, anon;
grant execute on function public.fco_heartbeat(), public.fco_admin_stats(text, integer) to authenticated;

commit;
