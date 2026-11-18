begin;

-- Hệ số tỷ lệ đập thẻ riêng cho từng tài khoản (người dùng 2026-11-18: "điều chỉnh tỉ lệ đập thẻ cho 1 acc").
--   • Admin đặt hệ số nhân (0 – 10, vd. 1,5 = tăng 50%, 0,5 = giảm một nửa) ở Quản trị FC → Tài khoản → Hạng tài khoản.
--   • Áp cho mọi cấp, giữ tới khi admin tắt (đặt 1 = xoá dòng).
--   • ẨN: màn đập thẻ, kết quả 'rate' và lịch sử vẫn hiện tỷ lệ gốc; chỉ xác suất máy chủ dùng để quyết định thành công đổi
--     (tối đa 100%). Người chơi không đọc được bảng này.
--   • fco_inv_upgrade chép nguyên bản đang chạy (202611110012_fco_stp_missions.sql), chỉ đổi dòng quyết định thành công.
-- Chạy lại được.

create table if not exists public.fco_upgrade_boost (
  user_id uuid primary key references auth.users(id) on delete cascade,
  factor numeric(6, 3) not null check (factor >= 0 and factor <= 10 and factor <> 1),
  note text not null default '',
  admin_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.fco_upgrade_boost enable row level security;
revoke all on public.fco_upgrade_boost from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fco_inv_upgrade(p_catalog text, p_target text, p_materials text[], p_protect integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Hệ số riêng từng tài khoản (fco_upgrade_boost, admin đặt, ẩn): chỉ đổi xác suất thật; 'rate' trả về / lịch sử vẫn là tỷ lệ gốc.
  success := random() * 100 < least(100, rate * coalesce((select b.factor from public.fco_upgrade_boost b where b.user_id = uid), 1));
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
$function$;

-- Đọc / đặt hệ số của một tài khoản. p_factor null = chỉ đọc; 1 = tắt (về tỷ lệ gốc).
create or replace function public.fco_admin_upgrade_boost(p_user uuid, p_factor numeric default null, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); row public.fco_upgrade_boost;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_factor is not null then
    if p_factor < 0 or p_factor > 10 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
    if round(p_factor, 3) = 1 then
      delete from public.fco_upgrade_boost where user_id = p_user;
    else
      insert into public.fco_upgrade_boost as b (user_id, factor, note, admin_id, updated_at)
      values (p_user, round(p_factor, 3), left(trim(coalesce(p_note, '')), 200), admin_id, now())
      on conflict (user_id) do update set factor = excluded.factor, note = excluded.note, admin_id = excluded.admin_id, updated_at = now();
    end if;
  end if;
  select * into row from public.fco_upgrade_boost where user_id = p_user;
  return jsonb_build_object('factor', coalesce(row.factor, 1), 'note', coalesce(row.note, ''),
    'at', case when row.user_id is null then null else (extract(epoch from row.updated_at) * 1000)::bigint end);
end;
$$;

-- Mọi tài khoản đang có hệ số riêng (mới sửa trước).
create or replace function public.fco_admin_upgrade_boosts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('user', b.user_id, 'login', public.fco_login_name(u.email), 'factor', b.factor, 'note', b.note,
      'at', (extract(epoch from b.updated_at) * 1000)::bigint) order by b.updated_at desc)
    from public.fco_upgrade_boost b join auth.users u on u.id = b.user_id), '[]'::jsonb);
end;
$$;

revoke all on function public.fco_admin_upgrade_boost(uuid, numeric, text), public.fco_admin_upgrade_boosts() from public, anon, authenticated;
grant execute on function public.fco_admin_upgrade_boost(uuid, numeric, text), public.fco_admin_upgrade_boosts() to authenticated;

commit;
