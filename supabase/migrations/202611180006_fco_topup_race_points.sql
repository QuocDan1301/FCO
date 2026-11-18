begin;

-- Top Đặc Huấn hiển thị ĐIỂM ĐẶC HUẤN thay cho FC nạp (2026-11-18, người dùng: "chuyển đổi điểm đặc huấn fc sang điểm, 1 fc = 1.5 điểm").
-- Điểm = tổng FC nạp × points_per_fc (1,5). Thứ hạng giữ nguyên (cùng tỉ lệ). Bảng công khai chỉ trả điểm (không lộ số FC nạp của người khác).
-- Chạy sau 202611180005. Chạy lại được.

alter table public.fco_topup_race add column if not exists points_per_fc numeric not null default 1.5 check (points_per_fc > 0);
update public.fco_topup_race set points_per_fc = 1.5 where id = 1;

create or replace function public.fco_topup_top() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); top integer := (select top_n from public.fco_topup_race where id = 1);
  rate numeric := coalesce((select points_per_fc from public.fco_topup_race where id = 1), 1.5); mine record;
begin
  perform public.fco_topup_race_award();
  select r.rn, r.amount into mine from public.fco_topup_race_rows() r where r.user_id = uid;
  return jsonb_build_object(
    'startsAt', (extract(epoch from (select starts_at from public.fco_topup_race where id = 1)) * 1000)::bigint,
    'endsAt', (extract(epoch from public.fco_topup_race_ends()) * 1000)::bigint,
    'ended', now() >= public.fco_topup_race_ends(),
    'topN', top,
    'pointsPerFc', rate,
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', r.rn, 'name', public.fco_public_name(r.user_id), 'points', r.amount * rate, 'mine', r.user_id = uid,
                       'effect', public.fco_name_effect(r.user_id), 'club', public.fco_club_logo(r.user_id)) order by r.rn)
                     from public.fco_topup_race_rows() r where r.rn <= top), '[]'::jsonb),
    'me', jsonb_build_object('rank', mine.rn, 'points', coalesce(mine.amount, 0) * rate),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('from', rank_from, 'to', rank_to, 'rewards', rewards, 'note', note) order by rank_from)
                         from public.fco_topup_race_rewards), '[]'::jsonb),
    'awarded', exists (select 1 from public.fco_topup_race_awarded where user_id = uid));
end;
$$;
revoke all on function public.fco_topup_top() from public, anon;
grant execute on function public.fco_topup_top() to authenticated;

commit;