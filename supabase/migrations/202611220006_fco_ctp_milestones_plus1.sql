begin;

-- Cờ tỷ phú (2026-11-22, người dùng: "Nâng tất cả các gói mốc trong sk cờ tỷ phú lên 1 mức thẻ"). Chạy SAU 202611220005_fco_ctp_race.sql.
--   · 59 gói riêng ctpm-* đã +1 cấp trong src/packs.json (game bản mới + Đồng bộ dữ liệu là máy chủ có cấp mới, không cần sửa bảng mốc).
--   · 15 gói dùng chung với sự kiện khác / Shop (ms-*, vqm-*, blm-*, bl-*, event-*, the-moment) KHÔNG sửa để không ảnh hưởng nơi khác:
--     tạo bản sao +1 cấp ctpm-<điểm>-<lựa chọn> (ICON TM 122+ → ctpm-9000 +2) và đổi bảng mốc sang bản sao.
-- Chạy lại được.

do $$
begin
  if (select count(*) from public.fco_cat_packs where id in ('ctpm-1400-1', 'ctpm-15-2', 'ctpm-1500-1', 'ctpm-1600-3', 'ctpm-200-3', 'ctpm-250-3', 'ctpm-350-3', 'ctpm-450-1', 'ctpm-450-3', 'ctpm-550-2', 'ctpm-650-1', 'ctpm-650-2', 'ctpm-650-3', 'ctpm-70-1', 'ctpm-9000')) < 15 then
    raise exception 'Chưa có các gói ctpm-* mới trên máy chủ: đưa bản game mới lên → Quản trị FC → Đồng bộ dữ liệu, rồi chạy lại migration này.';
  end if;
end $$;

update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1-1","count":1},{"voucher":30,"count":1}]]' where idx = 0 and points = 1;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-15-1","count":1},{"bp":1000000}],[{"pack":"ctpm-15-2","count":1},{"bp":1000000}]]' where idx = 1 and points = 15;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-25-1","count":1},{"bp":2000000}]]' where idx = 2 and points = 25;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-50-1","count":1},{"bp":3000000}]]' where idx = 3 and points = 50;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-70-1","count":1},{"bp":4000000}]]' where idx = 4 and points = 70;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-100-1","count":1},{"bp":5000000}],[{"pack":"ctpm-100-2","count":1},{"bp":5000000}],[{"pack":"ctpm-100-3","count":1},{"bp":5000000}]]' where idx = 5 and points = 100;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-150-1","count":1},{"bp":7000000}],[{"pack":"ctpm-150-2","count":1},{"bp":7000000}],[{"pack":"ctpm-150-3","count":1},{"bp":7000000}]]' where idx = 6 and points = 150;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-200-1","count":1},{"ctpCard":"chance","count":1},{"voucher":30,"count":1},{"bp":10000000}],[{"pack":"ctpm-200-2","count":1},{"ctpCard":"chance","count":1},{"voucher":30,"count":1},{"bp":10000000}],[{"pack":"ctpm-200-3","count":1},{"ctpCard":"chance","count":1},{"voucher":30,"count":1},{"bp":10000000}]]' where idx = 7 and points = 200;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-250-1","count":1},{"bp":12000000}],[{"pack":"ctpm-250-2","count":1},{"bp":12000000}],[{"pack":"ctpm-250-3","count":1},{"bp":12000000}]]' where idx = 8 and points = 250;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-350-1","count":1},{"bp":15000000}],[{"pack":"ctpm-350-2","count":1},{"bp":15000000}],[{"pack":"ctpm-350-3","count":1},{"bp":15000000}]]' where idx = 9 and points = 350;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-450-1","count":1},{"ctpCard":"luck","count":1},{"voucher":30,"count":1},{"bp":20000000}],[{"pack":"ctpm-450-2","count":1},{"ctpCard":"luck","count":1},{"voucher":30,"count":1},{"bp":20000000}],[{"pack":"ctpm-450-3","count":1},{"ctpCard":"luck","count":1},{"voucher":30,"count":1},{"bp":20000000}]]' where idx = 10 and points = 450;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-550-1","count":1},{"bp":25000000}],[{"pack":"ctpm-550-2","count":1},{"bp":25000000}],[{"pack":"ctpm-550-3","count":1},{"bp":25000000}]]' where idx = 11 and points = 550;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-650-1","count":1},{"bp":30000000}],[{"pack":"ctpm-650-2","count":1},{"bp":30000000}],[{"pack":"ctpm-650-3","count":1},{"bp":30000000}]]' where idx = 12 and points = 650;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-800-1","count":1},{"bp":40000000}],[{"pack":"ctpm-800-2","count":1},{"bp":40000000}],[{"pack":"ctpm-800-3","count":1},{"bp":40000000}]]' where idx = 13 and points = 800;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-900-1","count":1},{"bp":50000000}],[{"pack":"ctpm-900-2","count":1},{"bp":50000000}],[{"pack":"ctpm-900-3","count":1},{"bp":50000000}]]' where idx = 14 and points = 900;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1000-1","count":1},{"bp":60000000}],[{"pack":"ctpm-1000-2","count":1},{"bp":60000000}],[{"pack":"ctpm-1000-3","count":1},{"bp":60000000}]]' where idx = 15 and points = 1000;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1100-1","count":1},{"bp":70000000}],[{"pack":"ctpm-1100-2","count":1},{"bp":70000000}],[{"pack":"ctpm-1100-3","count":1},{"bp":70000000}]]' where idx = 16 and points = 1100;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1200-1","count":1},{"bp":80000000}],[{"pack":"ctpm-1200-2","count":1},{"bp":80000000}],[{"pack":"ctpm-1200-3","count":1},{"bp":80000000}]]' where idx = 17 and points = 1200;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1300-1","count":1},{"bp":90000000}],[{"pack":"ctpm-1300-2","count":1},{"bp":90000000}],[{"pack":"ctpm-1300-3","count":1},{"bp":90000000}]]' where idx = 18 and points = 1300;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1400-1","count":1},{"bp":110000000}],[{"pack":"ctpm-1400-2","count":1},{"bp":110000000}],[{"pack":"ctpm-1400-3","count":1},{"bp":110000000}]]' where idx = 19 and points = 1400;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1500-1","count":1},{"bp":130000000}],[{"pack":"ctpm-1500-2","count":1},{"bp":130000000}],[{"pack":"ctpm-1500-3","count":1},{"bp":130000000}]]' where idx = 20 and points = 1500;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1600-1","count":1},{"bp":140000000}],[{"pack":"ctpm-1600-2","count":1},{"bp":140000000}],[{"pack":"ctpm-1600-3","count":1},{"bp":140000000}]]' where idx = 21 and points = 1600;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1700-1","count":1},{"bp":160000000}],[{"pack":"ctpm-1700-2","count":1},{"bp":160000000}],[{"pack":"ctpm-1700-3","count":1},{"bp":160000000}]]' where idx = 22 and points = 1700;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-1800-1","count":1},{"voucher":30,"count":1},{"bp":180000000}],[{"pack":"ctpm-1800-2","count":1},{"voucher":30,"count":1},{"bp":180000000}],[{"pack":"ctpm-1800-3","count":1},{"voucher":30,"count":1},{"bp":180000000}]]' where idx = 23 and points = 1800;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-9000","count":1},{"voucher":35,"count":1},{"bp":200000000}]]' where idx = 24 and points = 9000;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-12600-1","count":1},{"voucher":35,"count":1},{"bp":220000000}]]' where idx = 25 and points = 12600;
update public.fco_ctp_milestones set options = '[[{"ctpBadge":1},{"voucher":40,"count":1},{"bp":230000000}]]' where idx = 26 and points = 12600;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-18000","count":1},{"voucher":40,"count":1},{"bp":250000000}]]' where idx = 27 and points = 18000;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-27000","count":1},{"voucher":40,"count":1},{"bp":260000000}]]' where idx = 28 and points = 27000;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-32400-1","count":1},{"voucher":40,"count":1},{"bp":280000000}]]' where idx = 29 and points = 32400;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-32400-2","count":1},{"voucher":40,"count":1},{"bp":280000000}]]' where idx = 30 and points = 32400;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-36000","count":1},{"voucher":40,"count":1},{"bp":300000000}]]' where idx = 31 and points = 36000;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-45000","count":1},{"voucher":40,"count":1},{"bp":310000000}]]' where idx = 32 and points = 45000;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-54000-1","count":1},{"voucher":40,"count":1},{"bp":320000000}]]' where idx = 33 and points = 54000;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-54000-2","count":1},{"voucher":40,"count":1},{"bp":320000000}]]' where idx = 34 and points = 54000;
update public.fco_ctp_milestones set options = '[[{"pack":"ctpm-63000","count":1},{"voucher":40,"count":1},{"bp":350000000}]]' where idx = 35 and points = 63000;

commit;
