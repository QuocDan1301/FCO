begin;

-- Hệ thống treo bán hàng phôi (2026-11-17, người dùng): cầu thủ NHÓM GIÁ 3 được hệ thống treo bán ở MỌI cấp, mỗi phút một lượng mới:
-- +1 khoảng 100–150 thẻ, cấp càng cao càng ít (× 0,68 mỗi cấp, +13 còn ~1). Mua hết lượng của phút thì chờ phút sau. Giá = giá tham chiếu.
-- Cầu thủ nhóm 1 / 2: hệ thống vẫn chỉ bán +1, không giới hạn (202611170003). Lệnh người chơi rẻ hơn / bằng luôn được ưu tiên.
--   • Nhóm giá của từng cầu thủ do game gửi lên khi đồng bộ dữ liệu kho thẻ (cột grp, phần tử thứ 13 của dòng cầu thủ) →
--     CẦN ĐỒNG BỘ LẠI dữ liệu sau khi đưa bản game mới lên (chưa đồng bộ thì grp = 0: chưa có hàng phôi của hệ thống).
--   • Lượng mỗi phút tính cố định theo (cầu thủ, cấp, phút) nên mọi máy thấy cùng số; số đã bán trong phút giữ ở fco_mkt_sys_sold.
-- Chạy sau 202611170002 và 202611170003. Chạy lại được.

alter table public.fco_cat_players add column if not exists grp integer not null default 0;
alter table public.fco_cat_players_next add column if not exists grp integer not null default 0;

-- Như 202611140016, thêm nhóm giá (r->12).
create or replace function public.fco_admin_catalog_players(p_version text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  perform public.fco_require_catalog_writer();
  if p_version is distinct from (select staging from public.fco_inventory where id = 1) then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  insert into public.fco_cat_players_next(id, name, ovrs, prices, fixed, insurance, wage, pos, positions, clubs, nation, season, grp)
  select (r->>0)::integer, r->>1,
    array(select v::integer from jsonb_array_elements_text(r->2) with ordinality x(v, o) order by o),
    array(select case when v = 'null' then null else v::bigint end from jsonb_array_elements_text(r->3) with ordinality x(v, o) order by o),
    (r->>4)::boolean, (r->>5)::double precision, greatest(0, coalesce((r->>6)::integer, 0)), left(coalesce(nullif(r->>7, ''), 'CM'), 4),
    array(select v from jsonb_array_elements_text(coalesce(r->8, '[]')) with ordinality x(v, o) order by o),
    array(select v from jsonb_array_elements_text(coalesce(r->9, '[]')) with ordinality x(v, o) order by o),
    coalesce(r->>10, ''), coalesce(r->>11, ''), coalesce((r->>12)::integer, 0)
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end;
$function$;

create table if not exists public.fco_mkt_sys_sold (
  player_id integer not null,
  level integer not null,
  minute bigint not null,
  sold integer not null default 0,
  primary key (player_id, level, minute)
);
alter table public.fco_mkt_sys_sold enable row level security;
revoke all on public.fco_mkt_sys_sold from public, anon, authenticated;

create or replace function public.fco_mkt_minute() returns bigint language sql stable set search_path = '' as $$
  select floor(extract(epoch from now()) / 60)::bigint
$$;
-- Lượng hệ thống treo bán trong một phút: 100–150 ở +1 (theo hàm lệch giá cố định), × 0,68 mỗi cấp, tối thiểu 1.
create or replace function public.fco_mkt_sys_qty(p_player integer, p_level integer, p_minute bigint) returns integer language sql immutable set search_path = '' as $$
  select greatest(1, floor((125 + 25 * public.fco_inv_swing(p_player, p_level, p_minute + 900000000)) * power(0.68, p_level - 1)))::integer
$$;
-- Hệ thống đang bán thẻ này không: {price, left} (left null = không giới hạn), null = không bán.
create or replace function public.fco_mkt_sys_offer(p_player integer, p_level integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare g integer; price bigint; m bigint := public.fco_mkt_minute(); q integer;
begin
  if public.fco_trade_locked(p_player) then return null; end if;
  select grp into g from public.fco_cat_players where id = p_player;
  if not found then return null; end if;
  price := public.fco_inv_price(p_player, p_level);
  if price is null or price <= 0 then return null; end if;
  if coalesce(g, 0) = 3 then
    q := public.fco_mkt_sys_qty(p_player, p_level, m);
    return jsonb_build_object('price', price, 'left', greatest(0, q - coalesce((select sold from public.fco_mkt_sys_sold where player_id = p_player and level = p_level and minute = m), 0)));
  end if;
  if p_level = 1 then return jsonb_build_object('price', price, 'left', null); end if;
  return null;
end;
$$;
revoke all on function public.fco_mkt_minute(), public.fco_mkt_sys_qty(integer, integer, bigint), public.fco_mkt_sys_offer(integer, integer) from public, anon, authenticated;

-- Như 202611170003: hệ thống bán theo fco_mkt_sys_offer (nhóm 3 mọi cấp có giới hạn mỗi phút; nhóm khác +1 không giới hạn).
create or replace function public.fco_mkt_buy(p_catalog text, p_player integer, p_level integer, p_price bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb; mr jsonb := public.fco_mkt_rules();
  s public.fco_mkt_orders; o public.fco_mkt_orders; applied jsonb; label text; offer jsonb; sys bigint; card jsonb; m bigint; q integer; taken integer;
begin
  if p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  perform public.fco_mkt_check_price(p_player, p_level, p_price, (rules->>'sellBand')::integer);
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  if coalesce((d->>'balance')::bigint, 0) < p_price then raise exception 'FCO_NOT_ENOUGH_BP' using errcode = 'P0001'; end if;
  label := public.fco_mkt_label(p_player, p_level);
  select * into s from public.fco_mkt_orders where status = 'open' and side = 'sell' and player_id = p_player and level = p_level
    and price <= p_price and user_id <> uid order by price, created_at limit 1 for update skip locked;
  offer := public.fco_mkt_sys_offer(p_player, p_level);
  sys := (offer->>'price')::bigint;
  if sys is not null and p_price >= sys and (s.id is null or s.price > sys) and (offer->'left' = 'null'::jsonb or (offer->>'left')::integer > 0) then
    if offer->'left' <> 'null'::jsonb then
      -- Giữ đúng giới hạn khi nhiều người mua cùng lúc: tăng số đã bán có điều kiện còn hàng.
      m := public.fco_mkt_minute(); q := public.fco_mkt_sys_qty(p_player, p_level, m);
      insert into public.fco_mkt_sys_sold (player_id, level, minute, sold) values (p_player, p_level, m, 1)
        on conflict (player_id, level, minute) do update set sold = public.fco_mkt_sys_sold.sold + 1 where public.fco_mkt_sys_sold.sold < q
        returning sold into taken;
      if taken is null then sys := null; end if;   -- vừa hết hàng phút này → xử lý như không có hệ thống bán
      delete from public.fco_mkt_sys_sold where minute < m - 10;
    end if;
    if sys is not null then
      card := public.fco_inv_new_card(p_player, p_level, true);
      d := d || jsonb_build_object('cards', jsonb_build_array(card) || coalesce(d->'cards', '[]'), 'balance', coalesce((d->>'balance')::bigint, 0) - sys);
      d := public.fco_inv_history(d, 'market', 'Mua · ' || label, 'Hệ thống bán · OVR ' || public.fco_inv_ovr(p_player, p_level) || ' · Giá ' || public.fco_inv_money(sys) || ' BP · −' || public.fco_inv_money(sys) || ' BP');
      applied := public.fco_mkt_apply(uid, d);
      return jsonb_build_object('matched', true, 'system', true, 'price', sys, 'order', null, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
    end if;
  end if;
  if (select count(*) from public.fco_mkt_orders where user_id = uid and side = 'buy' and status = 'open') >= (mr->>'maxOpenBuy')::integer and s.id is null then
    raise exception 'FCO_TOO_MANY_ORDERS' using errcode = 'P0001';
  end if;
  d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) - p_price);
  insert into public.fco_mkt_orders (user_id, side, player_id, level, price) values (uid, 'buy', p_player, p_level, p_price) returning * into o;
  if s.id is not null then
    perform public.fco_mkt_fill(s, o, s.price);
  else
    d := public.fco_inv_history(d, 'market', 'Đặt mua · ' || label, 'Giá ' || public.fco_inv_money(p_price) || ' BP (đang giữ) · Hết hạn sau ' || (mr->>'buyTtlHours') || ' giờ thì trả lại BP');
  end if;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('matched', s.id is not null, 'system', false, 'price', coalesce(s.price, p_price), 'order', o.id, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

-- Như 202611170002, mỗi cấp thêm phần hệ thống bán: sysPrice / sysLeft (sysLeft null = không giới hạn; không bán thì sysPrice null).
create or replace function public.fco_mkt_book(p_player integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare n integer := coalesce(array_length((select prices from public.fco_cat_players where id = p_player), 1), 0);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('level', lv, 'bid', s.bid, 'bids', coalesce(s.bids, 0), 'ask', s.ask, 'asks', coalesce(s.asks, 0),
      'sysPrice', public.fco_mkt_sys_offer(p_player, lv)->'price', 'sysLeft', public.fco_mkt_sys_offer(p_player, lv)->'left') order by lv), '[]')
    from generate_series(1, n) lv
    left join (
      select level,
        max(price) filter (where side = 'buy') as bid, count(*) filter (where side = 'buy') as bids,
        min(price) filter (where side = 'sell') as ask, count(*) filter (where side = 'sell') as asks
      from public.fco_mkt_orders where player_id = p_player and status = 'open' group by level
    ) s on s.level = lv);
end;
$$;

-- Như 202611170002, thêm sys: {price, left} của hệ thống (null = hệ thống không bán thẻ này).
create or replace function public.fco_mkt_depth(p_player integer, p_level integer) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'bids', coalesce((select jsonb_agg(jsonb_build_object('price', price, 'count', n) order by price desc) from (
      select price, count(*) as n from public.fco_mkt_orders where player_id = p_player and level = p_level and side = 'buy' and status = 'open'
      group by price order by price desc limit 5) b), '[]'),
    'asks', coalesce((select jsonb_agg(jsonb_build_object('price', price, 'count', n) order by price) from (
      select price, count(*) as n from public.fco_mkt_orders where player_id = p_player and level = p_level and side = 'sell' and status = 'open'
      group by price order by price limit 5) a), '[]'),
    'volume', (select count(*) from public.fco_mkt_orders where player_id = p_player and level = p_level and side = 'sell'
      and status in ('filled', 'system') and closed_at > now() - interval '2 hours'),
    'sys', public.fco_mkt_sys_offer(p_player, p_level))
$$;

commit;
