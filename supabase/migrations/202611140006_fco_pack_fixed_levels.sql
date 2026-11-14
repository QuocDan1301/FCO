begin;

-- Quà Top 1–5 sự kiện "Đập 8 liền tay" (2026-11-14, người dùng): gói MULTI EL · CU · UT · CC N+ (+8), riêng thẻ EL luôn +1.
-- Gói có thể đặt cấp cố định theo mùa (seasonLevels trong src/packs.json); game gửi lên khi đồng bộ dữ liệu dưới dạng fixedLevels
-- (cùng thứ tự players, 0 = rút cấp theo bảng). Máy chủ: thêm cột fixed_levels, nhận cột khi đồng bộ, mở gói thì ưu tiên cấp cố định.
-- Sau khi chạy: deploy game rồi admin bấm Đồng bộ ở Quản trị FC. Chạy lại được.

alter table public.fco_cat_packs add column if not exists fixed_levels integer[] not null default '{}';
alter table public.fco_cat_packs_next add column if not exists fixed_levels integer[] not null default '{}';

create or replace function public.fco_admin_catalog_packs(p_version text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.fco_require_admin();
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
$$;

create or replace function public.fco_inv_open(p_catalog text, p_packs text[], p_count integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  max_open integer := (rules->>'maxOpen')::integer; pk public.fco_cat_packs; pack_id text; seen text[] := '{}';
  stock bigint; n integer; total integer := 0; fresh jsonb; all_cards jsonb := '[]'; first_pack text; card jsonb; k integer;
begin
  if p_packs is null or coalesce(array_length(p_packs, 1), 0) = 0 then raise exception 'FCO_NO_PACKS' using errcode = 'P0001'; end if;
  if p_count is not null and (array_length(p_packs, 1) <> 1 or p_count < 1 or p_count > max_open) then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  foreach pack_id in array p_packs loop
    exit when total >= max_open;
    continue when pack_id = any(seen);
    seen := seen || pack_id;
    select * into pk from public.fco_cat_packs where id = pack_id;
    if not found or not pk.available then
      if p_count is not null then raise exception 'FCO_PACK_UNAVAILABLE' using errcode = 'P0001'; end if;
      continue;
    end if;
    if pk.choose then
      if p_count is not null then raise exception 'FCO_CHOOSE_PACK' using errcode = 'P0001'; end if;
      continue;
    end if;
    stock := public.fco_inv_stock(d, pack_id);
    if p_count is not null then
      if p_count > stock then raise exception 'FCO_NOT_ENOUGH_PACKS' using errcode = 'P0001'; end if;
      n := p_count;
    else n := least(stock, max_open - total); end if;
    continue when n < 1;
    fresh := '[]';
    for i in 1 .. n loop
      k := public.fco_inv_pick(pk.weights);
      -- Cấp cố định theo cầu thủ (seasonLevels của gói, vd. thẻ EL luôn +1); 0 / không có = rút theo bảng cấp.
      card := public.fco_inv_new_card(pk.players[k], coalesce(nullif(pk.fixed_levels[k], 0), pk.levels[public.fco_inv_pick(pk.level_weights)]));
      fresh := fresh || jsonb_build_array(card);
    end loop;
    d := public.fco_inv_set_stock(d, pack_id, stock - n);
    d := d || jsonb_build_object('cards', fresh || coalesce(d->'cards', '[]'), 'opened', coalesce((d->>'opened')::bigint, 0) + n);
    d := public.fco_inv_history(d, 'pack', 'Mở ' || n || ' ' || pk.label, public.fco_inv_best(fresh));
    all_cards := all_cards || fresh;
    total := total + n;
    first_pack := coalesce(first_pack, pack_id);
  end loop;
  if total = 0 then raise exception 'FCO_NO_PACKS' using errcode = 'P0001'; end if;
  return jsonb_build_object('cards', all_cards, 'pack', first_pack, 'save', public.fco_inv_store(uid, d));
end;
$$;

commit;
