begin;

-- Mùa NARUTO được thêm ô CSA vàng +7 như ICON TM / INFINITE PRIME / PRIME / EL (người dùng 2026-11-25: "mùa naruto lên mức +7 cũng sẽ được thêm 1 csa vàng").
-- Viết lại fco_gold_card của 202611160006_fco_gold_extra.sql, chỉ thêm 'NARUTO' vào danh sách mùa có ô "7". Chạy sau 202611250005_fco_naruto_real_madrid.sql. Chạy lại được.

create or replace function public.fco_gold_card(p_card jsonb) returns jsonb language plpgsql stable set search_path = '' as $$
declare lv integer := coalesce((p_card->>'level')::integer, 0); season text; pos text; g jsonb := '{}'::jsonb; v text; k text;
  gk_traits constant text[] := array['57', '60', '68'];
  all_traits constant text[] := array['50', '51', '52', '53', '54', '55', '56', '57', '59', '60', '62', '63', '64', '65', '66', '67', '68'];
begin
  if jsonb_typeof(p_card->'gold') <> 'object' then return p_card - 'gold'; end if;
  select cp.season, cp.pos into season, pos from public.fco_cat_players cp where cp.id = (p_card->>'playerId')::integer;
  foreach k in array array['7', '11'] loop
    v := p_card->'gold'->>k;
    if v is null or not (v = any(all_traits)) or (pos = 'GK') <> (v = any(gk_traits)) then continue; end if;
    if k = '11' and lv < 11 then continue; end if;
    if k = '7' and (lv < 7 or coalesce(season, '') not in ('ICON TM', 'INFINITE PRIME', 'PRIME', 'EL', 'NARUTO')) then continue; end if;
    g := g || jsonb_build_object(k, v);
  end loop;
  -- Hai ô cùng một CSA: giữ ô +11.
  if g ? '7' and g ? '11' and g->>'7' = g->>'11' then g := g - '7'; end if;
  return case when g = '{}'::jsonb then p_card - 'gold' else jsonb_set(p_card, '{gold}', g) end;
end;
$$;

commit;
