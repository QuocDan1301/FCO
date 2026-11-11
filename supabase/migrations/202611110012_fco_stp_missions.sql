-- Nhiệm vụ Star Point hằng ngày (2026-11-11, sau 202611110011). Mỗi nhiệm vụ nhận thưởng 1 lần mỗi ngày (giờ Việt Nam, fco_today),
-- và phải đạt trong chính ngày đó. Máy chủ tự ghi nhận khi đạt, người chơi chỉ bấm Nhận (không tin số liệu trình duyệt gửi):
--   · Nâng cấp: fco_inv_upgrade (kho thẻ trên máy chủ) gọi fco_stp_mission_upgrade khi đập thành công; thẻ đạt cấp >= mức nhiệm vụ.
--     Game chưa để máy chủ giữ kho (đập ở trình duyệt) thì không được tính.
--   · Sút phạt đền: trigger trên fco_penalty_runs khi chuỗi bàn liên tiếp vượt mốc.
-- Danh sách nhiệm vụ ở bảng fco_stp_mission_defs, phải khớp src/stp-missions.ts (tests/stp-missions.test.ts).
begin;

create table public.fco_stp_mission_defs (
  id text primary key,
  title text not null,
  kind text not null check (kind in ('upgrade', 'penalty')),
  names text[] not null default '{}',     -- upgrade: tên cầu thủ (mọi mùa)
  level integer,                          -- upgrade: cấp thẻ cần đạt
  goals integer,                          -- penalty: số bàn liên tiếp
  reward integer not null check (reward > 0),
  sort integer not null
);
alter table public.fco_stp_mission_defs enable row level security;
insert into public.fco_stp_mission_defs(id, title, kind, names, level, goals, reward, sort) values
  ('messi8', 'Nâng cấp L. Messi mùa bất kì lên +8', 'upgrade', '{"L. Messi"}', 8, null, 25, 1),
  ('ronaldo8', 'Nâng cấp C. Ronaldo mùa bất kì lên +8', 'upgrade', '{"Cristiano Ronaldo"}', 8, null, 25, 2),
  ('penalty20', 'Đạt 20 bàn liên tiếp trong Sút phạt đền', 'penalty', '{}', null, 20, 20, 3),
  ('messi7', 'Nâng cấp L. Messi mùa bất kì lên +7', 'upgrade', '{"L. Messi"}', 7, null, 15, 4),
  ('ronaldo7', 'Nâng cấp C. Ronaldo mùa bất kì lên +7', 'upgrade', '{"Cristiano Ronaldo"}', 7, null, 15, 5);

create table public.fco_stp_missions (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  mission text not null references public.fco_stp_mission_defs(id) on delete cascade,
  done_at timestamptz not null default now(),
  claimed_at timestamptz,
  primary key (user_id, day, mission)
);
alter table public.fco_stp_missions enable row level security;

-- Ghi nhận nâng cấp thành công: mọi nhiệm vụ nâng cấp có tên cầu thủ này và cấp mới đạt mức.
create function public.fco_stp_mission_upgrade(p_uid uuid, p_player integer, p_level integer) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.fco_stp_missions(user_id, day, mission)
  select p_uid, public.fco_today(), d.id from public.fco_stp_mission_defs d
  where d.kind = 'upgrade' and p_level >= d.level and public.fco_inv_name(p_player) = any(d.names)
  on conflict do nothing
$$;

-- Ghi nhận chuỗi bàn sút phạt khi vượt mốc.
create function public.fco_stp_mission_penalty() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fco_stp_missions(user_id, day, mission)
  select new.user_id, public.fco_today(), d.id from public.fco_stp_mission_defs d
  where d.kind = 'penalty' and new.streak >= d.goals
  on conflict do nothing;
  return new;
end;
$$;
create trigger fco_stp_mission_penalty after update of streak on public.fco_penalty_runs
  for each row when (new.streak > old.streak) execute function public.fco_stp_mission_penalty();

-- Danh sách nhiệm vụ hôm nay của người chơi: đã đạt / đã nhận.
create function public.fco_stp_missions_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return jsonb_build_object('day', public.fco_today(), 'missions', coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'reward', d.reward, 'done', m.mission is not null, 'claimed', m.claimed_at is not null) order by d.sort)
    from public.fco_stp_mission_defs d
    left join public.fco_stp_missions m on m.user_id = uid and m.day = public.fco_today() and m.mission = d.id), '[]'::jsonb));
end;
$$;

-- Nhận thưởng một nhiệm vụ đã đạt hôm nay (mỗi ngày một lần): cộng STP (sổ cái lý do 'mission').
create function public.fco_stp_mission_claim(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); d public.fco_stp_mission_defs; m public.fco_stp_missions;
begin
  select * into d from public.fco_stp_mission_defs where id = p_id;
  if not found then raise exception 'FCO_STP_MISSION_UNKNOWN' using errcode = '22023'; end if;
  perform public.fco_wallet_lock(uid);
  select * into m from public.fco_stp_missions where user_id = uid and day = public.fco_today() and mission = p_id for update;
  if not found then raise exception 'FCO_STP_MISSION_INCOMPLETE' using errcode = 'P0001'; end if;
  if m.claimed_at is not null then raise exception 'FCO_STP_MISSION_CLAIMED' using errcode = 'P0001'; end if;
  update public.fco_stp_missions set claimed_at = now() where user_id = uid and day = m.day and mission = p_id;
  perform public.fco_apply_stp(uid, d.reward, 'mission', jsonb_build_object('mission', p_id, 'day', m.day));
  return jsonb_build_object('wallet', public.fco_wallet_json(uid), 'reward', d.reward, 'state', public.fco_stp_missions_state());
end;
$$;

-- Như 202611100013, thêm ghi nhận nhiệm vụ Star Point khi đập thành công.
create or replace function public.fco_inv_upgrade(p_catalog text, p_target text, p_materials text[], p_protect integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb := public.fco_inv_lock(uid);
  target jsonb; mat jsonb; m text; t_player integer; t_level integer; t_ovr integer; max_level integer := (rules->>'maxLevel')::integer;
  total double precision := 0; energy double precision; base double precision; chance double precision; rate double precision;
  pct integer := coalesce(p_protect, 0); price bigint; cost bigint := 0; power double precision := 0; keep integer := 1; restore_chance integer := 0;
  success boolean; drop_to integer; shielded boolean := false; restored integer; new_level integer; weights jsonb; left_w double precision; w jsonb;
  transition text; name text; result jsonb; cards jsonb;
begin
  target := public.fco_inv_card(d, p_target);
  if target is null or (target->>'level')::integer >= max_level then raise exception 'FCO_BAD_TARGET' using errcode = 'P0001'; end if;
  if p_materials is null or coalesce(array_length(p_materials, 1), 0) not between 1 and 5
     or (select count(distinct x) from unnest(p_materials) x) <> array_length(p_materials, 1) or p_target = any(p_materials) then
    raise exception 'FCO_BAD_MATERIALS' using errcode = 'P0001';
  end if;
  t_player := (target->>'playerId')::integer; t_level := (target->>'level')::integer; t_ovr := public.fco_inv_ovr(t_player, t_level);
  if t_ovr is null then raise exception 'FCO_UNKNOWN_PLAYER' using errcode = 'P0001'; end if;
  foreach m in array p_materials loop
    mat := public.fco_inv_card(d, m);
    if mat is null then raise exception 'FCO_MATERIAL_MISSING' using errcode = 'P0001'; end if;
    if public.fco_inv_locked(d, m) then raise exception 'FCO_MATERIAL_LOCKED' using errcode = 'P0001'; end if;
    total := total + floor(public.fco_inv_gauge(rules, t_ovr, public.fco_inv_ovr((mat->>'playerId')::integer, (mat->>'level')::integer)) * 200 + 0.5) / 10;
    -- Khôi phục: chỉ phôi cùng mã cầu thủ (cùng mùa) đóng góp.
    if t_level >= (rules->>'restoreMin')::integer and (mat->>'playerId')::integer = t_player then
      if (mat->>'level')::integer >= t_level then power := power + 1; keep := greatest(keep, t_level);
      elsif (mat->>'level')::integer = t_level - 1 then power := power + .85; keep := greatest(keep, t_level);
      else power := power + case when (mat->>'level')::integer >= 3 then .5 else .2 end; keep := greatest(keep, (rules->>'restoreMin')::integer); end if;
    end if;
  end loop;
  energy := floor(least(100, total) * 10 + 0.5) / 10;
  base := (rules->'chances'->>t_level)::double precision;
  chance := floor(base * energy + 0.5) / 100;
  rate := least(100, floor(chance * 1000 + 0.5) / 1000);
  restore_chance := least(100, floor(power * 100 + 0.5)::integer);
  if pct > 0 then
    if pct > 100 or pct % 10 <> 0 then raise exception 'FCO_BAD_PROTECTION' using errcode = '22023'; end if;
    if t_level < (rules->>'protectMin')::integer then raise exception 'FCO_PROTECTION_LEVEL' using errcode = 'P0001'; end if;
    price := public.fco_inv_price(t_player, t_level);
    if price is null then raise exception 'FCO_NO_PRICE' using errcode = 'P0001'; end if;
    cost := floor(floor(price * (select insurance from public.fco_cat_players where id = t_player) + 0.5) * pct / 100 + 0.5)::bigint;
    if coalesce((d->>'balance')::bigint, 0) < cost then raise exception 'FCO_NOT_ENOUGH_BP' using errcode = 'P0001'; end if;
  end if;
  success := random() * 100 < rate;
  if not success then
    weights := coalesce(rules->'dropWeights'->(t_level::text), '[[1, 100]]'::jsonb);
    left_w := random() * (select sum((x->>1)::double precision) from jsonb_array_elements(weights) x);
    for w in select value from jsonb_array_elements(weights) loop
      drop_to := (w->>0)::integer;
      exit when left_w < (w->>1)::double precision;
      left_w := left_w - (w->>1)::double precision;
    end loop;
    shielded := pct > 0 and random() * 100 < pct;
    if not shielded and restore_chance > 0 and random() * 100 < restore_chance and keep > drop_to then restored := keep; end if;
  end if;
  new_level := case when success then t_level + 1 when shielded then t_level else coalesce(restored, drop_to) end;
  select coalesce(jsonb_agg(case when c->>'uid' = p_target then jsonb_set(c, '{level}', to_jsonb(new_level)) else c end order by o), '[]') into cards
    from jsonb_array_elements(d->'cards') with ordinality x(c, o) where not (c->>'uid' = any(p_materials));
  name := public.fco_inv_name(t_player);
  transition := case when shielded then '+' || t_level || ' → giữ nguyên +' || t_level || ' · Bảo vệ nâng cấp'
                     when restored is not null then '+' || t_level || ' → +' || drop_to || ' → +' || new_level || ' · Khôi phục cấp thẻ'
                     else '+' || t_level || ' → +' || new_level end;
  d := d || jsonb_build_object('cards', cards, 'balance', coalesce((d->>'balance')::bigint, 0) - cost, 'upgrades', coalesce((d->>'upgrades')::bigint, 0) + 1);
  d := public.fco_inv_history(d, 'upgrade', case when success then 'Thành công · ' else 'Thất bại · ' end || name,
    transition || ' · ' || array_length(p_materials, 1) || ' nguyên liệu' || case when pct > 0 then ' · Bảo vệ ' || pct || '%' else '' end
    || case when cost > 0 then ' · −' || public.fco_inv_money(cost) || ' BP' else '' end, success);
  if success then
    insert into public.fco_ranks as r (user_id, best_ovr, best_player, best_level, best_at)
    values (uid, public.fco_inv_ovr(t_player, new_level), t_player, new_level, now())
    on conflict (user_id) do update set best_ovr = excluded.best_ovr, best_player = excluded.best_player, best_level = excluded.best_level, best_at = excluded.best_at
    where excluded.best_ovr > r.best_ovr;
    -- Nhiệm vụ Star Point hằng ngày (202611110012): ghi nhận nâng cấp thành công.
    perform public.fco_stp_mission_upgrade(uid, t_player, new_level);
  end if;
  result := jsonb_build_object('success', success, 'card', jsonb_set(target, '{level}', to_jsonb(new_level)), 'before', t_level,
    'drop', case when success then null else drop_to end, 'restored', restored, 'shielded', shielded, 'cost', cost, 'rate', rate, 'energy', energy,
    'restoreChance', restore_chance, 'keep', keep);
  return result || jsonb_build_object('save', public.fco_inv_store(uid, d));
end;
$$;


revoke all on function public.fco_stp_mission_upgrade(uuid, integer, integer), public.fco_stp_mission_penalty() from public, anon, authenticated;
revoke all on function public.fco_stp_missions_state(), public.fco_stp_mission_claim(text) from public, anon;
grant execute on function public.fco_stp_missions_state(), public.fco_stp_mission_claim(text) to authenticated;

commit;
