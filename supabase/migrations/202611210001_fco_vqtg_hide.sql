begin;

-- Ẩn sự kiện Vòng Quanh Thế Giới (người dùng 2026-11-21: "ẩn sự kiện vqtg để chuẩn bị cho sự kiện tuần mới").
--   Game: src/config.ts EVENT_VQTG_ENABLED = false (bỏ mục Sự kiện ở thanh dưới, không mở được trang VQTG).
--   Máy chủ: thu quyền gọi các hàm CHƠI / NHẬN QUÀ của VQTG (fco_vqtg_play, fco_vqtg_claim, fco_vqtg_claim_many) để không ai chơi được
--   qua API khi sự kiện đang ẩn (bài học kiểm tra bảo mật 2026-11-14). Dữ liệu (vé, vị trí, Chỉ định, mốc đã nhận, BXH vé) giữ nguyên.
--   Hàm xem (config, top) vẫn để: không ghi gì, game đã ẩn trang.
-- Mở lại sau này: chạy
--   do $$ declare f regprocedure; begin
--     for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--              where n.nspname = 'public' and p.proname in ('fco_vqtg_play', 'fco_vqtg_claim', 'fco_vqtg_claim_many') loop
--       execute format('grant execute on function %s to authenticated', f); end loop; end $$;
--   rồi đặt EVENT_VQTG_ENABLED = true và deploy.
-- Chạy lại được.

do $$
declare f regprocedure; n integer := 0;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname in ('fco_vqtg_play', 'fco_vqtg_claim', 'fco_vqtg_claim_many') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    n := n + 1;
  end loop;
  raise notice 'Đã khoá % hàm chơi / nhận quà VQTG.', n;
end $$;

commit;
