begin;

-- Mùa NARUTO: thêm 13 thẻ Real Madrid id 4374–4386 (K. Mbappé … Casillas, scripts/data/naruto.csv; dựng từ khung trống như thẻ Lamine Yamal).
-- 1) BXH Đập +8 cần mùa của từng thẻ trên máy chủ (fco_player_tiers).
-- 2) Hệ thống không bán mùa NARUTO (202611250003_fco_naruto_no_system_sale.sql): nâng last_id lên 4386.
-- Chạy sau 202611250004_fco_topup_gift_tiers.sql. Chạy lại được.

insert into public.fco_player_tiers (player_id, tier) values
  (4374,'naruto'),(4375,'naruto'),(4376,'naruto'),(4377,'naruto'),(4378,'naruto'),(4379,'naruto'),(4380,'naruto'),(4381,'naruto'),(4382,'naruto'),(4383,'naruto'),(4384,'naruto'),(4385,'naruto'),(4386,'naruto')
on conflict (player_id) do update set tier = excluded.tier;

insert into public.fco_mkt_no_system (label, first_id, last_id) values ('NARUTO', 4346, 4386)
  on conflict (label) do update set first_id = excluded.first_id, last_id = excluded.last_id;

commit;
