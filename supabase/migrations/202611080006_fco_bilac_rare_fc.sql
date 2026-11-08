-- Bi Lắc: giảm tiếp FC (2026-11-08, sau 202611080005). Danh sách quà không đổi, chỉ đổi tỉ lệ bóng.
-- Bóng FC 6 → 3 và Special 6 → 3 (Giải Phụ / Giải Đặc Biệt trả FC từ quỹ jackpot): CLB 27 · FC 3 · Special 3 · BP 34 · Thẻ 33.
--   Giải Phụ (2 Special): ~1 % → ~0,26 % mỗi lượt (≈ 1 / 380 lượt); Giải Đặc Biệt (3 Special): ~0,02 % → ~0,003 % (≈ 1 / 37.000 lượt).
--   Quà FC từ hàng FC x2 / x3: ~0,018 % → ~0,004 % mỗi lượt (≈ 1 / 25.000 lượt).
begin;
update public.fco_bilac_symbols set weight = case id when 'club' then 27 when 'fc' then 3 when 'special' then 3 when 'bp' then 34 when 'card' then 33 end;
commit;
