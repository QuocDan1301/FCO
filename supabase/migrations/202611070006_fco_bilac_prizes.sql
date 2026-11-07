begin;

-- Quà Bi Lắc chính thức theo file quaracbilac.xlsx của người dùng (2026-11-07), thay quà tạm của 202611070005.
-- BP ghi "34M" = 34.000.000 BP. "Gói ITM" = gói ICONTM (ALL) (eternal). Các gói bl-* là gói sự kiện mới trong src/packs.json.

update public.fco_bilac_rows set points = 10, rewards = '[{"jackpot":"special"}]' where id = 'special3';
update public.fco_bilac_rows set points = 5, rewards = '[{"fc":3000},{"fc":2000},{"fc":1500},{"fc":1000}]' where id = 'fc3';
update public.fco_bilac_rows set points = 5, rewards = '[{"pack":"bl-up26-30","count":1},{"pack":"bl-up26-40","count":1},{"pack":"bl-up26-50","count":1},{"pack":"bl-up26-60","count":1}]' where id = 'club3';
update public.fco_bilac_rows set points = 5, rewards = '[{"bp":400000000},{"bp":350000000},{"bp":300000000},{"bp":250000000}]' where id = 'bp3';
update public.fco_bilac_rows set points = 5, rewards = '[{"pack":"bl-113-lwbb","count":1},{"pack":"bl-112-lwbb","count":1},{"pack":"bl-111-lwbb","count":1},{"pack":"bl-110-lwbb","count":1}]' where id = 'card3';

update public.fco_bilac_rows set points = 2, rewards = '[{"jackpot":"mini"}]' where id = 'special2';
update public.fco_bilac_rows set points = 2, rewards = '[{"fc":1800},{"fc":400},{"bp":240000000},{"fc":200},{"bp":150000000},{"pack":"event-7-109","count":1}]' where id = 'fc2';
update public.fco_bilac_rows set points = 2, rewards = '[{"pack":"bl-tp-60","count":1},{"pack":"bl-tp-125","count":1},{"pack":"event-4-top150","count":1},{"pack":"bl-tp-175","count":1},{"pack":"bl-tp-200","count":1},{"pack":"bl-tp-225","count":1}]' where id = 'club2';
update public.fco_bilac_rows set points = 2, rewards = '[{"bp":330000000},{"bp":50000000},{"bp":45000000},{"bp":40000000},{"bp":35000000},{"bp":32000000}]' where id = 'bp2';
update public.fco_bilac_rows set points = 2, rewards = '[{"pack":"event-6-wb","count":1},{"pack":"bl-108-lwbbg","count":1},{"bp":38000000},{"pack":"bl-108-lwb","count":1},{"bp":33000000},{"pack":"bl-108-lwbb","count":1}]' where id = 'card2';

update public.fco_bilac_rows set points = 1, rewards = '[{"pack":"eternal","count":1},{"bp":34000000},{"pack":"ms-100-1","count":1},{"bp":30000000},{"pack":"bl-116-mix","count":1},{"bp":25000000},{"pack":"bl-117-mix","count":1},{"bp":20000000}]' where id = 'mixed';

commit;
