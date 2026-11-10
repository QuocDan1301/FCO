-- Quản trị → Tài khoản: bấm tiêu đề cột để sắp xếp (2026-11-10, sau 202611090014).
--   p_sort nhận thêm 'play' (giờ chơi), 'bp', 'cards', 'packs' và hậu tố '_asc' để sắp tăng dần ('new_asc' = đăng ký cũ nhất trước).
--   Không hậu tố = giảm dần như cũ, nên 'new' / 'active' / 'topup' / 'fc' giữ nguyên nghĩa. Còn lại giống hệt 202611090014.
begin;

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


commit;
