-- Đặc quyền Premium / Luxury TỰ GIA HẠN khi người chơi nạp đủ tiền trong kỳ (người dùng 2026-11-24: "Các đặc quyền tự gia hạn khi người chơi nạp đủ số tiền";
-- chốt: Premium + Luxury, tính theo TỔNG NẠP TRONG KỲ, Premium 10.000 FC · Luxury 50.000 FC).
--   · Kỳ: Premium 7 ngày, Luxury 30 ngày (như hạn admin đặt). Tổng nạp = FC gốc đã nạp (sổ cái lý do 'admin', trừ phần thu hồi; KHÔNG tính FC khuyến mãi / quà admin).
--   · Hết hạn mà tổng nạp trong kỳ vừa qua [hạn − kỳ, hạn) ≥ mốc thì hạn tự cộng thêm đúng 1 kỳ (liền mạch, không hở ngày); kỳ mới lại xét tiếp
--     tổng nạp trong chính kỳ đó. Không đủ mốc thì để hết hạn như cũ (về Classic). Nghỉ nhiều kỳ rồi mới vào: xét lần lượt từng kỳ đã qua (tối đa 60 kỳ).
--   · Không có bộ hẹn giờ: gia hạn được chốt NGAY khi cần — lúc game tải ví (fco_wallet), lúc tính thuế bán (fco_inv_tax), lúc admin xem hạng (fco_admin_account_tier).
--   · Royal (vĩnh viễn) không liên quan. Không trừ / cộng FC; ghi hạn mới vào account_tier_until, tier_renew_checked = hạn đã xét mà không đủ (khỏi tính lại sổ cái).
--   Khớp src/profile.ts (TIER_RENEW) — tests/tier-renew.test.ts, supabase/tests/fco-tier-renew.pglite.mjs.
--   Chạy SAU 202611240004_fco_rank_split_rounds.sql. Chạy lại được.
begin;

alter table public.fco_wallets add column if not exists tier_renew_checked timestamptz;

create or replace function public.fco_tier_renew_rules() returns jsonb language sql immutable set search_path = '' as $$
  select '{"premium": {"fc": 10000, "days": 7}, "luxury": {"fc": 50000, "days": 30}}'::jsonb
$$;

-- Chốt gia hạn nếu hạng Premium / Luxury đã hết hạn. Trả true nếu vừa gia hạn.
create or replace function public.fco_tier_auto_renew(p_uid uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare w public.fco_wallets; rule jsonb; until_ timestamptz; period interval; need bigint; got bigint; n integer := 0;
begin
  -- Đường nhanh không khóa (gọi rất thường xuyên): chưa hết hạn / không phải Premium, Luxury / hạn này đã xét rồi thì thôi.
  select * into w from public.fco_wallets where user_id = p_uid;
  if not found or w.account_tier not in ('premium', 'luxury') or w.account_tier_until is null or w.account_tier_until > now()
     or w.tier_renew_checked is not distinct from w.account_tier_until then return false; end if;
  select * into w from public.fco_wallets where user_id = p_uid for update;
  if w.account_tier not in ('premium', 'luxury') or w.account_tier_until is null or w.account_tier_until > now()
     or w.tier_renew_checked is not distinct from w.account_tier_until then return false; end if;
  rule := public.fco_tier_renew_rules() -> w.account_tier;
  period := make_interval(days => (rule->>'days')::integer); need := (rule->>'fc')::bigint; until_ := w.account_tier_until;
  while until_ <= now() and n < 60 loop
    select greatest(coalesce(sum(l.delta), 0), 0) into got from public.fco_fc_ledger l
     where l.user_id = p_uid and l.reason = 'admin' and l.created_at >= until_ - period and l.created_at < until_;
    exit when got < need;
    until_ := until_ + period; n := n + 1;
  end loop;
  update public.fco_wallets set account_tier_until = until_, tier_renew_checked = case when until_ <= now() then until_ end, updated_at = now() where user_id = p_uid;
  return n > 0;
end;
$$;
revoke all on function public.fco_tier_renew_rules(), public.fco_tier_auto_renew(uuid) from public, anon, authenticated;

-- Game tải ví → chốt gia hạn trước khi trả hạng.
create or replace function public.fco_wallet(p_seed_points bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  perform public.fco_tier_auto_renew(uid);
  -- 202611140009: bỏ qua điểm sự kiện game tự khai khi tạo ví, luôn bắt đầu từ 0.
  perform public.fco_wallet_lock(uid, 0);
  return public.fco_wallet_json(uid);
end;
$$;

-- Thuế bán (như 202611240003) nhưng chốt gia hạn trước, để đang chơi qua giờ hết hạn vẫn được tính thuế đúng hạng.
create or replace function public.fco_inv_tax(p_uid uuid, p_rules jsonb) returns double precision
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.fco_tier_auto_renew(p_uid);
  return (select case public.fco_account_tier(p_uid)
    when 'royal' then (p_rules->>'marketFee')::double precision * (100 - 85) / 100
    when 'luxury' then (p_rules->>'marketFee')::double precision * (100 - 75) / 100
    when 'premium' then (p_rules->>'marketFee')::double precision * (100 - 65) / 100
  else (p_rules->>'marketFee')::double precision * (100 - coalesce((
    select max(v) from (
      select case when w.svip_until > now() then (p_rules->'membership'->>'svip')::double precision end as v from public.fco_wallets w where w.user_id = p_uid
      union all
      select case when w.premium_until > now() then (p_rules->'membership'->>'premium')::double precision end from public.fco_wallets w where w.user_id = p_uid
    ) s), 0)) / 100 end);
end;
$$;

-- Admin xem / đặt hạng (như 202611120011): chốt gia hạn trước khi trả; đặt hạng mới thì xoá dấu "đã xét".
create or replace function public.fco_admin_account_tier(p_user uuid, p_tier text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.fco_wallets;
begin
  perform public.fco_require_admin();
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_tier is not null and p_tier not in ('classic', 'premium', 'luxury') then raise exception 'FCO_BAD_TIER' using errcode = '22023'; end if;
  perform public.fco_tier_auto_renew(p_user);
  w := public.fco_wallet_lock(p_user);
  if p_tier in ('premium', 'luxury') then
    update public.fco_wallets set account_tier = p_tier,
      account_tier_until = greatest(coalesce(case when w.account_tier = p_tier then w.account_tier_until end, now()), now())
        + case when p_tier = 'luxury' then interval '30 days' else interval '7 days' end,
      tier_renew_checked = null, updated_at = now() where user_id = p_user;
  elsif p_tier = 'classic' then
    update public.fco_wallets set account_tier = 'classic', account_tier_until = null, tier_renew_checked = null, updated_at = now() where user_id = p_user;
  end if;
  select * into w from public.fco_wallets where user_id = p_user;
  return jsonb_build_object('tier', public.fco_account_tier(p_user),
    'until', case when public.fco_account_tier(p_user) <> 'classic' then (extract(epoch from w.account_tier_until) * 1000)::bigint end);
end;
$$;

commit;