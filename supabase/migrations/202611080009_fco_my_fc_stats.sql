-- Thống kê FC cho người chơi (2026-11-08): khung Nạp FC hiện "Đã nạp" và "Đã dùng" của chính tài khoản đang đăng nhập.
--   · Đã nạp = tổng FC admin cộng / trừ ở Nạp FC (lý do 'admin', cùng cách tính với cột "Đã nạp" của admin), không âm.
--     Quà ngày, gift code, tiền thắng sự kiện không tính.
--   · Đã dùng = tổng FC đã chi (mọi dòng trừ FC trừ lý do 'admin': Shop, Nâng Cấp Siêu Sao, Bi Lắc). Tiền thắng không trừ vào số này.
-- Hàm không nhận tham số nên chỉ đọc được số của chính mình; người chơi vẫn không đọc trực tiếp được sổ cái.
begin;

create function public.fco_my_fc_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); result jsonb;
begin
  select jsonb_build_object(
    'topup', greatest(coalesce(sum(delta) filter (where reason = 'admin'), 0), 0),
    'spent', coalesce(-sum(delta) filter (where delta < 0 and reason <> 'admin'), 0))
  into result from public.fco_fc_ledger where user_id = uid;
  return result;
end;
$$;

revoke all on function public.fco_my_fc_stats() from public, anon;
grant execute on function public.fco_my_fc_stats() to authenticated;

commit;