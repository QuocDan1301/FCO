begin;

-- Quà 13 ô quà của Vòng Quanh Thế Giới theo Tài liệu/quaracvqtg.xlsx (2026-11-13), thay quà TẠM lấy từ Bi Lắc ở 202611130004.
-- Mỗi ô 4 món theo đúng thứ tự cột trong Excel (trái → phải); weights tăng dần trái → phải (quà bên trái hiếm hơn, quy ước Bi Lắc).
-- Ô có FC ở đầu (4, 9, 16) để FC rất hiếm: 0,5 % mỗi lần dừng ô. Gói vq-* là gói sự kiện mới (src/packs.json, eventOnly, luật
-- tỷ lệ "danh sách quà" như bl-*); "BDO, BLD, GRU, CU 113+ (+8)" dùng lại gói event-7-113 đã có.
-- Excel không ghi quà cho ô 10 (Quỹ BP) và 14 (Giải Đặc Biệt) → bỏ quà an ủi tạm: không trúng quỹ thì lượt đó không có quà.
update public.fco_vqtg_tiles set rewards = '[{"bp":22000000},{"bp":28000000},{"bp":24000000},{"pack":"vq-111-lwbb-78","count":1}]', weights = '{50,150,300,500}' where idx = 1;
update public.fco_vqtg_tiles set rewards = '[{"pack":"vq-120-ucs-13","count":1},{"pack":"vq-119-ucs-24","count":1},{"pack":"vq-120-ucs","count":1},{"pack":"vq-119-ucs","count":1}]', weights = '{50,150,300,500}' where idx = 2;
update public.fco_vqtg_tiles set rewards = '[{"pack":"vq-112-bbgc-8","count":1},{"pack":"vq-111-bbgc-8","count":1},{"pack":"vq-110-bbgc-8","count":1},{"bp":25000000}]', weights = '{50,150,300,500}' where idx = 3;
update public.fco_vqtg_tiles set rewards = '[{"fc":50},{"bp":33000000},{"bp":30000000},{"bp":28000000}]', weights = '{5,195,300,500}' where idx = 4;
update public.fco_vqtg_tiles set rewards = '[{"pack":"vq-118-uspw-35","count":1},{"pack":"vq-119-ucs-24","count":1},{"bp":33000000},{"bp":30000000}]', weights = '{50,150,300,500}' where idx = 5;
update public.fco_vqtg_tiles set rewards = '[{"pack":"vq-113-lwbbg-8","count":1},{"pack":"vq-112-lwbbg-8","count":1},{"pack":"vq-111-lwbbg-8","count":1},{"bp":35000000}]', weights = '{50,150,300,500}' where idx = 7;
update public.fco_vqtg_tiles set rewards = '[{"bp":45000000},{"bp":40000000},{"bp":37000000},{"bp":35000000}]', weights = '{50,150,300,500}' where idx = 8;
update public.fco_vqtg_tiles set rewards = '[{"fc":100},{"pack":"vq-121-uspw-35","count":1},{"pack":"vq-120-uspw-35","count":1},{"pack":"vq-119-ucs-13","count":1}]', weights = '{5,195,300,500}' where idx = 9;
update public.fco_vqtg_tiles set rewards = '[{"bp":70000000},{"bp":55000000},{"bp":50000000},{"bp":45000000}]', weights = '{50,150,300,500}' where idx = 11;
update public.fco_vqtg_tiles set rewards = '[{"pack":"vq-112-lwb-8","count":1},{"pack":"vq-111-lwb-78","count":1},{"pack":"event-7-113","count":1},{"pack":"vq-112-bbgc-8","count":1}]', weights = '{50,150,300,500}' where idx = 12;
update public.fco_vqtg_tiles set rewards = '[{"bp":70000000},{"bp":60000000},{"bp":58000000},{"bp":55000000}]', weights = '{50,150,300,500}' where idx = 13;
update public.fco_vqtg_tiles set rewards = '[{"pack":"vq-113-lwb-78","count":1},{"pack":"vq-112-bbgc-8","count":1},{"pack":"vq-111-bbgc-8","count":1},{"bp":75000000}]', weights = '{50,150,300,500}' where idx = 15;
update public.fco_vqtg_tiles set rewards = '[{"fc":200},{"bp":80000000},{"pack":"vq-112-lwbbg-8","count":1},{"pack":"vq-111-lwbbg-8","count":1}]', weights = '{5,195,300,500}' where idx = 16;
update public.fco_vqtg_tiles set rewards = '[]', weights = null where idx in (10, 14);

commit;
