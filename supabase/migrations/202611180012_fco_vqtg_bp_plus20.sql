begin;

-- Vòng Quanh Thế Giới: BP tươi nhận khi chơi +20% (người dùng 2026-11-18: "Tăng số bp tươi nhận khi chơi sự kiện lên 20%").
--   • Quà BP ở các ô (fco_vqtg_tiles.rewards, quà ô từ quaracvqtg 202611130005): mọi mục {"bp": N} → N × 1,2 (vd 22 tr → 26,4 tr; 80 tr → 96 tr).
--     Tỷ lệ ra từng quà giữ nguyên. Chặn chạy lại nhân chồng: chỉ đổi khi ô 1 còn mức cũ 22.000.000.
--   • Mini Jackpot (ô 10): BP = quỹ Jackpot FC × bpPerJackpotFc: 5.000.000 → 6.000.000 (1.000 FC quỹ → 6B BP, trước 5B).
--   • Không đổi: gói quà ở ô, vé, Giải Đặc Biệt (FC), Shop Đổi Vé (mốc), Đua top. Game hiển thị: src/vqtg.ts VQTG_RULES.bpPerJackpotFc.
-- Chạy lại được.

do $$
begin
  if exists (select 1 from public.fco_vqtg_tiles where idx = 1 and rewards @> '[{"bp": 22000000}]'::jsonb) then
    update public.fco_vqtg_tiles t set rewards = (
      select jsonb_agg(case when r ? 'bp' then jsonb_set(r, '{bp}', to_jsonb(round((r->>'bp')::numeric * 1.2)::bigint)) else r end order by ord)
      from jsonb_array_elements(t.rewards) with ordinality x(r, ord))
    where jsonb_typeof(t.rewards) = 'array' and exists (select 1 from jsonb_array_elements(t.rewards) r where r ? 'bp');
  end if;
end $$;

create or replace function public.fco_vqtg_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'prices', '[{"count":1,"price":18},{"count":10,"price":190},{"count":50,"price":900}]'::jsonb,
    'bpPerJackpotFc', 6000000, -- Mini Jackpot (ô 10) = quỹ Jackpot FC × 6.000.000 BP (1.000 FC → 6B BP; +20% từ 202611180012)
    'bpChance', 0.06,         -- dừng ô 10 (Mini Jackpot = quỹ BP): 6 % trúng cả quỹ
    'rollTickets', '[1,2,2,2,3,6]'::jsonb)  -- vé theo số lắc 1..6 (vé in cạnh số trên vòng quay)
$$;

select idx, rewards from public.fco_vqtg_tiles where exists (select 1 from jsonb_array_elements(rewards) r where r ? 'bp') order by idx;

commit;