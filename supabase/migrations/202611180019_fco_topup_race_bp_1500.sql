begin;

-- Top Đặc Huấn: BP admin nạp tính 1.000đ = 1.500 điểm (người dùng 2026-11-18: "1k vnd nạp vào bp sẽ được 1500 điểm top đặc huấn,
-- những acc nào đã nạp bp cũng sẽ đổi lại bằng tỉ lệ này"). Trước đó (202611180015) 1.000đ = 10B BP = 1,5 điểm.
--   • 1.000đ = 10.000.000.000 BP (fco_bp_per_vnd) → 1.000 FC tương đương × points_per_fc 1,5 = 1.500 điểm
--     ⇒ bp_per_fc = 10.000.000 BP = 1 FC tương đương.
--   • Điểm tính lại mỗi lần đọc bảng từ sổ fco_bp_topups (fco_topup_race_rows), nên MỌI lần nạp BP trước đây đổi theo tỉ lệ mới ngay.
--   • Thể lệ trong game vẫn không nhắc BP.
-- Chạy sau 202611180015_fco_topup_race_bp.sql. Chạy lại được.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fco_topup_race' and column_name = 'bp_per_fc') then
    raise exception 'Chưa chạy 202611180015_fco_topup_race_bp.sql — chạy file đó trước rồi chạy lại file này.';
  end if;
end $$;

alter table public.fco_topup_race alter column bp_per_fc set default 10000000;
update public.fco_topup_race set bp_per_fc = 10000000 where id = 1;

-- Kiểm tra: top 10 sau khi đổi.
select r.rn, public.fco_public_name(r.user_id) as name, r.amount as fc_tuong_duong,
  r.amount * (select points_per_fc from public.fco_topup_race where id = 1) as diem
from public.fco_topup_race_rows() r order by r.rn limit 10;

commit;
