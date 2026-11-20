begin;

-- Khuyến mãi nạp tích luỹ TỰ CỘNG (người dùng 2026-11-20: "người chơi nạp thì sẽ nhận luôn mốc km, ko cần nhấn nhận nữa").
--   • Mỗi lần ví được cộng FC nạp (sổ fco_fc_ledger lý do 'admin', delta > 0: admin duyệt đơn nạp hoặc nạp theo bill) trong sự kiện
--     nạp tích luỹ (202611200005), máy chủ tự tính lại tổng nạp trong đợt và cộng ngay FC KM của mọi mốc vừa đạt (lý do 'topup_bonus'),
--     ghi sổ nhận fco_topup_tier_claims — mỗi mốc mỗi đợt một lần như trước.
--   • Chạy bằng trigger sau khi ghi sổ nên mọi đường cộng FC nạp đều được (fco_admin_topup_decide, fco_admin_credit…).
--   • Lúc chạy file: cộng luôn cho ai đang có mốc đã đạt mà chưa nhận trong đợt hiện tại.
--   • Nút Nhận ở trang nạp vẫn giữ để dự phòng (vd. admin hạ mốc giữa đợt).
-- Chạy sau 202611200005_fco_topup_event.sql. Chạy lại được.

create or replace function public.fco_topup_auto_award(p_uid uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.fco_topup_events := public.fco_topup_event_now(); total bigint; t record; n integer := 0;
begin
  if e.id is null or p_uid is null then return 0; end if;
  total := public.fco_topup_event_vnd(p_uid, e);
  for t in select x.min_vnd, x.bonus_fc from public.fco_topup_tiers x where x.min_vnd <= total order by x.min_vnd loop
    insert into public.fco_topup_tier_claims (user_id, event_id, min_vnd, bonus_fc) values (p_uid, e.id, t.min_vnd, t.bonus_fc) on conflict do nothing;
    if found then
      if t.bonus_fc > 0 then
        perform public.fco_apply_fc(p_uid, t.bonus_fc, 'topup_bonus',
          jsonb_build_object('note', e.title || ' · mốc ' || public.fco_inv_money(t.min_vnd) || 'đ · tự cộng', 'event', e.id));
      end if;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.fco_topup_ledger_award() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_topup_auto_award(new.user_id);
  return null;
end;
$$;

drop trigger if exists fco_topup_ledger_award on public.fco_fc_ledger;
create trigger fco_topup_ledger_award after insert on public.fco_fc_ledger
  for each row when (new.reason = 'admin' and new.delta > 0) execute function public.fco_topup_ledger_award();

revoke all on function public.fco_topup_auto_award(uuid), public.fco_topup_ledger_award() from public, anon, authenticated;

-- Cộng ngay cho ai đã đạt mốc trong đợt hiện tại mà chưa nhận.
do $$
declare e public.fco_topup_events := public.fco_topup_event_now(); u uuid; n integer := 0;
begin
  if e.id is null then raise notice 'Hiện không có sự kiện nạp tích luỹ — không có gì để cộng.'; return; end if;
  for u in select distinct l.user_id from public.fco_fc_ledger l where l.reason = 'admin' and l.delta > 0 and l.created_at >= e.starts_at loop
    perform public.fco_wallet_lock(u);
    n := n + public.fco_topup_auto_award(u);
  end loop;
  raise notice 'Đã tự cộng % mốc khuyến mãi còn chờ trong sự kiện "%".', n, e.title;
end $$;

commit;
