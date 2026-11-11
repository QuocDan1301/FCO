-- Mùa LD (LAST DANCE, tier ld) đã có trong game (2026-11-11, sau 202611110010): thêm 2 gói còn chờ mùa LD theo đúng vị trí danh sách người dùng gửi:
--   · Tinh anh: "GRU, CU, 24EP, MDL, LD, UT 106+ (+8)" (stp-c-106ld) đứng đầu.
--   · Tân binh: "CU, LD, MDL All (+7~+8)" (stp-r-cldm) đứng sau PTG, WG All (+5).
-- Vật phẩm phải khớp src/stp.ts (tests/stp.test.ts). Sau khi deploy: admin Đồng bộ dữ liệu ở Kho thẻ (mùa LD và 2 gói mới).
begin;

update public.fco_stp_packages set items = '[{"pack":"stp-c-106ld","count":1},{"pack":"stp-c-ep120","count":1},{"pack":"stp-c-bld","count":1},{"pack":"stp-c-106","count":1},{"pack":"stp-c-118","count":1},{"voucher":10,"count":1},{"bp":35000000}]' where id = 'challenge';
update public.fco_stp_packages set items = '[{"pack":"stp-r-wg119","count":1},{"pack":"stp-r-104","count":1},{"pack":"stp-pw-all","count":1},{"pack":"stp-r-cldm","count":1},{"pack":"stp-r-ts119","count":1},{"voucher":10,"count":1},{"bp":15000000}]' where id = 'rookie';

commit;
