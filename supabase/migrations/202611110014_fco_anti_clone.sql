-- Hạn chế tài khoản clone (2026-11-11, sau 202611110013).
--   · Mỗi trình duyệt có một mã thiết bị ngẫu nhiên (localStorage 'fco-device', src/device.ts) gửi kèm fco_heartbeat (không thêm request).
--     Máy chủ lưu cặp tài khoản – thiết bị – IP (IP lấy từ header x-forwarded-for của request) ở fco_devices; tự xoá sau 90 ngày.
--   · Giới hạn quà theo thiết bị: thiết bị nào đã nhận quà ngày / điểm danh, lượt Bi Lắc miễn phí cho một tài khoản trong ngày thì tài khoản
--     khác trên thiết bị đó (dùng trong 2 ngày gần đây) không nhận được nữa; mỗi gift code chỉ nhận 1 lần trên một thiết bị.
--     Làm bằng trigger trên fco_wallets / fco_gift_redemptions nên không phải định nghĩa lại các hàm nhận quà.
--     Admin bỏ qua giới hạn; thiết bị admin bấm "Cho phép" (người nhà dùng chung máy) cũng bỏ qua.
--   · fco_admin_clone_groups: nhóm tài khoản dùng chung thiết bị (>= 2) hoặc chung IP (>= 3) cho mục Nghi clone.
begin;

create table public.fco_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device text not null,
  ip text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device, ip)
);
create index fco_devices_device on public.fco_devices(device);
create index fco_devices_ip on public.fco_devices(ip);
alter table public.fco_devices enable row level security;

create table public.fco_device_claims (
  device text not null,
  kind text not null,                 -- 'daily:<ngày>', 'bilac:<ngày>', 'gift:<mã băm>'
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (device, kind)
);
alter table public.fco_device_claims enable row level security;

create table public.fco_device_allow (device text primary key, note text, at timestamptz not null default now());
alter table public.fco_device_allow enable row level security;

-- IP của request hiện tại (PostgREST đưa header vào request.headers); không có thì ''.
create function public.fco_request_ip() returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(trim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json->>'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1)), ''), '')
$$;

-- Như 202611070003, thêm mã thiết bị: lưu cặp tài khoản – thiết bị – IP (cập nhật tối đa 10 phút một lần).
drop function public.fco_heartbeat();
create function public.fco_heartbeat(p_device text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); prev timestamptz; add integer; v_ip text := public.fco_request_ip();
begin
  if p_device is not null and p_device ~ '^[0-9a-f-]{36}$' then
    insert into public.fco_devices as d (user_id, device, ip) values (uid, p_device, v_ip)
    on conflict (user_id, device, ip) do update set last_seen = now() where d.last_seen < now() - interval '10 minutes';
  end if;
  select last_seen into prev from public.fco_presence where user_id = uid for update;
  if prev is null then
    insert into public.fco_presence(user_id) values (uid) on conflict (user_id) do nothing;
    return;
  end if;
  add := least(greatest(floor(extract(epoch from now() - prev)), 0), 90)::integer;
  update public.fco_presence set last_seen = now(), play_seconds = play_seconds + add where user_id = uid;
  if add > 0 then
    insert into public.fco_play_days(user_id, day, seconds) values (uid, public.fco_today(), add)
    on conflict (user_id, day) do update set seconds = public.fco_play_days.seconds + excluded.seconds;
  end if;
  -- Dọn dữ liệu thiết bị cũ (thỉnh thoảng, khoảng 1/200 lượt).
  if random() < .005 then
    delete from public.fco_devices where last_seen < now() - interval '90 days';
    delete from public.fco_device_claims where at < now() - interval '90 days' and kind not like 'gift:%';
  end if;
end;
$$;

-- Ghi nhận một lượt nhận quà theo các thiết bị tài khoản này dùng trong 2 ngày gần đây; thiết bị đã nhận cho tài khoản khác thì chặn.
create function public.fco_device_claim(p_uid uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare other text;
begin
  if exists (select 1 from public.fco_admins where user_id = p_uid) then return; end if;
  select c.user_id::text into other from public.fco_devices d
    join public.fco_device_claims c on c.device = d.device and c.kind = p_kind and c.user_id <> p_uid
   where d.user_id = p_uid and d.last_seen > now() - interval '2 days'
     and not exists (select 1 from public.fco_device_allow a where a.device = d.device)
   limit 1;
  if other is not null then raise exception 'FCO_DEVICE_LIMIT' using errcode = 'P0001'; end if;
  insert into public.fco_device_claims(device, kind, user_id)
  select distinct d.device, p_kind, p_uid from public.fco_devices d
   where d.user_id = p_uid and d.last_seen > now() - interval '2 days'
     and not exists (select 1 from public.fco_device_allow a where a.device = d.device)
  on conflict do nothing;
end;
$$;

-- Quà ngày / điểm danh (daily đổi sang hôm nay) và lượt Bi Lắc miễn phí (bilac_free_day đổi sang hôm nay).
create function public.fco_device_wallet_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.daily is distinct from old.daily and new.daily = public.fco_today() then
    perform public.fco_device_claim(new.user_id, 'daily:' || public.fco_today());
  end if;
  if new.bilac_free_day is distinct from old.bilac_free_day and new.bilac_free_day = public.fco_today() then
    perform public.fco_device_claim(new.user_id, 'bilac:' || public.fco_today());
  end if;
  return new;
end;
$$;
create trigger fco_device_wallet_guard before update of daily, bilac_free_day on public.fco_wallets
  for each row execute function public.fco_device_wallet_guard();

-- Gift code: mỗi mã một lần trên một thiết bị.
create function public.fco_device_gift_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_device_claim(new.user_id, 'gift:' || new.hash);
  return new;
end;
$$;
create trigger fco_device_gift_guard before insert on public.fco_gift_redemptions
  for each row execute function public.fco_device_gift_guard();

-- Admin: nhóm tài khoản nghi clone. Chung thiết bị (>= 2 tài khoản) đáng tin; chung IP (>= 3) chỉ để tham khảo (wifi gia đình, 4G dùng chung IP).
create function public.fco_admin_clone_groups() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  return coalesce((select jsonb_agg(g order by (g->>'kind') = 'ip', jsonb_array_length(g->'accounts') desc) from (
    select jsonb_build_object('kind', k.kind, 'key', k.key, 'allowed', exists (select 1 from public.fco_device_allow a where k.kind = 'device' and a.device = k.key),
      'accounts', (select jsonb_agg(jsonb_build_object('id', u.id, 'login', split_part(u.email, '@', 1),
          'registered', (extract(epoch from u.created_at) * 1000)::bigint,
          'lastSeen', (select (extract(epoch from max(d.last_seen)) * 1000)::bigint from public.fco_devices d where d.user_id = u.id),
          'topup', coalesce((select sum(l.delta) from public.fco_fc_ledger l where l.user_id = u.id and l.reason = 'admin' and l.delta > 0), 0),
          'locked', coalesce(u.banned_until > now(), false),
          'admin', exists (select 1 from public.fco_admins a where a.user_id = u.id)) order by u.created_at)
        from auth.users u where u.id = any(k.users))) as g
    from (
      select 'device' as kind, device as key, array_agg(distinct user_id) as users from public.fco_devices group by device having count(distinct user_id) >= 2
      union all
      select 'ip', ip, array_agg(distinct user_id) from public.fco_devices where ip <> '' group by ip having count(distinct user_id) >= 3
    ) k) s), '[]'::jsonb);
end;
$$;

-- Admin cho phép / bỏ cho phép một thiết bị dùng chung (không tính giới hạn quà, không hiện trong Nghi clone theo thiết bị).
create function public.fco_admin_device_allow(p_device text, p_allow boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  if p_allow then insert into public.fco_device_allow(device) values (p_device) on conflict do nothing;
  else delete from public.fco_device_allow where device = p_device; end if;
end;
$$;

revoke all on function public.fco_request_ip(), public.fco_device_claim(uuid, text), public.fco_device_wallet_guard(), public.fco_device_gift_guard() from public, anon, authenticated;
revoke all on function public.fco_heartbeat(text), public.fco_admin_clone_groups(), public.fco_admin_device_allow(text, boolean) from public, anon;
grant execute on function public.fco_heartbeat(text), public.fco_admin_clone_groups(), public.fco_admin_device_allow(text, boolean) to authenticated;

commit;
