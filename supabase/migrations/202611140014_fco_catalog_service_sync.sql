begin;

-- Tự đồng bộ dữ liệu kho thẻ khi deploy (2026-11-14, người dùng hỏi "có cách nào máy chủ tự động đồng bộ không" → "oke"):
-- GitHub Actions (scripts/sync-catalog.ts) gọi 4 hàm đồng bộ bằng khoá service_role (secret SUPABASE_SERVICE_ROLE_KEY trên GitHub).
-- fco_require_catalog_writer: admin trong game HOẶC yêu cầu mang JWT role = service_role (PostgREST đặt request.jwt.claims; JWT ký bởi
-- Supabase nên người chơi không giả được). CHỈ 4 hàm đồng bộ dùng; mọi hàm admin khác vẫn fco_require_admin như cũ. Chạy lại được.

create or replace function public.fco_require_catalog_writer() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role' then return null; end if;
  return public.fco_require_admin();
end;
$$;
revoke all on function public.fco_require_catalog_writer() from public, anon, authenticated;


create or replace function public.fco_admin_catalog_begin(p_version text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.fco_require_catalog_writer();
  if p_version is null or p_version !~ '^[0-9a-f]{64}$' then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  delete from public.fco_cat_players_next where true;
  delete from public.fco_cat_packs_next where true;
  update public.fco_inventory set staging = p_version where id = 1;
end;
$function$;

create or replace function public.fco_admin_catalog_players(p_version text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  perform public.fco_require_catalog_writer();
  if p_version is distinct from (select staging from public.fco_inventory where id = 1) then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  insert into public.fco_cat_players_next(id, name, ovrs, prices, fixed, insurance, wage, pos)
  select (r->>0)::integer, r->>1,
    array(select v::integer from jsonb_array_elements_text(r->2) with ordinality x(v, o) order by o),
    array(select case when v = 'null' then null else v::bigint end from jsonb_array_elements_text(r->3) with ordinality x(v, o) order by o),
    (r->>4)::boolean, (r->>5)::double precision, greatest(0, coalesce((r->>6)::integer, 0)), left(coalesce(nullif(r->>7, ''), 'CM'), 4)
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end;
$function$;

create or replace function public.fco_admin_catalog_packs(p_version text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer;
begin
  perform public.fco_require_catalog_writer();
  if p_version is distinct from (select staging from public.fco_inventory where id = 1) then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  insert into public.fco_cat_packs_next(id, name, label, price, shop, choose, available, players, weights, levels, level_weights, draft, draft_size, draft_level, fixed_levels)
  select r->>'id', r->>'name', r->>'label', (r->>'price')::bigint, (r->>'shop')::boolean, (r->>'choose')::boolean, (r->>'available')::boolean,
    array(select v::integer from jsonb_array_elements_text(r->'players') with ordinality x(v, o) order by o),
    array(select v::double precision from jsonb_array_elements_text(r->'weights') with ordinality x(v, o) order by o),
    array(select v::integer from jsonb_array_elements_text(r->'levels') with ordinality x(v, o) order by o),
    array(select v::double precision from jsonb_array_elements_text(r->'levelWeights') with ordinality x(v, o) order by o),
    array(select v::integer from jsonb_array_elements_text(r->'draft') with ordinality x(v, o) order by o),
    (r->>'draftSize')::integer, (r->>'draftLevel')::integer,
    array(select v::integer from jsonb_array_elements_text(coalesce(r->'fixedLevels', '[]')) with ordinality x(v, o) order by o)
  from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end;
$function$;

create or replace function public.fco_admin_catalog_commit(p_version text, p_rules jsonb, p_players integer, p_packs integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare admin_id uuid := public.fco_require_catalog_writer();
begin
  if p_version is distinct from (select staging from public.fco_inventory where id = 1) or jsonb_typeof(p_rules) <> 'object'
     or (select count(*) from public.fco_cat_players_next) <> p_players or (select count(*) from public.fco_cat_packs_next) <> p_packs then
    raise exception 'FCO_CATALOG_INVALID' using errcode = '22023';
  end if;
  delete from public.fco_cat_players where true;
  delete from public.fco_cat_packs where true;
  insert into public.fco_cat_players select * from public.fco_cat_players_next;
  insert into public.fco_cat_packs select * from public.fco_cat_packs_next;
  delete from public.fco_cat_players_next where true;
  delete from public.fco_cat_packs_next where true;
  update public.fco_inventory set version = p_version, rules = p_rules, synced_at = now(), synced_by = admin_id, staging = null where id = 1;
  return public.fco_inventory_state();
end;
$function$;

-- Supabase luôn có role service_role (máy thử PGlite thì không).
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.fco_admin_catalog_begin(text), public.fco_admin_catalog_players(text, jsonb), public.fco_admin_catalog_packs(text, jsonb), public.fco_admin_catalog_commit(text, jsonb, integer, integer), public.fco_inventory_state() to service_role';
  end if;
end $$;

commit;
