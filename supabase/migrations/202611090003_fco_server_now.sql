-- Giờ máy chủ cho kỳ giá cầu thủ (đổi mỗi 5 giờ, src/market.ts), để đổi giờ trên máy không làm đổi giá.
create or replace function public.fco_server_now() returns bigint
language sql volatile
set search_path = public, pg_temp
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

revoke all on function public.fco_server_now() from public;
grant execute on function public.fco_server_now() to authenticated;
