-- Quản trị → Tài khoản: thêm bộ lọc Đang hoạt động / Không hoạt động (2026-11-09, sau 202611090001).
--   Đang hoạt động = đang online (có tín hiệu trong 2 phút gần nhất, cùng cách tính cột Hoạt động "đang online");
--   Không hoạt động = mọi tài khoản còn lại (kể cả chưa từng vào game). 'paused' giữ như cũ.
--   fco_account_status_match dùng chung cho danh sách và tạm dừng hàng loạt "tất cả tài khoản khớp bộ lọc".
--   Danh sách trả thêm 'online' = số tài khoản đang online để hiện trên nút.
begin;

create function public.fco_account_status_match(p_uid uuid, p_status text) returns boolean language sql stable security definer set search_path = '' as $$
  select case coalesce(p_status, '')
    when '' then true
    when 'paused' then exists (select 1 from public.fco_account_pauses x where x.user_id = p_uid)
    when 'active' then exists (select 1 from public.fco_presence p where p.user_id = p_uid and p.last_seen > now() - interval '2 minutes')
    when 'inactive' then not exists (select 1 from public.fco_presence p where p.user_id = p_uid and p.last_seen > now() - interval '2 minutes')
    else false end
$$;
revoke all on function public.fco_account_status_match(uuid, text) from public, anon, authenticated;

-- Như 202611090001, lọc trạng thái qua fco_account_status_match và trả thêm số tài khoản đang online.
create or replace function public.fco_admin_accounts(p_search text default null, p_sort text default 'new', p_limit integer default 50, p_offset integer default 0, p_status text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  skipped integer := greatest(coalesce(p_offset, 0), 0);
  matched bigint;
  everyone bigint;
  items jsonb;
  online_count bigint;
begin
  perform public.fco_require_admin();
  select count(*), count(*) filter (where (q is null or position(q in public.fco_login_name(u.email)) > 0)
      and public.fco_account_status_match(u.id, p_status))
    into everyone, matched from auth.users u;
  select count(*) into online_count from public.fco_presence p join auth.users u on u.id = p.user_id where p.last_seen > now() - interval '2 minutes';
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
        and public.fco_account_status_match(u.id, p_status)
    ) b
    cross join lateral public.fco_save_numbers(b.data) n
    order by ord
    limit page_size offset skipped
  ) page;
  return jsonb_build_object('total', everyone, 'matched', matched, 'online', online_count, 'accounts', items, 'now', (extract(epoch from now()) * 1000)::bigint);
end;
$$;

-- Như 202611080012, lọc trạng thái qua fco_account_status_match.
create or replace function public.fco_admin_accounts_pause(p_paused boolean, p_users uuid[] default null, p_all boolean default false, p_search text default null, p_status text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin_id uuid := public.fco_require_admin();
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  targets uuid[];
  changed integer := 0;
  skipped_admins integer := 0;
begin
  if p_paused is null or p_all is null then raise exception 'Invalid pause request' using errcode = '22023'; end if;
  if not p_all and coalesce(cardinality(p_users), 0) = 0 then raise exception 'FCO_NO_ACCOUNTS' using errcode = '22023'; end if;
  select coalesce(array_agg(u.id), '{}') into targets from auth.users u
  where case when p_all
    then (q is null or position(q in public.fco_login_name(u.email)) > 0) and public.fco_account_status_match(u.id, p_status)
    else u.id = any(p_users) end;
  if p_paused then
    select count(*) into skipped_admins from public.fco_admins a where a.user_id = any(targets);
    insert into public.fco_account_pauses(user_id, paused_by)
    select t, admin_id from unnest(targets) t where not exists (select 1 from public.fco_admins a where a.user_id = t)
    on conflict (user_id) do nothing;
  else
    delete from public.fco_account_pauses where user_id = any(targets);
  end if;
  get diagnostics changed = row_count;
  return jsonb_build_object('changed', changed, 'skippedAdmins', skipped_admins);
end;
$$;

commit;
