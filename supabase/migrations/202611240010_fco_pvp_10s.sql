-- Penalty đối kháng: mỗi quả 10 giây cho cả hai bên (người dùng 2026-11-24: "sẽ có thời gian là 10 giây cho cả 2, nếu ko chọn hướng sút
-- hoặc bắt thì máy sẽ tự sút và bắt gôn"). Trước: 20 giây (202611240009).
--   · pickSeconds = 10: thời gian chọn mỗi quả, game đếm từ lúc quả đó hiện trên sân (sau khi diễn xong quả trước). Hết 10 giây mà chưa chốt
--     thì game tự sút (vạch ngắm đang ở đâu sút đó) / tự bay người (chưa chọn hướng thì chọn ngẫu nhiên 1 trong 6 hướng).
--   · revealSeconds = 5: thời gian diễn cảnh quả trước + chờ hỏi máy chủ; roundSeconds = pickSeconds + revealSeconds = 15 là hạn máy chủ cho mỗi
--     quả. Quá hạn thêm graceSeconds (3 giây) mà vẫn thiếu lựa chọn (đóng trang, mất mạng) thì máy chủ chọn ngẫu nhiên như trước.
--   · Các luật khác không đổi. Khớp src/pvp.ts (PVP_RULES) — tests/pvp.test.ts. Chạy SAU 202611240009_fco_pvp_alternate.sql. Chạy lại được.
begin;

create or replace function public.fco_pvp_rules() returns jsonb language sql immutable set search_path = '' as $$
  select '{"kicks": 5, "maxKicks": 30, "pickSeconds": 10, "revealSeconds": 5, "roundSeconds": 15, "graceSeconds": 3, "awaySeconds": 45, "queueSeconds": 20, "k": 24, "start": 1000}'::jsonb
$$;
revoke all on function public.fco_pvp_rules() from public, anon, authenticated;

commit;
