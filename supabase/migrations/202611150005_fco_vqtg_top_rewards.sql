begin;

-- Quà Đua top Vòng Quanh Thế Giới (người dùng 2026-11-15). Chạy lại được; nên chạy trước khi Đua top chốt (0h 20/11 giờ VN).
--   Top 1: EL All 135+ (vqt-1), TSUBASA All 128+ (vqt-1t), GRU chỉ định 10 (+11) (vqt-1g)
--   Top 2: EL All 134+ (vqt-2e), TSUBASA All 127+ (vqt-2t), GRU chỉ định 15 (+11) (vqt-2g)
--   Top 3: EL All 133+ (vqt-3e), TSUBASA All 126+ (vqt-3t), GRU chỉ định 20 (+11) (vqt-3)
--   Top 4: TSUBASA All (vqt-2), GRU chỉ định 25 (+11) (vqt-4)
--   Top 5: TSUBASA All (vqt-2), GRU chỉ định 30 (+11) (vqt-5)
-- Các gói mới (vqt-1 đổi thành EL 135+, vqt-2e/3e/1t/2t/3t) nằm trong src/packs.json: push rồi Đồng bộ catalog để máy chủ biết gói.

insert into public.fco_vqtg_top_rewards (rank, rewards, note) values
  (1, '[{"pack":"vqt-1","count":1},{"pack":"vqt-1t","count":1},{"pack":"vqt-1g","count":1}]', ''),
  (2, '[{"pack":"vqt-2e","count":1},{"pack":"vqt-2t","count":1},{"pack":"vqt-2g","count":1}]', ''),
  (3, '[{"pack":"vqt-3e","count":1},{"pack":"vqt-3t","count":1},{"pack":"vqt-3","count":1}]', ''),
  (4, '[{"pack":"vqt-2","count":1},{"pack":"vqt-4","count":1}]', ''),
  (5, '[{"pack":"vqt-2","count":1},{"pack":"vqt-5","count":1}]', '')
on conflict (rank) do update set rewards = excluded.rewards, note = excluded.note;

select rank, rewards from public.fco_vqtg_top_rewards order by rank;

commit;