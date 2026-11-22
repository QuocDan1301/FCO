-- THU HỒI NGAY loạt KM nạp "tự cộng" lúc 15:26 ngày 22/11/2026 (giờ VN) — người dùng 2026-11-22: "Vẫn chưa thu hồi".
-- Chạy file này là TRỪ LUÔN (không cần gọi thêm hàm). Không phụ thuộc 202611220013 / 0014 (tự tạo bảng sổ thu hồi nếu chưa có).
--   • Lấy mọi dòng sổ cái lý do 'topup_bonus', số dương, ghi chú có "tự cộng", tạo trong phút 15:26 22/11 giờ VN.
--   • Trừ tối đa bằng FC đang có (ví không âm); thiếu thì ghi shortfall. Dòng đã thu hồi trước đó không trừ lần nữa → chạy lại an toàn.
--   • Giữ sổ "đã nhận" các mốc đó → không tự cộng / bấm Nhận lại được.
-- Cuối file trả bảng kết quả từng người + một dòng chẩn đoán nếu không tìm thấy gì.

begin;

create table if not exists public.fco_topup_revokes (
  ledger_id bigint primary key references public.fco_fc_ledger(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null, revoked bigint not null, shortfall bigint not null,
  created_at timestamptz not null default now()
);
alter table public.fco_topup_revokes enable row level security;
revoke all on public.fco_topup_revokes from public, anon, authenticated;

do $$
declare d record; w public.fco_wallets; amt bigint; n integer := 0;
  t0 timestamptz := timestamp '2026-11-22 15:26:00' at time zone 'Asia/Ho_Chi_Minh';
begin
  for d in select l.id, l.user_id, l.delta from public.fco_fc_ledger l
      where l.reason = 'topup_bonus' and l.delta > 0 and l.detail->>'note' like '%tự cộng%'
        and l.created_at >= t0 and l.created_at < t0 + interval '1 minute'
        and not exists (select 1 from public.fco_topup_revokes v where v.ledger_id = l.id)
      order by l.user_id, l.id loop
    w := public.fco_wallet_lock(d.user_id);
    amt := least(d.delta, greatest(w.fc, 0));
    if amt > 0 then
      perform public.fco_apply_fc(d.user_id, -amt, 'topup_bonus', jsonb_build_object('note', 'Thu hồi KM nạp tự cộng do chạy migration', 'revoke', d.id));
    end if;
    insert into public.fco_topup_revokes (ledger_id, user_id, amount, revoked, shortfall) values (d.id, d.user_id, d.delta, amt, d.delta - amt);
    n := n + 1;
  end loop;
  raise notice 'Đã thu hồi % dòng KM tự cộng.', n;
end $$;

commit;

-- Kết quả: từng người trong loạt 15:26 (đã trừ / còn thiếu / FC còn lại). Không có dòng nào → xem dòng CHẨN ĐOÁN.
select coalesce(n.name, v.user_id::text) as hlv, count(*) as so_moc, sum(v.amount) as bi_cong, sum(v.revoked) as da_tru,
  sum(v.shortfall) as con_thieu, max(w.fc) as fc_con_lai
from public.fco_topup_revokes v
join public.fco_fc_ledger l on l.id = v.ledger_id
left join public.fco_display_names n on n.user_id = v.user_id
left join public.fco_wallets w on w.user_id = v.user_id
where l.created_at >= timestamp '2026-11-22 15:26:00' at time zone 'Asia/Ho_Chi_Minh'
  and l.created_at < timestamp '2026-11-22 15:27:00' at time zone 'Asia/Ho_Chi_Minh'
group by v.user_id, n.name
union all
select 'CHẨN ĐOÁN: KM tự cộng ngày 22/11 theo phút → ' || string_agg(to_char(m, 'HH24:MI') || ' = ' || c || ' dòng', ', ' order by m), null, null, null, null, null
from (select date_trunc('minute', l.created_at at time zone 'Asia/Ho_Chi_Minh') m, count(*) c from public.fco_fc_ledger l
      where l.reason = 'topup_bonus' and l.delta > 0 and l.detail->>'note' like '%tự cộng%'
        and l.created_at >= timestamp '2026-11-22 00:00' at time zone 'Asia/Ho_Chi_Minh' group by 1) x
order by bi_cong desc nulls last;