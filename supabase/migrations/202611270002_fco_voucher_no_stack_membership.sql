-- Phiếu giảm thuế KHÔNG cộng dồn với gói thành viên (người dùng 2026-11-27: "bỏ cộng dồn gói thành viên với phiếu giảm thuế").
--   · Trước: có gói SVIP Class / Premium (Shop) thì giảm theo gói trước rồi phiếu giảm tiếp trên phần còn lại (gói Premium 20 % + phiếu 40 % = 12 %).
--   · Nay: giống hạng tài khoản — lấy mức THẤP HƠN giữa thuế theo gói và thuế gốc × (100 − phiếu) / 100. Phiếu không thấp hơn thì báo
--     FCO_VOUCHER_USELESS, không mất phiếu (gói Premium 20 % chỉ phiếu 35 % / 40 % mới thấp hơn: 26 % / 24 % → không phiếu nào; SVIP Class 28 %:
--     phiếu 35 % → 26 %, phiếu 40 % → 24 %).
--   · Sửa thẳng bản đang chạy của mọi hàm còn nhánh "fco_account_tier(uid) in ('premium', 'luxury', 'royal')" (fco_mkt_sell…): nhánh không cộng dồn
--     áp cho mọi tài khoản. Tài khoản không có gì giảm thì thuế = thuế gốc nên kết quả như cũ.
--   Khớp src/market.ts (taxFor). Chạy SAU 202611270001_fco_mkt_system_take_cap.sql. Chạy lại được.
begin;

do $$
declare f record; def text; n integer := 0;
begin
  for f in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.prosrc like '%fco_account_tier(uid) in (''premium'', ''luxury'', ''royal'')%' and p.prosrc like '%p_voucher%' loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'fco_account_tier(uid) in (''premium'', ''luxury'', ''royal'')', 'fco_account_tier(uid) is not null /* phiếu không cộng dồn với hạng / gói thành viên (202611270002) */');
    execute def;
    n := n + 1;
  end loop;
  if position('202611270002' in pg_get_functiondef('public.fco_mkt_sell(text, jsonb, integer)'::regprocedure)) = 0 then
    raise exception 'fco_mkt_sell đang chạy khác bản mong đợi (không thấy nhánh hạng tài khoản), không sửa được';
  end if;
  raise notice 'Đã sửa % hàm', n;
end $$;

commit;