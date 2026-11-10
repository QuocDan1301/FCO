-- Xoá tài khoản hàng loạt (2026-11-10): Quản trị FC → Tài khoản, chọn nhiều tài khoản → Xoá. Chạy sau 202611090014.
--   Giống fco_admin_account_delete (202611080008) nhưng cho nhiều tài khoản: theo danh sách p_users, hoặc p_all = true cho mọi
--   tài khoản khớp p_search + p_status (như tạm dừng hàng loạt; phải bật p_all rõ ràng để danh sách rỗng không thành "tất cả").
--   Xoá auth.users nên dữ liệu liên quan xoá theo (on delete cascade), gồm cả sổ cái FC; không khôi phục được.
--   Không xoá tài khoản admin: bỏ qua và báo số bỏ qua.
--   Mỗi lần gọi xoá tối đa 200 tài khoản để không vượt giới hạn thời gian câu lệnh của Supabase;
--   remaining = số tài khoản (không phải admin) còn lại cần xoá, game gọi tiếp cho tới khi bằng 0.
begin;

create function public.fco_admin_accounts_delete(p_users uuid[] default null, p_all boolean default false, p_search text default null, p_status text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  targets uuid[];
  batch uuid[];
  deleted integer := 0;
  skipped_admins integer := 0;
begin
  perform public.fco_require_admin();
  if p_all is null then raise exception 'Invalid delete request' using errcode = '22023'; end if;
  if not p_all and coalesce(cardinality(p_users), 0) = 0 then raise exception 'FCO_NO_ACCOUNTS' using errcode = '22023'; end if;
  if not p_all and cardinality(p_users) > 1000 then raise exception 'FCO_TOO_MANY_ACCOUNTS' using errcode = '22023'; end if;
  select coalesce(array_agg(u.id order by u.created_at, u.id), '{}') into targets from auth.users u
  where case when p_all
    then (q is null or position(q in public.fco_login_name(u.email)) > 0) and public.fco_account_status_match(u.id, p_status)
    else u.id = any(p_users) end;
  select count(*) into skipped_admins from public.fco_admins a where a.user_id = any(targets);
  select coalesce(array_agg(t), '{}') into targets from unnest(targets) t where not exists (select 1 from public.fco_admins a where a.user_id = t);
  batch := targets[1:200];
  delete from auth.users where id = any(batch);
  get diagnostics deleted = row_count;
  return jsonb_build_object('deleted', deleted, 'skippedAdmins', skipped_admins, 'remaining', greatest(cardinality(targets) - cardinality(batch), 0));
end;
$$;

revoke all on function public.fco_admin_accounts_delete(uuid[], boolean, text, text) from public, anon;
grant execute on function public.fco_admin_accounts_delete(uuid[], boolean, text, text) to authenticated;

commit;