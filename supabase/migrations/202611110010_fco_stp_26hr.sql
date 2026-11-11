-- Mùa 26HR (26 HEROES, tier hr26) đã có trong game (2026-11-11, sau 202611110009): thêm gói "WG, 26HR 119+ (+5)" (stp-u-wg26)
-- vào gói STP Siêu cấp, đứng sau gói CU, UT, MDL All (+8~+9) và trước gói CA 102+ (+11) như danh sách người dùng gửi.
-- Vật phẩm phải khớp src/stp.ts (tests/stp.test.ts). Sau khi deploy: admin Đồng bộ dữ liệu ở Kho thẻ (mùa 26HR và gói stp-u-wg26 mới).
begin;

update public.fco_stp_packages set items = '[{"pack":"stp-u-110","count":1},{"pack":"stp-u-117","count":1},{"pack":"stp-u-hg","count":1},{"pack":"stp-u-111","count":1},{"pack":"stp-u-jnm","count":1},{"pack":"stp-u-cum","count":1},{"pack":"stp-u-wg26","count":1},{"pack":"stp-u-ca","count":1},{"pack":"stp-u-118","count":1},{"voucher":30,"count":1},{"bp":75000000}]' where id = 'ultimate';

commit;
