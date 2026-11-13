begin;

-- Reset tài khoản (admin) xoá luôn tiến trình sự kiện Vòng Quanh Thế Giới (2026-11-13, người dùng: "reset acc thì reset luôn điểm sự kiện"):
-- vị trí quân, lượt Chỉ định, vé (BXH Đua top cũng mất theo), mốc Shop Đổi Vé đã nhận. Lượt miễn phí trong ngày giữ nguyên (không cho thêm lượt).
-- "Đã chơi trả phí" (mốc 1 vé chỉ nhận bằng lượt quay trả phí) chỉ tính lượt trả FC sau lần reset gần nhất (sổ FC lý do 'reset').

create or replace function public.fco_vqtg_paid(p_uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fco_fc_ledger l where l.user_id = p_uid and l.reason = 'vqtg'
                   and l.id > coalesce((select max(r.id) from public.fco_fc_ledger r where r.user_id = p_uid and r.reason = 'reset'), 0))
$$;
revoke all on function public.fco_vqtg_paid(uuid) from public, anon, authenticated;

-- Như 202611080010, thêm các cột VQTG.
create or replace function public.fco_admin_account_reset(p_user uuid, p_reset_fc boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); w public.fco_wallets; old_data jsonb; remaining bigint;
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_reset_fc is null then raise exception 'Invalid reset option' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(p_user);
  remaining := case when p_reset_fc then 0 else w.fc end;
  update public.fco_wallets set fc = remaining, event_points = 0, event_free = 0, event_paid = 0, event_missions = '{}',
    bilac_points = 0, bilac_claimed = '{}', checkin_day = 0,
    vqtg_pos = 0, vqtg_picks = 0, vqtg_tickets = 0, vqtg_tickets_at = null, vqtg_claimed = '{}', updated_at = now()
  where user_id = p_user;
  select data into old_data from public.fco_game_saves where user_id = p_user for update;
  -- Chưa có bản lưu thì không có gì để xoá; lần đầu vào game sẽ tự tạo bản trống.
  if found then
    update public.fco_game_saves set revision = revision + 1, updated_at = now(), data =
      jsonb_build_object('version', 1, 'balance', 0, 'cards', '[]'::jsonb, 'history', '[]'::jsonb, 'unopened', '{}'::jsonb, 'daily', '', 'opened', 0, 'upgrades', 0,
        'sound', coalesce(old_data->'sound', 'false'::jsonb), 'reduced', coalesce(old_data->'reduced', 'false'::jsonb))
      || jsonb_strip_nulls(jsonb_build_object('reset', old_data->'reset', 'bpReset', old_data->'bpReset', 'quick', old_data->'quick', 'light', old_data->'light', 'codes', old_data->'codes'))
    where user_id = p_user;
  end if;
  delete from public.fco_ranks where user_id = p_user;
  insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, actor)
  values (p_user, remaining - w.fc, remaining, 'reset', jsonb_build_object('resetFc', p_reset_fc), admin_id);
  return jsonb_build_object('reset', true, 'fc', remaining);
end;
$$;

-- Như 202611130006, 'paid' tính sau lần reset gần nhất.
create or replace function public.fco_wallet_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'fc', w.fc,
    'stp', w.stp,
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
    'vqtg', jsonb_build_object('pos', w.vqtg_pos, 'picks', w.vqtg_picks, 'tickets', w.vqtg_tickets, 'freeToday', w.vqtg_free_day is distinct from public.fco_today(),
      'claimed', to_jsonb(w.vqtg_claimed), 'paid', public.fco_vqtg_paid(w.user_id)),
    'membership', jsonb_build_object(
      'svip', (extract(epoch from w.svip_until) * 1000)::bigint,
      'premium', (extract(epoch from w.premium_until) * 1000)::bigint),
    'tier', public.fco_account_tier(w.user_id),
    'tierUntil', case when public.fco_account_tier(w.user_id) <> 'classic' then (extract(epoch from w.account_tier_until) * 1000)::bigint end,
    'effect', public.fco_name_effect(w.user_id),
    'club', w.club_logo,
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

-- Như 202611130006, điều kiện mốc lượt trả phí tính sau lần reset gần nhất.
create or replace function public.fco_vqtg_claim(p_index integer, p_choice integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; m public.fco_vqtg_milestones;
  round_size bigint; reached bigint; done integer; rewards jsonb; fc bigint; claimed integer[]; granted jsonb;
begin
  w := public.fco_wallet_lock(uid);
  select * into m from public.fco_vqtg_milestones where idx = p_index;
  if not found then raise exception 'FCO_MILESTONE_UNKNOWN' using errcode = '22023'; end if;
  if m.paid_only and not public.fco_vqtg_paid(uid) then
    raise exception 'FCO_MILESTONE_PAID_ONLY' using errcode = 'P0001';
  end if;
  select max(tickets) into round_size from public.fco_vqtg_milestones;
  reached := case when w.vqtg_tickets < m.tickets then 0 when m.once then 1 else 1 + (w.vqtg_tickets - m.tickets) / round_size end;
  done := coalesce(w.vqtg_claimed[p_index + 1], 0);
  if reached = 0 then raise exception 'FCO_MILESTONE_LOCKED' using errcode = 'P0001'; end if;
  if done >= reached then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  if jsonb_array_length(m.options) = 1 then rewards := m.options -> 0;
  elsif p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(m.options) then raise exception 'FCO_MILESTONE_CHOICE' using errcode = '22023';
  else rewards := m.options -> p_choice; end if;
  claimed := array(select case when i = p_index + 1 then done + 1 else coalesce(w.vqtg_claimed[i], 0) end
                   from generate_series(1, greatest(coalesce(array_upper(w.vqtg_claimed, 1), 0), p_index + 1)) i order by i);
  update public.fco_wallets set vqtg_claimed = claimed where user_id = uid;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(rewards) r where r ? 'fc';
  if fc > 0 then perform public.fco_apply_fc(uid, fc, 'vqtg_milestone', jsonb_build_object('index', p_index)); end if;
  granted := public.fco_inv_grant(uid, rewards, 'event', 'Vòng Quanh Thế Giới · Quà mốc ' || m.tickets || ' vé',
    concat_ws(', ', nullif(public.fco_inv_reward_text(rewards), ''),
      (select string_agg('Phiếu giảm giá thuế các mùa ' || (r->>'voucher') || '%' || case when (r->>'count')::integer > 1 then ' x ' || (r->>'count') else '' end, ', ')
         from jsonb_array_elements(rewards) r where r ? 'voucher')));
  return jsonb_build_object('rewards', rewards, 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

commit;
