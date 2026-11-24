-- Phiếu giảm thuế giảm THEO PHẦN TRĂM CỦA THUẾ (người dùng 2026-11-24: "giảm 30% là hưởng 30% thuế chứ không phải giảm 30%, giảm 40% cũng vậy").
--   · Trước: trừ thẳng điểm % (thuế 40% − phiếu 30% = 10%). Nay: thuế × (100 − phiếu) / 100 → thuế 40% với phiếu 30% còn 28%, phiếu 40% còn 24%,
--     phiếu 10% còn 36%; bán cho hệ thống (thuế 50%) phiếu 20% còn 40%. Gói thành viên (SVIP / Premium) vẫn giảm trước rồi mới tới phiếu.
--   · Hạng Premium / Luxury / Royal không cộng dồn: lấy mức thấp hơn giữa thuế của hạng và thuế gốc × (100 − phiếu) / 100 (nay không phiếu nào thấp
--     hơn thuế của hạng → FCO_VOUCHER_USELESS, không mất phiếu).
--   · Sửa thẳng bản fco_mkt_sell đang chạy (mọi hàm public còn trừ thẳng "- p_voucher"), giữ nguyên các thay đổi trước (Royal, acc phụ bán…).
--   Khớp src/stp.ts (taxWithVoucher) + src/market.ts (taxFor) — tests/stp.test.ts. Chạy SAU 202611240010_fco_pvp_10s.sql. Chạy lại được.
begin;

do $$
declare f record; def text; n integer := 0;
begin
  for f in select p.oid from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (p.prosrc like '%precision - p_voucher%' or p.prosrc like '%tax - p_voucher%') loop
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'greatest(0, (rules->>''marketFee'')::double precision - p_voucher)', '(rules->>''marketFee'')::double precision * (100 - p_voucher) / 100');
    def := replace(def, 'greatest(0, tax - p_voucher)', 'tax * (100 - p_voucher) / 100');
    def := replace(def, '(phiếu −'' || p_voucher || ''%)', '(phiếu giảm '' || p_voucher || ''% thuế)');
    if position('precision - p_voucher' in def) > 0 or position('tax - p_voucher' in def) > 0 then raise exception 'Chưa sửa hết cách trừ phiếu trong %', f.oid::regprocedure; end if;
    execute def;
    n := n + 1;
  end loop;
  if position('(100 - p_voucher) / 100' in pg_get_functiondef('public.fco_mkt_sell(text, jsonb, integer)'::regprocedure)) = 0 then
    raise exception 'fco_mkt_sell chưa tính phiếu theo phần trăm thuế';
  end if;
  raise notice 'Đã sửa % hàm', n;
end $$;

commit;
