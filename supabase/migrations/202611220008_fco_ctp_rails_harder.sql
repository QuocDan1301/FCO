begin;

-- Cờ tỷ phú (2026-11-22, người dùng: "giảm tỉ lệ trúng quà rất ngon"): cân lại tỷ lệ kệ quà (D:\FCOvv-tmp\tmp\ctp_calib2.py).
--   · Giá trị TB mỗi lần sút 144M → ~101M BP (−30 %): quà càng đắt càng giảm mạnh (vd. CU 114+ (+9) 0,31 % → 0,12 %,
--     500M BP 1,0 % → 0,59 %, FCA 107+ (+11) 0,53 % → 0,25 %); quà nhỏ (25–35M BP) ra nhiều hơn.
--   · Quà FC và ICON TM hiếm gấp đôi (vd. 2.000 FC 0,003 % → 0,0015 %).
-- Chạy SAU 202611220007_fco_ctp_roll_points.sql. Chạy lại được.

update public.fco_ctp_rails set weights = '{6206,22,1939,11,1822}', rail_weight = 135 where id = 'orange';
update public.fco_ctp_rails set weights = '{2562,2207,1939,1730,1562}', rail_weight = 379 where id = 'green';
update public.fco_ctp_rails set weights = '{1329,211,2024,53,6383}', rail_weight = 189 where id = 'red';
update public.fco_ctp_rails set weights = '{4578,656,3623,577,566}', rail_weight = 1101 where id = 'purple';
update public.fco_ctp_rails set weights = '{2961,2519,2192,1942,386}', rail_weight = 1702 where id = 'yellow';
update public.fco_ctp_rails set weights = '{567,6112,2429,801,91}', rail_weight = 1278 where id = 'cyan';
update public.fco_ctp_rails set weights = '{4106,1434,3708,645,107}', rail_weight = 2448 where id = 'white';
update public.fco_ctp_rails set weights = '{3914,1385,3632,1065,4}', rail_weight = 2768 where id = 'pink';

commit;
