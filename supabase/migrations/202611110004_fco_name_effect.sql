-- Hiệu ứng avatar + tên cho tài khoản Premium (2026-11-11, sau 202611110003). Người chơi Premium tự chọn ở Thông tin HLV
-- (src/ProfileCard.tsx, danh sách ở src/name-effects.ts); hiện ở avatar trên thanh trên cùng, bảng Thông tin HLV và tên trên BXH.
--   · Chỉ tài khoản Premium (fco_wallets.account_tier, admin đặt) mới đặt được; về Classic thì hiệu ứng không hiện (lựa chọn vẫn giữ,
--     lên Premium lại thì hiện lại).
--   · Đổi danh sách hiệu ứng: sửa cả ràng buộc check dưới đây và src/name-effects.ts (tests/name-effects.test.ts kiểm tra khớp).
begin;

alter table public.fco_wallets add column name_effect text check (name_effect in ('gold', 'fire', 'ice', 'neon', 'galaxy'));

-- Hiệu ứng đang hiện của một tài khoản (null nếu không phải Premium hoặc chưa chọn).
create function public.fco_name_effect(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when w.account_tier = 'premium' then w.name_effect end from public.fco_wallets w where w.user_id = p_uid
$$;

-- Như 202611110003, thêm hiệu ứng đang hiện.
create or replace function public.fco_wallet_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'fc', w.fc,
    'dailyClaimed', w.daily is not distinct from public.fco_today(),
    'event', jsonb_build_object(
      'points', w.event_points, 'free', w.event_free,
      'paid', case when w.event_day = public.fco_today() then w.event_paid else 0 end,
      'missions', case when w.event_day = public.fco_today() then to_jsonb(w.event_missions) else '[]'::jsonb end),
    'checkin', case when w.checkin_date = public.fco_today()
      then jsonb_build_object('claimedToday', true, 'day', w.checkin_day, 'done', w.checkin_day)
      else jsonb_build_object('claimedToday', false, 'day', public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today()),
                              'done', public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today()) - 1) end,
    'bilac', jsonb_build_object('points', w.bilac_points, 'claimed', to_jsonb(w.bilac_claimed), 'freeToday', w.bilac_free_day is distinct from public.fco_today()),
    'membership', jsonb_build_object(
      'svip', (extract(epoch from w.svip_until) * 1000)::bigint,
      'premium', (extract(epoch from w.premium_until) * 1000)::bigint),
    'tier', w.account_tier,
    'effect', case when w.account_tier = 'premium' then w.name_effect end,
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

-- Người chơi chọn hiệu ứng (null = không hiệu ứng). Chọn hiệu ứng cần tài khoản Premium; tắt thì ai cũng tắt được.
create function public.fco_set_name_effect(p_effect text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets;
begin
  w := public.fco_wallet_lock(uid);
  if p_effect is not null then
    if w.account_tier is distinct from 'premium' then raise exception 'FCO_PREMIUM_ONLY' using errcode = 'P0001'; end if;
    if p_effect not in ('gold', 'fire', 'ice', 'neon', 'galaxy') then raise exception 'FCO_BAD_EFFECT' using errcode = '22023'; end if;
  end if;
  update public.fco_wallets set name_effect = p_effect, updated_at = now() where user_id = uid;
  return public.fco_wallet_json(uid);
end;
$$;

-- Như 202611080001, thêm hiệu ứng tên của từng HLV trên bảng.
create or replace function public.fco_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); me public.fco_ranks;
begin
  select * into me from public.fco_ranks where user_id = uid;
  return jsonb_build_object(
    'ovr', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'ovr', t.best_ovr, 'playerId', t.best_player,
                       'level', t.best_level, 'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id)) order by t.best_ovr desc, t.best_at)
                     from (select * from public.fco_ranks where best_ovr > 0 order by best_ovr desc, best_at limit 10) t), '[]'::jsonb),
    'squad', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'value', t.squad_value, 'mine', t.user_id = uid,
                       'effect', public.fco_name_effect(t.user_id)) order by t.squad_value desc, t.squad_at)
                     from (select * from public.fco_ranks where squad_value > 0 order by squad_value desc, squad_at limit 10) t), '[]'::jsonb),
    'me', jsonb_build_object(
      'ovr', case when coalesce(me.best_ovr, 0) > 0 then me.best_ovr end,
      'ovrRank', case when coalesce(me.best_ovr, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                 where o.best_ovr > me.best_ovr or (o.best_ovr = me.best_ovr and o.best_at < me.best_at)) end,
      'squad', case when coalesce(me.squad_value, 0) > 0 then me.squad_value end,
      'squadRank', case when coalesce(me.squad_value, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                   where o.squad_value > me.squad_value or (o.squad_value = me.squad_value and o.squad_at < me.squad_at)) end));
end;
$$;

revoke all on function public.fco_name_effect(uuid) from public, anon, authenticated;
revoke all on function public.fco_set_name_effect(text) from public, anon;
grant execute on function public.fco_set_name_effect(text) to authenticated;

commit;
