begin;

-- Giá chợ cho cả danh sách thẻ trong một lần gọi (2026-11-17, người dùng: "Bán hàng loạt cũng hiển thị giá thật từ chợ").
-- fco_mkt_quotes(p_keys) với p_keys = [[cầu thủ, cấp], ...] (tối đa 400 cặp) → [{p, l, bid, ask}]:
--   bid = lệnh đặt mua cao nhất của người chơi khác; ask = giá bán thấp nhất (lệnh treo bán của người chơi khác hoặc hệ thống còn hàng).
-- Chỉ đọc, không đổi dữ liệu. Chạy sau 202611170006. Chạy lại được.

create or replace function public.fco_mkt_quotes(p_keys jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'FCO_LOGIN_REQUIRED' using errcode = '42501'; end if;
  if p_keys is null or jsonb_typeof(p_keys) <> 'array' or jsonb_array_length(p_keys) > 400 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('p', k.p, 'l', k.l,
      'bid', (select max(price) from public.fco_mkt_orders where status = 'open' and side = 'buy' and player_id = k.p and level = k.l and user_id <> uid),
      'ask', (select min(v) from (
        select min(price) as v from public.fco_mkt_orders where status = 'open' and side = 'sell' and player_id = k.p and level = k.l and user_id <> uid
        union all
        select (o->>'price')::bigint from (select public.fco_mkt_sys_offer(k.p, k.l) as o) s
          where o is not null and (o->'left' = 'null'::jsonb or (o->>'left')::integer > 0)) x))), '[]')
    from (select distinct (e->>0)::integer as p, (e->>1)::integer as l from jsonb_array_elements(p_keys) e) k);
end;
$$;
grant execute on function public.fco_mkt_quotes(jsonb) to authenticated;
revoke execute on function public.fco_mkt_quotes(jsonb) from public, anon;

commit;