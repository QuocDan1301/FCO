begin;

-- Mua hàng loạt mọi cấp +1 → +13 qua chợ (2026-11-17, người dùng: màn đập thẻ › Mua hàng loạt chạy cả +1 đến +13).
-- fco_mkt_bulk_buy mua tối đa p_count thẻ p_player +p_level, mỗi thẻ lấy nguồn rẻ nhất không vượt p_max:
--   lệnh treo bán của người chơi khác hoặc hệ thống (hàng phôi nhóm 1 mọi cấp có giới hạn mỗi phút; nhóm khác +1 không giới hạn —
--   fco_mkt_sys_offer). Hết người bán / hết BP thì dừng, mua được bao nhiêu trả bấy nhiêu; không mua được thẻ nào → FCO_NO_SELLER.
--   Không treo lệnh đặt mua phần còn thiếu. Chạy sau 202611170007. Chạy lại được.

create or replace function public.fco_mkt_bulk_buy(p_catalog text, p_player integer, p_level integer, p_count integer, p_max bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb;
  s public.fco_mkt_orders; o public.fco_mkt_orders; offer jsonb; sys bigint; m bigint; q integer; taken integer;
  bought integer := 0; spent bigint := 0; bal bigint; card jsonb; label text; applied jsonb;
begin
  if p_count is null or p_count < 1 or p_count > 10 or p_level is null or p_level < 1 or p_level > (rules->>'maxLevel')::integer then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  if p_max is null or p_max < 1 then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
  if public.fco_trade_locked(p_player) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  label := public.fco_mkt_label(p_player, p_level);
  for i in 1 .. p_count loop
    bal := coalesce((d->>'balance')::bigint, 0);
    select * into s from public.fco_mkt_orders where status = 'open' and side = 'sell' and player_id = p_player and level = p_level
      and price <= p_max and user_id <> uid order by price, created_at limit 1 for update skip locked;
    offer := public.fco_mkt_sys_offer(p_player, p_level);
    sys := (offer->>'price')::bigint;
    if sys is not null and (sys > p_max or (offer->'left' <> 'null'::jsonb and (offer->>'left')::integer <= 0)) then sys := null; end if;
    if sys is not null and s.id is not null and s.price <= sys then sys := null; end if;   -- người chơi rẻ hơn / bằng: ưu tiên người chơi
    if sys is not null then
      if bal < sys then exit; end if;
      if offer->'left' <> 'null'::jsonb then
        m := public.fco_mkt_minute(); q := public.fco_mkt_sys_qty(p_player, p_level, m); taken := null;
        insert into public.fco_mkt_sys_sold (player_id, level, minute, sold) values (p_player, p_level, m, 1)
          on conflict (player_id, level, minute) do update set sold = public.fco_mkt_sys_sold.sold + 1 where public.fco_mkt_sys_sold.sold < q
          returning sold into taken;
        if taken is null then sys := null; end if;
      end if;
    end if;
    if sys is not null then
      card := public.fco_inv_new_card(p_player, p_level, true);
      d := d || jsonb_build_object('cards', jsonb_build_array(card) || coalesce(d->'cards', '[]'), 'balance', bal - sys);
      d := public.fco_inv_history(d, 'market', 'Mua · ' || label, 'Hệ thống bán · OVR ' || public.fco_inv_ovr(p_player, p_level) || ' · Giá ' || public.fco_inv_money(sys) || ' BP · −' || public.fco_inv_money(sys) || ' BP');
      bought := bought + 1; spent := spent + sys;
    elsif s.id is not null then
      if bal < s.price then exit; end if;
      -- Mua của người chơi: lệnh mua đúng giá lệnh bán rồi khớp ngay (thẻ về qua phần nhận, cộng ở cuối lượt).
      d := d || jsonb_build_object('balance', bal - s.price);
      insert into public.fco_mkt_orders (user_id, side, player_id, level, price) values (uid, 'buy', p_player, p_level, s.price) returning * into o;
      perform public.fco_mkt_fill(s, o, s.price);
      bought := bought + 1; spent := spent + s.price;
    else
      exit;
    end if;
  end loop;
  if bought = 0 then raise exception 'FCO_NO_SELLER' using errcode = 'P0001'; end if;
  delete from public.fco_mkt_sys_sold where minute < public.fco_mkt_minute() - 10;
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('bought', bought, 'spent', spent, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;
grant execute on function public.fco_mkt_bulk_buy(text, integer, integer, integer, bigint) to authenticated;
revoke execute on function public.fco_mkt_bulk_buy(text, integer, integer, integer, bigint) from public, anon;

commit;
