-- KHÔNG CẦN CHẠY: đã thay bằng 202611200004_fco_topup_cumulative.sql (KM theo tổng nạp cộng dồn). Lỡ chạy rồi thì 0004 tự gỡ phần này.
begin;

-- Mốc nạp tích luỹ (người dùng 2026-11-20, ảnh "Gói nạp đặc biệt · FC đã nạp · thanh 0 / 500 / 1.000 / 2.000 · Cần 776 FC").
--   Tổng FC đã nạp = mọi FC admin cộng với lý do 'admin' (nạp theo bill + FC gốc của đơn nạp; KHÔNG gồm khuyến mãi, quà, gift code),
--   giống ô "Đã nạp" của người chơi (fco_my_fc_stats). Mỗi mốc có quà riêng (gói / BP / FC, kiểm bằng fco_valid_rewards), admin đặt.
--   Đạt mốc → người chơi bấm Nhận (mỗi mốc 1 lần mãi mãi): FC cộng thẳng vào ví (lý do 'topup_milestone', không tính doanh thu / Top Đặc Huấn);
--   gói / BP vào hàng chờ Quà từ Admin (fco_admin_gifts) — game tự nhận vào kho như quà admin.
--   Khuyến mãi theo từng đơn (202611200002) giữ nguyên. Chạy sau 202611200002_fco_topup_orders.sql. Chạy lại được.

create table if not exists public.fco_topup_milestones (
  fc bigint primary key check (fc > 0),
  rewards jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.fco_topup_milestones enable row level security;
revoke all on public.fco_topup_milestones from public, anon, authenticated;

create table if not exists public.fco_topup_milestone_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  fc bigint not null,
  rewards jsonb not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, fc)
);
alter table public.fco_topup_milestone_claims enable row level security;
revoke all on public.fco_topup_milestone_claims from public, anon, authenticated;

create or replace function public.fco_topup_total(p_uid uuid) returns bigint language sql stable security definer set search_path = '' as $$
  select greatest(coalesce(sum(delta), 0), 0)::bigint from public.fco_fc_ledger where user_id = p_uid and reason = 'admin'
$$;

create or replace function public.fco_topup_milestones_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return jsonb_build_object('total', public.fco_topup_total(uid),
    'milestones', coalesce((select jsonb_agg(jsonb_build_object('fc', m.fc, 'rewards', m.rewards,
        'claimed', exists (select 1 from public.fco_topup_milestone_claims c where c.user_id = uid and c.fc = m.fc)) order by m.fc)
      from public.fco_topup_milestones m), '[]'::jsonb));
end;
$$;

create or replace function public.fco_topup_milestone_claim(p_fc bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_topup_milestones; fc_sum bigint;
begin
  select * into m from public.fco_topup_milestones x where x.fc = p_fc;
  if not found then raise exception 'FCO_MILESTONE_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  if public.fco_topup_total(uid) < m.fc then raise exception 'FCO_MILESTONE_NOT_REACHED' using errcode = 'P0001'; end if;
  insert into public.fco_topup_milestone_claims (user_id, fc, rewards) values (uid, m.fc, m.rewards) on conflict do nothing;
  if not found then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc_sum from jsonb_array_elements(m.rewards) r where r ? 'fc';
  if fc_sum > 0 then perform public.fco_apply_fc(uid, fc_sum, 'topup_milestone', jsonb_build_object('note', 'Mốc nạp ' || m.fc || ' FC')); end if;
  -- Gói / BP: hàng chờ Quà từ Admin (FC trong đó đã cộng ở trên, lúc nhận game bỏ qua phần FC).
  if exists (select 1 from jsonb_array_elements(m.rewards) r where not r ? 'fc') then
    insert into public.fco_admin_gifts (user_id, rewards, note) values (uid, m.rewards, 'Mốc nạp ' || public.fco_inv_money(m.fc) || ' FC');
  end if;
  return jsonb_build_object('fc', m.fc, 'rewards', m.rewards, 'wallet', public.fco_wallet_json(uid));
end;
$$;

-- Admin: lưu toàn bộ danh sách mốc [{fc, rewards}] (tối đa 20). Người đã nhận mốc giữ nguyên (sổ fco_topup_milestone_claims).
create or replace function public.fco_admin_topup_milestones_save(p_list jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  if jsonb_typeof(p_list) <> 'array' or jsonb_array_length(p_list) > 20 or exists (
      select 1 from jsonb_array_elements(p_list) e
      where jsonb_typeof(e->'fc') <> 'number' or (e->>'fc')::numeric <= 0 or (e->>'fc')::numeric > 1000000000000
        or (e->>'fc')::numeric <> floor((e->>'fc')::numeric) or not public.fco_valid_rewards(e->'rewards'))
     or (select count(*) <> count(distinct (e->>'fc')::numeric) from jsonb_array_elements(p_list) e) then
    raise exception 'FCO_MILESTONE_BAD' using errcode = '22023';
  end if;
  delete from public.fco_topup_milestones where true;
  insert into public.fco_topup_milestones (fc, rewards) select (e->>'fc')::bigint, e->'rewards' from jsonb_array_elements(p_list) e;
  return coalesce((select jsonb_agg(jsonb_build_object('fc', fc, 'rewards', rewards) order by fc) from public.fco_topup_milestones), '[]'::jsonb);
end;
$$;

-- Admin: đọc danh sách mốc + số người đã nhận mỗi mốc.
create or replace function public.fco_admin_topup_milestones() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('fc', m.fc, 'rewards', m.rewards,
      'claims', (select count(*) from public.fco_topup_milestone_claims c where c.fc = m.fc)) order by m.fc) from public.fco_topup_milestones m), '[]'::jsonb);
end;
$$;

revoke all on function public.fco_topup_total(uuid) from public, anon, authenticated;
revoke all on function public.fco_topup_milestones_me(), public.fco_topup_milestone_claim(bigint), public.fco_admin_topup_milestones_save(jsonb),
  public.fco_admin_topup_milestones() from public, anon;
grant execute on function public.fco_topup_milestones_me(), public.fco_topup_milestone_claim(bigint), public.fco_admin_topup_milestones_save(jsonb),
  public.fco_admin_topup_milestones() to authenticated;

commit;
