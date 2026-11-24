-- Hạng ROYAL độc quyền (người dùng 2026-11-24: "Thêm vào độc quyền Royal khi người chơi nạp đủ 100k fc, thêm nhiều hiệu ứng đẹp hơn, giảm 85% thuế bán cầu thủ").
--   · Tự lên Royal khi TỔNG FC đã nạp (sổ cái lý do 'admin' = đơn nạp được duyệt / admin cộng FC nạp; KHÔNG tính FC khuyến mãi 'topup_bonus')
--     đạt 100.000 FC. Royal VĨNH VIỄN (không hết hạn); chỉ mất khi tổng nạp tụt dưới mốc (admin thu hồi đơn nạp).
--     fco_wallets.royal_at = lúc đạt mốc, cập nhật bằng trigger mỗi lần sổ cái có dòng 'admin' (không tính lại mỗi lần đọc ví → nhẹ Disk IO).
--   · Royal đứng trên Luxury / Premium: fco_account_tier trả 'royal' khi royal_at có giá trị, bất kể hạng admin đặt.
--   · Giảm 85% thuế bán (40% → 6%; bán cho hệ thống 50% → 7,5%), KHÔNG cộng dồn gói thành viên Shop; phiếu giảm thuế chỉ dùng khi cho thuế
--     thấp hơn (với Royal không phiếu nào thấp hơn → FCO_VOUCHER_USELESS, không mất phiếu).
--   · 6 hiệu ứng avatar + tên độc quyền Royal: emperor, nebula, thunder, sakura, obsidian, celestial; Royal dùng được cả hiệu ứng Premium + Luxury.
--   Khớp src/market.ts (ROYAL_TAX_DISCOUNT, ROYAL_TOPUP_FC), src/name-effects.ts — tests/royal.test.ts, supabase/tests/fco-royal.pglite.mjs.
--   Chạy SAU 202611240002_fco_jackpot_player_daily.sql. Chạy lại được.
begin;

alter table public.fco_wallets add column if not exists royal_at timestamptz;

-- Mốc nạp lên Royal (FC gốc đã nạp).
create or replace function public.fco_royal_topup_fc() returns bigint language sql immutable set search_path = '' as $$ select 100000::bigint $$;

-- Tổng FC đã nạp của một tài khoản (giống cột "Đã nạp" ở Quản trị FC và fco_my_fc_stats).
create or replace function public.fco_topup_fc_total(p_uid uuid) returns bigint language sql stable security definer set search_path = '' as $$
  select greatest(coalesce(sum(l.delta), 0), 0)::bigint from public.fco_fc_ledger l where l.user_id = p_uid and l.reason = 'admin'
$$;

-- Mỗi dòng sổ cái 'admin' (nạp / thu hồi): tính lại tổng nạp, đạt mốc thì đặt royal_at (giữ lúc đạt lần đầu), tụt dưới mốc thì bỏ.
create or replace function public.fco_royal_ledger_sync() returns trigger language plpgsql security definer set search_path = '' as $$
declare total bigint := public.fco_topup_fc_total(new.user_id);
begin
  update public.fco_wallets set royal_at = case when total >= public.fco_royal_topup_fc() then coalesce(royal_at, now()) end
   where user_id = new.user_id and (royal_at is null) = (total >= public.fco_royal_topup_fc());
  return null;
end;
$$;
drop trigger if exists fco_royal_ledger_sync on public.fco_fc_ledger;
create trigger fco_royal_ledger_sync after insert on public.fco_fc_ledger
  for each row when (new.reason = 'admin') execute function public.fco_royal_ledger_sync();

-- Tài khoản đã nạp đủ từ trước: lên Royal ngay.
update public.fco_wallets w set royal_at = now()
 where w.royal_at is null and public.fco_topup_fc_total(w.user_id) >= public.fco_royal_topup_fc();

-- Mọi chỗ "Premium / Luxury không cộng dồn phiếu" (bán cho hệ thống, treo bán chợ, bán ngay…) áp luôn cho Royal: sửa đúng bản hàm đang chạy,
-- không chép lại cả hàm. Bỏ qua hàm admin đặt hạng (Royal không đặt tay) và fco_account_tier (viết lại bên dưới).
do $do$
declare f record; def text; n integer := 0;
begin
  for f in select p.oid, p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
            where ns.nspname = 'public' and p.prosrc like '%fco_account_tier(uid) in (''premium'', ''luxury'')%'
              and p.proname not in ('fco_admin_account_tier', 'fco_account_tier') loop
    def := replace(pg_get_functiondef(f.oid), 'fco_account_tier(uid) in (''premium'', ''luxury'')', 'fco_account_tier(uid) in (''premium'', ''luxury'', ''royal'')');
    execute def; n := n + 1;
  end loop;
  raise notice 'Royal: % hàm bán / treo bán đã nhận Royal như Premium / Luxury', n;
end
$do$;

-- Loại tài khoản đang có hiệu lực: Royal (vĩnh viễn) > Luxury / Premium còn hạn > Classic.
create or replace function public.fco_account_tier(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select case when w.royal_at is not null then 'royal'
                               when w.account_tier in ('premium', 'luxury') and w.account_tier_until > now() then w.account_tier else 'classic' end
                   from public.fco_wallets w where w.user_id = p_uid), 'classic')
$$;

-- Thuế bán: Royal trả 15% thuế chung (giảm 85%), Luxury 25%, Premium 35%; không xét gói thành viên Shop (không cộng dồn).
create or replace function public.fco_inv_tax(p_uid uuid, p_rules jsonb) returns double precision language sql stable security definer set search_path = '' as $$
  select case public.fco_account_tier(p_uid)
    when 'royal' then (p_rules->>'marketFee')::double precision * (100 - 85) / 100
    when 'luxury' then (p_rules->>'marketFee')::double precision * (100 - 75) / 100
    when 'premium' then (p_rules->>'marketFee')::double precision * (100 - 65) / 100
  else (p_rules->>'marketFee')::double precision * (100 - coalesce((
    select max(v) from (
      select case when w.svip_until > now() then (p_rules->'membership'->>'svip')::double precision end as v from public.fco_wallets w where w.user_id = p_uid
      union all
      select case when w.premium_until > now() then (p_rules->'membership'->>'premium')::double precision end from public.fco_wallets w where w.user_id = p_uid
    ) s), 0)) / 100 end
$$;

-- Hiệu ứng: thêm 6 hiệu ứng Royal vào ràng buộc.
do $do$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.fco_wallets'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'name_effect' loop
    execute format('alter table public.fco_wallets drop constraint %I', c);
  end loop;
end
$do$;
alter table public.fco_wallets add constraint fco_wallets_name_effect_check check (name_effect in ('gold', 'fire', 'ice', 'neon', 'galaxy', 'diamond', 'aurora', 'phoenix', 'royal', 'prism',
  'emperor', 'nebula', 'thunder', 'sakura', 'obsidian', 'celestial'));

create or replace function public.fco_royal_effect(p_effect text) returns boolean language sql immutable set search_path = '' as $$
  select p_effect in ('emperor', 'nebula', 'thunder', 'sakura', 'obsidian', 'celestial')
$$;

-- Hiệu ứng đang hiện: Royal hiện mọi hiệu ứng; Luxury hiện hiệu ứng Premium + Luxury; Premium chỉ hiệu ứng Premium.
create or replace function public.fco_name_effect(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select case public.fco_account_tier(w.user_id)
    when 'royal' then w.name_effect
    when 'luxury' then case when not public.fco_royal_effect(w.name_effect) then w.name_effect end
    when 'premium' then case when not public.fco_royal_effect(w.name_effect) and not public.fco_luxury_effect(w.name_effect) then w.name_effect end
  end from public.fco_wallets w where w.user_id = p_uid
$$;

create or replace function public.fco_set_name_effect(p_effect text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); tier text;
begin
  perform public.fco_wallet_lock(uid);
  tier := public.fco_account_tier(uid);
  if p_effect is not null then
    if tier = 'classic' then raise exception 'FCO_PREMIUM_ONLY' using errcode = 'P0001'; end if;
    if p_effect not in ('gold', 'fire', 'ice', 'neon', 'galaxy', 'diamond', 'aurora', 'phoenix', 'royal', 'prism', 'emperor', 'nebula', 'thunder', 'sakura', 'obsidian', 'celestial')
      then raise exception 'FCO_BAD_EFFECT' using errcode = '22023'; end if;
    if public.fco_royal_effect(p_effect) and tier <> 'royal' then raise exception 'FCO_ROYAL_ONLY' using errcode = 'P0001'; end if;
    if public.fco_luxury_effect(p_effect) and tier not in ('luxury', 'royal') then raise exception 'FCO_LUXURY_ONLY' using errcode = 'P0001'; end if;
  end if;
  update public.fco_wallets set name_effect = p_effect, updated_at = now() where user_id = uid;
  return public.fco_wallet_json(uid);
end;
$$;

revoke all on function public.fco_royal_topup_fc() from public, anon, authenticated;
revoke all on function public.fco_topup_fc_total(uuid) from public, anon, authenticated;
revoke all on function public.fco_royal_ledger_sync() from public, anon, authenticated;
revoke all on function public.fco_royal_effect(text) from public, anon, authenticated;

commit;