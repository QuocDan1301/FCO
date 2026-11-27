-- Bịt lỗ hổng mua của hệ thống rồi bán lại cho hệ thống (2026-11-27, người dùng: "làm cách 1").
--   Trước: hệ thống bán thẻ đúng giá tham chiếu (thẻ +1 không giới hạn), nhưng lại MUA NGAY mọi lệnh bán đúng giá treo — tới +10 % giá tham chiếu.
--   Thuế dưới 9,1 % (Royal 6 %, Luxury 10 % kèm phiếu…) thì cứ mua của hệ thống rồi bán lại +10 % là lãi, lặp vô hạn ra BP.
--   Sau: hệ thống mua tối đa bằng GIÁ THAM CHIẾU hiện tại (fco_inv_price) — treo cao hơn mà không có người chơi đặt mua thì hệ thống trả giá tham
--   chiếu, thuế tính trên giá đó. Khớp với lệnh đặt mua của người chơi vẫn theo giá treo (±10 %) như cũ.
--   Chỉ thay fco_mkt_system_take (chỗ duy nhất hệ thống mua: fco_mkt_sell bán ngay + fco_mkt_settle lệnh còn treo); fco_inv_sell đã chặn từ 202611180004.
-- Chạy sau 202611260002_fco_tkl_no_system_sale.sql. Chạy lại được.
begin;

create or replace function public.fco_mkt_system_take(r public.fco_mkt_orders) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  ref bigint := public.fco_inv_price(r.player_id, r.level);
  at bigint := case when ref is not null and ref > 0 then least(r.price, ref) else r.price end;
  fee bigint := floor(at * coalesce(r.tax, 0) / 100)::bigint;
begin
  update public.fco_mkt_orders set status = 'system', closed_at = now(), fill_price = at where id = r.id and status = 'open';
  if not found then return; end if;
  insert into public.fco_mkt_deliveries (user_id, bp, kind, order_id, title, detail) values (r.user_id, at - fee, 'sell', r.id,
    'Nhận BP · ' || public.fco_mkt_label(r.player_id, r.level), 'Hệ thống mua ngay · Giá '
      || public.fco_inv_money(at) || ' BP' || case when at < r.price then ' (giá tham chiếu; treo ' || public.fco_inv_money(r.price) || ' BP)' else '' end
      || ' · Phí ' || public.fco_inv_num(coalesce(r.tax, 0)) || '%: ' || public.fco_inv_money(fee) || ' BP · +' || public.fco_inv_money(at - fee) || ' BP');
end;
$$;
revoke all on function public.fco_mkt_system_take(public.fco_mkt_orders) from public, anon, authenticated;

commit;