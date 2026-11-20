begin;

-- Sự kiện nạp tích luỹ hết giờ là TẮT HẲN (người dùng 2026-11-20: "Quá hạn rồi thì tắt sự kiện đi").
--   Bỏ 3 ngày hạn sau giờ kết thúc: fco_topup_claim_days() = 0 → fco_topup_event_now() chỉ trả đợt đang chạy (bắt đầu ≤ now < kết thúc).
--   Hết giờ: không thanh, không bấm Nhận, KHÔNG tự cộng KM nữa (kể cả đơn tạo trong đợt mà admin duyệt sau giờ kết thúc —
--   muốn tính thì duyệt trước giờ kết thúc). Chạy sau 202611200005_fco_topup_event.sql. Chạy lại được.

create or replace function public.fco_topup_claim_days() returns integer language sql immutable set search_path = '' as $$ select 0 $$;
revoke all on function public.fco_topup_claim_days() from public, anon, authenticated;

commit;
