-- Tách FC tặng khỏi FC nạp trong trang quản trị (2026-11-09). Trước đây mọi lần cộng FC ở "Cộng / trừ FC" và "Nạp FC" đều ghi lý do 'admin'
-- nên bị tính vào "Đã nạp" và doanh thu, kể cả khi admin chỉ tặng (vd. 1.000 FC cho tài khoản mới).
--   · fco_admin_credit thêm p_gift: true thì tặng FC như ô Tặng quà (lý do 'admin_gift', người chơi được báo), không tính vào Đã nạp.
--   · fco_admin_ledger trả thêm id dòng sổ cái.
--   · fco_admin_ledger_mark_gift(id, gift): admin đổi một lần cộng FC đã ghi giữa 'admin' (nạp) và 'admin_gift' (tặng);
--     số dư người chơi không đổi, chỉ đổi cách thống kê. Chỉ áp dụng cho dòng cộng FC (delta > 0) do admin thực hiện.
begin;

drop function public.fco_admin_credit(text, bigint, text);
create function public.fco_admin_credit(p_login text, p_amount bigint, p_note text default '', p_gift boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); login text := lower(trim(coalesce(p_login, ''))); target uuid; b bigint;
begin
  if login = '' then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
  select id into target from auth.users where lower(email) = case when position('@' in login) > 0 then login else login || '@players.fco.invalid' end;
  if target is null then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if coalesce(p_gift, false) then
    -- Tặng: dùng đúng đường của ô Tặng quà (lý do 'admin_gift', có dòng trong fco_admin_gifts để người chơi được báo).
    if p_amount < 0 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
    b := (public.fco_admin_send_gift(target, p_amount, null, null, p_note)->>'fc')::bigint;
  else
    perform public.fco_wallet_lock(target);
    b := public.fco_apply_fc(target, p_amount, 'admin', jsonb_build_object('note', left(coalesce(p_note, ''), 200)), admin_id);
  end if;
  return jsonb_build_object('login', login, 'fc', b);
end;
$$;

-- Như 202611070001, thêm id dòng sổ cái.
create or replace function public.fco_admin_ledger(p_limit integer default 50, p_login text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.fco_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'time', (extract(epoch from l.created_at) * 1000)::bigint, 'login', split_part(u.email, '@', 1),
      'delta', l.delta, 'balance', l.balance, 'reason', l.reason, 'note', l.detail->>'note', 'admin', l.actor is not null) order by l.created_at desc), '[]')
  into result
  from (select * from public.fco_fc_ledger l2
        where p_login is null or l2.user_id = (select id from auth.users where lower(email) = lower(trim(p_login)) || '@players.fco.invalid' or lower(email) = lower(trim(p_login)))
        order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) l
  join auth.users u on u.id = l.user_id;
  return result;
end;
$$;

create function public.fco_admin_ledger_mark_gift(p_id bigint, p_gift boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); r public.fco_fc_ledger; new_reason text := case when p_gift then 'admin_gift' else 'admin' end;
begin
  select * into r from public.fco_fc_ledger where id = p_id for update;
  if not found then raise exception 'FCO_LEDGER_NOT_FOUND' using errcode = 'P0001'; end if;
  if r.delta <= 0 or r.actor is null or r.reason not in ('admin', 'admin_gift') then raise exception 'FCO_LEDGER_NOT_ADMIN_CREDIT' using errcode = '22023'; end if;
  update public.fco_fc_ledger set reason = new_reason,
    detail = detail || jsonb_build_object('reclassified', jsonb_build_object('by', admin_id, 'at', now(), 'from', r.reason))
  where id = p_id;
  return jsonb_build_object('id', p_id, 'reason', new_reason);
end;
$$;

revoke all on function public.fco_admin_credit(text, bigint, text, boolean), public.fco_admin_ledger_mark_gift(bigint, boolean) from public, anon;
grant execute on function public.fco_admin_credit(text, bigint, text, boolean), public.fco_admin_ledger_mark_gift(bigint, boolean) to authenticated;

commit;
