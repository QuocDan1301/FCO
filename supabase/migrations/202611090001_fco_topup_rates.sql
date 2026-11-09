-- Doanh thu nạp FC theo tỉ giá tại thời điểm nạp (2026-11-09): đổi tỉ giá không làm đổi số tiền của các lần nạp cũ.
--   · fco_topup_rates: mỗi dòng là một mức giá, áp dụng từ effective_from đến mức kế tiếp.
--   · Mọi lần nạp trước khi chạy migration tính 4.000 VND / 1.000 FC, đúng số trang thống kê đang hiện; từ lúc chạy migration là 5.000 VND.
--   · fco_admin_stats, fco_admin_accounts trả thêm topupVnd…; các trường topupFc giữ nguyên.
-- Đổi tỉ giá lần sau: thêm một dòng vào bảng này, cùng lúc sửa TOPUP_VND_PER_1000_FC trong src/config.ts.
begin;

create table public.fco_topup_rates (
  effective_from timestamptz primary key,
  vnd_per_1000 integer not null check (vnd_per_1000 > 0)
);
alter table public.fco_topup_rates enable row level security;
revoke all on public.fco_topup_rates from public, anon, authenticated;
insert into public.fco_topup_rates(effective_from, vnd_per_1000) values ('-infinity', 4000), (now(), 5000);

create function public.fco_topup_vnd(p_delta bigint, p_at timestamptz) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(p_delta / 1000.0 * r.vnd_per_1000) from public.fco_topup_rates r where r.effective_from <= p_at order by r.effective_from desc limit 1
$$;
revoke all on function public.fco_topup_vnd(bigint, timestamptz) from public, anon, authenticated;

-- Như 202611070003, thêm số tiền nạp.
create or replace function public.fco_admin_stats(p_search text default null, p_limit integer default 300) returns jsonb
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
    'topupVndToday', (select coalesce(sum(public.fco_topup_vnd(delta, created_at)), 0) from public.fco_fc_ledger where reason = 'admin' and (created_at at time zone 'Asia/Ho_Chi_Minh')::date = today),
    'topupVnd7', (select coalesce(sum(public.fco_topup_vnd(delta, created_at)), 0) from public.fco_fc_ledger where reason = 'admin' and (created_at at time zone 'Asia/Ho_Chi_Minh')::date > today - 7),
    'topupVnd30', (select coalesce(sum(public.fco_topup_vnd(delta, created_at)), 0) from public.fco_fc_ledger where reason = 'admin' and (created_at at time zone 'Asia/Ho_Chi_Minh')::date > today - 30),
    'topupVndAll', (select coalesce(sum(public.fco_topup_vnd(delta, created_at)), 0) from public.fco_fc_ledger where reason = 'admin'),
    'payers', (select count(distinct user_id) from public.fco_fc_ledger where reason = 'admin' and delta > 0))
  into summary;
  select jsonb_agg(jsonb_build_object('day', d,
      'active', (select count(*) from public.fco_play_days p where p.day = d and p.seconds > 0),
      'seconds', (select coalesce(sum(seconds), 0) from public.fco_play_days p where p.day = d),
      'topupFc', (select coalesce(sum(delta), 0) from public.fco_fc_ledger l where l.reason = 'admin' and (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date = d),
      'topupVnd', (select coalesce(sum(public.fco_topup_vnd(l.delta, l.created_at)), 0) from public.fco_fc_ledger l where l.reason = 'admin' and (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date = d),
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
        'topupVnd', coalesce((select sum(public.fco_topup_vnd(l.delta, l.created_at)) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin'), 0),
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

-- Như 202611080012, thêm số tiền nạp; "Nạp nhiều" xếp theo tiền thật.
create or replace function public.fco_admin_accounts(p_search text default null, p_sort text default 'new', p_limit integer default 50, p_offset integer default 0, p_status text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  only_paused boolean := p_status is not distinct from 'paused';
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  skipped integer := greatest(coalesce(p_offset, 0), 0);
  matched bigint;
  everyone bigint;
  items jsonb;
begin
  perform public.fco_require_admin();
  select count(*), count(*) filter (where (q is null or position(q in public.fco_login_name(u.email)) > 0)
      and (not only_paused or exists (select 1 from public.fco_account_pauses p where p.user_id = u.id)))
    into everyone, matched from auth.users u;
  select coalesce(jsonb_agg(page.item order by page.ord), '[]') into items from (
    select row_number() over (order by
        case when p_sort = 'active' then b.last_seen end desc nulls last,
        case when p_sort = 'topup' then b.topup_vnd end desc nulls last,
        case when p_sort = 'fc' then b.fc end desc nulls last,
        b.created_at desc, b.id) as ord,
      jsonb_build_object('id', b.id, 'login', b.login,
        'registered', (extract(epoch from b.created_at) * 1000)::bigint,
        'lastSeen', (extract(epoch from b.last_seen) * 1000)::bigint,
        'online', coalesce(b.last_seen > now() - interval '2 minutes', false),
        'playSeconds', b.play_seconds, 'topupFc', b.topup, 'topupVnd', b.topup_vnd, 'fc', b.fc,
        'bp', n.bp, 'cards', n.cards, 'packs', n.packs, 'hasSave', b.data is not null,
        'locked', coalesce(b.banned_until > now(), false), 'admin', b.is_admin, 'paused', b.paused) as item
    from (
      select u.id, public.fco_login_name(u.email) as login, u.created_at, u.banned_until, p.last_seen,
        coalesce(p.play_seconds, 0) as play_seconds, coalesce(w.fc, 0) as fc, s.data,
        coalesce((select sum(l.delta) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin'), 0) as topup,
        coalesce((select sum(public.fco_topup_vnd(l.delta, l.created_at)) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin'), 0) as topup_vnd,
        exists (select 1 from public.fco_admins a where a.user_id = u.id) as is_admin,
        exists (select 1 from public.fco_account_pauses x where x.user_id = u.id) as paused
      from auth.users u
      left join public.fco_presence p on p.user_id = u.id
      left join public.fco_wallets w on w.user_id = u.id
      left join public.fco_game_saves s on s.user_id = u.id
      where (q is null or position(q in public.fco_login_name(u.email)) > 0)
        and (not only_paused or exists (select 1 from public.fco_account_pauses x where x.user_id = u.id))
    ) b
    cross join lateral public.fco_save_numbers(b.data) n
    order by ord
    limit page_size offset skipped
  ) page;
  return jsonb_build_object('total', everyone, 'matched', matched, 'accounts', items, 'now', (extract(epoch from now()) * 1000)::bigint);
end;
$$;

commit;
