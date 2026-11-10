-- Sửa đồng bộ kho thẻ (2026-11-11, sau 202611100013): Supabase bật safeupdate cho lệnh gọi qua API, chặn DELETE không có WHERE
-- ("DELETE requires a WHERE clause"), nên nút Đồng bộ ở Quản trị FC → Kho thẻ báo lỗi ngay bước đầu. Thêm `where true`.
-- Chỉ định nghĩa lại 2 hàm, không đổi dữ liệu; chạy xong bấm Đồng bộ lại.
begin;

create or replace function public.fco_admin_catalog_begin(p_version text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  if p_version is null or p_version !~ '^[0-9a-f]{64}$' then raise exception 'FCO_CATALOG_INVALID' using errcode = '22023'; end if;
  delete from public.fco_cat_players_next where true;
  delete from public.fco_cat_packs_next where true;
  update public.fco_inventory set staging = p_version where id = 1;
end;
$$;

create or replace function public.fco_admin_catalog_commit(p_version text, p_rules jsonb, p_players integer, p_packs integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin();
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
$$;

commit;
