begin;

-- Mùa EL thêm 1 ô CSA vàng từ +5 (ô "5", người dùng 2026-11-25: "mùa EL lên +5 được thêm 1 chỉ số ẩn vàng nữa") → EL có 3 ô: +5 / +7 / +11.
-- 1) fco_gold_card: viết lại bản 202611250006_fco_gold_extra_naruto.sql, thêm ô "5" (chỉ mùa 'EL', thẻ từ +5). Hai ô trùng một CSA: giữ ô cấp cao hơn.
-- 2) fco_inv_gold: vá bản đang chạy (chỉ đổi danh sách ô hợp lệ thành '5', '7', '11').
-- Chạy sau 202611250006_fco_gold_extra_naruto.sql. Chạy lại được.

create or replace function public.fco_gold_card(p_card jsonb) returns jsonb language plpgsql stable set search_path = '' as $$
declare lv integer := coalesce((p_card->>'level')::integer, 0); season text; pos text; g jsonb := '{}'::jsonb; v text; k text;
  gk_traits constant text[] := array['57', '60', '68'];
  all_traits constant text[] := array['50', '51', '52', '53', '54', '55', '56', '57', '59', '60', '62', '63', '64', '65', '66', '67', '68'];
begin
  if jsonb_typeof(p_card->'gold') <> 'object' then return p_card - 'gold'; end if;
  select cp.season, cp.pos into season, pos from public.fco_cat_players cp where cp.id = (p_card->>'playerId')::integer;
  -- Xét ô cấp cao trước: CSA trùng với ô cao hơn thì bỏ ô thấp.
  foreach k in array array['11', '7', '5'] loop
    v := p_card->'gold'->>k;
    if v is null or not (v = any(all_traits)) or (pos = 'GK') <> (v = any(gk_traits)) then continue; end if;
    if k = '11' and lv < 11 then continue; end if;
    if k = '7' and (lv < 7 or coalesce(season, '') not in ('ICON TM', 'INFINITE PRIME', 'PRIME', 'EL', 'NARUTO')) then continue; end if;
    if k = '5' and (lv < 5 or coalesce(season, '') not in ('EL')) then continue; end if;
    if exists (select 1 from jsonb_each_text(g) e where e.value = v) then continue; end if;
    g := g || jsonb_build_object(k, v);
  end loop;
  return case when g = '{}'::jsonb then p_card - 'gold' else jsonb_set(p_card, '{gold}', g) end;
end;
$$;

do $$
declare def text;
begin
  def := pg_get_functiondef('public.fco_inv_gold(text, text, text)'::regprocedure);
  if position('p_slot not in (''5'', ''7'', ''11'')' in def) = 0 then
    if position('p_slot not in (''7'', ''11'')' in def) = 0 then raise exception 'fco_inv_gold: không tìm thấy danh sách ô để vá'; end if;
    execute replace(def, 'p_slot not in (''7'', ''11'')', 'p_slot not in (''5'', ''7'', ''11'')');
  end if;
end;
$$;

commit;
