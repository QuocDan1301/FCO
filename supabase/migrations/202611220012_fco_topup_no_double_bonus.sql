begin;

-- SỬA LỖI cộng KM nạp HAI LẦN cho cùng một mốc (người dùng 2026-11-22: "lỗi tăng fc bất thường cho các người chơi";
-- 24 giờ: topup_bonus 131 lần · 2.683.000 FC · 29 người mà không có lần nạp nào).
-- Nguyên nhân: KM theo đơn nạp cũ (202611200002) được ghi vào sổ nhận ở 202611200004 → 202611200005 gắn các dòng đó vào "đợt 0", mỗi đợt
-- tính lại từ đầu, nên mốc đã nhận theo đơn KHÔNG chặn đợt đang chạy; trong khi tiền của chính đơn đó vẫn tính vào tổng nạp của đợt
-- → 202611200006 (tự cộng bù lúc chạy file + trigger) cộng KM mốc đó lần nữa.
-- Từ bản này: mốc coi là ĐÃ NHẬN trong đợt nếu có dòng sổ nhận của đợt đó, HOẶC dòng "đợt 0" nhận từ lúc đợt bắt đầu.
-- File này KHÔNG trừ FC của ai. Thu hồi phần cộng đôi là bước riêng, chạy sau khi admin xem danh sách (fco_topup_double_awards).
-- Chạy SAU 202611200008_fco_topup_event_no_grace.sql. Chạy lại được.

create or replace function public.fco_topup_tier_taken(p_uid uuid, p_event public.fco_topup_events, p_vnd bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fco_topup_tier_claims c where c.user_id = p_uid and c.min_vnd = p_vnd
    and (c.event_id = p_event.id or (c.event_id = 0 and c.claimed_at >= p_event.starts_at)))
$$;

-- Như 202611200006 + chặn mốc đã nhận theo đơn.
create or replace function public.fco_topup_auto_award(p_uid uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.fco_topup_events := public.fco_topup_event_now(); total bigint; t record; n integer := 0;
begin
  if e.id is null or p_uid is null then return 0; end if;
  total := public.fco_topup_event_vnd(p_uid, e);
  for t in select x.min_vnd, x.bonus_fc from public.fco_topup_tiers x where x.min_vnd <= total order by x.min_vnd loop
    continue when public.fco_topup_tier_taken(p_uid, e, t.min_vnd);
    insert into public.fco_topup_tier_claims (user_id, event_id, min_vnd, bonus_fc) values (p_uid, e.id, t.min_vnd, t.bonus_fc) on conflict do nothing;
    if found then
      if t.bonus_fc > 0 then
        perform public.fco_apply_fc(p_uid, t.bonus_fc, 'topup_bonus',
          jsonb_build_object('note', e.title || ' · mốc ' || public.fco_inv_money(t.min_vnd) || 'đ · tự cộng', 'event', e.id));
      end if;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Như 202611200007 + chặn mốc đã nhận theo đơn.
create or replace function public.fco_topup_tier_claim(p_vnd bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); e public.fco_topup_events := public.fco_topup_event_now(); t public.fco_topup_tiers;
begin
  if e.id is null or now() >= e.ends_at then raise exception 'FCO_TOPUP_NO_EVENT' using errcode = 'P0001'; end if;
  select * into t from public.fco_topup_tiers x where x.min_vnd = p_vnd;
  if not found then raise exception 'FCO_MILESTONE_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  if public.fco_topup_event_vnd(uid, e) < t.min_vnd then raise exception 'FCO_MILESTONE_NOT_REACHED' using errcode = 'P0001'; end if;
  if public.fco_topup_tier_taken(uid, e, t.min_vnd) then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  insert into public.fco_topup_tier_claims (user_id, event_id, min_vnd, bonus_fc) values (uid, e.id, t.min_vnd, t.bonus_fc) on conflict do nothing;
  if not found then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  if t.bonus_fc > 0 then
    perform public.fco_apply_fc(uid, t.bonus_fc, 'topup_bonus', jsonb_build_object('note', e.title || ' · mốc ' || public.fco_inv_money(t.min_vnd) || 'đ', 'event', e.id));
  end if;
  return jsonb_build_object('vnd', t.min_vnd, 'bonus', t.bonus_fc, 'wallet', public.fco_wallet_json(uid));
end;
$$;

-- Như 202611200005: thanh trang nạp hiện "đã nhận" cho mốc đã nhận theo đơn.
create or replace function public.fco_topup_tiers_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); e public.fco_topup_events := public.fco_topup_event_now();
begin
  if e.id is null then return jsonb_build_object('event', null, 'totalVnd', 0, 'tiers', '[]'::jsonb); end if;
  return jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'title', e.title, 'startsAt', (extract(epoch from e.starts_at) * 1000)::bigint,
      'endsAt', (extract(epoch from e.ends_at) * 1000)::bigint,
      'claimUntil', (extract(epoch from e.ends_at + make_interval(days => public.fco_topup_claim_days())) * 1000)::bigint),
    'totalVnd', public.fco_topup_event_vnd(uid, e),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('vnd', t.min_vnd, 'bonus', t.bonus_fc,
        'claimed', public.fco_topup_tier_taken(uid, e, t.min_vnd)) order by t.min_vnd)
      from public.fco_topup_tiers t), '[]'::jsonb));
end;
$$;

-- Danh sách KM bị cộng đôi (chỉ admin, chỉ đọc): mốc đã nhận theo đơn ("đợt 0", nhận từ lúc đợt bắt đầu) mà đợt vẫn cộng thêm.
create or replace function public.fco_topup_double_awards() returns table (user_id uuid, name text, event_id bigint, min_vnd bigint,
  bonus_fc bigint, claimed_at timestamptz, fc_now bigint)
language sql stable security definer set search_path = '' as $$
  select c.user_id, n.name, c.event_id, c.min_vnd, c.bonus_fc, c.claimed_at, w.fc
  from public.fco_topup_tier_claims c
  join public.fco_topup_events e on e.id = c.event_id
  left join public.fco_display_names n on n.user_id = c.user_id
  left join public.fco_wallets w on w.user_id = c.user_id
  where c.event_id > 0 and exists (select 1 from public.fco_topup_tier_claims o where o.user_id = c.user_id and o.min_vnd = c.min_vnd
    and o.event_id = 0 and o.claimed_at >= e.starts_at)
  order by c.bonus_fc desc, c.claimed_at
$$;

revoke all on function public.fco_topup_tier_taken(uuid, public.fco_topup_events, bigint), public.fco_topup_auto_award(uuid),
  public.fco_topup_double_awards() from public, anon, authenticated;

do $$ declare k integer; s bigint;
begin
  select count(*), coalesce(sum(bonus_fc), 0) into k, s from public.fco_topup_double_awards();
  raise notice 'KM nạp bị cộng đôi: % mốc · % FC. Xem: select * from public.fco_topup_double_awards();', k, s;
end $$;

commit;