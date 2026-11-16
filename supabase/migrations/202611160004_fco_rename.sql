-- Đổi tên HLV (2026-11-16, người dùng chọn): lần đầu miễn phí, các lần sau 100 FC; mỗi 7 ngày đổi tối đa 1 lần; không trùng tên người khác
-- (không phân biệt hoa thường, dấu cách thừa). Tên hiện ở BXH, GLXH, dòng LIVE, sự kiện… đều qua fco_public_name.
--   fco_display_names: tên công khai của từng tài khoản (máy chủ giữ — sửa user metadata ở trình duyệt không đổi được tên công khai).
--     Điền sẵn bằng tên đang hiện; tài khoản mới tự thêm khi đăng ký (trigger fco_display_name_on_signup).
--   fco_public_name: ưu tiên tên trong bảng, không có thì như 202611110016.
--   fco_rename_info(): tên hiện tại, số lần đã đổi, lúc được đổi tiếp, phí lần tới.
--   fco_rename(p_name): đổi tên (kiểm tra độ dài 3–24, ký tự, tên cấm, trùng, thời gian chờ, trừ FC lý do 'rename').
begin;

create table if not exists public.fco_display_names (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  name_key text not null,
  changes integer not null default 0,
  changed_at timestamptz
);
create index if not exists fco_display_names_key on public.fco_display_names(name_key);
alter table public.fco_display_names enable row level security;

create or replace function public.fco_name_key(p_name text) returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'))
$$;

-- Điền sẵn tên đang hiện (trước khi đổi fco_public_name).
insert into public.fco_display_names(user_id, name, name_key)
select u.id, public.fco_public_name(u.id), public.fco_name_key(public.fco_public_name(u.id)) from auth.users u
on conflict (user_id) do nothing;

create or replace function public.fco_public_name(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select d.name from public.fco_display_names d where d.user_id = p_uid), (
    select case when lower(split_part(e, '@', 2)) = 'players.fco.invalid' then n
                when nullif(trim(dn), '') is not null then left(trim(dn), 24)
                when length(n) > 3 then left(n, 3) || '***' else left(n, 1) || '***' end
    from (select coalesce(email, 'player') as e, split_part(coalesce(email, 'player'), '@', 1) as n, raw_user_meta_data->>'display_name' as dn
          from auth.users where id = p_uid) u))
$$;

-- Tài khoản mới: lưu tên lúc đăng ký (tên nhập ở form đăng ký; tài khoản cũ dạng tên đăng nhập thì là tên đăng nhập).
create or replace function public.fco_display_name_on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
declare n text;
begin
  n := case when lower(split_part(coalesce(new.email, ''), '@', 2)) = 'players.fco.invalid' then split_part(new.email, '@', 1)
            when nullif(trim(new.raw_user_meta_data->>'display_name'), '') is not null then left(regexp_replace(trim(new.raw_user_meta_data->>'display_name'), '\s+', ' ', 'g'), 24)
            else left(split_part(coalesce(new.email, 'player'), '@', 1), 3) || '***' end;
  insert into public.fco_display_names(user_id, name, name_key) values (new.id, n, public.fco_name_key(n)) on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists fco_display_name_on_signup on auth.users;
create trigger fco_display_name_on_signup after insert on auth.users for each row execute function public.fco_display_name_on_signup();
revoke all on function public.fco_display_name_on_signup() from public, anon, authenticated;

create or replace function public.fco_rename_info() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); r public.fco_display_names;
begin
  select * into r from public.fco_display_names where user_id = uid;
  return jsonb_build_object('name', public.fco_public_name(uid), 'changes', coalesce(r.changes, 0),
    'nextAt', case when r.changed_at is null then null else (extract(epoch from r.changed_at + interval '7 days') * 1000)::bigint end,
    'cost', case when coalesce(r.changes, 0) = 0 then 0 else 100 end, 'now', (extract(epoch from now()) * 1000)::bigint);
end;
$$;

create or replace function public.fco_rename(p_name text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user();
  n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  k text; r public.fco_display_names; cost integer; bal bigint;
begin
  if char_length(n) < 3 or char_length(n) > 24 then raise exception 'FCO_NAME_LENGTH' using errcode = '22023'; end if;
  if n ~ '[[:cntrl:]<>"''`\\/@#$%^&*(){}\[\]|;:=+~?!,]' then raise exception 'FCO_NAME_CHARS' using errcode = '22023'; end if;
  k := public.fco_name_key(n);
  if k ~ '(admin|quản trị|quan tri|moderator|hỗ trợ|ho tro|support|garena|nexon|fco vip)' then raise exception 'FCO_NAME_RESERVED' using errcode = '22023'; end if;
  -- Khoá chung để hai người không cùng lúc lấy một tên.
  perform pg_advisory_xact_lock(hashtext('fco_rename'));
  insert into public.fco_display_names(user_id, name, name_key) values (uid, public.fco_public_name(uid), public.fco_name_key(public.fco_public_name(uid))) on conflict (user_id) do nothing;
  select * into r from public.fco_display_names where user_id = uid for update;
  if r.name = n then raise exception 'FCO_NAME_SAME' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fco_display_names d where d.name_key = k and d.user_id <> uid) then raise exception 'FCO_NAME_TAKEN' using errcode = 'P0001'; end if;
  if r.changed_at is not null and now() < r.changed_at + interval '7 days' then raise exception 'FCO_NAME_COOLDOWN' using errcode = 'P0001'; end if;
  cost := case when r.changes = 0 then 0 else 100 end;
  if cost > 0 then bal := public.fco_apply_fc(uid, -cost, 'rename', jsonb_build_object('from', r.name, 'to', n)); end if;
  update public.fco_display_names set name = n, name_key = k, changes = changes + 1, changed_at = now() where user_id = uid;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', n) where id = uid;
  return jsonb_build_object('name', n, 'cost', cost, 'changes', r.changes + 1, 'nextAt', (extract(epoch from now() + interval '7 days') * 1000)::bigint);
end;
$$;

revoke all on function public.fco_rename_info(), public.fco_rename(text) from public, anon;
grant execute on function public.fco_rename_info(), public.fco_rename(text) to authenticated;

commit;
