-- Tăng giá gói thành viên (2026-11-09): SVIP Class 1.000 FC, Premium 1.500 FC. Hạn đã mua giữ nguyên. Chạy sau 202611090004.
create or replace function public.fco_buy_membership(p_tier text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; price bigint; label text;
begin
  case p_tier
    when 'svip' then price := 1000; label := 'SVIP Class';
    when 'premium' then price := 1500; label := 'Premium';
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
