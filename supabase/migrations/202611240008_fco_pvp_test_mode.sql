-- Penalty đối kháng: CHẾ ĐỘ THỬ NGHIỆM (người dùng 2026-11-24: "tôi muốn test pvp penalty trước").
--   · fco_pvp_settings.open = false (mặc định): chỉ ADMIN và ACC PHỤ (admin tạo, dùng làm tài khoản thử) vào được Ghép ngẫu nhiên / Tạo phòng /
--     Nhập mã; người chơi thường báo FCO_PVP_CLOSED và game không hiện nút "Đấu với người chơi".
--   · open = true: mọi người chơi (trừ acc phụ) — như 202611240006. Admin bật / tắt bằng fco_admin_pvp_open (nút trong trang Penalty đối kháng).
--   · Trận có acc phụ không tính BXH (như cũ, fco_pvp_finish bỏ acc phụ).
--   Chạy SAU 202611240007_fco_sub_market_sell.sql. Chạy lại được.
begin;

create table if not exists public.fco_pvp_settings (
  id integer primary key default 1 check (id = 1),
  open boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.fco_pvp_settings(id) values (1) on conflict (id) do nothing;
alter table public.fco_pvp_settings enable row level security;
revoke all on public.fco_pvp_settings from public, anon, authenticated;

create or replace function public.fco_pvp_is_open() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select open from public.fco_pvp_settings where id = 1), false)
$$;
-- Ai được chơi: mở → mọi người trừ acc phụ; thử nghiệm → admin + acc phụ.
create or replace function public.fco_pvp_allowed(p_uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.fco_pvp_is_open() then not public.fco_is_sub(p_uid)
    else exists (select 1 from public.fco_admins a where a.user_id = p_uid) or public.fco_is_sub(p_uid) end
$$;
create or replace function public.fco_pvp_require_access(p_uid uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if public.fco_pvp_allowed(p_uid) then return; end if;
  if public.fco_pvp_is_open() then raise exception 'FCO_SUB_ACCOUNT' using errcode = 'P0001', hint = 'pvp'; end if;
  raise exception 'FCO_PVP_CLOSED' using errcode = 'P0001';
end;
$$;

-- Game hỏi khi vào trang Penalty: có hiện nút "Đấu với người chơi" không, đang thử nghiệm hay đã mở, có phải admin.
create or replace function public.fco_pvp_access() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return jsonb_build_object('open', public.fco_pvp_is_open(), 'allowed', public.fco_pvp_allowed(uid),
    'admin', exists (select 1 from public.fco_admins a where a.user_id = uid));
end;
$$;

-- Admin mở cho mọi người / đưa về thử nghiệm.
create or replace function public.fco_admin_pvp_open(p_open boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  if p_open is null then raise exception 'FCO_BAD_REQUEST' using errcode = '22023'; end if;
  update public.fco_pvp_settings set open = p_open, updated_at = now() where id = 1;
  return public.fco_pvp_access();
end;
$$;

-- Như 202611240006, thay bước chặn acc phụ bằng kiểm tra quyền chơi (thử nghiệm / đã mở).
create or replace function public.fco_pvp_find() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches := public.fco_pvp_mine(uid); rules jsonb := public.fco_pvp_rules();
begin
  perform public.fco_pvp_require_access(uid);
  if m.id is not null then return public.fco_pvp_json(m, uid); end if;
  perform pg_advisory_xact_lock(hashtext('fco_pvp_queue'));
  -- Người chờ đã rời (không còn hỏi trạng thái) thì huỷ chỗ chờ.
  update public.fco_pvp_matches set status = 'cancelled', finished_at = now()
   where mode = 'random' and status = 'waiting' and p1_seen < now() - make_interval(secs => (rules->>'queueSeconds')::integer);
  select * into m from public.fco_pvp_matches
   where mode = 'random' and status = 'waiting' and p1 <> uid
   order by created_at limit 1 for update skip locked;
  if m.id is not null then
    update public.fco_pvp_matches set p2 = uid, p2_seen = now(), status = 'playing', round = 1, started_at = now(),
      deadline = now() + make_interval(secs => (rules->>'roundSeconds')::integer) where id = m.id returning * into m;
  else
    insert into public.fco_pvp_matches(mode, p1) values ('random', uid) returning * into m;
  end if;
  return public.fco_pvp_json(m, uid);
end;
$$;

create or replace function public.fco_pvp_room_create() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches := public.fco_pvp_mine(uid);
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text;
begin
  perform public.fco_pvp_require_access(uid);
  if m.id is not null then raise exception 'FCO_PVP_BUSY' using errcode = 'P0001'; end if;
  for attempt in 1..20 loop
    c := ''; for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1); end loop;
    exit when not exists (select 1 from public.fco_pvp_matches where code = c);
  end loop;
  insert into public.fco_pvp_matches(mode, p1, code) values ('room', uid, c) returning * into m;
  return public.fco_pvp_json(m, uid);
end;
$$;

create or replace function public.fco_pvp_room_join(p_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); m public.fco_pvp_matches := public.fco_pvp_mine(uid); rules jsonb := public.fco_pvp_rules();
begin
  perform public.fco_pvp_require_access(uid);
  if m.id is not null then raise exception 'FCO_PVP_BUSY' using errcode = 'P0001'; end if;
  select * into m from public.fco_pvp_matches where code = upper(trim(coalesce(p_code, ''))) and mode = 'room' for update;
  if not found or m.status <> 'waiting' then raise exception 'FCO_PVP_NO_ROOM' using errcode = 'P0001'; end if;
  if m.p1 = uid then raise exception 'FCO_PVP_OWN_ROOM' using errcode = 'P0001'; end if;
  update public.fco_pvp_matches set p2 = uid, p2_seen = now(), status = 'playing', round = 1, started_at = now(), code = null,
    deadline = now() + make_interval(secs => (rules->>'roundSeconds')::integer) where id = m.id returning * into m;
  return public.fco_pvp_json(m, uid);
end;
$$;


revoke all on function public.fco_pvp_is_open(), public.fco_pvp_allowed(uuid), public.fco_pvp_require_access(uuid) from public, anon, authenticated;
revoke all on function public.fco_pvp_access(), public.fco_admin_pvp_open(boolean) from public, anon;
grant execute on function public.fco_pvp_access(), public.fco_admin_pvp_open(boolean) to authenticated;

commit;