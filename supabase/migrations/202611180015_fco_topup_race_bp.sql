begin;

-- Top Đặc Huấn tính cả BP admin nạp (người dùng 2026-11-18: "10B bp nạp vào = 1.5 điểm, không hiện trên thể lệ").
--   • BP nạp qua fco_admin_topup_bp (sổ fco_bp_topups, 202611180013) quy ra "FC tương đương": bp_per_fc = 10.000.000.000 BP = 1 FC,
--     rồi nhân points_per_fc (1,5) như FC nạp → 10B BP = 1,5 điểm (1.000đ nạp BP = 1,5 điểm). Cùng khung giờ, cùng loại trừ admin / tài khoản khoá.
--   • Thể lệ hiển thị trong game KHÔNG nhắc BP (chỉ ghi FC); bảng công khai vẫn chỉ trả điểm, không lộ FC / BP.
--   • Tổng có thể lẻ (vd 15B BP = 1,5 FC tương đương) → amount đổi sang numeric (fco_topup_race_rows, fco_topup_race_awarded).
-- Chạy sau 202611180013_fco_admin_topup_bp.sql (và 202611180005 / 0006 / 0009). Chạy lại được.

alter table public.fco_topup_race add column if not exists bp_per_fc numeric not null default 10000000000;
alter table public.fco_topup_race_awarded alter column amount type numeric using amount::numeric;

drop function if exists public.fco_topup_race_rows();
create function public.fco_topup_race_rows() returns table(user_id uuid, amount numeric, last_at timestamptz, rn bigint)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.amount, s.last_at, row_number() over (order by s.amount desc, s.last_at, s.user_id) as rn
  from (
    select x.user_id, sum(x.amt) as amount, max(x.at) as last_at
    from (
      select l.user_id, l.delta::numeric as amt, l.created_at as at
      from public.fco_fc_ledger l
      where l.reason = 'admin'
        and l.created_at >= (select starts_at from public.fco_topup_race where id = 1)
        and l.created_at < public.fco_topup_race_ends()
      union all
      -- BP admin nạp: bp / bp_per_fc = FC tương đương.
      select b.user_id, b.bp::numeric / (select bp_per_fc from public.fco_topup_race where id = 1), b.created_at
      from public.fco_bp_topups b
      where b.created_at >= (select starts_at from public.fco_topup_race where id = 1)
        and b.created_at < public.fco_topup_race_ends()
    ) x
    where not exists (select 1 from public.fco_admins a where a.user_id = x.user_id)
      and not exists (select 1 from auth.users u where u.id = x.user_id and u.banned_until > now())
    group by x.user_id
    having sum(x.amt) > 0
  ) s
$$;
revoke all on function public.fco_topup_race_rows() from public, anon, authenticated;

select r.rn, public.fco_public_name(r.user_id) as name, r.amount as fc_tuong_duong,
  r.amount * (select points_per_fc from public.fco_topup_race where id = 1) as diem
from public.fco_topup_race_rows() r order by r.rn limit 10;

commit;