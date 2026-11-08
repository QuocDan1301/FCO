-- Reset tài khoản cho admin (2026-11-08): nút "Reset tài khoản" ở Quản trị FC → Tài khoản. Đưa người chơi về như mới, không xoá tài khoản.
--   Xoá: thẻ, BP, gói, đội hình, lịch sử, tiến trình sự kiện (bản lưu); điểm / lượt / quà mốc sự kiện, chuỗi điểm danh (ví); kỷ lục BXH.
--   Giữ: tên đăng nhập, mật khẩu, FC (trừ khi admin chọn xoá FC), sổ cái, giờ chơi, cảnh báo bất thường, cài đặt âm thanh / hiển thị.
--   Giữ để reset không tạo thêm quà: quà ngày và lượt Bi Lắc miễn phí đã dùng hôm nay, gift code đã dùng.
-- Bản lưu được GHI ĐÈ và tăng revision, không xoá dòng: máy người chơi đang mở tự nhận bản mới (kiểm tra mỗi 15 giây), còn bản cũ
-- chưa đồng bộ bị fco_commit_save từ chối (FCO_SAVE_CONFLICT). Xoá dòng thì máy người chơi sẽ đẩy đồ cũ lên lại như tài khoản mới.
-- Mỗi lần reset ghi một dòng sổ cái lý do 'reset' kèm admin thực hiện (delta = FC bị xoá, 0 nếu giữ FC).
-- Cho phép reset cả tài khoản admin: không làm mất quyền quản trị (khác với khoá / xoá).
begin;

create function public.fco_admin_account_reset(p_user uuid, p_reset_fc boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); w public.fco_wallets; old_data jsonb; remaining bigint;
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_reset_fc is null then raise exception 'Invalid reset option' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(p_user);
  remaining := case when p_reset_fc then 0 else w.fc end;
  update public.fco_wallets set fc = remaining, event_points = 0, event_free = 0, event_paid = 0, event_missions = '{}',
    bilac_points = 0, bilac_claimed = '{}', checkin_day = 0, updated_at = now()
  where user_id = p_user;
  select data into old_data from public.fco_game_saves where user_id = p_user for update;
  -- Chưa có bản lưu thì không có gì để xoá; lần đầu vào game sẽ tự tạo bản trống.
  if found then
    update public.fco_game_saves set revision = revision + 1, updated_at = now(), data =
      jsonb_build_object('version', 1, 'balance', 0, 'cards', '[]'::jsonb, 'history', '[]'::jsonb, 'unopened', '{}'::jsonb, 'daily', '', 'opened', 0, 'upgrades', 0,
        'sound', coalesce(old_data->'sound', 'false'::jsonb), 'reduced', coalesce(old_data->'reduced', 'false'::jsonb))
      || jsonb_strip_nulls(jsonb_build_object('reset', old_data->'reset', 'bpReset', old_data->'bpReset', 'quick', old_data->'quick', 'light', old_data->'light', 'codes', old_data->'codes'))
    where user_id = p_user;
  end if;
  delete from public.fco_ranks where user_id = p_user;
  insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, actor)
  values (p_user, remaining - w.fc, remaining, 'reset', jsonb_build_object('resetFc', p_reset_fc), admin_id);
  return jsonb_build_object('reset', true, 'fc', remaining);
end;
$$;

-- Như 202611080009, thêm: FC bị admin xoá khi reset không tính là người chơi đã dùng.
create or replace function public.fco_my_fc_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); result jsonb;
begin
  select jsonb_build_object(
    'topup', greatest(coalesce(sum(delta) filter (where reason = 'admin'), 0), 0),
    'spent', coalesce(-sum(delta) filter (where delta < 0 and reason not in ('admin', 'reset')), 0))
  into result from public.fco_fc_ledger where user_id = uid;
  return result;
end;
$$;

revoke all on function public.fco_admin_account_reset(uuid, boolean), public.fco_my_fc_stats() from public, anon;
grant execute on function public.fco_admin_account_reset(uuid, boolean), public.fco_my_fc_stats() to authenticated;

commit;