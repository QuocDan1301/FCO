begin;

-- Mốc 1.250 → 1.900 vé Shop Đổi Vé VQTG: mọi gói +1 cấp thẻ (2026-11-18, người dùng: "tất cả các gói mốc từ 1250 vé đến 1900 vé đều tăng lên 1 mức thẻ cộng").
--   • 15 gói vqm-* ở các mốc này đổi cấp ngay trong bộ dữ liệu game (src/packs.json) → admin Đồng bộ dữ liệu là máy chủ mở theo cấp mới.
--   • 4 lựa chọn đang dùng chung gói Bi Lắc (không đổi để khỏi ảnh hưởng sự kiện khác) đổi sang bản riêng của VQTG ở cấp mới:
--       mốc 1.250: blm-1150-3 GRU chỉ định 50 (+9)  → vqm-1250-2 GRU chỉ định 50 (+10)
--       mốc 1.500: bl-up26-50 26UP chỉ định 50 (+5) → vqm-1500-2 26UP chỉ định 50 (+6)
--       mốc 1.600: blm-1250-2 WB chỉ định 70 (+8)   → vqm-1600-3 WB chỉ định 70 (+9)
--       mốc 1.900: blm-1250-1 LE chỉ định 70 (+8)   → vqm-1900-1 LE chỉ định 70 (+9)
-- Chạy SAU khi đưa bản game mới lên và admin đã Đồng bộ dữ liệu (gói mới phải có trên máy chủ). Chạy lại được.

do $$
begin
  if (select count(*) from public.fco_cat_packs where id in ('vqm-1250-2', 'vqm-1500-2', 'vqm-1600-3', 'vqm-1900-1')) < 4 then
    raise exception 'Chưa có gói vqm-1250-2 / vqm-1500-2 / vqm-1600-3 / vqm-1900-1 trên máy chủ: đưa bản game mới lên → Quản trị FC → Đồng bộ dữ liệu, rồi chạy lại migration này.';
  end if;
end $$;

update public.fco_vqtg_milestones set options = replace(options::text, '"blm-1150-3"', '"vqm-1250-2"')::jsonb where tickets = 1250;
update public.fco_vqtg_milestones set options = replace(options::text, '"bl-up26-50"', '"vqm-1500-2"')::jsonb where tickets = 1500;
update public.fco_vqtg_milestones set options = replace(options::text, '"blm-1250-2"', '"vqm-1600-3"')::jsonb where tickets = 1600;
update public.fco_vqtg_milestones set options = replace(options::text, '"blm-1250-1"', '"vqm-1900-1"')::jsonb where tickets = 1900;

commit;