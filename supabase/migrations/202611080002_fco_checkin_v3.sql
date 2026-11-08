-- Điểm danh 7 ngày đổi quà (2026-11-08):
--   ngày 1: 200 FC · 2: 350 FC · 3: 500 FC · 4: 650 FC · 5: 800 FC · 6: 1.000 FC · 7: gói ITM All 122+ (the-moment)
-- (thay 200 / 400 / 700 / 1.000 / 1.300 / 1.600 / 2.000 FC của 202611070008_fco_checkin_fc.sql).
-- FC máy chủ cộng (sổ cái lý do 'checkin'); gói ngày 7 do trình duyệt thêm vào kho theo src/checkin.ts (bảng quà phải khớp).
-- Vẫn +1.000 FC quà mỗi ngày như cũ; chuỗi ngày giữ nguyên.
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
  bonus := (array[200, 350, 500, 650, 800, 1000, 0])[next];
  if bonus > 0 then perform public.fco_apply_fc(uid, bonus, 'checkin', jsonb_build_object('day', next)); end if;
  return public.fco_wallet_json(uid);
end;
$$;

commit;
