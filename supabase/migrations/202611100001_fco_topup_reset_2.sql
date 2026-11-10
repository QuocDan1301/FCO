-- Reset lần 2 toàn bộ số tiền nạp về 0 (2026-11-10, người dùng yêu cầu). Cùng cách với 202611090015_fco_topup_reset.sql:
--   không xoá dòng sổ cái nào và không đổi số FC trong ví; mọi lần admin nạp / trừ trước thời điểm chạy (lý do 'admin')
--   đổi sang 'admin_old' nên không còn tính vào "Đã nạp", doanh thu (Nạp hôm nay / 7 / 30 ngày / Tổng nạp), số người đã nạp,
--   sắp xếp "Nạp nhiều". Quà admin tặng ('admin_gift') vốn không tính nên giữ nguyên. Lần nạp sau đó tính lại từ 0.
--   Ghi thời điểm reset vào detail.topup_reset. Hoàn tác riêng lần này (giữ nguyên lần reset 2026-11-09):
--     update public.fco_fc_ledger set reason = 'admin', detail = detail - 'topup_reset'
--     where reason = 'admin_old' and (detail->>'topup_reset')::timestamptz >= '2026-11-10 00:00+07';
begin;

update public.fco_fc_ledger
set reason = 'admin_old', detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('topup_reset', now())
where reason = 'admin';

commit;