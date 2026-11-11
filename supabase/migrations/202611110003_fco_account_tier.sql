-- Loại tài khoản (2026-11-11): Classic / Premium do admin đặt cho từng người chơi (Quản trị FC → Tài khoản → Quản lý) để nhận ưu đãi riêng.
--   Không liên quan gói thành viên SVIP Class / Premium bán trong Shop (svip_until / premium_until).
--   Mặc định Classic. Game đọc qua fco_wallet_json ('tier') và hiện ở Thông tin HLV (src/ProfileCard.tsx).
begin;

alter table public.fco_wallets add column account_tier text not null default 'classic' check (account_tier in ('classic', 'premium'));

-- Như 202611090004, thêm loại tài khoản.
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
    'bilac', jsonb_build_object('points', w.bilac_points, 'claimed', to_jsonb(w.bilac_claimed), 'freeToday', w.bilac_free_day is distinct from public.fco_today()),
    'membership', jsonb_build_object(
      'svip', (extract(epoch from w.svip_until) * 1000)::bigint,
      'premium', (extract(epoch from w.premium_until) * 1000)::bigint),
    'tier', w.account_tier,
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

-- Admin xem (p_tier null) hoặc đặt loại tài khoản của một người chơi.
create function public.fco_admin_account_tier(p_user uuid, p_tier text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tier text;
begin
  perform public.fco_require_admin();
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_tier is not null and p_tier not in ('classic', 'premium') then raise exception 'FCO_BAD_TIER' using errcode = '22023'; end if;
  perform public.fco_wallet_lock(p_user);
  if p_tier is not null then update public.fco_wallets set account_tier = p_tier, updated_at = now() where user_id = p_user; end if;
  select account_tier into tier from public.fco_wallets where user_id = p_user;
  return jsonb_build_object('tier', tier);
end;
$$;
revoke all on function public.fco_admin_account_tier(uuid, text) from public, anon;
grant execute on function public.fco_admin_account_tier(uuid, text) to authenticated;

commit;
