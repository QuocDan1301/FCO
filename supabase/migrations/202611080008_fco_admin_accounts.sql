-- Quản lý tài khoản cho admin (2026-11-08): mục "Tài khoản" trong Quản trị FC.
--   · fco_admin_accounts: mọi tài khoản đã đăng ký (kể cả chưa từng vào game), tìm theo tên, sắp xếp, phân trang,
--     kèm FC / BP / thẻ / gói / đã nạp. Đếm và lọc ngay trên auth.users nên tài khoản mới hiện ngay sau khi đăng ký.
--   · fco_admin_account_lock: khoá / mở khoá. Khoá = banned_until (Supabase Auth chặn đăng nhập và làm mới phiên) + xoá
--     các phiên hiện có. JWT cũ còn hạn tới ~1 giờ nên fco_require_user và fco_commit_save cũng kiểm tra, chặn ngay.
--   · fco_admin_account_delete: xoá hẳn, dữ liệu liên quan xoá theo (on delete cascade), gồm cả sổ cái FC của tài khoản đó.
-- Không khoá / xoá được tài khoản admin (kể cả chính mình), kẻo mất quyền quản trị. Mọi hàm kiểm tra quyền bằng fco_require_admin.
begin;

create or replace function public.fco_require_user() returns uuid language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if exists (select 1 from auth.users where id = uid and banned_until > now()) then raise exception 'FCO_ACCOUNT_LOCKED' using errcode = '42501'; end if;
  return uid;
end;
$$;

-- Giống 202611070002, chỉ đổi chỗ lấy chủ tài khoản sang fco_require_user để bản lưu cũng bị chặn khi khoá.
create or replace function public.fco_commit_save(p_data jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := public.fco_require_user();
  saved public.fco_game_saves;
  previous jsonb;
begin
  if p_revision is null or p_revision < 0 or p_data is null or jsonb_typeof(p_data) <> 'object'
    or p_data->>'version' is distinct from '1' or jsonb_typeof(p_data->'cards') is distinct from 'array'
    or octet_length(p_data::text) > 10000000 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  p_data := p_data - 'fc';
  if p_revision = 0 then
    insert into public.fco_game_saves(user_id, revision, data)
    values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
  else
    select data into previous from public.fco_game_saves where user_id = owner_id and revision = p_revision for update;
    update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'FCO_SAVE_CONFLICT' using errcode = 'P0001'; end if;
  perform public.fco_audit_save(owner_id, saved.revision, previous, p_data);
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$$;

-- Tên admin nhìn thấy và dùng được ở Nạp FC: tên đăng nhập, hoặc nguyên email với tài khoản đăng ký bằng email thật.
create function public.fco_login_name(p_email text) returns text language sql immutable set search_path = '' as $$
  select case when lower(p_email) like '%@players.fco.invalid' then split_part(lower(p_email), '@', 1) else lower(coalesce(p_email, '')) end
$$;

create function public.fco_admin_accounts(p_search text default null, p_sort text default 'new', p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  skipped integer := greatest(coalesce(p_offset, 0), 0);
  matched bigint;
  everyone bigint;
  items jsonb;
begin
  perform public.fco_require_admin();
  select count(*), count(*) filter (where q is null or position(q in public.fco_login_name(u.email)) > 0) into everyone, matched from auth.users u;
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
        'locked', coalesce(b.banned_until > now(), false), 'admin', b.is_admin) as item
    from (
      select u.id, public.fco_login_name(u.email) as login, u.created_at, u.banned_until, p.last_seen,
        coalesce(p.play_seconds, 0) as play_seconds, coalesce(w.fc, 0) as fc, s.data,
        coalesce((select sum(l.delta) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin'), 0) as topup,
        exists (select 1 from public.fco_admins a where a.user_id = u.id) as is_admin
      from auth.users u
      left join public.fco_presence p on p.user_id = u.id
      left join public.fco_wallets w on w.user_id = u.id
      left join public.fco_game_saves s on s.user_id = u.id
      where q is null or position(q in public.fco_login_name(u.email)) > 0
    ) b
    cross join lateral public.fco_save_numbers(b.data) n
    order by ord
    limit page_size offset skipped
  ) page;
  return jsonb_build_object('total', everyone, 'matched', matched, 'accounts', items, 'now', (extract(epoch from now()) * 1000)::bigint);
end;
$$;

-- Đích của thao tác khoá / xoá: phải tồn tại và không phải admin.
create function public.fco_admin_target(p_user uuid) returns void language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fco_admins where user_id = p_user) then raise exception 'FCO_ADMIN_PROTECTED' using errcode = '42501'; end if;
end;
$$;

create function public.fco_admin_account_lock(p_user uuid, p_locked boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  perform public.fco_admin_target(p_user);
  if p_locked is null then raise exception 'Invalid lock state' using errcode = '22023'; end if;
  -- 100 năm thay vì 'infinity': Supabase Auth đọc cột này thành thời gian thường, không đọc được 'infinity'.
  update auth.users set banned_until = case when p_locked then now() + interval '100 years' end where id = p_user;
  if p_locked then delete from auth.sessions where user_id = p_user; end if;
  return jsonb_build_object('locked', p_locked);
end;
$$;

create function public.fco_admin_account_delete(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  perform public.fco_admin_target(p_user);
  delete from auth.users where id = p_user;
  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.fco_login_name(text), public.fco_admin_target(uuid) from public, anon, authenticated;
revoke all on function public.fco_admin_accounts(text, text, integer, integer), public.fco_admin_account_lock(uuid, boolean), public.fco_admin_account_delete(uuid) from public, anon;
grant execute on function public.fco_admin_accounts(text, text, integer, integer), public.fco_admin_account_lock(uuid, boolean), public.fco_admin_account_delete(uuid) to authenticated;

commit;