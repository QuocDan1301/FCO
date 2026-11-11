-- Đăng ký bằng Gmail + mã xác nhận, tự đặt lại mật khẩu (2026-11-11, sau 202611110015).
--   · Tài khoản mới chỉ nhận @gmail.com, lưu ở dạng chuẩn hoá: chữ thường, bỏ dấu chấm, bỏ phần +…, googlemail.com → gmail.com
--     (a.b.c+1@gmail.com và abc@gmail.com là cùng một hộp thư → chỉ tạo được một tài khoản). Game chuẩn hoá trước khi gửi
--     (src/account-identity.ts normalizeGmail); trigger dưới đây chặn mọi email khác ngay trong máy chủ.
--   · Tài khoản cũ (tên đăng nhập @players.fco.invalid) vẫn đăng nhập bình thường; được liên kết Gmail (đổi email, cũng phải là Gmail chuẩn hoá).
--     Không tạo thêm được tài khoản @players.fco.invalid mới.
--   · Tên công khai (BXH, bảng tin jackpot): tài khoản Gmail dùng tên HLV (display_name), không lộ địa chỉ Gmail.
--   Cấu hình Supabase cần làm: SMTP riêng, bật Confirm email, TẮT Secure email change, mẫu email có {{ .Token }} (mã 6 số).
begin;

-- Gmail dạng chuẩn; không phải Gmail thì trả nguyên (chữ thường, bỏ khoảng trắng).
create function public.fco_gmail_normalize(p_email text) returns text language sql immutable set search_path = '' as $$
  select case when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
              then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com' else e end
  from (select lower(trim(coalesce(p_email, ''))) as e) x
$$;

create function public.fco_auth_email_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare e text := lower(coalesce(new.email, '')); c text := lower(coalesce(new.email_change, ''));
begin
  -- Email mới (đăng ký) hoặc email đang chờ đổi phải là Gmail chuẩn hoá. Tài khoản cũ @players.fco.invalid giữ nguyên email thì không xét.
  if tg_op = 'INSERT' or e is distinct from lower(coalesce(old.email, '')) then
    if e !~ '^[a-z0-9]{6,30}@gmail\.com$' or e <> public.fco_gmail_normalize(e) then raise exception 'FCO_GMAIL_ONLY' using errcode = 'P0001'; end if;
  end if;
  if c <> '' and (tg_op = 'INSERT' or c is distinct from lower(coalesce(old.email_change, ''))) then
    if c !~ '^[a-z0-9]{6,30}@gmail\.com$' or c <> public.fco_gmail_normalize(c) then raise exception 'FCO_GMAIL_ONLY' using errcode = 'P0001'; end if;
  end if;
  return new;
end;
$$;
create trigger fco_auth_email_guard before insert or update of email, email_change on auth.users
  for each row execute function public.fco_auth_email_guard();

-- Như 202611090008: tài khoản cũ hiện tên đăng nhập; tài khoản Gmail hiện tên HLV (tối đa 24 ký tự), không có thì che bớt.
create or replace function public.fco_public_name(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when lower(split_part(e, '@', 2)) = 'players.fco.invalid' then n
              when nullif(trim(d), '') is not null then left(trim(d), 24)
              when length(n) > 3 then left(n, 3) || '***' else left(n, 1) || '***' end
  from (select coalesce(email, 'player') as e, split_part(coalesce(email, 'player'), '@', 1) as n, raw_user_meta_data->>'display_name' as d
        from auth.users where id = p_uid) u
$$;

revoke all on function public.fco_auth_email_guard() from public, anon, authenticated;

commit;
