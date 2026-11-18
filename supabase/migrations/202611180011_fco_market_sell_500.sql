begin;

-- Bán tối đa 500 cầu thủ một lần (người dùng 2026-11-18: "nâng lên bán 500 cầu thủ 1 lần"); bộ dữ liệu game MAX_BULK_SELL = 500
-- (maxBulkSell, cần đưa bản game mới + Đồng bộ dữ liệu). Bán là xong ngay (202611180010) nên lệnh không còn treo, nhưng fco_mkt_sell vẫn
-- chặn "lệnh bán đang mở + số thẻ bán ≤ maxOpenSell" → nâng maxOpenSell 300 → 600 để bán đủ 500 thẻ một lần. Chạy sau 202611180010. Chạy lại được.

create or replace function public.fco_mkt_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('systemAfterSec', 0, 'maxOpenSell', 600, 'maxOpenBuy', 50)
$$;
revoke all on function public.fco_mkt_rules() from public, anon, authenticated;

commit;