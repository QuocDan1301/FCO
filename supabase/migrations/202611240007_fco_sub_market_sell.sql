-- Acc phụ BÁN được cầu thủ (người dùng 2026-11-24: "cho acc phụ có thể bán cầu thủ"; trước đó chỉ mua thẻ hệ thống bán, 202611220018).
--   · Acc phụ đặt bán ở TTCN như người chơi thường (thuế, giá ±10% như cũ) nhưng HỆ THỐNG LUÔN MUA NGAY đúng giá bán; KHÔNG khớp với lệnh
--     đặt mua của người chơi thật — giống chiều mua (202611220018): thẻ / BP của acc phụ không chảy qua lại với người chơi thật.
--     BP nhận ở Lịch sử chuyển nhượng như mọi lệnh bán.
--   · Đặt lệnh mua chờ / mua thẻ của người chơi khác vẫn chặn.
--   · fco_mkt_sell: sửa đúng bản đang chạy (đã nhận Royal ở 202611240003), không chép lại cả hàm.
--   Chạy SAU 202611240006_fco_penalty_pvp.sql. Chạy lại được.
begin;

-- Lệnh của acc phụ: cho dòng "hệ thống bán" (buy, filled) và lệnh BÁN; lệnh mua chờ vẫn chặn.
create or replace function public.fco_sub_block_market() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.fco_is_sub(new.user_id) and not ((new.side = 'buy' and new.status = 'filled') or new.side = 'sell') then
    raise exception 'FCO_SUB_MARKET' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.fco_sub_block_market() from public, anon, authenticated;

-- fco_mkt_sell: acc phụ không khớp lệnh mua của người chơi → hệ thống mua ngay.
do $do$
declare def text; old text := 'and price >= asked and user_id <> uid order by';
begin
  def := pg_get_functiondef('public.fco_mkt_sell(text, jsonb, integer)'::regprocedure);
  if position('not public.fco_is_sub(uid)' in def) > 0 then return; end if;
  if position(old in def) = 0 then raise exception 'fco_mkt_sell đang chạy khác bản mong đợi, không sửa được'; end if;
  execute replace(def, old, 'and price >= asked and user_id <> uid and not public.fco_is_sub(uid) order by');
end
$do$;

commit;