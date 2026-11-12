-- Dòng LIVE trang chủ (2026-11-12, sau 202611120007): tin chúc mừng chung cho mọi người chơi.
--   · Mở gói ra thẻ OVR > 133 (mỗi lượt mở chỉ đăng thẻ tốt nhất) — gắn vào fco_inv_best (mọi kiểu mở gói đều gọi với các thẻ vừa mở).
--   · Đập thẻ thành công lên OVR > 133 — gắn vào fco_stp_mission_upgrade (fco_inv_upgrade gọi sau mỗi lần thành công).
--   · Lên Top 1 một bảng xếp hạng: Đập thẻ OVR cao nhất / Giá trị đội hình / Penalty (fco_ranks), GLXH (fco_ranked) — trigger.
--     Mỗi người mỗi bảng tối đa 1 tin / 6 giờ (tránh lặp khi hai người thay nhau giữ top).
--   · fco_live_feed(): tin trong 24 giờ, mới nhất trước, tối đa 20. Không có tin thì game để trống dòng LIVE.
begin;

create table public.fco_live_feed (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,
  user_id uuid references auth.users(id) on delete cascade,
  text text not null
);
create index fco_live_feed_at on public.fco_live_feed(at desc);
create index fco_live_feed_user_kind on public.fco_live_feed(user_id, kind, at desc);
alter table public.fco_live_feed enable row level security;
revoke all on public.fco_live_feed from public, anon, authenticated;

-- Mốc OVR để chúc mừng (mở gói / đập thẻ): trên 133.
create function public.fco_live_min_ovr() returns integer language sql immutable set search_path = '' as $$ select 133 $$;

-- Đăng một tin. p_cooldown: cùng người + cùng loại trong khoảng này thì bỏ qua. Giữ tối đa 300 tin, xoá tin quá 3 ngày.
create function public.fco_live_post(p_uid uuid, p_kind text, p_text text, p_cooldown interval default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_uid is null or p_text is null then return; end if;
  if p_cooldown is not null and exists (select 1 from public.fco_live_feed where user_id = p_uid and kind = p_kind and at > now() - p_cooldown) then return; end if;
  insert into public.fco_live_feed(kind, user_id, text) values (p_kind, p_uid, left(p_text, 220));
  delete from public.fco_live_feed where at < now() - interval '3 days'
    or id < (select coalesce(min(id), 0) from (select id from public.fco_live_feed order by id desc limit 300) s);
end;
$$;

-- Như 202611100013 (thẻ tốt nhất của lượt mở), thêm: thẻ tốt nhất OVR > 133 thì đăng tin chúc mừng.
create or replace function public.fco_inv_best(p_cards jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); top_player integer; top_level integer; top_ovr integer;
begin
  select (c->>'playerId')::integer, (c->>'level')::integer, public.fco_inv_ovr((c->>'playerId')::integer, (c->>'level')::integer)
    into top_player, top_level, top_ovr
    from jsonb_array_elements(p_cards) with ordinality x(c, o)
    order by public.fco_inv_ovr((c->>'playerId')::integer, (c->>'level')::integer) desc, o limit 1;
  if top_player is null then return null; end if;
  if uid is not null and top_ovr > public.fco_live_min_ovr() then
    perform public.fco_live_post(uid, 'pack', '🎁 Chúc mừng HLV ' || public.fco_public_name(uid) || ' mở được ' || public.fco_inv_name(top_player)
      || ' +' || top_level || ' · OVR ' || top_ovr || '!');
  end if;
  return public.fco_inv_name(top_player) || ' +' || top_level || ' · OVR ' || top_ovr;
end;
$$;

-- Như 202611110012 (nhiệm vụ Star Point khi đập thành công), thêm: OVR mới > 133 thì đăng tin chúc mừng.
create or replace function public.fco_stp_mission_upgrade(p_uid uuid, p_player integer, p_level integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare ovr integer := public.fco_inv_ovr(p_player, p_level);
begin
  insert into public.fco_stp_missions(user_id, day, mission)
  select p_uid, public.fco_today(), d.id from public.fco_stp_mission_defs d
  where d.kind = 'upgrade' and p_level >= d.level and public.fco_inv_name(p_player) = any(d.names)
  on conflict do nothing;
  if ovr > public.fco_live_min_ovr() then
    perform public.fco_live_post(p_uid, 'upgrade', '🔥 Chúc mừng HLV ' || public.fco_public_name(p_uid) || ' đập thành công ' || public.fco_inv_name(p_player)
      || ' lên +' || p_level || ' · OVR ' || ovr || '!');
  end if;
end;
$$;

-- Top 1 BXH HLV: điểm mới vượt hẳn mọi người khác, trước đó chưa vượt (bằng nhau thì người đạt trước giữ top như BXH).
create function public.fco_live_ranks_top() returns trigger language plpgsql security definer set search_path = '' as $$
declare others bigint;
begin
  if new.best_ovr > 0 and (tg_op = 'INSERT' or new.best_ovr > old.best_ovr) then
    select coalesce(max(best_ovr), -1) into others from public.fco_ranks where user_id <> new.user_id;
    if new.best_ovr > others and (tg_op = 'INSERT' or old.best_ovr <= others) then
      perform public.fco_live_post(new.user_id, 'top:ovr', '👑 HLV ' || public.fco_public_name(new.user_id) || ' lên Top 1 BXH Đập thẻ OVR cao nhất (OVR ' || new.best_ovr || ')!', interval '6 hours');
    end if;
  end if;
  if new.squad_value > 0 and (tg_op = 'INSERT' or new.squad_value > old.squad_value) then
    select coalesce(max(squad_value), -1) into others from public.fco_ranks where user_id <> new.user_id;
    if new.squad_value > others and (tg_op = 'INSERT' or old.squad_value <= others) then
      perform public.fco_live_post(new.user_id, 'top:squad', '👑 HLV ' || public.fco_public_name(new.user_id) || ' lên Top 1 BXH Giá trị đội hình!', interval '6 hours');
    end if;
  end if;
  if new.penalty_best > 0 and (tg_op = 'INSERT' or new.penalty_best > old.penalty_best) then
    select coalesce(max(penalty_best), -1) into others from public.fco_ranks where user_id <> new.user_id;
    if new.penalty_best > others and (tg_op = 'INSERT' or old.penalty_best <= others) then
      perform public.fco_live_post(new.user_id, 'top:penalty', '👑 HLV ' || public.fco_public_name(new.user_id) || ' lên Top 1 BXH Penalty (' || new.penalty_best || ' bàn liên tiếp)!', interval '6 hours');
    end if;
  end if;
  return new;
end;
$$;
create trigger fco_live_ranks_top after insert or update on public.fco_ranks for each row execute function public.fco_live_ranks_top();

-- Top 1 GLXH: điểm mới vượt hẳn mọi người khác, trước đó chưa vượt.
create function public.fco_live_ranked_top() returns trigger language plpgsql security definer set search_path = '' as $$
declare others integer;
begin
  if tg_op = 'UPDATE' and new.points <= old.points then return new; end if;
  select coalesce(max(points), -1) into others from public.fco_ranked where user_id <> new.user_id;
  if new.points > others and (tg_op = 'INSERT' or old.points <= others) and exists (select 1 from public.fco_ranked where user_id <> new.user_id) then
    perform public.fco_live_post(new.user_id, 'top:ranked', '👑 HLV ' || public.fco_public_name(new.user_id) || ' lên Top 1 BXH GLXH (' || new.points || ' điểm)!', interval '6 hours');
  end if;
  return new;
end;
$$;
create trigger fco_live_ranked_top after insert or update of points on public.fco_ranked for each row execute function public.fco_live_ranked_top();

-- Tin cho dòng LIVE: 24 giờ gần nhất, mới nhất trước, tối đa 20.
create function public.fco_live_feed() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', (extract(epoch from at) * 1000)::bigint, 'kind', kind, 'text', text) order by id desc), '[]')
  from (select * from public.fco_live_feed where at > now() - interval '24 hours' order by id desc limit 20) s
$$;

revoke all on function public.fco_live_min_ovr(), public.fco_live_post(uuid, text, text, interval), public.fco_live_ranks_top(), public.fco_live_ranked_top() from public, anon, authenticated;
revoke all on function public.fco_live_feed() from public, anon;
grant execute on function public.fco_live_feed() to authenticated;

commit;
