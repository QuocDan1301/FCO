-- Mùa CA (AMBASSADOR CHELSEA FC, tier chelsea) đã có trong game (2026-11-11, sau 202611110008): thêm gói "CA 102+ (+11)" (stp-u-ca)
-- vào gói STP Siêu cấp, đứng sau gói CU, UT, MDL All (+8~+9) như danh sách người dùng gửi (gói WG, 26HR còn chờ mùa 26HR).
-- Vật phẩm phải khớp src/stp.ts (tests/stp.test.ts). Sau khi deploy: admin Đồng bộ dữ liệu ở Kho thẻ (mùa CA và gói stp-u-ca mới).
begin;

update public.fco_stp_packages set items = '[{"pack":"stp-u-110","count":1},{"pack":"stp-u-117","count":1},{"pack":"stp-u-hg","count":1},{"pack":"stp-u-111","count":1},{"pack":"stp-u-jnm","count":1},{"pack":"stp-u-cum","count":1},{"pack":"stp-u-ca","count":1},{"pack":"stp-u-118","count":1},{"voucher":30,"count":1},{"bp":75000000}]' where id = 'ultimate';

commit;
