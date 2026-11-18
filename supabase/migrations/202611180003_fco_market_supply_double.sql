begin;

-- Tăng gấp đôi lượng hệ thống treo bán nhóm 1 và nhóm 2 (2026-11-18, người dùng: "tăng số lượng bán ở nhóm 1 và nhóm 2 lên gấp đôi").
-- Lượng mỗi phút (cấp ≥ 2) = (450 ± 50) × 0,68^(cấp−1) × hệ số nhóm: nhóm 1 ×2 (trước ×1), nhóm 2 ×4/3 (trước ×2/3),
-- nhóm 3 giữ ×4/9 như 202611180002. +1 mọi nhóm vẫn không giới hạn; EL / TSUBASA vẫn không bán. Chạy sau 202611180002. Chạy lại được.

create or replace function public.fco_mkt_sys_qty(p_player integer, p_level integer, p_minute bigint) returns integer language sql stable security definer set search_path = '' as $$
  select greatest(1, floor((450 + 50 * public.fco_inv_swing(p_player, p_level, p_minute + 900000000)) * power(0.68, p_level - 1)
    * case coalesce((select grp from public.fco_cat_players where id = p_player), 0) when 1 then 2 when 2 then 4.0 / 3 when 3 then 4.0 / 9 else 1 end))::integer
$$;
revoke all on function public.fco_mkt_sys_qty(integer, integer, bigint) from public, anon, authenticated;

commit;