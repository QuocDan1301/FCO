begin;

-- Mùa DCB (DRAMATIC COMEBACKS, mã FC Online 846, người dùng 2026-11-25): 67 thẻ id 4387–4453 (scripts/data/dcb.csv, scripts/import-dcb.py).
-- BXH Đập +8 cần mùa của từng thẻ trên máy chủ (fco_player_tiers). Sau khi chạy: Quản trị FC → Đồng bộ dữ liệu (cầu thủ, giá, gói DCB (ALL)).
-- Chạy sau 202611250007_fco_gold_el_5.sql. Chạy lại được.

insert into public.fco_player_tiers (player_id, tier) values
  (4387,'dcb'),(4388,'dcb'),(4389,'dcb'),(4390,'dcb'),(4391,'dcb'),(4392,'dcb'),(4393,'dcb'),(4394,'dcb'),(4395,'dcb'),(4396,'dcb'),(4397,'dcb'),(4398,'dcb'),(4399,'dcb'),(4400,'dcb'),(4401,'dcb'),(4402,'dcb'),(4403,'dcb'),(4404,'dcb'),(4405,'dcb'),(4406,'dcb'),(4407,'dcb'),(4408,'dcb'),(4409,'dcb'),(4410,'dcb'),(4411,'dcb'),(4412,'dcb'),(4413,'dcb'),(4414,'dcb'),(4415,'dcb'),(4416,'dcb'),(4417,'dcb'),(4418,'dcb'),(4419,'dcb'),(4420,'dcb'),(4421,'dcb'),(4422,'dcb'),(4423,'dcb'),(4424,'dcb'),(4425,'dcb'),(4426,'dcb'),(4427,'dcb'),(4428,'dcb'),(4429,'dcb'),(4430,'dcb'),(4431,'dcb'),(4432,'dcb'),(4433,'dcb'),(4434,'dcb'),(4435,'dcb'),(4436,'dcb'),(4437,'dcb'),(4438,'dcb'),(4439,'dcb'),(4440,'dcb'),(4441,'dcb'),(4442,'dcb'),(4443,'dcb'),(4444,'dcb'),(4445,'dcb'),(4446,'dcb'),(4447,'dcb'),(4448,'dcb'),(4449,'dcb'),(4450,'dcb'),(4451,'dcb'),(4452,'dcb'),(4453,'dcb')
on conflict (player_id) do update set tier = excluded.tier;

commit;
