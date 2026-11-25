begin;

-- Giới hạn kho thẻ 200 → 500 (người dùng 2026-11-25: "Tăng giới hạn cầu thủ trong kho lên 500"). Viết lại trigger của
-- 202611230002_fco_inventory_cap.sql: chỉ chặn khi số thẻ TĂNG và vượt 500; bán / xoá / đập luôn được.
-- Danh sách miễn (fco_inv_cap_exempt, tài khoản >200 thẻ lúc áp dụng giới hạn cũ) và acc phụ vẫn được miễn như cũ.
-- Game: src/game.ts INVENTORY_CARD_CAP = 500. Chạy sau 202611250011_fco_ranked_draw_light.sql. Chạy lại được.

create or replace function public.fco_inv_cap_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare n_new integer; n_old integer;
begin
  n_new := case when jsonb_typeof(new.data->'cards') = 'array' then jsonb_array_length(new.data->'cards') else 0 end;
  if n_new <= 500 then return new; end if;
  n_old := case when jsonb_typeof(old.data->'cards') = 'array' then jsonb_array_length(old.data->'cards') else 0 end;
  if n_new <= n_old then return new; end if;
  if exists (select 1 from public.fco_inv_cap_exempt x where x.user_id = new.user_id) or public.fco_is_sub(new.user_id) then return new; end if;
  raise exception 'FCO_INVENTORY_FULL' using errcode = 'P0001';
end;
$$;
revoke all on function public.fco_inv_cap_guard() from public, anon, authenticated;

commit;
