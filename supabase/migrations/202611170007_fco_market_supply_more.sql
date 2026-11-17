begin;

-- Tăng lượt hệ thống bán hàng phôi (nhóm 1) (2026-11-17, người dùng): +1 mỗi phút 400–500 thẻ (cũ 100–150), cấp càng cao càng ít
-- (× 0,68 mỗi cấp: +2 ≈ 272–340, +5 ≈ 85–107, +8 ≈ 27–34, +13 ≈ 3–4). Chạy sau 202611170006. Chạy lại được.
create or replace function public.fco_mkt_sys_qty(p_player integer, p_level integer, p_minute bigint) returns integer language sql immutable set search_path = '' as $$
  select greatest(1, floor((450 + 50 * public.fco_inv_swing(p_player, p_level, p_minute + 900000000)) * power(0.68, p_level - 1)))::integer
$$;
revoke all on function public.fco_mkt_sys_qty(integer, integer, bigint) from public, anon, authenticated;

commit;