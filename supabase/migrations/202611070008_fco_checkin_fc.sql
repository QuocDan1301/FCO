-- Điểm danh 7 ngày đổi quà (2026-11-07): cả 7 ngày đều là FC, máy chủ cộng hết (sổ cái lý do 'checkin').
--   ngày 1: 200 FC · 2: 400 FC · 3: 700 FC · 4: 1.000 FC · 5: 1.300 FC · 6: 1.600 FC · 7: 2.000 FC
-- (thay 300 / 500 / gói ICONTM / 700 / 900 / gói PRIME / gói INFINITE PRIME của 202611070004_fco_checkin.sql).
-- Vẫn +1.000 FC quà mỗi ngày như cũ; chuỗi ngày giữ nguyên. Bảng quà phải khớp src/checkin.ts.
begin;

create or replace function public.fco_claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; next smallint; bonus integer;
begin
  w := public.fco_wallet_lock(uid);
  if w.daily is not distinct from public.fco_today() then raise exception 'FCO_DAILY_CLAIMED' using errcode = 'P0001'; end if;
  next := public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today());
  update public.fco_wallets set daily = public.fco_today(), checkin_day = next, checkin_date = public.fco_today() where user_id = uid;
  perform public.fco_apply_fc(uid, 1000, 'daily');
  bonus := (array[200, 400, 700, 1000, 1300, 1600, 2000])[next];
  if bonus > 0 then perform public.fco_apply_fc(uid, bonus, 'checkin', jsonb_build_object('day', next)); end if;
  return public.fco_wallet_json(uid);
end;
$$;

commit;
