begin;

-- Top Đặc Huấn: phải đạt từ 30.000 điểm trở lên mới vào bảng xếp hạng (người dùng 2026-11-20: "Top đặc huấn từ 50k điểm trở lên mới vào bxh",
--   • Cột fco_topup_race.min_points (30.000). Điểm = FC tương đương × points_per_fc (như 202611180006 / 0015 / 0019).
--   • fco_topup_race_amounts(): điểm thô của MỌI người (để người chưa đủ vẫn xem được điểm của mình).
--   • fco_topup_race_rows(): chỉ người đủ ngưỡng, xếp hạng lại từ 1 → bảng công khai VÀ trao quà (fco_topup_race_award) cùng dùng,
--     nên người dưới 30.000 điểm không có hạng, không nhận quà; người đủ ngưỡng dồn hạng lên.
--   • fco_topup_top trả thêm minPoints; me.points là điểm thật kể cả khi chưa đủ ngưỡng (me.rank = null).
-- Chạy sau 202611180015_fco_topup_race_bp.sql (và 202611180019). Phải chạy TRƯỚC khi trao quà (sự kiện VQTG kết thúc). Chạy lại được.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fco_topup_race' and column_name = 'bp_per_fc') then
    raise exception 'Chưa chạy 202611180015_fco_topup_race_bp.sql — chạy file đó trước rồi chạy lại file này.';
  end if;
  if exists (select 1 from public.fco_topup_race_awarded) then
    raise exception 'Top Đặc Huấn đã trao quà — đổi ngưỡng bây giờ không còn tác dụng với người đã nhận.';
  end if;
end $$;

alter table public.fco_topup_race add column if not exists min_points numeric not null default 30000 check (min_points >= 0);
update public.fco_topup_race set min_points = 30000 where id = 1;

create or replace function public.fco_topup_race_amounts() returns table(user_id uuid, amount numeric, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.user_id, sum(x.amt) as amount, max(x.at) as last_at
  from (
    select l.user_id, l.delta::numeric as amt, l.created_at as at
    from public.fco_fc_ledger l
    where l.reason = 'admin'
      and l.created_at >= (select starts_at from public.fco_topup_race where id = 1)
      and l.created_at < public.fco_topup_race_ends()
    union all
    -- BP admin nạp: bp / bp_per_fc = FC tương đương (202611180015, tỉ lệ 202611180019).
    select b.user_id, b.bp::numeric / (select bp_per_fc from public.fco_topup_race where id = 1), b.created_at
    from public.fco_bp_topups b
    where b.created_at >= (select starts_at from public.fco_topup_race where id = 1)
      and b.created_at < public.fco_topup_race_ends()
  ) x
  where not exists (select 1 from public.fco_admins a where a.user_id = x.user_id)
    and not exists (select 1 from auth.users u where u.id = x.user_id and u.banned_until > now())
  group by x.user_id
  having sum(x.amt) > 0
$$;

create or replace function public.fco_topup_race_rows() returns table(user_id uuid, amount numeric, last_at timestamptz, rn bigint)
language sql stable security definer set search_path = '' as $$
  select a.user_id, a.amount, a.last_at, row_number() over (order by a.amount desc, a.last_at, a.user_id) as rn
  from public.fco_topup_race_amounts() a, public.fco_topup_race r
  where r.id = 1 and a.amount * r.points_per_fc >= r.min_points
$$;

create or replace function public.fco_topup_top() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); top integer := (select top_n from public.fco_topup_race where id = 1);
  rate numeric := coalesce((select points_per_fc from public.fco_topup_race where id = 1), 1.5);
  floor_pts numeric := coalesce((select min_points from public.fco_topup_race where id = 1), 0);
  my_rank bigint; my_amount numeric;
begin
  perform public.fco_topup_race_award();
  select r.rn into my_rank from public.fco_topup_race_rows() r where r.user_id = uid;
  select a.amount into my_amount from public.fco_topup_race_amounts() a where a.user_id = uid;
  return jsonb_build_object(
    'startsAt', (extract(epoch from (select starts_at from public.fco_topup_race where id = 1)) * 1000)::bigint,
    'endsAt', (extract(epoch from public.fco_topup_race_ends()) * 1000)::bigint,
    'ended', now() >= public.fco_topup_race_ends(),
    'topN', top,
    'pointsPerFc', rate,
    'minPoints', floor_pts,
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', r.rn, 'name', public.fco_public_name(r.user_id), 'points', r.amount * rate, 'mine', r.user_id = uid,
                       'effect', public.fco_name_effect(r.user_id), 'club', public.fco_club_logo(r.user_id)) order by r.rn)
                     from public.fco_topup_race_rows() r where r.rn <= top), '[]'::jsonb),
    'me', jsonb_build_object('rank', my_rank, 'points', coalesce(my_amount, 0) * rate),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('from', rank_from, 'to', rank_to, 'rewards', rewards, 'note', note) order by rank_from)
                         from public.fco_topup_race_rewards), '[]'::jsonb),
    'awarded', exists (select 1 from public.fco_topup_race_awarded where user_id = uid));
end;
$$;

revoke all on function public.fco_topup_race_amounts(), public.fco_topup_race_rows() from public, anon, authenticated;
revoke all on function public.fco_topup_top() from public, anon;
grant execute on function public.fco_topup_top() to authenticated;

-- Kiểm tra: những người đủ ngưỡng (top 10) và số người chưa đủ.
select r.rn, public.fco_public_name(r.user_id) as name, r.amount * (select points_per_fc from public.fco_topup_race where id = 1) as diem
from public.fco_topup_race_rows() r order by r.rn limit 10;
select count(*) as so_nguoi_chua_du_30k from public.fco_topup_race_amounts() a
where a.amount * (select points_per_fc from public.fco_topup_race where id = 1) < (select min_points from public.fco_topup_race where id = 1);

commit;
