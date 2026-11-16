-- Xác nhận Gmail thủ công (2026-11-16): một số người chơi đăng ký xong không nhận / không tìm thấy mail mã 6 số (máy chủ vẫn gửi:
-- confirmation_sent_at có giá trị) nên kẹt ở bước xác nhận. Admin xem được tài khoản chưa xác nhận và xác nhận hộ.
--   fco_account_status_match: thêm trạng thái 'unconfirmed' (email_confirmed_at trống) cho bộ lọc danh sách.
--   fco_admin_accounts: như 202611100011, trả thêm 'unconfirmed'.
--   fco_admin_confirm_email(p_user): admin đặt email_confirmed_at = now() cho tài khoản chưa xác nhận.
begin;

create or replace function public.fco_account_status_match(p_uid uuid, p_status text) returns boolean language sql stable security definer set search_path = '' as $$
  select case coalesce(p_status, '')
    when '' then true
    when 'paused' then exists (select 1 from public.fco_account_pauses x where x.user_id = p_uid)
    when 'active' then exists (select 1 from public.fco_presence p where p.user_id = p_uid and p.last_seen > now() - interval '2 minutes')
    when 'inactive' then not exists (select 1 from public.fco_presence p where p.user_id = p_uid and p.last_seen > now() - interval '2 minutes')
    when 'unconfirmed' then exists (select 1 from auth.users u where u.id = p_uid and u.email_confirmed_at is null)
    else false end
$$;
revoke all on function public.fco_account_status_match(uuid, text) from public, anon, authenticated;

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
  -- p_sort = '<cột>' (giảm dần) hoặc '<cột>_asc' (tăng dần); cột lạ thì về mặc định Mới đăng ký.
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
      jsonb_build_object('id', b.id, 'login', b.login,
        'registered', (extract(epoch from b.created_at) * 1000)::bigint,
        'lastSeen', (extract(epoch from b.last_seen) * 1000)::bigint,
        'online', coalesce(b.last_seen > now() - interval '2 minutes', false),
        'playSeconds', b.play_seconds, 'topupFc', b.topup, 'topupVnd', b.topup_vnd, 'fc', b.fc,
        'bp', n.bp, 'cards', n.cards, 'packs', n.packs, 'hasSave', b.data is not null,
        'locked', coalesce(b.banned_until > now(), false), 'admin', b.is_admin, 'paused', b.paused,
        'unconfirmed', b.email_confirmed_at is null) as item
    from (
      select u.id, public.fco_login_name(u.email) as login, u.created_at, u.banned_until, u.email_confirmed_at, p.last_seen,
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
    -- Giá trị để sắp xếp. BP / thẻ / gói của tài khoản chưa có bản lưu là null (hiện "—") nên luôn đứng cuối.
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

create or replace function public.fco_admin_confirm_email(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  login text;
  was timestamptz;
begin
  perform public.fco_require_admin();
  select public.fco_login_name(u.email), u.email_confirmed_at into login, was from auth.users u where u.id = p_user for update;
  if not found then raise exception 'FCO_NO_ACCOUNT' using hint = 'Không tìm thấy tài khoản.'; end if;
  if was is null then
    update auth.users set email_confirmed_at = now(), updated_at = now() where id = p_user;
  end if;
  return jsonb_build_object('login', login, 'already', was is not null);
end;
$$;
revoke all on function public.fco_admin_confirm_email(uuid) from public, anon;
grant execute on function public.fco_admin_accounts(text, text, integer, integer, text), public.fco_admin_confirm_email(uuid) to authenticated;

commit;
