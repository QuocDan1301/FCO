-- Tạm dừng tài khoản hàng loạt (2026-11-08): Quản trị FC → Tài khoản. Cần chạy sau 202611080008 và 202611080011.
--   Tài khoản bị tạm dừng vẫn đăng nhập được nhưng thấy popup "Máy chủ bảo trì, game sẽ quay lại sau" và không chơi được; người khác không ảnh hưởng.
--   Khác khoá (202611080008): không đăng xuất, không báo tài khoản bị khoá; bỏ tạm dừng thì người chơi tự vào lại game.
--   fco_require_user từ chối (FCO_ACCOUNT_PAUSED); fco_commit_save vẫn cho qua như lúc bảo trì để không mất phần vừa chơi.
--   Không tạm dừng tài khoản admin: thao tác hàng loạt bỏ qua và báo số bỏ qua.
begin;

create table public.fco_account_pauses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  paused_at timestamptz not null default now(),
  paused_by uuid references auth.users(id) on delete set null
);
alter table public.fco_account_pauses enable row level security;
revoke all on public.fco_account_pauses from anon, authenticated;

-- Như 202611080011, thêm chặn tài khoản bị tạm dừng.
create or replace function public.fco_require_user() returns uuid language plpgsql stable set search_path = '' as $$
declare uid uuid := public.fco_require_account();
begin
  if not exists (select 1 from public.fco_admins where user_id = uid) then
    if exists (select 1 from public.fco_account_pauses where user_id = uid) then raise exception 'FCO_ACCOUNT_PAUSED' using errcode = 'P0001'; end if;
    if exists (select 1 from public.fco_maintenance where id = 1 and enabled) then raise exception 'FCO_MAINTENANCE' using errcode = 'P0001'; end if;
  end if;
  return uid;
end;
$$;

-- Như 202611080011, thêm paused: chỉ cho biết về chính người đang xem.
create or replace function public.fco_maintenance_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled', m.enabled, 'message', m.message,
    'bypass', exists (select 1 from public.fco_admins a where a.user_id = auth.uid()),
    'paused', exists (select 1 from public.fco_account_pauses p where p.user_id = auth.uid()))
  from public.fco_maintenance m where m.id = 1
$$;

-- Như 202611080008, thêm cờ paused và lọc p_status ('paused' = chỉ tài khoản đang tạm dừng).
drop function if exists public.fco_admin_accounts(text, text, integer, integer);
create function public.fco_admin_accounts(p_search text default null, p_sort text default 'new', p_limit integer default 50, p_offset integer default 0, p_status text default null) returns jsonb
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
        case when p_sort = 'topup' then b.topup end desc nulls last,
        case when p_sort = 'fc' then b.fc end desc nulls last,
        b.created_at desc, b.id) as ord,
      jsonb_build_object('id', b.id, 'login', b.login,
        'registered', (extract(epoch from b.created_at) * 1000)::bigint,
        'lastSeen', (extract(epoch from b.last_seen) * 1000)::bigint,
        'online', coalesce(b.last_seen > now() - interval '2 minutes', false),
        'playSeconds', b.play_seconds, 'topupFc', b.topup, 'fc', b.fc,
        'bp', n.bp, 'cards', n.cards, 'packs', n.packs, 'hasSave', b.data is not null,
        'locked', coalesce(b.banned_until > now(), false), 'admin', b.is_admin, 'paused', b.paused) as item
    from (
      select u.id, public.fco_login_name(u.email) as login, u.created_at, u.banned_until, p.last_seen,
        coalesce(p.play_seconds, 0) as play_seconds, coalesce(w.fc, 0) as fc, s.data,
        coalesce((select sum(l.delta) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin'), 0) as topup,
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

-- Tạm dừng (p_paused = true) hoặc bỏ tạm dừng hàng loạt: theo danh sách p_users, hoặc p_all = true cho mọi tài khoản khớp p_search + p_status
-- (phải bật p_all rõ ràng, để danh sách rỗng không thành "tất cả"). changed = số tài khoản thực sự đổi trạng thái.
create function public.fco_admin_accounts_pause(p_paused boolean, p_users uuid[] default null, p_all boolean default false, p_search text default null, p_status text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin_id uuid := public.fco_require_admin();
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  only_paused boolean := p_status is not distinct from 'paused';
  targets uuid[];
  changed integer := 0;
  skipped_admins integer := 0;
begin
  if p_paused is null or p_all is null then raise exception 'Invalid pause request' using errcode = '22023'; end if;
  if not p_all and coalesce(cardinality(p_users), 0) = 0 then raise exception 'FCO_NO_ACCOUNTS' using errcode = '22023'; end if;
  select coalesce(array_agg(u.id), '{}') into targets from auth.users u
  where case when p_all
    then (q is null or position(q in public.fco_login_name(u.email)) > 0) and (not only_paused or exists (select 1 from public.fco_account_pauses x where x.user_id = u.id))
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

revoke all on function public.fco_admin_accounts(text, text, integer, integer, text), public.fco_admin_accounts_pause(boolean, uuid[], boolean, text, text), public.fco_maintenance_state() from public, anon;
grant execute on function public.fco_admin_accounts(text, text, integer, integer, text), public.fco_admin_accounts_pause(boolean, uuid[], boolean, text, text) to authenticated;
grant execute on function public.fco_maintenance_state() to anon, authenticated;

commit;