begin;

-- THU HỒI KM nạp bị cộng trùng (người dùng 2026-11-22: "khả năng tôi chạy migration cộng fc km thêm 1 lần nữa, hãy thu hồi").
-- Luật: mỗi người · mỗi mốc KM · mỗi đợt nạp tích luỹ chỉ được cộng 1 lần. KM theo đơn cũ / bấm Nhận khi chưa có đợt (không ghi đợt) nhận
-- trong lúc một đợt đang chạy thì tính vào đợt đó (như 202611220012_fco_topup_no_double_bonus.sql). Lần cộng thứ 2 trở đi = cộng trùng.
-- Hai bước, KHÔNG tự trừ khi chạy file này:
--   1) Xem:  select * from public.fco_topup_duplicate_bonus();                 (mặc định chỉ xét lần cộng trùng trong 2 ngày gần đây)
--   2) Trừ:  select * from public.fco_topup_revoke_duplicates(true);
-- Trừ tối đa bằng FC đang có (ví không âm); phần thiếu ghi ở cột shortfall của bảng fco_topup_revokes. Mỗi dòng sổ cái chỉ thu hồi 1 lần
-- (chạy lại không trừ thêm). Dòng thu hồi ghi sổ cái lý do 'topup_bonus' số âm, detail.revoke = mã dòng bị thu hồi.
-- Chỉ gọi được trong SQL Editor (không cấp cho người chơi). Chạy SAU 202611220012_fco_topup_no_double_bonus.sql. Chạy lại được.

create table if not exists public.fco_topup_revokes (
  ledger_id bigint primary key references public.fco_fc_ledger(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null,      -- FC bị cộng trùng
  revoked bigint not null,     -- FC đã trừ được
  shortfall bigint not null,   -- FC còn thiếu (ví không đủ)
  created_at timestamptz not null default now()
);
alter table public.fco_topup_revokes enable row level security;
revoke all on public.fco_topup_revokes from public, anon, authenticated;

create or replace function public.fco_topup_duplicate_bonus(p_since timestamptz default now() - interval '2 days')
returns table (ledger_id bigint, user_id uuid, name text, event_key bigint, tier_vnd bigint, amount bigint, credited_at timestamptz,
  first_ledger_id bigint, fc_now bigint, revoked_already boolean)
language sql stable security definer set search_path = '' as $$
  with k as (
    select l.id, l.user_id, l.delta, l.created_at,
      coalesce((l.detail->>'event')::bigint,
               (select e.id from public.fco_topup_events e where e.starts_at <= l.created_at order by e.starts_at desc limit 1), 0) as ev,
      coalesce((select o.tier_vnd from public.fco_topup_orders o where o.code = l.detail->>'order'),
               (select t.min_vnd from public.fco_topup_tiers t
                 where l.detail->>'note' like '%mốc ' || public.fco_inv_money(t.min_vnd) || 'đ%'
                    or l.detail->>'note' like '%mốc nạp ' || public.fco_inv_money(t.min_vnd) || 'đ%'
                    or l.detail->>'note' like '%mốc ' || t.min_vnd || 'đ%'
                 order by t.min_vnd desc limit 1)) as tier,
      l.detail->>'note' as note
    from public.fco_fc_ledger l
    where l.reason = 'topup_bonus' and l.delta > 0
  ), r as (
    select k.*, row_number() over (partition by k.user_id, k.ev, coalesce(k.tier::text, k.note) order by k.id) as rn,
      first_value(k.id) over (partition by k.user_id, k.ev, coalesce(k.tier::text, k.note) order by k.id) as first_id
    from k
  )
  select r.id, r.user_id, n.name, r.ev, r.tier, r.delta, r.created_at, r.first_id, w.fc,
    exists (select 1 from public.fco_topup_revokes v where v.ledger_id = r.id)
  from r
  left join public.fco_display_names n on n.user_id = r.user_id
  left join public.fco_wallets w on w.user_id = r.user_id
  where r.rn > 1 and r.created_at >= p_since
  order by r.user_id, r.id
$$;

create or replace function public.fco_topup_revoke_duplicates(p_apply boolean default false, p_since timestamptz default now() - interval '2 days')
returns table (name text, user_id uuid, cong_trung bigint, da_tru bigint, con_thieu bigint, fc_con_lai bigint)
language plpgsql security definer set search_path = '' as $$
declare d record; w public.fco_wallets; amt bigint;
begin
  if not coalesce(p_apply, false) then
    return query select x.name, x.user_id, sum(x.amount)::bigint, 0::bigint, 0::bigint, max(x.fc_now)::bigint
      from public.fco_topup_duplicate_bonus(p_since) x where not x.revoked_already group by x.user_id, x.name order by 3 desc;
    return;
  end if;
  for d in select * from public.fco_topup_duplicate_bonus(p_since) x where not x.revoked_already order by x.user_id, x.ledger_id loop
    w := public.fco_wallet_lock(d.user_id);
    amt := least(d.amount, greatest(w.fc, 0));
    if amt > 0 then
      perform public.fco_apply_fc(d.user_id, -amt, 'topup_bonus',
        jsonb_build_object('note', 'Thu hồi KM nạp cộng trùng', 'revoke', d.ledger_id, 'first', d.first_ledger_id));
    end if;
    insert into public.fco_topup_revokes (ledger_id, user_id, amount, revoked, shortfall) values (d.ledger_id, d.user_id, d.amount, amt, d.amount - amt);
  end loop;
  return query select n.name, v.user_id, sum(v.amount)::bigint, sum(v.revoked)::bigint, sum(v.shortfall)::bigint, max(wl.fc)::bigint
    from public.fco_topup_revokes v left join public.fco_display_names n on n.user_id = v.user_id left join public.fco_wallets wl on wl.user_id = v.user_id
    group by v.user_id, n.name order by 3 desc;
end;
$$;

revoke all on function public.fco_topup_duplicate_bonus(timestamptz), public.fco_topup_revoke_duplicates(boolean, timestamptz) from public, anon, authenticated;

do $$ declare k integer; s bigint; u integer;
begin
  select count(*), coalesce(sum(amount), 0), count(distinct user_id) into k, s, u from public.fco_topup_duplicate_bonus() where not revoked_already;
  raise notice 'KM nạp cộng trùng (2 ngày gần đây): % lần · % FC · % người. Xem: select * from public.fco_topup_duplicate_bonus(); — Trừ: select * from public.fco_topup_revoke_duplicates(true);', k, s, u;
end $$;

commit;