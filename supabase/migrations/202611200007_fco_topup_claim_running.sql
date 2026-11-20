begin;

-- Sửa lỗi 2026-11-20: sự kiện nạp tích luỹ đã kết thúc (còn 3 ngày hạn) vẫn cho bấm Nhận KM — sau khi admin thu hồi KM cộng nhầm và xoá
-- lượt "đã nhận", người chơi bấm Nhận lại được. Từ bản này: chỉ bấm Nhận khi sự kiện CÒN CHẠY (now < ends_at). Hết giờ: không bấm được,
-- KM chỉ còn tự cộng qua trigger 202611200006 khi admin duyệt muộn đơn tạo trong đợt. Trang nạp cũng ẩn thanh ngay khi hết giờ.
-- Chạy sau 202611200005_fco_topup_event.sql. Chạy lại được.

create or replace function public.fco_topup_tier_claim(p_vnd bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); e public.fco_topup_events := public.fco_topup_event_now(); t public.fco_topup_tiers;
begin
  -- Chỉ bấm Nhận khi sự kiện còn chạy; hết giờ thì KM chỉ còn tự cộng (202611200006) cho đơn tạo trong đợt mà admin duyệt muộn.
  if e.id is null or now() >= e.ends_at then raise exception 'FCO_TOPUP_NO_EVENT' using errcode = 'P0001'; end if;
  select * into t from public.fco_topup_tiers x where x.min_vnd = p_vnd;
  if not found then raise exception 'FCO_MILESTONE_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  if public.fco_topup_event_vnd(uid, e) < t.min_vnd then raise exception 'FCO_MILESTONE_NOT_REACHED' using errcode = 'P0001'; end if;
  insert into public.fco_topup_tier_claims (user_id, event_id, min_vnd, bonus_fc) values (uid, e.id, t.min_vnd, t.bonus_fc) on conflict do nothing;
  if not found then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  if t.bonus_fc > 0 then
    perform public.fco_apply_fc(uid, t.bonus_fc, 'topup_bonus', jsonb_build_object('note', e.title || ' · mốc ' || public.fco_inv_money(t.min_vnd) || 'đ', 'event', e.id));
  end if;
  return jsonb_build_object('vnd', t.min_vnd, 'bonus', t.bonus_fc, 'wallet', public.fco_wallet_json(uid));
end;
$$;

commit;
