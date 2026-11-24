-- Penalty đối kháng: thủ môn chỉ bắt được khi điểm bay người VỚI TỚI bóng (người dùng 2026-11-24: "lỗi PvP đá vào khung thành nhưng vẫn tính là
-- bị bắt bóng").
--   · Trước (202611240006): dùng tỉ lệ của Penalty một người (fco_penalty_keep_chance, tối thiểu 5%, thủ môn đứng giữa vẫn cản 37% quả sút góc) →
--     thủ môn bay một hướng, bóng vào lưới chỗ khác mà vẫn tính "BỊ BẮT".
--   · Nay: d = khoảng cách điểm bay người tới điểm sút (lệch ngang × 1,2, lệch dọc × 0,6, cùng thước như Penalty thường).
--     Tỉ lệ cản = 0,9 × min(1, max(0, (0,55 − d) / 0,35)) × hệ số kiểu sút (mạnh 0,85 · trivela 0,92 · cứa góc 0,88 / cứa giữa 1,05), tối đa 90%.
--     d ≤ 0,2 (bay đúng chỗ): 90%; bay đúng bên nhưng khác độ cao (d ≈ 0,33): ~57%; d ≥ 0,55 (sai hướng / đứng giữa khi bóng vào góc): 0% — chắc chắn vào.
--   · Sút hỏng (3% + rủi ro theo điểm / kiểu sút) giữ nguyên. Khớp src/pvp.ts (pvpSaveChance) — tests/pvp.test.ts.
--   Chạy SAU 202611240011_fco_voucher_percent_of_tax.sql. Chạy lại được.
begin;

create or replace function public.fco_pvp_save_chance(p_shot jsonb, p_dive jsonb) returns double precision language sql immutable set search_path = '' as $$
  select least(.9, .9 * least(1, greatest(0, (.55 - sqrt(power(1.2 * ((p_shot->>'x')::double precision - (p_dive->>'x')::double precision), 2)
      + power(.6 * ((p_shot->>'y')::double precision - (p_dive->>'y')::double precision), 2))) / .35))
    * case coalesce(p_shot->>'kind', 'normal') when 'power' then .85 when 'trivela' then .92
        when 'curl' then case when abs((p_shot->>'x')::double precision) > .6 then .88 else 1.05 end else 1 end)
$$;

create or replace function public.fco_pvp_kick(p_shot jsonb, p_dive jsonb) returns text language plpgsql volatile set search_path = '' as $$
declare sx double precision := (p_shot->>'x')::double precision; sy double precision := (p_shot->>'y')::double precision;
  kind text := coalesce(p_shot->>'kind', 'normal');
begin
  if random() < .03 + public.fco_penalty_miss_chance(sx, sy, kind) then return 'miss'; end if;
  return case when random() < public.fco_pvp_save_chance(p_shot, p_dive) then 'save' else 'goal' end;
end;
$$;

revoke all on function public.fco_pvp_save_chance(jsonb, jsonb), public.fco_pvp_kick(jsonb, jsonb) from public, anon, authenticated;

commit;
