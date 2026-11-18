begin;

-- Quà Top Đặc Huấn theo hạng, theo Dachuan.xlsx của người dùng (2026-11-18). Thay bảng quà cũ (bản đầu lấy nhầm bảng 24TOTS cũ trên trang Garena).
--   Hạng 1     : 26TOTS chỉ định 1 (+10) · CH chỉ định 1 (+9)  · WS chỉ định 1 (+9)
--   Hạng 2     : 26TOTS chỉ định 1 (+9)  · CH chỉ định 3 (+9)  · WS chỉ định 3 (+9)
--   Hạng 3     : 26TOTS chỉ định 3 (+9)  · CH chỉ định 5 (+9)  · WS chỉ định 5 (+9)
--   Hạng 4–5   : 26TOTS chỉ định 5 (+9)  · CH chỉ định 7 (+9)  · WS chỉ định 7 (+9)
--   Hạng 6–10  : 26TOTS chỉ định 7 (+9)  · CH chỉ định 10 (+9) · WS chỉ định 10 (+9)
--   Hạng 11–20 : 26TOTS chỉ định 10 (+8) · CH chỉ định 15 (+9) · WS chỉ định 15 (+8)
--   Hạng 21–29 : 26TOTS chỉ định 20 (+8) · CH chỉ định 20 (+9) · WS chỉ định 20 (+8)
--   Hạng 30–40 : 26TOTS chỉ định 30 (+8) · CH chỉ định 30 (+9) · WS chỉ định 30 (+8)
--   Hạng 41–50 : 26TOTS chỉ định 40 (+8) · CH chỉ định 40 (+9) · WS chỉ định 40 (+8)
-- 27 gói tdh-ts* / tdh-ch* / tdh-ws* trong src/packs.json; mùa CH (CONTINENTAL HEROES) thêm 2026-11-18 (scripts/import-ch.py, migration 202611180008_fco_season_ch.sql).
-- Chạy SAU khi đưa bản game mới lên và admin đã Đồng bộ dữ liệu; chạy trước khi sự kiện VQTG kết thúc (quà trao ngay khi hết giờ).
-- Chạy lại được: thay toàn bộ bảng quà.

do $$
begin
  if (select count(*) from public.fco_cat_packs where id in ('tdh-ts1-10', 'tdh-ch1-9', 'tdh-ws1-9', 'tdh-ts1-9', 'tdh-ch3-9', 'tdh-ws3-9', 'tdh-ts3-9', 'tdh-ch5-9', 'tdh-ws5-9', 'tdh-ts5-9', 'tdh-ch7-9', 'tdh-ws7-9', 'tdh-ts7-9', 'tdh-ch10-9', 'tdh-ws10-9', 'tdh-ts10-8', 'tdh-ch15-9', 'tdh-ws15-8', 'tdh-ts20-8', 'tdh-ch20-9', 'tdh-ws20-8', 'tdh-ts30-8', 'tdh-ch30-9', 'tdh-ws30-8', 'tdh-ts40-8', 'tdh-ch40-9', 'tdh-ws40-8')) < 27 then
    raise exception 'Chưa có các gói tdh-* trên máy chủ: đưa bản game mới lên → Quản trị FC → Đồng bộ dữ liệu, rồi chạy lại migration này.';
  end if;
  if exists (select 1 from public.fco_topup_race_awarded) then
    raise exception 'Top Đặc Huấn đã trao quà, không đổi bảng quà nữa.';
  end if;
end $$;

delete from public.fco_topup_race_rewards;
insert into public.fco_topup_race_rewards (rank_from, rank_to, rewards, note) values
  (1, 1, '[{"pack":"tdh-ts1-10","count":1},{"pack":"tdh-ch1-9","count":1},{"pack":"tdh-ws1-9","count":1}]', ''),
  (2, 2, '[{"pack":"tdh-ts1-9","count":1},{"pack":"tdh-ch3-9","count":1},{"pack":"tdh-ws3-9","count":1}]', ''),
  (3, 3, '[{"pack":"tdh-ts3-9","count":1},{"pack":"tdh-ch5-9","count":1},{"pack":"tdh-ws5-9","count":1}]', ''),
  (4, 5, '[{"pack":"tdh-ts5-9","count":1},{"pack":"tdh-ch7-9","count":1},{"pack":"tdh-ws7-9","count":1}]', ''),
  (6, 10, '[{"pack":"tdh-ts7-9","count":1},{"pack":"tdh-ch10-9","count":1},{"pack":"tdh-ws10-9","count":1}]', ''),
  (11, 20, '[{"pack":"tdh-ts10-8","count":1},{"pack":"tdh-ch15-9","count":1},{"pack":"tdh-ws15-8","count":1}]', ''),
  (21, 29, '[{"pack":"tdh-ts20-8","count":1},{"pack":"tdh-ch20-9","count":1},{"pack":"tdh-ws20-8","count":1}]', ''),
  (30, 40, '[{"pack":"tdh-ts30-8","count":1},{"pack":"tdh-ch30-9","count":1},{"pack":"tdh-ws30-8","count":1}]', ''),
  (41, 50, '[{"pack":"tdh-ts40-8","count":1},{"pack":"tdh-ch40-9","count":1},{"pack":"tdh-ws40-8","count":1}]', '');

select rank_from, rank_to, rewards from public.fco_topup_race_rewards order by rank_from;

commit;