-- Giảm tải CPU (2026-11-14): fco_vqtg_paid (gọi trong fco_wallet_json — mỗi lần tải ví / chơi / nhận quà) tìm dòng sổ FC theo người + lý do
-- ('vqtg', 'reset'); chỉ mục cũ (user_id, created_at) phải quét hết sổ của người đó. Chỉ mục theo (user_id, reason, id) tra thẳng.
-- Chạy lại được. Không dùng "concurrently" để chạy được trong SQL Editor (bảng sổ FC nhỏ, khóa ghi trong chốc lát).
create index if not exists fco_fc_ledger_user_reason on public.fco_fc_ledger (user_id, reason, id);
analyze public.fco_fc_ledger;
