-- Giờ chơi của chính tài khoản (2026-11-23): ô cấp độ cạnh tên HLV trên thanh trên cùng hiện số giờ chơi.
--   fco_my_play_seconds(): tổng giây chơi của người gọi (fco_presence.play_seconds, do nhịp tim fco_heartbeat cộng); chưa chơi thì 0.
-- Chạy lại được.
begin;

create or replace function public.fco_my_play_seconds() returns bigint language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return coalesce((select p.play_seconds from public.fco_presence p where p.user_id = uid), 0);
end;
$$;
revoke all on function public.fco_my_play_seconds() from public, anon;
grant execute on function public.fco_my_play_seconds() to authenticated;

commit;
