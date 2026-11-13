-- Admin tặng quà hàng loạt (2026-11-13, sau 202611130001): Quản trị → Tài khoản, chọn nhiều tài khoản (hoặc mọi tài khoản khớp
-- tìm kiếm + bộ lọc) → Tặng quà. Giống fco_admin_send_gift (202611090002): FC cộng vào ví ngay (lý do 'admin_gift', không tính
-- doanh thu), gói nằm chờ trong fco_admin_gifts để game tự nhận.
--   · Mỗi lần gọi tặng tối đa 200 tài khoản (giới hạn thời gian câu lệnh của Supabase); remaining = số còn lại, game gọi tiếp tới 0.
--   · p_batch (game tạo ngẫu nhiên cho mỗi lần bấm): tài khoản đã có quà của đợt này thì bỏ qua → gọi lại / mất mạng giữa chừng không tặng trùng.
begin;

alter table public.fco_admin_gifts add column if not exists batch uuid;
create index if not exists fco_admin_gifts_batch on public.fco_admin_gifts(batch, user_id) where batch is not null;

create function public.fco_admin_gift_bulk(p_batch uuid, p_users uuid[] default null, p_all boolean default false, p_search text default null, p_status text default null,
  p_fc bigint default null, p_pack text default null, p_count integer default null, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin_id uuid := public.fco_require_admin();
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  note text := left(trim(coalesce(p_note, '')), 200);
  reward jsonb;
  targets uuid[];
  batch uuid[];
  t uuid;
begin
  if p_batch is null or p_all is null then raise exception 'Invalid gift request' using errcode = '22023'; end if;
  if not p_all and coalesce(cardinality(p_users), 0) = 0 then raise exception 'FCO_NO_ACCOUNTS' using errcode = '22023'; end if;
  if not p_all and cardinality(p_users) > 5000 then raise exception 'FCO_TOO_MANY_ACCOUNTS' using errcode = '22023'; end if;
  if (p_fc is null) = (p_pack is null) then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
  if p_fc is not null then
    if p_fc <= 0 or p_fc > 1000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
    reward := jsonb_build_object('fc', p_fc);
  else
    if p_pack !~ '^[A-Za-z0-9._-]{1,64}$' or p_count is null or p_count < 1 or p_count > 1000 then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
    reward := jsonb_build_object('pack', p_pack, 'count', p_count);
  end if;
  select coalesce(array_agg(u.id order by u.created_at, u.id), '{}') into targets from auth.users u
  where (case when p_all
      then (q is null or position(q in public.fco_login_name(u.email)) > 0) and public.fco_account_status_match(u.id, p_status)
      else u.id = any(p_users) end)
    and not exists (select 1 from public.fco_admin_gifts g where g.batch = p_batch and g.user_id = u.id);
  batch := targets[1:200];
  foreach t in array batch loop
    if p_fc is not null then
      perform public.fco_wallet_lock(t);
      perform public.fco_apply_fc(t, p_fc, 'admin_gift', jsonb_build_object('note', note, 'batch', p_batch), admin_id);
    end if;
    insert into public.fco_admin_gifts(user_id, rewards, note, actor, batch) values (t, jsonb_build_array(reward), note, admin_id, p_batch);
  end loop;
  return jsonb_build_object('sent', cardinality(batch), 'remaining', greatest(cardinality(targets) - cardinality(batch), 0),
    'total', (select count(*) from public.fco_admin_gifts g where g.batch = p_batch));
end;
$$;

revoke all on function public.fco_admin_gift_bulk(uuid, uuid[], boolean, text, text, bigint, text, integer, text) from public, anon;
grant execute on function public.fco_admin_gift_bulk(uuid, uuid[], boolean, text, text, bigint, text, integer, text) to authenticated;

commit;
