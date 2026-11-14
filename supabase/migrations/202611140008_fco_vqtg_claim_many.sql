begin;

-- Shop Đổi Vé VQTG (2026-11-14, người dùng: "chọn gói mốc nhanh khi người chơi có từ 3 lượt chọn quà trở lên"):
-- nhận nhiều lượt của một mốc trong một lần gọi. p_choices = lựa chọn của từng lượt (0.. theo options; mốc 1 lựa chọn thì mọi phần tử 0),
-- tối đa số lượt còn lại và 100 lượt / lần. Một giao dịch: kiểm tra như fco_vqtg_claim (202611130009), cộng claimed theo số lượt,
-- gộp quà cùng loại (gói cùng id, BP, FC, phiếu thuế cùng %) rồi cấp một lần. Chạy lại được.

create or replace function public.fco_vqtg_claim_many(p_index integer, p_choices integer[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; m public.fco_vqtg_milestones;
  round_size bigint; reached bigint; done integer; n integer := coalesce(array_length(p_choices, 1), 0); opts integer;
  raw jsonb := '[]'; rewards jsonb; fc bigint; claimed integer[]; granted jsonb; c integer;
begin
  if n < 1 or n > 100 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  select * into m from public.fco_vqtg_milestones where idx = p_index;
  if not found then raise exception 'FCO_MILESTONE_UNKNOWN' using errcode = '22023'; end if;
  if m.paid_only and not public.fco_vqtg_paid(uid) then raise exception 'FCO_MILESTONE_PAID_ONLY' using errcode = 'P0001'; end if;
  select max(tickets) into round_size from public.fco_vqtg_milestones;
  reached := case when w.vqtg_tickets < m.tickets then 0 when m.once then 1 else 1 + (w.vqtg_tickets - m.tickets) / round_size end;
  done := coalesce(w.vqtg_claimed[p_index + 1], 0);
  if reached = 0 then raise exception 'FCO_MILESTONE_LOCKED' using errcode = 'P0001'; end if;
  if done + n > reached then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  opts := jsonb_array_length(m.options);
  foreach c in array p_choices loop
    if c is null or c < 0 or c >= opts then raise exception 'FCO_MILESTONE_CHOICE' using errcode = '22023'; end if;
    raw := raw || (m.options -> c);
  end loop;
  -- Gộp quà cùng loại để kho / lịch sử ghi gọn (vd. 5 × gói A → gói A x5).
  rewards := coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('pack', r->>'pack', 'count', sum(coalesce((r->>'count')::bigint, 1))) x from jsonb_array_elements(raw) r where r ? 'pack' group by r->>'pack'
      union all select jsonb_build_object('bp', sum((r->>'bp')::bigint)) from jsonb_array_elements(raw) r where r ? 'bp' having count(*) > 0
      union all select jsonb_build_object('fc', sum((r->>'fc')::bigint)) from jsonb_array_elements(raw) r where r ? 'fc' having count(*) > 0
      union all select jsonb_build_object('voucher', (r->>'voucher')::integer, 'count', sum(coalesce((r->>'count')::bigint, 1))) from jsonb_array_elements(raw) r where r ? 'voucher' group by (r->>'voucher')::integer
      union all select r from jsonb_array_elements(raw) r where not (r ? 'pack' or r ? 'bp' or r ? 'fc' or r ? 'voucher')) t), '[]');
  claimed := array(select case when i = p_index + 1 then done + n else coalesce(w.vqtg_claimed[i], 0) end
                   from generate_series(1, greatest(coalesce(array_upper(w.vqtg_claimed, 1), 0), p_index + 1)) i order by i);
  update public.fco_wallets set vqtg_claimed = claimed where user_id = uid;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(rewards) r where r ? 'fc';
  if fc > 0 then perform public.fco_apply_fc(uid, fc, 'vqtg_milestone', jsonb_build_object('index', p_index, 'count', n)); end if;
  granted := public.fco_inv_grant(uid, rewards, 'event', 'Vòng Quanh Thế Giới · Quà mốc ' || m.tickets || ' vé' || case when n > 1 then ' × ' || n else '' end,
    concat_ws(', ', nullif(public.fco_inv_reward_text(rewards), ''),
      (select string_agg('Phiếu giảm giá thuế các mùa ' || (r->>'voucher') || '%' || case when (r->>'count')::integer > 1 then ' x ' || (r->>'count') else '' end, ', ')
         from jsonb_array_elements(rewards) r where r ? 'voucher')));
  return jsonb_build_object('rewards', rewards, 'count', n, 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;
revoke all on function public.fco_vqtg_claim_many(integer, integer[]) from public, anon;
grant execute on function public.fco_vqtg_claim_many(integer, integer[]) to authenticated;

commit;