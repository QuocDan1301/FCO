begin;

-- Mùa NARUTO (NARUTO SHIPPUDEN, 2026-11-25): thẻ đầu tiên Lamine Yamal id 4346 (src/narutoPlayers.ts, scripts/import-naruto.py).
-- BXH Đập +8 cần mùa của từng thẻ trên máy chủ (fco_player_tiers, migration 202611140005). Thêm cầu thủ NARUTO thì thêm dòng ở migration mới. Chạy lại được.

insert into public.fco_player_tiers (player_id, tier) values
  (4346,'naruto')
on conflict (player_id) do update set tier = excluded.tier;

commit;