-- Acc phụ cho sự kiện đập thẻ (2026-11-22, người dùng: "admin có thể tạo những acc phụ để làm sự kiện đập thẻ, mọi dữ liệu đều ko tính").
--   · Admin tạo acc phụ ở Quản trị FC → Tài khoản → "Tạo acc phụ": tên đăng nhập + mật khẩu do admin tự đặt (đăng nhập bằng tên, không cần Gmail).
--     Hoặc đánh dấu một tài khoản có sẵn là acc phụ (mục Bảo mật của tài khoản đó).
--   · Acc phụ VẪN: mở gói, đập thẻ, xếp đội hình, nhận quà admin tặng.
--   · KHÔNG ghi / KHÔNG tính: BXH (kỷ lục đập OVR, giá trị đội hình, Penalty, Đập +8), tin LIVE trang chủ, đua top Cờ tỷ phú,
--     thống kê giờ chơi, thiết bị (không lẫn vào Nghi clone, không chiếm lượt quà theo thiết bị của tài khoản chính).
--   · BỊ CHẶN (báo "Acc phụ không dùng được…"): chợ TTCN (mua / bán / đặt mua), GLXH, Cờ tỷ phú / VQTG / Bi Lắc (jackpot chung),
--     gift code, tạo đơn nạp, admin "nạp" FC (chỉ được Tặng quà → không vào doanh thu, Đã nạp, Top Đặc Huấn, KM nạp).
--   · Đánh dấu tài khoản có sẵn: xoá luôn kỷ lục BXH / Đập +8 / tin LIVE / GLXH / điểm đua Cờ tỷ phú / thiết bị / giờ chơi của nó.
--     Bỏ đánh dấu: từ đó tính bình thường (dữ liệu đã xoá không quay lại).
-- Chạy lại được.
begin;

create table if not exists public.fco_sub_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.fco_sub_accounts enable row level security;
revoke all on public.fco_sub_accounts from anon, authenticated;

create or replace function public.fco_is_sub(p_uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid is not null and exists (select 1 from public.fco_sub_accounts s where s.user_id = p_uid)
$$;
revoke all on function public.fco_is_sub(uuid) from public, anon, authenticated;

-- Bỏ qua (không ghi) dòng của acc phụ: BXH, tin LIVE, thiết bị, giờ chơi, điểm đua.
create or replace function public.fco_sub_skip() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.fco_is_sub(new.user_id) then return null; end if;
  return new;
end;
$$;
revoke all on function public.fco_sub_skip() from public, anon, authenticated;

-- Chặn hẳn (báo lỗi) thao tác của acc phụ. Bảng không có cột user_id (fco_mkt_sys_sold) thì xét người đang gọi.
create or replace function public.fco_sub_block() returns trigger language plpgsql security definer set search_path = '' as $$
declare who uuid := coalesce(nullif(to_jsonb(new)->>'user_id', '')::uuid, auth.uid());
begin
  if public.fco_is_sub(who) then raise exception 'FCO_SUB_ACCOUNT' using errcode = 'P0001', hint = tg_table_name; end if;
  return new;
end;
$$;
revoke all on function public.fco_sub_block() from public, anon, authenticated;

-- Sự kiện có jackpot chung: chính acc phụ đổ xúc xắc / đá bi thì chặn. Admin sửa ví acc phụ (reset…) vẫn được.
create or replace function public.fco_sub_block_event() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not distinct from new.user_id and public.fco_is_sub(new.user_id) then
    raise exception 'FCO_SUB_ACCOUNT' using errcode = 'P0001', hint = 'event';
  end if;
  return new;
end;
$$;
revoke all on function public.fco_sub_block_event() from public, anon, authenticated;

-- Acc phụ không nhận FC kiểu "nạp" (lý do admin): chỉ Tặng quà, để không vào doanh thu / Đã nạp / Top Đặc Huấn / KM nạp.
create or replace function public.fco_sub_block_topup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reason = 'admin' and new.delta > 0 and public.fco_is_sub(new.user_id) then
    raise exception 'FCO_SUB_TOPUP' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.fco_sub_block_topup() from public, anon, authenticated;

-- Tên trigger bắt đầu bằng "a_" để chạy trước các trigger BEFORE khác của bảng.
do $$
declare t text;
begin
  foreach t in array array['fco_ranks', 'fco_plus8', 'fco_live_feed', 'fco_devices', 'fco_device_claims', 'fco_play_days', 'fco_ctp_race_points'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists a_fco_sub_skip on public.%I', t);
      execute format('create trigger a_fco_sub_skip before insert or update on public.%I for each row execute function public.fco_sub_skip()', t);
    end if;
  end loop;
  foreach t in array array['fco_mkt_orders', 'fco_mkt_sys_sold', 'fco_ranked', 'fco_ranked_pending', 'fco_gift_redemptions', 'fco_topup_orders', 'fco_ctp_pending'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists a_fco_sub_block on public.%I', t);
      execute format('create trigger a_fco_sub_block before insert on public.%I for each row execute function public.fco_sub_block()', t);
    end if;
  end loop;
end $$;
drop trigger if exists a_fco_sub_block_event on public.fco_wallets;
create trigger a_fco_sub_block_event before update of ctp_pos, ctp_first_done, vqtg_pos, bilac_points on public.fco_wallets
  for each row execute function public.fco_sub_block_event();
drop trigger if exists a_fco_sub_block_topup on public.fco_fc_ledger;
create trigger a_fco_sub_block_topup before insert on public.fco_fc_ledger for each row execute function public.fco_sub_block_topup();

-- Như 202611110016, thêm: hàm tạo acc phụ của admin được tạo tài khoản tên đăng nhập (@players.fco.invalid).
-- Cờ fco.sub_create chỉ đặt bên trong fco_admin_sub_create (cùng giao dịch); người chơi gọi API đăng ký vẫn bị chặn.
create or replace function public.fco_auth_email_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare e text := lower(coalesce(new.email, '')); c text := lower(coalesce(new.email_change, ''));
begin
  if tg_op = 'INSERT' and coalesce(current_setting('fco.sub_create', true), '') = '1' and e ~ '^[a-z0-9_]{3,24}@players\.fco\.invalid$' then
    return new;
  end if;
  if tg_op = 'INSERT' or e is distinct from lower(coalesce(old.email, '')) then
    if e !~ '^[a-z0-9]{6,30}@gmail\.com$' or e <> public.fco_gmail_normalize(e) then raise exception 'FCO_GMAIL_ONLY' using errcode = 'P0001'; end if;
  end if;
  if c <> '' and (tg_op = 'INSERT' or c is distinct from lower(coalesce(old.email_change, ''))) then
    if c !~ '^[a-z0-9]{6,30}@gmail\.com$' or c <> public.fco_gmail_normalize(c) then raise exception 'FCO_GMAIL_ONLY' using errcode = 'P0001'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fco_auth_email_guard() from public, anon, authenticated;

-- Xoá dữ liệu "được tính" của một tài khoản (dùng khi đánh dấu acc phụ).
create or replace function public.fco_sub_purge(p_uid uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer; result jsonb := '{}';
begin
  delete from public.fco_ranks where user_id = p_uid; get diagnostics n = row_count; result := result || jsonb_build_object('ranks', n);
  delete from public.fco_plus8 where user_id = p_uid; get diagnostics n = row_count; result := result || jsonb_build_object('plus8', n);
  delete from public.fco_live_feed where user_id = p_uid; get diagnostics n = row_count; result := result || jsonb_build_object('feed', n);
  delete from public.fco_ranked_pending where user_id = p_uid;
  delete from public.fco_ranked where user_id = p_uid; get diagnostics n = row_count; result := result || jsonb_build_object('ranked', n);
  if to_regclass('public.fco_ctp_race_points') is not null then
    execute 'delete from public.fco_ctp_race_points where user_id = $1' using p_uid; get diagnostics n = row_count; result := result || jsonb_build_object('ctpRace', n);
  end if;
  delete from public.fco_device_claims where user_id = p_uid;
  delete from public.fco_devices where user_id = p_uid;
  delete from public.fco_play_days where user_id = p_uid;
  return result;
end;
$$;
revoke all on function public.fco_sub_purge(uuid) from public, anon, authenticated;

-- Admin tạo acc phụ. p_name = tên HLV (bỏ trống thì dùng tên đăng nhập).
create or replace function public.fco_admin_sub_create(p_login text, p_password text, p_name text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.fco_require_admin();
  login text := lower(trim(coalesce(p_login, '')));
  mail text;
  uid uuid := gen_random_uuid();
  nm text := left(regexp_replace(trim(coalesce(nullif(trim(p_name), ''), lower(trim(coalesce(p_login, ''))))), '\s+', ' ', 'g'), 24);
  problem text;
begin
  if login !~ '^[a-z0-9_]{3,24}$' then raise exception 'FCO_SUB_LOGIN' using errcode = '22023'; end if;
  if char_length(coalesce(p_password, '')) not between 6 and 72 then raise exception 'FCO_BAD_PASSWORD' using errcode = '22023'; end if;
  mail := login || '@players.fco.invalid';
  if exists (select 1 from auth.users u where lower(u.email) = mail) then raise exception 'FCO_SUB_TAKEN' using errcode = 'P0001'; end if;
  problem := public.fco_name_problem(nm);
  if problem is not null then raise exception '%', problem using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('fco_rename'));
  if exists (select 1 from public.fco_display_names d where d.name_key = public.fco_name_key(nm)) then raise exception 'FCO_NAME_TAKEN' using errcode = 'P0001'; end if;

  perform set_config('fco.sub_create', '1', true);
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values (coalesce((select u.instance_id from auth.users u where u.instance_id is not null limit 1), '00000000-0000-0000-0000-000000000000'::uuid),
          uid, 'authenticated', 'authenticated', mail, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('sub_account', true),
          now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now());
  perform set_config('fco.sub_create', '', true);

  insert into public.fco_sub_accounts (user_id, note, created_by) values (uid, nullif(left(trim(coalesce(p_note, '')), 200), ''), admin);
  -- Trigger đăng ký đã lưu tên = tên đăng nhập; admin nhập tên HLV khác thì đổi.
  update public.fco_display_names set name = nm, name_key = public.fco_name_key(nm) where user_id = uid;
  insert into public.fco_display_names (user_id, name, name_key) values (uid, nm, public.fco_name_key(nm)) on conflict (user_id) do nothing;
  return jsonb_build_object('id', uid, 'login', login, 'name', nm);
end;
$$;

-- Admin đánh dấu / bỏ đánh dấu acc phụ cho tài khoản có sẵn.
create or replace function public.fco_admin_sub_set(p_user uuid, p_sub boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin uuid := public.fco_require_admin(); login text; purged jsonb := '{}';
begin
  select public.fco_login_name(u.email) into login from auth.users u where u.id = p_user;
  if not found then raise exception 'FCO_NO_ACCOUNT' using hint = 'Không tìm thấy tài khoản.'; end if;
  if coalesce(p_sub, false) then
    if exists (select 1 from public.fco_admins a where a.user_id = p_user) then raise exception 'FCO_SUB_ADMIN' using errcode = 'P0001'; end if;
    if exists (select 1 from public.fco_mkt_orders o where o.user_id = p_user and o.status = 'open') then raise exception 'FCO_SUB_OPEN_ORDERS' using errcode = 'P0001'; end if;
    insert into public.fco_sub_accounts (user_id, note, created_by) values (p_user, nullif(left(trim(coalesce(p_note, '')), 200), ''), admin)
      on conflict (user_id) do nothing;
    purged := public.fco_sub_purge(p_user);
  else
    delete from public.fco_sub_accounts where user_id = p_user;
  end if;
  return jsonb_build_object('login', login, 'sub', coalesce(p_sub, false), 'purged', purged);
end;
$$;

-- Bộ lọc danh sách tài khoản: thêm 'sub' (acc phụ). Như 202611160002, thêm một nhánh.
create or replace function public.fco_account_status_match(p_uid uuid, p_status text) returns boolean language sql stable security definer set search_path = '' as $$
  select case coalesce(p_status, '')
    when '' then true
    when 'paused' then exists (select 1 from public.fco_account_pauses x where x.user_id = p_uid)
    when 'active' then exists (select 1 from public.fco_presence p where p.user_id = p_uid and p.last_seen > now() - interval '2 minutes')
    when 'inactive' then not exists (select 1 from public.fco_presence p where p.user_id = p_uid and p.last_seen > now() - interval '2 minutes')
    when 'unconfirmed' then exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is null)
    when 'sub' then exists (select 1 from public.fco_sub_accounts s where s.user_id = p_uid)
    else false end
$$;
revoke all on function public.fco_account_status_match(uuid, text) from public, anon, authenticated;

-- Như 202611190001_fco_admin_accounts_name.sql, trả thêm 'sub'.
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
  sort_key text := regexp_replace(coalesce(p_sort, 'new'), '_asc$', '');
  ascending boolean := right(coalesce(p_sort, ''), 4) = '_asc';
begin
  perform public.fco_require_admin();
  select count(*), count(*) filter (where (q is null or position(q in public.fco_login_name(u.email)) > 0)
      and public.fco_account_status_match(u.id, p_status))
    into everyone, matched from auth.users u;
  select count(*) into online_count from public.fco_presence p join auth.users u on u.id = p.user_id where p.last_seen > now() - interval '2 minutes';
  select coalesce(jsonb_agg(page.item order by page.ord), '[]') into items from (
    select row_number() over (order by
        case when not ascending then sortv.v end desc nulls last,
        case when ascending then sortv.v end asc nulls last,
        b.created_at desc, b.id) as ord,
      jsonb_build_object('id', b.id, 'login', b.login, 'name', b.name,
        'registered', (extract(epoch from b.created_at) * 1000)::bigint,
        'lastSeen', (extract(epoch from b.last_seen) * 1000)::bigint,
        'online', coalesce(b.last_seen > now() - interval '2 minutes', false),
        'playSeconds', b.play_seconds, 'topupFc', b.topup, 'topupVnd', b.topup_vnd, 'fc', b.fc,
        'bp', n.bp, 'cards', n.cards, 'packs', n.packs, 'hasSave', b.data is not null,
        'locked', coalesce(b.banned_until > now(), false), 'admin', b.is_admin, 'paused', b.paused,
        'unconfirmed', b.email_confirmed_at is null, 'sub', b.is_sub) as item
    from (
      select u.id, public.fco_login_name(u.email) as login,
        coalesce((select dn.name from public.fco_display_names dn where dn.user_id = u.id), nullif(trim(u.raw_user_meta_data->>'display_name'), '')) as name,
        u.created_at, u.banned_until, u.email_confirmed_at, p.last_seen,
        coalesce(p.play_seconds, 0) as play_seconds, coalesce(w.fc, 0) as fc, s.data,
        coalesce((select sum(l.delta) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin'), 0) as topup,
        coalesce((select sum(public.fco_topup_vnd(l.delta, l.created_at)) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin'), 0) as topup_vnd,
        exists (select 1 from public.fco_admins a where a.user_id = u.id) as is_admin,
        exists (select 1 from public.fco_account_pauses x where x.user_id = u.id) as paused,
        exists (select 1 from public.fco_sub_accounts sa where sa.user_id = u.id) as is_sub
      from auth.users u
      left join public.fco_presence p on p.user_id = u.id
      left join public.fco_wallets w on w.user_id = u.id
      left join public.fco_game_saves s on s.user_id = u.id
      where (q is null or position(q in public.fco_login_name(u.email)) > 0)
        and public.fco_account_status_match(u.id, p_status)
    ) b
    cross join lateral public.fco_save_numbers(b.data) n
    cross join lateral (select case sort_key
        when 'active' then extract(epoch from b.last_seen)
        when 'play' then b.play_seconds::numeric
        when 'fc' then b.fc::numeric
        when 'bp' then case when b.data is not null then n.bp::numeric end
        when 'cards' then case when b.data is not null then n.cards::numeric end
        when 'packs' then case when b.data is not null then n.packs::numeric end
        when 'topup' then b.topup_vnd::numeric
        else extract(epoch from b.created_at) end as v) sortv
    order by ord
    limit page_size offset skipped
  ) page;
  return jsonb_build_object('total', everyone, 'matched', matched, 'online', online_count, 'accounts', items, 'now', (extract(epoch from now()) * 1000)::bigint);
end;
$$;

revoke all on function public.fco_admin_sub_create(text, text, text, text), public.fco_admin_sub_set(uuid, boolean, text) from public, anon;
grant execute on function public.fco_admin_sub_create(text, text, text, text), public.fco_admin_sub_set(uuid, boolean, text),
  public.fco_admin_accounts(text, text, integer, integer, text) to authenticated;

commit;
