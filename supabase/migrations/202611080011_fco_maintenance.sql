-- Chế độ bảo trì (2026-11-08): nút ở Quản trị FC → Bảo trì.
--   Khi bật, fco_require_user từ chối tài khoản thường (FCO_MAINTENANCE) nên mọi thao tác chơi game trên máy chủ đều bị chặn, kể cả khi
--   trình duyệt không chịu hiện màn bảo trì. Tài khoản admin không bị chặn để còn vào kiểm tra và tắt bảo trì.
--   fco_commit_save vẫn cho qua: thao tác người chơi vừa làm trước lúc bật bảo trì được đồng bộ nốt, không rơi vào cảnh hai bản tiến trình.
--   fco_maintenance_state đọc được cả khi chưa đăng nhập để màn đăng nhập báo bảo trì.
begin;

create table public.fco_maintenance (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  message text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.fco_maintenance(id) values (1);
alter table public.fco_maintenance enable row level security;
revoke all on public.fco_maintenance from anon, authenticated;

-- Đã đăng nhập và không bị khoá; dùng cho những gì vẫn phải chạy khi bảo trì.
create function public.fco_require_account() returns uuid language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if exists (select 1 from auth.users where id = uid and banned_until > now()) then raise exception 'FCO_ACCOUNT_LOCKED' using errcode = '42501'; end if;
  return uid;
end;
$$;

-- Như 202611080008, thêm chặn khi bảo trì (trừ admin).
create or replace function public.fco_require_user() returns uuid language plpgsql stable set search_path = '' as $$
declare uid uuid := public.fco_require_account();
begin
  if exists (select 1 from public.fco_maintenance where id = 1 and enabled)
     and not exists (select 1 from public.fco_admins where user_id = uid) then
    raise exception 'FCO_MAINTENANCE' using errcode = 'P0001';
  end if;
  return uid;
end;
$$;

-- Như 202611080008, chỉ đổi chỗ lấy chủ tài khoản: khi bảo trì vẫn đồng bộ được, tài khoản bị khoá thì không.
create or replace function public.fco_commit_save(p_data jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := public.fco_require_account();
  saved public.fco_game_saves;
  previous jsonb;
begin
  if p_revision is null or p_revision < 0 or p_data is null or jsonb_typeof(p_data) <> 'object'
    or p_data->>'version' is distinct from '1' or jsonb_typeof(p_data->'cards') is distinct from 'array'
    or octet_length(p_data::text) > 10000000 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  p_data := p_data - 'fc';
  if p_revision = 0 then
    insert into public.fco_game_saves(user_id, revision, data)
    values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
  else
    select data into previous from public.fco_game_saves where user_id = owner_id and revision = p_revision for update;
    update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'FCO_SAVE_CONFLICT' using errcode = 'P0001'; end if;
  perform public.fco_audit_save(owner_id, saved.revision, previous, p_data);
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$$;

-- bypass = người đang xem là admin (chưa đăng nhập thì false); chỉ cho biết về chính mình.
create function public.fco_maintenance_state() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('enabled', m.enabled, 'message', m.message,
    'bypass', exists (select 1 from public.fco_admins a where a.user_id = auth.uid()))
  from public.fco_maintenance m where m.id = 1
$$;

create function public.fco_admin_maintenance_set(p_enabled boolean, p_message text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin();
begin
  if p_enabled is null then raise exception 'Invalid maintenance state' using errcode = '22023'; end if;
  update public.fco_maintenance set enabled = p_enabled, message = left(trim(coalesce(p_message, '')), 300), updated_at = now(), updated_by = admin_id where id = 1;
  return public.fco_maintenance_state();
end;
$$;

revoke all on function public.fco_require_account(), public.fco_maintenance_state(), public.fco_admin_maintenance_set(boolean, text) from public, anon, authenticated;
grant execute on function public.fco_maintenance_state() to anon, authenticated;
grant execute on function public.fco_admin_maintenance_set(boolean, text) to authenticated;

commit;