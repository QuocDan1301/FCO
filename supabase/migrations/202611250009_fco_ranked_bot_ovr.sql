begin;

-- GLXH: OVR đội máy (bot) theo CHÍNH đội người chơi, cộng thêm theo điểm và có trần (người dùng 2026-11-25: bot quá mạnh).
-- Trước (202611140016): OVR bot = TB OVR đội người chơi thật trong ±200 điểm (từ 3 người), không đủ thì 115 + (điểm − 1000) / 20, ±3
--   → người ở top bảng / đội yếu hơn mặt bằng hạng gặp bot hơn mình 10–20 OVR (thắng ~9–16%).
-- Nay: OVR bot = OVR đội mình + min(4, max(0, (điểm − 1000) / 100)) − (0…2 ngẫu nhiên)
--   → ≤ 1000 điểm: bot bằng hoặc kém 1–2 OVR; mỗi 100 điểm khó thêm 1; từ 1.400 điểm: bot hơn 2–4 OVR (không bao giờ hơn quá 4).
-- Vá hàm đang chạy (pg_get_functiondef): bỏ truy vấn trung bình (đỡ đọc đĩa) và đổi công thức; phần còn lại giữ nguyên ('gx', 'faces', mốc lương…).
-- Chạy sau 202611250008_fco_season_dcb.sql. Chạy lại được.

do $$
declare def text;
  old_q constant text := E'    select round(avg(r.team_ovr))::integer, count(*)::integer into bot_avg, bot_n from public.fco_ranked r\n     where r.user_id <> uid and r.team_ovr is not null and r.updated_at > now() - interval ''30 days'' and abs(r.points - me.points) <= 200;\n';
  old_f constant text := 'opp_ovr := least(180, greatest(60, coalesce(case when bot_n >= 3 then bot_avg end, 115 + (me.points - 1000) / 20) + floor(random() * 7)::integer - 3));';
  new_f constant text := 'opp_ovr := least(180, greatest(60, my_ovr + least(4, greatest(0, (me.points - 1000) / 100)) - floor(random() * 3)::integer));  -- 202611250009: theo OVR đội mình, hơn tối đa 4';
begin
  def := pg_get_functiondef('public.fco_ranked_play(jsonb)'::regprocedure);
  if position(new_f in def) > 0 then return; end if;
  if position(old_f in def) = 0 then raise exception 'fco_ranked_play: không tìm thấy công thức OVR bot cũ để vá'; end if;
  def := replace(def, old_f, new_f);
  def := replace(def, old_q, '');
  execute def;
end;
$$;

commit;
