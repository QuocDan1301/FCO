begin;

-- Vá bảo mật (2026-11-14, người dùng: "kiểm tra toàn bộ game và xem có lỗ hổng bảo mật hay người chơi có thể cheat không"). Chạy lại được.
-- 1. Sự kiện đã ẩn (Bi Lắc, Nâng Cấp Siêu Sao) vẫn gọi được qua API (kể cả lượt miễn phí hằng ngày): thu quyền chơi / nhận lượt nhiệm vụ.
--    fco_bilac_claim giữ nguyên (chỉ nhận mốc đã đủ điểm từ trước). Mở lại sự kiện: grant execute … to authenticated (xem cuối file).
-- 2. BXH "Giá trị đội hình" tin số game gửi: máy chủ tự tính từ đội hình đang dùng (thẻ trong kho máy chủ × giá hiện tại), bỏ số gửi lên.
-- 3. Lượt xem thẻ (Tâm điểm TTCN) bị thổi phồng nếu gọi heartbeat dồn dập: chỉ tính khi lần báo trước cách ≥ 20 giây.
-- 4. fco_wallet(p_seed_points) cho tài khoản mới tự khai tới 10 triệu điểm sự kiện: bỏ qua, luôn 0.
-- 5. fco_player_views_cleanup chỉ dùng nội bộ: thu quyền người chơi.

revoke all on function public.fco_bilac_play(integer, text) from public, anon, authenticated;
revoke all on function public.fco_event_play(integer, text) from public, anon, authenticated;
revoke all on function public.fco_event_mission(text) from public, anon, authenticated;
revoke all on function public.fco_player_views_cleanup() from public, anon, authenticated;

-- Giá trị đội hình đang dùng = tổng giá hiện tại (fco_inv_price, như marketQuote của game) các thẻ trong 11 ô của bộ đội hình đang chọn,
-- chỉ thẻ có trong kho + danh sách đội (squad), mỗi thẻ tính một lần. Chưa đồng bộ dữ liệu giá thì null.
create or replace function public.fco_squad_value(p_uid uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare d jsonb; act integer := 0; s jsonb; v_uid text; card jsonb; seen text[] := '{}'; total bigint := 0; price bigint;
begin
  if not exists (select 1 from public.fco_cat_players) then return null; end if;
  select data into d from public.fco_game_saves where user_id = p_uid;
  if d is null or jsonb_typeof(d->'lineups') <> 'object' or jsonb_typeof(d->'lineups'->'sets') <> 'array' then return 0; end if;
  if jsonb_typeof(d->'lineups'->'active') = 'number' then act := least(greatest(floor((d->'lineups'->>'active')::numeric)::integer, 0), 2); end if;
  s := d->'lineups'->'sets'->act;
  if s is null or jsonb_typeof(s) <> 'object' or jsonb_typeof(s->'slots') <> 'array' then return 0; end if;
  for i in 0 .. 10 loop
    v_uid := case when jsonb_typeof(s->'slots'->i) = 'string' then s->'slots'->>i end;
    continue when v_uid is null or v_uid = any(seen) or jsonb_typeof(d->'squad') <> 'array' or not (d->'squad') ? v_uid;
    seen := seen || v_uid;
    card := public.fco_inv_card(d, v_uid);
    continue when card is null;
    price := public.fco_inv_price((card->>'playerId')::integer, (card->>'level')::integer, now());
    total := total + coalesce(price, 0);
  end loop;
  return total;
end;
$$;
revoke all on function public.fco_squad_value(uuid) from public, anon, authenticated;

-- Game vẫn gọi khi đội hình đổi (p_value giữ để không phải đổi game), nhưng máy chủ ghi số tự tính.
create or replace function public.fco_rank_squad(p_value bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); v bigint;
begin
  if p_value is null or p_value not between 0 and 1000000000000000000 then raise exception 'FCO_RANK_INVALID' using errcode = 'P0001'; end if;
  v := public.fco_squad_value(uid);
  if v is null then return; end if;
  insert into public.fco_ranks as r (user_id, squad_value, squad_at) values (uid, v, now())
  on conflict (user_id) do update set squad_value = excluded.squad_value, squad_at = excluded.squad_at
  where r.squad_value is distinct from excluded.squad_value;
end;
$$;

-- Sửa lại số đã khai trên BXH: tính lại cho mọi HLV đang có trên bảng.
update public.fco_ranks r set squad_value = v.value
from (select user_id, public.fco_squad_value(user_id) as value from public.fco_ranks where squad_value > 0) v
where r.user_id = v.user_id and v.value is not null and r.squad_value is distinct from v.value;

create or replace function public.fco_heartbeat(p_device text DEFAULT NULL::text, p_views jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := public.fco_require_user(); prev timestamptz; add integer; v_ip text := public.fco_request_ip();
begin
  if p_device is not null and p_device ~ '^[0-9a-f-]{36}$' then
    insert into public.fco_devices as d (user_id, device, ip) values (uid, p_device, v_ip)
    on conflict (user_id, device, ip) do update set last_seen = now() where d.last_seen < now() - interval '10 minutes';
  end if;
  -- Lượt xem thẻ (202611140004): game gom trên máy, gửi kèm heartbeat {"<id cầu thủ>": số lần}; tối đa 20 cầu thủ, mỗi cầu thủ tính tối đa 3
  -- lần mỗi lượt gửi (chống bấm spam). Một câu upsert, chỉ khi có lượt xem.
  select last_seen into prev from public.fco_presence where user_id = uid;
  -- 202611140009: chỉ tính lượt xem khi lần báo trước cách ít nhất 20 giây (game gửi 60 giây / lần), gọi dồn dập không thổi phồng Tâm điểm.
  if jsonb_typeof(p_views) = 'object' and prev is not null and now() - prev >= interval '20 seconds' then
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
$function$;

create or replace function public.fco_wallet(p_seed_points bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid := public.fco_require_user();
begin
  -- 202611140009: bỏ qua điểm sự kiện game tự khai khi tạo ví (chỉ dùng lúc chuyển dữ liệu cũ), luôn bắt đầu từ 0.
  perform public.fco_wallet_lock(uid, 0);
  return public.fco_wallet_json(uid);
end;
$function$;

commit;

-- Mở lại sự kiện sau này:
--   grant execute on function public.fco_bilac_play(integer, text) to authenticated;
--   grant execute on function public.fco_event_play(integer, text) to authenticated;
--   grant execute on function public.fco_event_mission(text) to authenticated;

-- Kiểm tra: kho thẻ phải do máy chủ giữ (true). false = người chơi tự sửa được thẻ / BP / gói trong bản lưu → bật ở Quản trị FC.
select enforced as kho_may_chu_bat_buoc from public.fco_inventory where id = 1;
