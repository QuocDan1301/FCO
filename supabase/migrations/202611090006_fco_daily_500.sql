-- Giảm quà mỗi ngày (2026-11-09): +500 FC thay cho +1.000 FC, phải khớp DAILY_FC trong src/game.ts.
-- Thưởng điểm danh 7 ngày giữ nguyên như 202611080002_fco_checkin_v3.sql, chuỗi ngày không đổi.
begin;

create or replace function public.fco_claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; next smallint; bonus integer;
begin
  w := public.fco_wallet_lock(uid);
  if w.daily is not distinct from public.fco_today() then raise exception 'FCO_DAILY_CLAIMED' using errcode = 'P0001'; end if;
  next := public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today());
  update public.fco_wallets set daily = public.fco_today(), checkin_day = next, checkin_date = public.fco_today() where user_id = uid;
  perform public.fco_apply_fc(uid, 500, 'daily');
  bonus := (array[200, 350, 500, 650, 800, 1000, 0])[next];
  if bonus > 0 then perform public.fco_apply_fc(uid, bonus, 'checkin', jsonb_build_object('day', next)); end if;
  return public.fco_wallet_json(uid);
end;
$$;

commit;
