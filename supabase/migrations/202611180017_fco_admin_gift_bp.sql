begin;

-- Admin tặng BP (người dùng 2026-11-18: "Thêm chức năng tặng bp cho người chơi").
--   fco_admin_send_gift / fco_admin_gift_bulk thêm p_bp: quà {bp} vào hàng chờ fco_admin_gifts như gói; game tự nhận vào kho
--   (fco_inv_claim_gifts → fco_inv_grant, lịch sử "Quà từ Admin"). Mỗi lần ≤ 10^15 BP mỗi tài khoản.
--   Là quà: không ghi sổ nạp BP (fco_bp_topups), không tính doanh thu, không tính Top Đặc Huấn.
--   Hàm chép nguyên bản đang chạy, chỉ thêm loại quà BP; game cũ (không gửi p_bp) vẫn chạy.
-- Chạy lại được.

drop function if exists public.fco_admin_send_gift(uuid, bigint, text, integer, text);
drop function if exists public.fco_admin_gift_bulk(uuid, uuid[], boolean, text, text, bigint, text, integer, text);

CREATE OR REPLACE FUNCTION public.fco_admin_send_gift(p_user uuid, p_fc bigint DEFAULT NULL::bigint, p_pack text DEFAULT NULL::text, p_count integer DEFAULT NULL::integer, p_note text DEFAULT ''::text, p_bp bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  admin_id uuid := public.fco_require_admin();
  note text := left(trim(coalesce(p_note, '')), 200);
  reward jsonb;
  balance bigint;
  gift_id bigint;
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if (p_fc is not null)::int + (p_pack is not null)::int + (p_bp is not null)::int <> 1 then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
  if p_bp is not null then
    -- BP: vào hàng chờ Quà từ Admin như gói, game nhận vào kho (fco_inv_claim_gifts) trong ≤ 60 giây khi người chơi đang online.
    if p_bp <= 0 or p_bp > 1000000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
    reward := jsonb_build_object('bp', p_bp);
  elsif p_fc is not null then
    if p_fc <= 0 or p_fc > 1000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
    perform public.fco_wallet_lock(p_user);
    balance := public.fco_apply_fc(p_user, p_fc, 'admin_gift', jsonb_build_object('note', note), admin_id);
    reward := jsonb_build_object('fc', p_fc);
  else
    if p_pack !~ '^[A-Za-z0-9._-]{1,64}$' or p_count is null or p_count < 1 or p_count > 1000 then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
    reward := jsonb_build_object('pack', p_pack, 'count', p_count);
  end if;
  insert into public.fco_admin_gifts(user_id, rewards, note, actor) values (p_user, jsonb_build_array(reward), note, admin_id) returning id into gift_id;
  return jsonb_build_object('id', gift_id, 'fc', balance);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fco_admin_gift_bulk(p_batch uuid, p_users uuid[] DEFAULT NULL::uuid[], p_all boolean DEFAULT false, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_fc bigint DEFAULT NULL::bigint, p_pack text DEFAULT NULL::text, p_count integer DEFAULT NULL::integer, p_note text DEFAULT ''::text, p_bp bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if (p_fc is not null)::int + (p_pack is not null)::int + (p_bp is not null)::int <> 1 then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
  if p_bp is not null then
    if p_bp <= 0 or p_bp > 1000000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
    reward := jsonb_build_object('bp', p_bp);
  elsif p_fc is not null then
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
$function$;

revoke all on function public.fco_admin_send_gift(uuid, bigint, text, integer, text, bigint), public.fco_admin_gift_bulk(uuid, uuid[], boolean, text, text, bigint, text, integer, text, bigint) from public, anon;
grant execute on function public.fco_admin_send_gift(uuid, bigint, text, integer, text, bigint), public.fco_admin_gift_bulk(uuid, uuid[], boolean, text, text, bigint, text, integer, text, bigint) to authenticated;

commit;
