-- Mùa 24HR (24 HEROES) đã có trong game (2026-11-11, sau 202611110007): thêm gói "JNM, 24HR, DC, JVA 101+ (+9~+10)" (stp-u-jnm)
-- vào gói STP Siêu cấp, đứng sau gói No.7, LE 111+ (+7) như danh sách người dùng gửi. JVA = mùa JUVENTUS.
-- Vật phẩm phải khớp src/stp.ts (tests/stp.test.ts). Sau khi deploy: admin Đồng bộ dữ liệu ở Kho thẻ (gói stp-u-jnm và mùa 24HR mới).
begin;

update public.fco_stp_packages set items = '[{"pack":"stp-u-110","count":1},{"pack":"stp-u-117","count":1},{"pack":"stp-u-hg","count":1},{"pack":"stp-u-111","count":1},{"pack":"stp-u-jnm","count":1},{"pack":"stp-u-cum","count":1},{"pack":"stp-u-118","count":1},{"voucher":30,"count":1},{"bp":75000000}]' where id = 'ultimate';

commit;
