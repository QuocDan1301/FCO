begin;

-- Tâm điểm TTCN ô 3 "Được xem nhiều nhất" (2026-11-14): đếm lượt mở Thông tin cầu thủ của mọi người chơi theo ngày.
-- Tránh tốn Disk IO: không thêm lệnh riêng — game gom lượt xem trên máy rồi gửi kèm fco_heartbeat (vốn gọi mỗi phút).
-- fco_top_viewed(): 5 cầu thủ nhiều lượt xem nhất 7 ngày gần đây (chỉ đọc). Dọn dữ liệu cũ hơn 30 ngày thỉnh thoảng. Chạy lại được.

create table if not exists public.fco_player_views (
  day date not null,
  player_id integer not null,
  views integer not null default 0 check (views >= 0),
  primary key (day, player_id)
);
alter table public.fco_player_views enable row level security;
revoke all on public.fco_player_views from anon, authenticated;

drop function if exists public.fco_heartbeat(text);
drop function if exists public.fco_heartbeat(text, jsonb);
-- Như 202611110014, thêm p_views.
create function public.fco_heartbeat(p_device text default null, p_views jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); prev timestamptz; add integer; v_ip text := public.fco_request_ip();
begin
  if p_device is not null and p_device ~ '^[0-9a-f-]{36}$' then
    insert into public.fco_devices as d (user_id, device, ip) values (uid, p_device, v_ip)
    on conflict (user_id, device, ip) do update set last_seen = now() where d.last_seen < now() - interval '10 minutes';
  end if;
  -- Lượt xem thẻ (202611140004): game gom trên máy, gửi kèm heartbeat {"<id cầu thủ>": số lần}; tối đa 20 cầu thủ, mỗi cầu thủ tính tối đa 3
  -- lần mỗi lượt gửi (chống bấm spam). Một câu upsert, chỉ khi có lượt xem.
  if jsonb_typeof(p_views) = 'object' then
    insert into public.fco_player_views as v (day, player_id, views)
    select public.fco_today(), k::integer, least(greatest((p_views->>k)::integer, 0), 3)
      from (select k from jsonb_object_keys(p_views) k where k ~ '^[0-9]{1,6}$' and jsonb_typeof(p_views->k) = 'number' limit 20) t
     where least(greatest((p_views->>k)::integer, 0), 3) > 0
    on conflict (day, player_id) do update set views = v.views + excluded.views;
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
    perform public.fco_player_views_cleanup();
  end if;
end;
$$;

create or replace function public.fco_top_viewed() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  return coalesce((select jsonb_agg(jsonb_build_object('id', player_id, 'views', total) order by total desc, player_id)
    from (select player_id, sum(views)::bigint as total from public.fco_player_views
          where day > public.fco_today() - 7 group by player_id order by total desc, player_id limit 5) t), '[]'::jsonb);
end;
$$;

create or replace function public.fco_player_views_cleanup() returns void language sql security definer set search_path = '' as $$
  delete from public.fco_player_views where day < public.fco_today() - 30
$$;

revoke all on function public.fco_heartbeat(text, jsonb), public.fco_top_viewed(), public.fco_player_views_cleanup() from public, anon;
grant execute on function public.fco_heartbeat(text, jsonb), public.fco_top_viewed() to authenticated;

commit;
