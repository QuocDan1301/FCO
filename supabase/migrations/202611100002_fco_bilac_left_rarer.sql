-- Bi Lắc: giảm tỉ lệ trúng gói ngon trong bảng quà (2026-11-10, sau 202611090013). Danh sách quà và tỉ lệ bóng không đổi.
-- Quy ước của người dùng: hàng càng cao quà càng ngon, trong mỗi hàng quà càng về trái càng ngon.
-- Tỉ lệ ra từng hàng đã giảm dần từ trên xuống (x3 ~0,9–1,6 % · x2 ~18–25 % · khác nhau ~28 % mỗi lượt) nên giữ nguyên;
-- ở đây sắp lại trọng số trong hàng cho tăng dần từ trái sang phải (món trái hiếm nhất), thang phần nghìn (tổng 1000).
-- Không đổi: Special x3 / x2 (1 món), FC x3, BP x3, BP x2 (đã tăng dần, không phải gói).
begin;

update public.fco_bilac_rows set weights = case id
  when 'club3' then '{10,50,190,750}'::integer[]                -- 26UP chỉ định 30 · 40 · 50 · 60          (trước 30 · 100 · 250 · 620)
  when 'card3' then '{10,50,190,750}'::integer[]                -- 113+ · 112+ · 111+ · 110+                (trước 30 · 100 · 250 · 620)
  when 'fc2'   then '{1,3,6,10,300,680}'::integer[]             -- 1800 FC · 400 FC · 240M BP · 200 FC · 150M BP · gói 109+
                                                                 --   (trước 1 · 4 · 120 · 10 · 320 · 545; tổng quà FC 15 → 14 ‰)
  when 'club2' then '{5,25,70,150,280,470}'::integer[]          -- Top Price 60 · 125 · 150 · 175 · 200 · 225 (trước 20 · 60 · 110 · 180 · 260 · 370)
  when 'card2' then '{5,25,70,150,280,470}'::integer[]          -- WB All · 108+ LWBBG · 38M · 108+ LWB · 33M · 108+ LWBB
                                                                 --   (trước 250 · 70 · 30 · 230 · 120 · 300: WB All đang ra nhiều nhất hàng)
  when 'mixed' then '{2,10,25,50,100,170,250,393}'::integer[]   -- ICONTM · 34M · BLD/GRU/CU/24EP · 30M · 116+ mix · 25M · 117+ mix · 20M
                                                                 --   (trước 5 · 35 · 50 · 90 · 270 · 130 · 300 · 120)
  else weights end;

commit;
