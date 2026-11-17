-- Lùi giờ kết thúc Đua top Vòng Quanh Thế Giới sang hết ngày 20/11/2026 (0h 21/11 giờ Việt Nam) — người dùng 2026-11-17.
-- Khớp VQTG_RACE_END ở src/vqtg.ts. Chỉ đổi khi cuộc đua chưa chốt.
update public.fco_vqtg_race set ends_at = '2026-11-21 00:00+07' where id = 1 and settled_at is null;
select ends_at at time zone 'Asia/Ho_Chi_Minh' as ket_thuc, settled_at from public.fco_vqtg_race where id = 1;