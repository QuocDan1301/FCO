begin;

-- Sửa lỗi "Mini · Bạn · 0 BP" (2026-11-13): máy chủ thiếu hằng số bpPerJackpotFc (fco_vqtg_rules của 202611130011 chưa chạy hoặc bị
-- 202611130010 chạy sau ghi đè) → Mini Jackpot ô 10 tính ra null → quà {"bp": null} → fco_inv_grant cộng null làm số BP (balance) của
-- người trúng thành null (mất BP, bản lưu không hợp lệ).
--   1. fco_vqtg_rules đầy đủ (giá lượt, bpChance, bpPerJackpotFc, rollTickets) — đặt lại bất kể thứ tự đã chạy.
--   2. fco_inv_grant bỏ qua số rỗng (BP / số gói / số phiếu null tính là 0) để lỗi kiểu này không xoá BP nữa.
--   3. Bản lưu có balance không phải số → đặt 0 (NOTICE in id tài khoản bị ảnh hưởng để admin bù BP); bỏ tin Mini Jackpot 0 / rỗng.
-- Chạy lại được.

-- 1. Như 202611130011.
create or replace function public.fco_vqtg_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'prices', '[{"count":1,"price":18},{"count":10,"price":190},{"count":50,"price":900}]'::jsonb,
    'bpPerJackpotFc', 5000000, -- Mini Jackpot (ô 10) = quỹ Jackpot FC × 5.000.000 BP (1.000 FC → 5B BP)
    'bpChance', 0.06,         -- dừng ô 10 (Mini Jackpot = quỹ BP): 6 % trúng cả quỹ
    'rollTickets', '[1,2,2,2,3,6]'::jsonb)  -- vé theo số lắc 1..6 (vé in cạnh số trên vòng quay)
$$;

-- 2. Như 202611110007, số rỗng tính là 0.
create or replace function public.fco_inv_grant(p_uid uuid, p_rewards jsonb, p_type text, p_title text, p_detail text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare d jsonb; r jsonb; bp bigint := 0;
begin
  if not public.fco_inv_server_owned(p_uid) then return null; end if;
  d := public.fco_inv_lock(p_uid);
  for r in select value from jsonb_array_elements(coalesce(p_rewards, '[]')) loop
    if r ? 'jackpot' or r ? 'fc' then continue; end if;
    if r ? 'bp' then bp := bp + coalesce((r->>'bp')::bigint, 0);
    elsif r ? 'pack' then d := public.fco_inv_set_stock(d, r->>'pack', public.fco_inv_stock(d, r->>'pack') + coalesce((r->>'count')::bigint, 0));
    elsif r ? 'voucher' then d := public.fco_inv_set_voucher(d, (r->>'voucher')::integer, public.fco_inv_voucher(d, (r->>'voucher')::integer) + coalesce((r->>'count')::bigint, 0));
    end if;
  end loop;
  d := d || jsonb_build_object('balance', coalesce((d->>'balance')::bigint, 0) + bp);
  d := public.fco_inv_history(d, p_type, p_title, p_detail);
  return public.fco_inv_store(p_uid, d);
end;
$$;

-- 3. Sửa dữ liệu hỏng.
do $$
declare ids text;
begin
  select string_agg(user_id::text, ', ') into ids from public.fco_game_saves where jsonb_typeof(data->'balance') is distinct from 'number';
  if ids is not null then raise notice 'Tài khoản bị mất BP (đặt lại 0, cần admin bù): %', ids; end if;
end $$;
update public.fco_game_saves set data = jsonb_set(data, '{balance}', '0'), revision = revision + 1, updated_at = now()
  where jsonb_typeof(data->'balance') is distinct from 'number';
update public.fco_vqtg_state set feed = coalesce((select jsonb_agg(e order by n) from jsonb_array_elements(feed) with ordinality t(e, n)
  where jsonb_typeof(e->'amount') = 'number' and (e->>'amount')::bigint > 0), '[]'::jsonb) where id = 1;

commit;
