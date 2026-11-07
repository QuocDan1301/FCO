begin;

-- Điểm danh 7 ngày (cùng nút Nhận của Quà mỗi ngày, vẫn +1.000 FC như cũ):
--   ngày 1: 300 FC · ngày 2: 500 FC · ngày 3: gói ICONTM (ALL) · ngày 4: 700 FC · ngày 5: 900 FC · ngày 6: gói PRIME All · ngày 7: gói INFINITE PRIME All
-- Nhận liên tiếp mỗi ngày thì lên mốc kế; bỏ lỡ một ngày hoặc đã nhận đủ 7 ngày thì quay lại ngày 1. Ngày theo giờ Việt Nam.
-- FC do máy chủ cộng (sổ cái lý do 'checkin'); gói do trình duyệt thêm vào kho theo src/checkin.ts (cùng bảng quà, đổi thì sửa cả hai).

alter table public.fco_wallets
  add column checkin_day smallint not null default 0 check (checkin_day between 0 and 7),   -- mốc đã nhận gần nhất
  add column checkin_date date;                                                            -- ngày nhận mốc đó

-- Mốc sẽ nhận nếu điểm danh vào ngày p_today.
create function public.fco_checkin_next(p_day smallint, p_date date, p_today date) returns smallint
language sql immutable set search_path = '' as $$
  select case when p_date = p_today - 1 and p_day between 1 and 6 then p_day + 1 else 1 end::smallint
$$;

create or replace function public.fco_wallet_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'fc', w.fc,
    'dailyClaimed', w.daily is not distinct from public.fco_today(),
    'event', jsonb_build_object(
      'points', w.event_points, 'free', w.event_free,
      'paid', case when w.event_day = public.fco_today() then w.event_paid else 0 end,
      'missions', case when w.event_day = public.fco_today() then to_jsonb(w.event_missions) else '[]'::jsonb end),
    'checkin', case when w.checkin_date = public.fco_today()
      then jsonb_build_object('claimedToday', true, 'day', w.checkin_day, 'done', w.checkin_day)
      else jsonb_build_object('claimedToday', false, 'day', public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today()),
                              'done', public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today()) - 1) end,
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

-- Quà mỗi ngày: +1.000 FC như cũ, cộng quà mốc điểm danh. Mỗi ngày một lần.
create or replace function public.fco_claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; next smallint; bonus integer;
begin
  w := public.fco_wallet_lock(uid);
  if w.daily is not distinct from public.fco_today() then raise exception 'FCO_DAILY_CLAIMED' using errcode = 'P0001'; end if;
  next := public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today());
  update public.fco_wallets set daily = public.fco_today(), checkin_day = next, checkin_date = public.fco_today() where user_id = uid;
  perform public.fco_apply_fc(uid, 1000, 'daily');
  bonus := (array[300, 500, 0, 700, 900, 0, 0])[next];
  if bonus > 0 then perform public.fco_apply_fc(uid, bonus, 'checkin', jsonb_build_object('day', next)); end if;
  return public.fco_wallet_json(uid);
end;
$$;

revoke all on function public.fco_checkin_next(smallint, date, date) from public, anon, authenticated;

commit;
