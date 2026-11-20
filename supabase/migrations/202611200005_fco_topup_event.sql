begin;

-- Khuyến mãi nạp tích luỹ là SỰ KIỆN CÓ THỜI GIAN (người dùng 2026-11-20: "nạp tích lũy là sự kiện có thời gian, bình thường thì ko có").
--   • fco_topup_events: mỗi đợt có tên, giờ bắt đầu, giờ kết thúc. Ngoài đợt: không có thanh, không có KM (đơn nạp chỉ cộng FC gốc).
--   • Trong đợt: tổng nạp = FC lý do 'admin' quy VND (fco_topup_vnd) của các lần nạp trong khung giờ đợt. Đơn nạp TẠO trong đợt vẫn tính
--     dù admin duyệt sau giờ kết thúc (lấy giờ tạo đơn); nạp theo bill tính theo giờ admin cộng.
--   • Hết đợt còn 3 ngày để bấm nhận KM đã đạt. Mỗi đợt tính lại từ đầu: sổ nhận fco_topup_tier_claims thêm event_id.
--   • Mốc + FC KM vẫn ở fco_topup_tiers (admin sửa trước mỗi đợt).
-- Chạy sau 202611200004_fco_topup_cumulative.sql. Chạy lại được.

create table if not exists public.fco_topup_events (
  id bigint generated always as identity primary key,
  title text not null default 'Nạp tích luỹ',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.fco_topup_events enable row level security;
revoke all on public.fco_topup_events from public, anon, authenticated;

-- Sổ nhận theo từng đợt (dòng cũ trước khi có đợt: event_id = 0, không ảnh hưởng đợt nào).
alter table public.fco_topup_tier_claims add column if not exists event_id bigint not null default 0;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'fco_topup_tier_claims_pkey'
             and pg_get_constraintdef(oid) not like '%event_id%') then
    alter table public.fco_topup_tier_claims drop constraint fco_topup_tier_claims_pkey;
    alter table public.fco_topup_tier_claims add constraint fco_topup_tier_claims_pkey primary key (user_id, event_id, min_vnd);
  end if;
end $$;

create or replace function public.fco_topup_claim_days() returns integer language sql immutable set search_path = '' as $$ select 3 $$;

-- Đợt đang chạy hoặc đang trong hạn nhận (mới nhất trước).
create or replace function public.fco_topup_event_now() returns public.fco_topup_events language sql stable security definer set search_path = '' as $$
  select e.* from public.fco_topup_events e
  where e.starts_at <= now() and now() < e.ends_at + make_interval(days => public.fco_topup_claim_days())
  order by e.starts_at desc limit 1
$$;

-- Tổng tiền nạp của một người trong đợt.
create or replace function public.fco_topup_event_vnd(p_uid uuid, p_event public.fco_topup_events) returns bigint language sql stable security definer set search_path = '' as $$
  select greatest(coalesce(sum(public.fco_topup_vnd(l.delta, l.created_at)), 0), 0)::bigint
  from public.fco_fc_ledger l
  left join public.fco_topup_orders o on o.code = l.detail->>'order'
  where l.user_id = p_uid and l.reason = 'admin'
    and coalesce(o.created_at, l.created_at) >= p_event.starts_at and coalesce(o.created_at, l.created_at) < p_event.ends_at
$$;

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
        'claimed', exists (select 1 from public.fco_topup_tier_claims c where c.user_id = uid and c.event_id = e.id and c.min_vnd = t.min_vnd)) order by t.min_vnd)
      from public.fco_topup_tiers t), '[]'::jsonb));
end;
$$;

create or replace function public.fco_topup_tier_claim(p_vnd bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); e public.fco_topup_events := public.fco_topup_event_now(); t public.fco_topup_tiers;
begin
  if e.id is null then raise exception 'FCO_TOPUP_NO_EVENT' using errcode = 'P0001'; end if;
  select * into t from public.fco_topup_tiers x where x.min_vnd = p_vnd;
  if not found then raise exception 'FCO_MILESTONE_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  if public.fco_topup_event_vnd(uid, e) < t.min_vnd then raise exception 'FCO_MILESTONE_NOT_REACHED' using errcode = 'P0001'; end if;
  insert into public.fco_topup_tier_claims (user_id, event_id, min_vnd, bonus_fc) values (uid, e.id, t.min_vnd, t.bonus_fc) on conflict do nothing;
  if not found then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  if t.bonus_fc > 0 then
    perform public.fco_apply_fc(uid, t.bonus_fc, 'topup_bonus', jsonb_build_object('note', e.title || ' · mốc ' || public.fco_inv_money(t.min_vnd) || 'đ', 'event', e.id));
  end if;
  return jsonb_build_object('vnd', t.min_vnd, 'bonus', t.bonus_fc, 'wallet', public.fco_wallet_json(uid));
end;
$$;

-- ===== Admin =====
create or replace function public.fco_admin_topup_events() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  return jsonb_build_object('claimDays', public.fco_topup_claim_days(), 'now', (extract(epoch from now()) * 1000)::bigint,
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title,
        'startsAt', (extract(epoch from e.starts_at) * 1000)::bigint, 'endsAt', (extract(epoch from e.ends_at) * 1000)::bigint,
        'claims', (select count(*) from public.fco_topup_tier_claims c where c.event_id = e.id),
        'players', (select count(distinct c.user_id) from public.fco_topup_tier_claims c where c.event_id = e.id),
        'bonusFc', (select coalesce(sum(c.bonus_fc), 0) from public.fco_topup_tier_claims c where c.event_id = e.id)) order by e.starts_at desc)
      from (select * from public.fco_topup_events order by starts_at desc limit 10) e), '[]'::jsonb));
end;
$$;

-- Tạo (p_id null) hoặc sửa một đợt. Các đợt không được trùng giờ nhau.
create or replace function public.fco_admin_topup_event_save(p_id bigint, p_title text, p_starts timestamptz, p_ends timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare new_title text := left(coalesce(nullif(trim(p_title), ''), 'Nạp tích luỹ'), 60);
begin
  perform public.fco_require_admin();
  if p_starts is null or p_ends is null or p_ends <= p_starts then raise exception 'FCO_TOPUP_EVENT_BAD' using errcode = '22023'; end if;
  if exists (select 1 from public.fco_topup_events e where e.id is distinct from p_id and e.starts_at < p_ends and p_starts < e.ends_at) then
    raise exception 'FCO_TOPUP_EVENT_OVERLAP' using errcode = 'P0001';
  end if;
  if p_id is null then insert into public.fco_topup_events (title, starts_at, ends_at) values (new_title, p_starts, p_ends);
  else
    update public.fco_topup_events set title = new_title, starts_at = p_starts, ends_at = p_ends where id = p_id;
    if not found then raise exception 'FCO_TOPUP_EVENT_BAD' using errcode = '22023'; end if;
  end if;
  return public.fco_admin_topup_events();
end;
$$;

-- Kết thúc ngay (giữ 3 ngày nhận quà), hoặc xoá đợt chưa bắt đầu.
create or replace function public.fco_admin_topup_event_end(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.fco_topup_events;
begin
  perform public.fco_require_admin();
  select * into e from public.fco_topup_events where id = p_id for update;
  if not found then raise exception 'FCO_TOPUP_EVENT_BAD' using errcode = '22023'; end if;
  if e.starts_at > now() then delete from public.fco_topup_events where id = p_id;
  elsif e.ends_at > now() then update public.fco_topup_events set ends_at = now() where id = p_id;
  end if;
  return public.fco_admin_topup_events();
end;
$$;

revoke all on function public.fco_topup_claim_days(), public.fco_topup_event_now(), public.fco_topup_event_vnd(uuid, public.fco_topup_events) from public, anon, authenticated;
revoke all on function public.fco_topup_tiers_me(), public.fco_topup_tier_claim(bigint), public.fco_admin_topup_events(),
  public.fco_admin_topup_event_save(bigint, text, timestamptz, timestamptz), public.fco_admin_topup_event_end(bigint) from public, anon;
grant execute on function public.fco_topup_tiers_me(), public.fco_topup_tier_claim(bigint), public.fco_admin_topup_events(),
  public.fco_admin_topup_event_save(bigint, text, timestamptz, timestamptz), public.fco_admin_topup_event_end(bigint) to authenticated;

commit;
