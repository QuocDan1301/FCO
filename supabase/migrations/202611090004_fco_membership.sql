-- Gói thành viên theo tuần (2026-11-09): SVIP Class 500 FC giảm 30% thuế bán, Premium 700 FC giảm 50%.
--   Giá nằm ở máy chủ, không nhận giá từ trình duyệt như fco_spend_fc. Mua thêm khi còn hạn thì cộng dồn 7 ngày.
--   Hai gói có hạn riêng và chạy song song; game áp dụng gói giảm nhiều hơn (src/membership.ts).
--   Sổ cái dùng lý do 'shop' nên được tính vào "Đã dùng", không tính vào doanh thu nạp.
--   Thuế tính trong trình duyệt như BP nói chung; máy chủ chỉ bảo vệ FC và hạn gói.
begin;

alter table public.fco_wallets
  add column svip_until timestamptz,
  add column premium_until timestamptz;

-- Như 202611070005, thêm hạn gói thành viên.
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
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

create function public.fco_buy_membership(p_tier text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; price bigint; label text;
begin
  case p_tier
    when 'svip' then price := 500; label := 'SVIP Class';
    when 'premium' then price := 700; label := 'Premium';
    else raise exception 'FCO_BAD_MEMBERSHIP' using errcode = '22023';
  end case;
  w := public.fco_wallet_lock(uid);
  perform public.fco_apply_fc(uid, -price, 'shop', jsonb_build_object('membership', p_tier, 'note', label || ' 7 ngày'));
  update public.fco_wallets set
    svip_until = case when p_tier = 'svip' then greatest(now(), coalesce(w.svip_until, now())) + interval '7 days' else svip_until end,
    premium_until = case when p_tier = 'premium' then greatest(now(), coalesce(w.premium_until, now())) + interval '7 days' else premium_until end
  where user_id = uid;
  return public.fco_wallet_json(uid);
end;
$$;

revoke all on function public.fco_buy_membership(text) from public, anon;
grant execute on function public.fco_buy_membership(text) to authenticated;

commit;
