begin;

-- THU HỒI CẢ LOẠT KM nạp "tự cộng" do chạy migration (người dùng 2026-11-22, ảnh: nhiều mốc 20.000đ → 250.000đ+ cùng cộng lúc 15:26:07 22/11,
-- "khả năng tôi chạy migration cộng fc km thêm 1 lần nữa, hãy thu hồi"). Đoạn "cộng bù" trong 202611200006_fco_topup_auto_award.sql cộng một
-- lượt cho mọi người đã đạt mốc — mọi dòng của một lần chạy file có CÙNG thời điểm (now() của giao dịch), nên thu hồi theo thời điểm đó.
-- Ba bước, KHÔNG tự trừ khi chạy file này:
--   1) Xem các loạt:   select * from public.fco_topup_auto_batches();
--   2) Xem 1 loạt:     select * from public.fco_topup_revoke_batch('2026-11-22 15:26:07', false);   (giờ Việt Nam, tới giây)
--   3) Trừ loạt đó:    select * from public.fco_topup_revoke_batch('2026-11-22 15:26:07', true);
-- Trừ tối đa bằng FC đang có (ví không âm), phần thiếu ghi shortfall; dùng chung bảng fco_topup_revokes nên dòng nào đã thu hồi (kể cả bằng
-- 202611220013) không bị trừ lần nữa. Giữ sổ "đã nhận" của các mốc đó → máy chủ không tự cộng / không cho bấm Nhận lại; nạp thêm qua mốc mới
-- vẫn nhận bình thường. Chỉ gọi được trong SQL Editor. Chạy SAU 202611220013_fco_topup_revoke_duplicates.sql. Chạy lại được.

create table if not exists public.fco_topup_revokes (
  ledger_id bigint primary key references public.fco_fc_ledger(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null, revoked bigint not null, shortfall bigint not null,
  created_at timestamptz not null default now()
);
alter table public.fco_topup_revokes enable row level security;
revoke all on public.fco_topup_revokes from public, anon, authenticated;

-- Các loạt "tự cộng": mỗi dòng = 1 thời điểm (giờ VN, tới giây) có từ 2 lần cộng trở lên.
create or replace function public.fco_topup_auto_batches()
returns table (luc_vn timestamp, so_lan bigint, so_nguoi bigint, tong_fc bigint, da_thu_hoi bigint)
language sql stable security definer set search_path = '' as $$
  select date_trunc('second', l.created_at at time zone 'Asia/Ho_Chi_Minh'), count(*), count(distinct l.user_id), sum(l.delta)::bigint,
    coalesce(sum(v.revoked), 0)::bigint
  from public.fco_fc_ledger l left join public.fco_topup_revokes v on v.ledger_id = l.id
  where l.reason = 'topup_bonus' and l.delta > 0 and l.detail->>'note' like '%tự cộng%'
  group by 1 having count(*) > 1 order by 1 desc
$$;

create or replace function public.fco_topup_revoke_batch(p_at_vn timestamp, p_apply boolean default false)
returns table (name text, user_id uuid, so_moc bigint, bi_cong bigint, da_tru bigint, con_thieu bigint, fc_con_lai bigint)
language plpgsql security definer set search_path = '' as $$
declare d record; w public.fco_wallets; amt bigint;
begin
  if p_at_vn is null then raise exception 'Cần thời điểm loạt cộng (giờ VN), xem fco_topup_auto_batches()'; end if;
  if not coalesce(p_apply, false) then
    return query select n.name, l.user_id, count(*)::bigint, sum(l.delta)::bigint, 0::bigint, 0::bigint, max(w2.fc)::bigint
      from public.fco_fc_ledger l
      left join public.fco_display_names n on n.user_id = l.user_id left join public.fco_wallets w2 on w2.user_id = l.user_id
      where l.reason = 'topup_bonus' and l.delta > 0 and l.detail->>'note' like '%tự cộng%'
        and date_trunc('second', l.created_at at time zone 'Asia/Ho_Chi_Minh') = date_trunc('second', p_at_vn)
        and not exists (select 1 from public.fco_topup_revokes v where v.ledger_id = l.id)
      group by l.user_id, n.name order by 4 desc;
    return;
  end if;
  for d in select l.id, l.user_id, l.delta from public.fco_fc_ledger l
      where l.reason = 'topup_bonus' and l.delta > 0 and l.detail->>'note' like '%tự cộng%'
        and date_trunc('second', l.created_at at time zone 'Asia/Ho_Chi_Minh') = date_trunc('second', p_at_vn)
        and not exists (select 1 from public.fco_topup_revokes v where v.ledger_id = l.id)
      order by l.user_id, l.id loop
    w := public.fco_wallet_lock(d.user_id);
    amt := least(d.delta, greatest(w.fc, 0));
    if amt > 0 then
      perform public.fco_apply_fc(d.user_id, -amt, 'topup_bonus', jsonb_build_object('note', 'Thu hồi KM nạp tự cộng do chạy migration', 'revoke', d.id));
    end if;
    insert into public.fco_topup_revokes (ledger_id, user_id, amount, revoked, shortfall) values (d.id, d.user_id, d.delta, amt, d.delta - amt);
  end loop;
  return query select n.name, v.user_id, count(*)::bigint, sum(v.amount)::bigint, sum(v.revoked)::bigint, sum(v.shortfall)::bigint, max(w2.fc)::bigint
    from public.fco_topup_revokes v join public.fco_fc_ledger l on l.id = v.ledger_id
    left join public.fco_display_names n on n.user_id = v.user_id left join public.fco_wallets w2 on w2.user_id = v.user_id
    where date_trunc('second', l.created_at at time zone 'Asia/Ho_Chi_Minh') = date_trunc('second', p_at_vn)
    group by v.user_id, n.name order by 4 desc;
end;
$$;

revoke all on function public.fco_topup_auto_batches(), public.fco_topup_revoke_batch(timestamp, boolean) from public, anon, authenticated;

commit;