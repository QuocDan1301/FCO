begin;

-- Lịch sử "Đập 8 liền tay" (2026-11-14, người dùng: "Thêm cả lịch sử đập +8 cầu thủ nào của hlv"): bấm HLV trên BXH (hoặc ô Thành tích
-- của bạn) xem các cầu thủ HLV đó đã đập lên +8, lúc nào, có được tính điểm không (mỗi mùa tối đa 3 cầu thủ đạt sớm nhất).
-- p_rank = hạng 1..10 trên bảng (cùng thứ tự fco_plus8_board: điểm giảm dần, ai đạt trước đứng trên); null = của chính mình.
-- Không trả mã người chơi. Chạy lại được.

create or replace function public.fco_plus8_history(p_rank integer default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); target uuid;
begin
  if p_rank is null then target := uid;
  elsif p_rank between 1 and 10 then
    select s.user_id into target from public.fco_plus8_scores() s order by s.score desc, s.reached, s.user_id offset p_rank - 1 limit 1;
  else raise exception 'FCO_BAD_RANK' using errcode = '22023';
  end if;
  if target is null then return null; end if;
  return jsonb_build_object('name', public.fco_public_name(target), 'mine', target = uid, 'club', public.fco_club_logo(target),
    'items', coalesce((select jsonb_agg(jsonb_build_object('pid', x.player_id, 'at', (extract(epoch from x.at) * 1000)::bigint, 'counted', x.k <= 3) order by x.at desc, x.player_id)
      from (select p.player_id, p.at, row_number() over (partition by coalesce(t.tier, 'id:' || p.player_id) order by p.at, p.player_id) as k
              from public.fco_plus8 p left join public.fco_player_tiers t on t.player_id = p.player_id where p.user_id = target) x), '[]'::jsonb));
end;
$$;
revoke all on function public.fco_plus8_history(integer) from public, anon;
grant execute on function public.fco_plus8_history(integer) to authenticated;

commit;
