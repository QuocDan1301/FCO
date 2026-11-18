begin;

-- Top Đặc Huấn tính TOÀN BỘ FC đã nạp từ trước tới giờ (người dùng 2026-11-18: "tính số tiền nạp từ trước đến giờ luôn"), không chỉ từ 0h 18/11.
-- Lùi mốc bắt đầu về 2000-01-01 (trước mọi dòng sổ FC; sổ có từ khi FC chuyển lên máy chủ 2026-11-07). Hết giờ vẫn theo sự kiện VQTG.
-- Game hiểu mốc trước 2020 là "toàn bộ" (src/topup-race.ts isAllTime). Chạy lại được.

update public.fco_topup_race set starts_at = '2000-01-01 00:00+07' where id = 1;

select starts_at, top_n, public.fco_topup_race_ends() as ends_at from public.fco_topup_race where id = 1;

commit;