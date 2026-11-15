-- Giao quà đang kẹt trong hàng chờ (2026-11-16). Chạy lại được (chỉ lấy quà chưa nhận).
-- Lỗi phía game: hẹn giờ nhận quà dùng trạng thái lúc vừa đăng nhập (kho máy chủ còn đang tải) nên người chơi có kho trên máy chủ
-- (inv = 1) không bao giờ tự nhận quà trong fco_admin_gifts: quà admin tặng / tặng hàng loạt, quà Top BXH Đập 8 liền tay (vòng 1)…
-- Game bản mới đã sửa (App.tsx claimGiftsRef). Migration này cộng ngay mọi quà chưa nhận của tài khoản có kho trên máy chủ
-- (fco_inv_grant: gói, BP, phiếu vào kho + một dòng lịch sử "Quà từ Admin"; FC của quà đã cộng vào ví lúc tặng nên bỏ qua) rồi đánh dấu đã nhận.
-- Tài khoản chưa có kho trên máy chủ giữ nguyên để game tự nhận như trước.
begin;

do $$
declare g public.fco_admin_gifts; n integer := 0; skipped integer := 0; t text;
begin
  for g in select * from public.fco_admin_gifts where claimed_at is null order by user_id, id for update loop
    -- Tài khoản chưa có bản lưu trên máy chủ (chưa vào game lần nào): fco_inv_grant báo FCO_NO_SAVE → để quà chờ, game nhận sau.
    if not public.fco_inv_server_owned(g.user_id) or not exists (select 1 from public.fco_game_saves s where s.user_id = g.user_id) then
      skipped := skipped + 1; continue;
    end if;
    t := public.fco_inv_reward_text(g.rewards);
    perform public.fco_inv_grant(g.user_id, g.rewards, 'gift', 'Quà từ Admin', 'Nhận ' || t || case when g.note <> '' then ' · ' || g.note else '' end);
    update public.fco_admin_gifts set claimed_at = now() where id = g.id;
    n := n + 1;
    raise notice '% ← % (%)', public.fco_public_name(g.user_id), t, g.note;
  end loop;
  raise notice 'Đã giao % quà đang chờ; để lại % quà (tài khoản chưa có kho / bản lưu trên máy chủ).', n, skipped;
end $$;

commit;