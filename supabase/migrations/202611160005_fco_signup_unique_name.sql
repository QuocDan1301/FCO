-- Chặn trùng tên HLV lúc đăng ký (2026-11-16, người dùng yêu cầu; cùng luật với đổi tên 202611160004):
--   fco_name_problem(p_name): mã lỗi tên ('FCO_NAME_LENGTH' / 'FCO_NAME_CHARS' / 'FCO_NAME_RESERVED') hoặc null — dùng chung đăng ký.
--   fco_name_available(p_name, p_email): form đăng ký hỏi trước (khách chưa đăng nhập gọi được) → 'ok' hoặc mã lỗi, 'FCO_NAME_TAKEN' khi
--     tên đã có HLV khác dùng (tài khoản của chính Gmail đó — đăng ký lại khi chưa xác nhận — không tính là trùng).
--   Trigger fco_signup_name_guard (BEFORE INSERT auth.users): chặn chắc ở máy chủ, kể cả khi gọi thẳng API đăng ký.
begin;

create or replace function public.fco_name_problem(p_name text) returns text language sql immutable set search_path = '' as $$
  select case
    when char_length(n) < 3 or char_length(n) > 24 then 'FCO_NAME_LENGTH'
    when n ~ '[[:cntrl:]<>"''`\\/@#$%^&*(){}\[\]|;:=+~?!,]' then 'FCO_NAME_CHARS'
    when lower(n) ~ '(admin|quản trị|quan tri|moderator|hỗ trợ|ho tro|support|garena|nexon|fco vip)' then 'FCO_NAME_RESERVED'
  end
  from (select regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g') as n) x
$$;

create or replace function public.fco_name_available(p_name text, p_email text default null) returns text language plpgsql stable security definer set search_path = '' as $$
declare problem text := public.fco_name_problem(p_name); mail text := lower(trim(coalesce(p_email, '')));
begin
  if problem is not null then return problem; end if;
  if exists (select 1 from public.fco_display_names d join auth.users u on u.id = d.user_id
             where d.name_key = public.fco_name_key(p_name) and lower(coalesce(u.email, '')) <> mail) then return 'FCO_NAME_TAKEN'; end if;
  return 'ok';
end;
$$;
revoke all on function public.fco_name_available(text, text) from public;
grant execute on function public.fco_name_available(text, text) to anon, authenticated;

create or replace function public.fco_signup_name_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare n text := regexp_replace(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '\s+', ' ', 'g'); problem text;
begin
  -- Tài khoản cũ dạng tên đăng nhập / không nhập tên: không kiểm tra.
  if lower(split_part(coalesce(new.email, ''), '@', 2)) = 'players.fco.invalid' or n = '' then return new; end if;
  problem := public.fco_name_problem(n);
  if problem is not null then raise exception '%', problem using errcode = '22023'; end if;
  -- Cùng khoá với fco_rename: hai người không cùng lúc lấy một tên.
  perform pg_advisory_xact_lock(hashtext('fco_rename'));
  if exists (select 1 from public.fco_display_names d where d.name_key = public.fco_name_key(n)) then
    raise exception 'FCO_NAME_TAKEN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists fco_signup_name_guard on auth.users;
create trigger fco_signup_name_guard before insert on auth.users for each row execute function public.fco_signup_name_guard();
revoke all on function public.fco_signup_name_guard() from public, anon, authenticated;

commit;
