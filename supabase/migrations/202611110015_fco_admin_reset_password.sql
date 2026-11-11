-- Admin đặt lại mật khẩu người chơi (2026-11-11, sau 202611110014). Không xem được mật khẩu cũ: Supabase chỉ lưu mã băm bcrypt.
-- Tài khoản người chơi dùng email giả @players.fco.invalid nên không gửi được email khôi phục; admin đặt mật khẩu tạm rồi gửi cho người chơi.
--   · Mật khẩu mới lưu dạng bcrypt (pgcrypto, giống Supabase Auth), 6–72 ký tự.
--   · Đăng xuất tài khoản đó ở mọi thiết bị (xoá phiên + refresh token) để người đang giữ mật khẩu cũ không dùng tiếp.
--   · Không đặt lại được tài khoản admin (FCO_ADMIN_PROTECTED). Mỗi lần đặt lại được ghi vào fco_admin_password_resets.
begin;

create table public.fco_admin_password_resets (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  at timestamptz not null default now()
);
alter table public.fco_admin_password_resets enable row level security;

create function public.fco_admin_reset_password(p_user uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); login text;
begin
  select split_part(email, '@', 1) into login from auth.users where id = p_user;
  if login is null then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fco_admins where user_id = p_user) then raise exception 'FCO_ADMIN_PROTECTED' using errcode = 'P0001'; end if;
  if p_password is null or char_length(p_password) < 6 or octet_length(p_password) > 72 then raise exception 'FCO_BAD_PASSWORD' using errcode = '22023'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now() where id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  insert into public.fco_admin_password_resets(user_id, admin_id) values (p_user, admin_id);
  return jsonb_build_object('login', login);
end;
$$;
revoke all on function public.fco_admin_reset_password(uuid, text) from public, anon;
grant execute on function public.fco_admin_reset_password(uuid, text) to authenticated;

commit;
