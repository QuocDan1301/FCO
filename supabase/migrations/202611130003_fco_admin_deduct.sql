-- Admin trừ FC (2026-11-13, sau 202611130002): Quản trị → Tài khoản → Quản lý → "Trừ FC", hoặc chọn nhiều tài khoản → "Trừ FC".
-- Khác ô "Cộng / trừ FC" nhập số âm (lý do 'admin' = sửa nạp nhầm, làm giảm Đã nạp và doanh thu): ở đây ghi lý do riêng
-- 'admin_deduct' (thu hồi / phạt), không đụng Đã nạp, doanh thu, và không tính là người chơi "Đã dùng".
--   · p_clamp = false: tài khoản không đủ số FC cần trừ thì bỏ qua (skipped). true: không đủ thì trừ hết số đang có.
--   · Mỗi lần gọi tối đa 200 tài khoản; remaining = số còn lại, game gọi tiếp tới 0.
--   · p_batch (game tạo ngẫu nhiên cho mỗi lần bấm): tài khoản đã bị trừ trong đợt này thì bỏ qua → gọi lại không trừ hai lần.
--   · "Tất cả khớp bộ lọc" (p_all) bỏ qua tài khoản admin.
begin;

create index if not exists fco_fc_ledger_deduct_batch on public.fco_fc_ledger ((detail->>'batch'), user_id) where reason = 'admin_deduct';

create function public.fco_admin_deduct(p_batch uuid, p_amount bigint, p_users uuid[] default null, p_all boolean default false, p_search text default null,
  p_status text default null, p_clamp boolean default false, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin_id uuid := public.fco_require_admin();
  q text := nullif(lower(trim(coalesce(p_search, ''))), '');
  note text := left(trim(coalesce(p_note, '')), 200);
  clamp boolean := coalesce(p_clamp, false);
  need bigint;
  targets uuid[];
  batch uuid[];
  skipped integer;
  t uuid;
  w public.fco_wallets;
  take bigint;
  balance bigint := null;
  processed integer := 0;
  taken bigint := 0;
begin
  if p_batch is null or p_all is null then raise exception 'Invalid deduct request' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
  if not p_all and coalesce(cardinality(p_users), 0) = 0 then raise exception 'FCO_NO_ACCOUNTS' using errcode = '22023'; end if;
  if not p_all and cardinality(p_users) > 5000 then raise exception 'FCO_TOO_MANY_ACCOUNTS' using errcode = '22023'; end if;
  need := case when clamp then 1 else p_amount end;
  with picked as (
    select u.id, u.created_at from auth.users u
    where (case when p_all
        then (q is null or position(q in public.fco_login_name(u.email)) > 0) and public.fco_account_status_match(u.id, p_status)
          and not exists (select 1 from public.fco_admins a where a.user_id = u.id)
        else u.id = any(p_users) end)
      and not exists (select 1 from public.fco_fc_ledger l where l.reason = 'admin_deduct' and l.detail->>'batch' = p_batch::text and l.user_id = u.id))
  select coalesce(array_agg(p.id order by p.created_at, p.id) filter (where w2.fc >= need), '{}'), count(*) filter (where w2.fc is null or w2.fc < need)
  into targets, skipped
  from picked p left join public.fco_wallets w2 on w2.user_id = p.id;
  batch := targets[1:200];
  foreach t in array batch loop
    w := public.fco_wallet_lock(t);
    -- Số dư có thể vừa đổi sau lúc chọn: không còn đủ thì bỏ qua (lần gọi sau tính vào skipped).
    if w.fc is null or w.fc < need then continue; end if;
    take := least(p_amount, w.fc);
    balance := public.fco_apply_fc(t, -take, 'admin_deduct', jsonb_build_object('note', note, 'batch', p_batch, 'requested', p_amount), admin_id);
    processed := processed + 1; taken := taken + take;
  end loop;
  return jsonb_build_object('deducted', processed, 'fc', taken, 'balance', balance, 'skipped', skipped,
    'remaining', greatest(cardinality(targets) - cardinality(batch), 0),
    'done', (select count(*) from public.fco_fc_ledger l where l.reason = 'admin_deduct' and l.detail->>'batch' = p_batch::text),
    'doneFc', (select coalesce(-sum(l.delta), 0) from public.fco_fc_ledger l where l.reason = 'admin_deduct' and l.detail->>'batch' = p_batch::text));
end;
$$;

-- Như 202611080010, thêm: FC bị admin trừ không tính là người chơi đã dùng.
create or replace function public.fco_my_fc_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); result jsonb;
begin
  select jsonb_build_object(
    'topup', greatest(coalesce(sum(delta) filter (where reason = 'admin'), 0), 0),
    'spent', coalesce(-sum(delta) filter (where delta < 0 and reason not in ('admin', 'reset', 'admin_deduct')), 0))
  into result from public.fco_fc_ledger where user_id = uid;
  return result;
end;
$$;

revoke all on function public.fco_admin_deduct(uuid, bigint, uuid[], boolean, text, text, boolean, text) from public, anon;
grant execute on function public.fco_admin_deduct(uuid, bigint, uuid[], boolean, text, text, boolean, text) to authenticated;

commit;
