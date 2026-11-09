-- Reset toàn bộ số tiền nạp về 0 (2026-11-09, người dùng yêu cầu).
--   Không xoá dòng sổ cái nào và không đổi số FC trong ví: mọi lần admin nạp / trừ trước thời điểm chạy (lý do 'admin')
--   đổi sang lý do 'admin_old' nên không còn tính vào "Đã nạp", doanh thu, số người đã nạp. Lần nạp sau đó tính lại từ 0.
--   Ghi kèm thời điểm reset vào detail để tra lại. Hoàn tác (nếu cần):
--     update public.fco_fc_ledger set reason = 'admin', detail = detail - 'topup_reset' where reason = 'admin_old';
begin;

update public.fco_fc_ledger
set reason = 'admin_old', detail = detail || jsonb_build_object('topup_reset', now())
where reason = 'admin';

commit;
