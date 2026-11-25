begin;

-- GLXH: trận HOÀ không cộng, không trừ điểm (người dùng 2026-11-25: "khi hòa sẽ không trừ hay cộng điểm").
-- Trước: Elo K = 32, hoà = 0,5 → hoà với đối thủ điểm cao hơn được cộng, thấp hơn bị trừ. Nay hoà luôn ±0 (vẫn đếm vào số trận hoà, vẫn ghi lịch sử).
-- Thắng / thua giữ nguyên (thắng ít nhất +5, thua ít nhất −5). Vá hàm đang chạy fco_ranked_settle (pg_get_functiondef), phần còn lại giữ nguyên.
-- Chạy sau 202611250009_fco_ranked_bot_ovr.sql. Chạy lại được.
-- ĐÃ THAY bằng 202611250011_fco_ranked_draw_light.sql (hoà ± nhẹ): nếu hàm đã có luật 0011 thì file này không làm gì.

do $$
declare def text;
  old_l constant text := 'if result = 1 then delta := greatest(delta, 5); elsif result = 0 then delta := least(delta, -5); end if;';
  new_l constant text := 'if result = 1 then delta := greatest(delta, 5); elsif result = 0 then delta := least(delta, -5); else delta := 0; end if;';
begin
  def := pg_get_functiondef('public.fco_ranked_settle(uuid, integer, integer, text, integer, jsonb, integer, text)'::regprocedure);
  if position(new_l in def) > 0 or position('202611250011' in def) > 0 then return; end if;
  if position(old_l in def) = 0 then raise exception 'fco_ranked_settle: không tìm thấy dòng tính điểm để vá'; end if;
  execute replace(def, old_l, new_l);
end;
$$;

commit;
