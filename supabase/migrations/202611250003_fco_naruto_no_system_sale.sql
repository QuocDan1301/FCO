begin;

-- Mùa NARUTO (id 4346–4373): hệ thống KHÔNG BÁN ở bất kỳ cấp nào (người dùng 2026-11-25: "Mùa này hệ thống không bán"), như EL / TSUBASA
-- (fco_mkt_no_system, 202611170010): không có dòng hệ thống ở TTCN, mua +1 từ hệ thống báo FCO_NO_SYSTEM_SALE. Người chơi vẫn treo bán /
-- đặt mua với nhau và bán cho hệ thống như mọi thẻ. Thêm cầu thủ NARUTO mới (vd Busquets 4374) thì nâng last_id. Chạy lại được.

insert into public.fco_mkt_no_system (label, first_id, last_id) values ('NARUTO', 4346, 4373)
  on conflict (label) do update set first_id = excluded.first_id, last_id = excluded.last_id;

commit;