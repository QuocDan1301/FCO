begin;

-- GLXH: trận HOÀ cộng / trừ NHẸ theo chênh điểm (người dùng 2026-11-25: "Hòa đối thủ thấp điểm hơn thì bị trừ điểm nhẹ,
-- hòa đối thủ cao điểm hơn thì cũng được cộng điểm nhẹ"). Thay cho 202611250010_fco_ranked_draw_zero.sql (hoà ±0).
-- Hoà: điểm = 16 × (0,5 − kỳ vọng Elo), làm tròn, chặn ±5 (một nửa mức Elo cũ K = 32, mức cũ tới ±13–16).
--   Cùng điểm: 0; đối thủ hơn 100 điểm: +2; hơn 200: +4; hơn từ 260: +5. Thấp hơn thì trừ tương ứng.
-- Thắng / thua giữ nguyên (thắng ít nhất +5, thua ít nhất −5). Vá hàm đang chạy fco_ranked_settle (pg_get_functiondef), chạy được dù đã
-- hay chưa chạy 202611250010. Chạy sau 202611250010_fco_ranked_draw_zero.sql (hoặc thay nó). Chạy lại được.

do $$
declare def text;
  orig_l constant text := 'if result = 1 then delta := greatest(delta, 5); elsif result = 0 then delta := least(delta, -5); end if;';
  zero_l constant text := 'if result = 1 then delta := greatest(delta, 5); elsif result = 0 then delta := least(delta, -5); else delta := 0; end if;';
  new_l constant text := 'if result = 1 then delta := greatest(delta, 5); elsif result = 0 then delta := least(delta, -5); else delta := greatest(-5, least(5, round(16 * (result - expected))::integer)); end if;  -- 202611250011: hoà ± nhẹ';
begin
  def := pg_get_functiondef('public.fco_ranked_settle(uuid, integer, integer, text, integer, jsonb, integer, text)'::regprocedure);
  if position(new_l in def) > 0 then return; end if;
  if position(zero_l in def) > 0 then def := replace(def, zero_l, new_l);
  elsif position(orig_l in def) > 0 then def := replace(def, orig_l, new_l);
  else raise exception 'fco_ranked_settle: không tìm thấy dòng tính điểm để vá'; end if;
  execute def;
end;
$$;

commit;
