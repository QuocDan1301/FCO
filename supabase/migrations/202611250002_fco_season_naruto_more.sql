begin;

-- Mùa NARUTO: thêm 27 thẻ id 4347–4373 (Raphinha … R. Koeman, scripts/data/naruto.csv; thẻ dựng từ khung trống theo bố cục thẻ Lamine Yamal).
-- BXH Đập +8 cần mùa của từng thẻ trên máy chủ (fco_player_tiers). Chạy sau 202611250001_fco_season_naruto.sql. Chạy lại được.

insert into public.fco_player_tiers (player_id, tier) values
  (4347,'naruto'),(4348,'naruto'),(4349,'naruto'),(4350,'naruto'),(4351,'naruto'),(4352,'naruto'),(4353,'naruto'),(4354,'naruto'),(4355,'naruto'),(4356,'naruto'),(4357,'naruto'),(4358,'naruto'),(4359,'naruto'),(4360,'naruto'),(4361,'naruto'),(4362,'naruto'),(4363,'naruto'),(4364,'naruto'),(4365,'naruto'),(4366,'naruto'),(4367,'naruto'),(4368,'naruto'),(4369,'naruto'),(4370,'naruto'),(4371,'naruto'),(4372,'naruto'),(4373,'naruto')
on conflict (player_id) do update set tier = excluded.tier;

commit;
