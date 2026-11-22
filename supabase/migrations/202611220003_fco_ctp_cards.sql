begin;

-- Cờ tỷ phú · THẺ CƠ HỘI / THẺ KHÍ VẬN (2026-11-22, theo mô tả người dùng gửi). Chạy SAU 202611220002_fco_ctp_milestones.sql. Chạy lại được.
--   · Thẻ Cơ Hội (ngôi sao, mốc 200 điểm): lần bấm chơi này (1 / 10 / 50 / 100 lượt) máy chủ quay 2 lần độc lập từ cùng vị trí → Bộ quà A và
--     Bộ quà B; người chơi chọn 1 bộ (fco_ctp_pick), chỉ bộ được chọn có hiệu lực (ô đứng, điểm, lượt miễn phí, quà). Trả tiền + trừ thẻ ngay
--     lúc bấm; đang chờ chọn thì không chơi tiếp được (FCO_CTP_PENDING). Quà Ultimate / Mini trong bộ được chọn tính theo quỹ lúc chọn.
--   · Thẻ Khí Vận (trái tim, mốc 450 điểm): chọn đúng 3 dải màu bỏ ra cho lần bấm chơi này → cú sút chỉ trúng quà 5 dải còn lại
--     (tỷ lệ giữa 5 dải giữ nguyên tương quan). Trừ 1 thẻ mỗi lần bấm (dù 1 hay 100 lượt).
--   · Dùng cùng lúc 2 thẻ được.
-- fco_ctp_play cũ (integer, text) được thay bằng bản 4 tham số (p_chance, p_exclude mặc định không dùng thẻ).

create table if not exists public.fco_ctp_pending (
  user_id uuid primary key references auth.users(id) on delete cascade,
  count integer not null, mode text not null, price integer not null, exclude text[],
  outcomes jsonb not null, created_at timestamptz not null default now()
);
alter table public.fco_ctp_pending enable row level security;
revoke all on public.fco_ctp_pending from anon, authenticated;

drop function if exists public.fco_ctp_play(integer, text);
drop function if exists public.fco_ctp_shot(boolean);

-- Một cú sút: dải theo rail_weight (bỏ các dải p_exclude), quà trong dải theo weights; p_double nhân đôi (BP / FC / số gói).
create or replace function public.fco_ctp_shot(p_double boolean, p_exclude text[] default null) returns jsonb language plpgsql volatile set search_path = '' as $$
declare ids text[]; ws integer[]; k integer; r public.fco_ctp_rails; slot integer; reward jsonb;
begin
  select array_agg(id order by idx), array_agg(rail_weight order by idx) into ids, ws
    from public.fco_ctp_rails where p_exclude is null or not (id = any(p_exclude));
  k := public.fco_bilac_pick(array_length(ws, 1), ws) + 1;
  select * into r from public.fco_ctp_rails where id = ids[k];
  slot := public.fco_bilac_pick(5, r.weights);
  reward := r.rewards -> slot;
  if p_double then
    reward := case when reward ? 'bp' then jsonb_build_object('bp', (reward->>'bp')::bigint * 2)
                   when reward ? 'fc' then jsonb_build_object('fc', (reward->>'fc')::bigint * 2)
                   else jsonb_build_object('pack', reward->>'pack', 'count', coalesce((reward->>'count')::integer, 1) * 2) end;
  end if;
  return jsonb_build_object('reward', reward, 'rail', r.id, 'slot', slot);
end;
$$;

-- Mô phỏng p_count lượt từ trạng thái cho trước (không ghi gì). Quà Ultimate / Mini ghi số tạm theo p_pot; fco_ctp_apply tính lại theo quỹ thật.
create or replace function public.fco_ctp_sim(p_count integer, p_pos integer, p_lucky integer, p_pot bigint,
  p_jp_at timestamptz, p_jp_prev timestamptz, p_mini_at timestamptz, p_mini_prev timestamptz, p_exclude text[]) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  rules jsonb := public.fco_ctp_rules(); pos integer := p_pos; lucky integer := p_lucky; pot bigint := p_pot;
  jp_at timestamptz := p_jp_at; jp_prev timestamptz := p_jp_prev; mini_at timestamptz := p_mini_at; mini_prev timestamptz := p_mini_prev;
  moves integer; dbl boolean; next_dbl boolean; is_bonus boolean; roll integer; steps integer; dest integer; pts integer; kind text;
  shot jsonb; reward jsonb; extra jsonb; amount bigint; gain integer; old_lucky integer;
  plays jsonb := '[]'; pts_won integer := 0; free_won integer := 0; jmin bigint := (rules->>'jackpotMin')::bigint;
begin
  for i in 1 .. p_count loop
    pot := pot + (rules->>'potPerPlay')::bigint;
    moves := 1; dbl := false; is_bonus := false;
    while moves > 0 loop
      moves := moves - 1; next_dbl := false;
      roll := 1 + floor(random() * 6)::integer;
      steps := roll + case when roll = 6 then (rules->>'maxRollBonus')::integer else 0 end;
      dest := (pos + steps - 1) % 28 + 1;
      pts := roll * case when dbl then 2 else 1 end;
      reward := null; extra := '{}'; shot := null;
      kind := case dest when 7 then 'mini' when 14 then 'special' when 21 then 'ultimate' when 28 then 'lucky' else 'ball' end;
      if kind = 'special' then
        moves := moves + 1; next_dbl := true;
      elsif kind = 'ultimate' and pot >= jmin and (jp_prev is null or jp_prev <= now() - interval '24 hours')
            and random() < (rules->>'ultimateChance')::double precision then
        reward := jsonb_build_object('fc', pot, 'jackpot', 'special'); pot := 2000; jp_prev := jp_at; jp_at := now();
      elsif kind = 'mini' and pot >= jmin and (mini_prev is null or mini_prev <= now() - interval '24 hours')
            and random() < (rules->>'miniChance')::double precision then
        amount := floor(pot / 10); pot := pot - amount; mini_prev := mini_at; mini_at := now();
        reward := jsonb_build_object('fc', amount, 'jackpot', 'mini');
      else
        shot := public.fco_ctp_shot(dbl, p_exclude); reward := shot->'reward';
        extra := jsonb_build_object('rail', shot->>'rail', 'slot', (shot->>'slot')::integer);
        if kind = 'lucky' then
          old_lucky := lucky;
          gain := case when roll > lucky then (rules->>'luckyMore')::integer else (rules->>'luckyLess')::integer end;
          free_won := free_won + gain;
          lucky := 1 + floor(random() * 6)::integer;
          extra := extra || jsonb_build_object('free', gain, 'lucky', old_lucky);
        end if;
      end if;
      pts_won := pts_won + pts;
      plays := plays || (jsonb_build_object('roll', roll, 'steps', steps, 'from', pos, 'to', dest, 'kind', kind, 'reward', reward,
        'points', pts, 'double', dbl, 'bonus', is_bonus) || extra);
      pos := dest; dbl := next_dbl; is_bonus := next_dbl;
    end loop;
  end loop;
  return jsonb_build_object('plays', plays, 'pos', pos, 'lucky', lucky, 'ptsWon', pts_won, 'freeWon', free_won,
    'jpAt', jp_at, 'jpPrev', jp_prev, 'miniAt', mini_at, 'miniPrev', mini_prev);
end;
$$;

-- Áp một kết quả mô phỏng: quỹ Jackpot (tính lại tiền Ultimate / Mini theo quỹ hiện tại), bảng tin, ví, FC, kho quà. Ví đã khoá ở hàm gọi.
create or replace function public.fco_ctp_apply(p_uid uuid, o jsonb, p_count integer, p_mode text, p_price integer, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  rules jsonb := public.fco_ctp_rules(); j public.fco_jackpot; p jsonb; reward jsonb; amount bigint; plays jsonb := '[]'; grants jsonb := '[]';
  fc_won bigint := 0; granted jsonb; w public.fco_wallets; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  j := public.fco_jackpot_tick();
  for p in select value from jsonb_array_elements(o->'plays') loop
    if not coalesce((p->>'bonus')::boolean, false) then j.pot := j.pot + (rules->>'potPerPlay')::bigint; end if;
    reward := p->'reward';
    if jsonb_typeof(reward) = 'object' and reward ? 'jackpot' then
      if reward->>'jackpot' = 'special' then amount := j.pot; j.pot := 2000; else amount := floor(j.pot / 10); j.pot := j.pot - amount; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', reward->>'jackpot');
      p := jsonb_set(p, '{reward}', reward);
      j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_public_name(p_uid), 'uid', p_uid, 'amount', amount, 'kind', reward->>'jackpot', 'time', now_ms));
    end if;
    if jsonb_typeof(reward) = 'object' then
      if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
      grants := grants || jsonb_build_array(reward);
    end if;
    plays := plays || jsonb_build_array(p);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set ctp_pos = (o->>'pos')::integer, ctp_points = ctp_points + (o->>'ptsWon')::integer, ctp_free = ctp_free + (o->>'freeWon')::integer,
    ctp_lucky = (o->>'lucky')::integer, ctp_jp_at = (o->>'jpAt')::timestamptz, ctp_jp_prev = (o->>'jpPrev')::timestamptz,
    ctp_mini_at = (o->>'miniAt')::timestamptz, ctp_mini_prev = (o->>'miniPrev')::timestamptz
    where user_id = p_uid returning * into w;
  if fc_won > 0 then perform public.fco_apply_fc(p_uid, fc_won, 'ctp_win', jsonb_build_object('count', p_count)); end if;
  granted := public.fco_inv_grant(p_uid, grants, 'event',
    'Cờ tỷ phú · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end || coalesce(p_note, ''),
    coalesce(nullif(public.fco_inv_reward_text(grants), ''), 'Không có quà') || ' · +' || (o->>'ptsWon') || ' điểm'
      || case when (o->>'freeWon')::integer > 0 then ' · +' || (o->>'freeWon') || ' lượt miễn phí' else '' end
      || case when p_price > 0 then ' · −' || public.fco_inv_money(p_price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', p_price, 'pos', w.ctp_pos, 'points', w.ctp_points, 'free', w.ctp_free, 'lucky', w.ctp_lucky,
    'jackpot', public.fco_jackpot_view(j, p_uid), 'wallet', public.fco_wallet_json(p_uid), 'save', granted);
end;
$$;

-- Lượt đang chờ chọn bộ quà (Thẻ Cơ Hội) của người gọi; không có thì null.
create or replace function public.fco_ctp_pending_view(p_uid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('count', p.count, 'mode', p.mode, 'paid', p.price, 'exclude', to_jsonb(p.exclude),
    'outcomes', (select jsonb_agg(jsonb_build_object('plays', x->'plays', 'pos', x->'pos', 'ptsWon', x->'ptsWon', 'freeWon', x->'freeWon') order by n)
                 from jsonb_array_elements(p.outcomes) with ordinality t(x, n)))
  from public.fco_ctp_pending p where p.user_id = p_uid
$$;
create or replace function public.fco_ctp_pending() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return public.fco_ctp_pending_view(public.fco_require_user());
end;
$$;

-- Chơi: p_mode 'fc' (1 / 10 / 50 / 100 lượt) hoặc 'free' (1..100, không quá số lượt miễn phí); p_chance = dùng Thẻ Cơ Hội;
-- p_exclude = 3 dải màu bỏ ra (dùng Thẻ Khí Vận).
create or replace function public.fco_ctp_play(p_count integer, p_mode text, p_chance boolean default false, p_exclude text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; rules jsonb := public.fco_ctp_rules(); price integer; ex text[]; pot bigint; a jsonb; b jsonb; note text;
begin
  if not public.fco_ctp_open() then raise exception 'FCO_EVENT_CLOSED' using errcode = 'P0001'; end if;
  if p_mode not in ('fc', 'free') then raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  if exists (select 1 from public.fco_ctp_pending where user_id = uid) then raise exception 'FCO_CTP_PENDING' using errcode = 'P0001'; end if;
  if p_mode = 'fc' then
    select (p->>'price')::integer into price from jsonb_array_elements(rules->'prices') p where (p->>'count')::integer = p_count;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    if p_count = 1 and not w.ctp_first_done then price := (rules->>'firstPrice')::integer; end if;
  else
    if p_count is null or p_count not between 1 and 100 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    if w.ctp_free < p_count then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
    price := 0;
  end if;
  if coalesce(p_chance, false) and w.ctp_card_chance < 1 then raise exception 'FCO_CTP_NO_CARD' using errcode = 'P0001'; end if;
  if p_exclude is not null then
    ex := array(select distinct x from unnest(p_exclude) x);
    if coalesce(array_length(ex, 1), 0) <> 3 or exists (select 1 from unnest(ex) x where not exists (select 1 from public.fco_ctp_rails r where r.id = x)) then
      raise exception 'FCO_CTP_BAD_EXCLUDE' using errcode = '22023';
    end if;
    if w.ctp_card_luck < 1 then raise exception 'FCO_CTP_NO_CARD' using errcode = 'P0001'; end if;
  end if;
  if price > 0 then perform public.fco_apply_fc(uid, -price, 'ctp', jsonb_build_object('count', p_count, 'chance', coalesce(p_chance, false), 'luck', ex is not null)); end if;
  update public.fco_wallets set ctp_free = ctp_free - case when p_mode = 'free' then p_count else 0 end,
    ctp_first_done = ctp_first_done or p_mode = 'fc',
    ctp_card_chance = ctp_card_chance - case when coalesce(p_chance, false) then 1 else 0 end,
    ctp_card_luck = ctp_card_luck - case when ex is not null then 1 else 0 end
    where user_id = uid;
  note := case when coalesce(p_chance, false) then ' · Thẻ Cơ Hội' else '' end || case when ex is not null then ' · Thẻ Khí Vận' else '' end;
  select j.pot into pot from public.fco_jackpot j where j.id = 1;
  a := public.fco_ctp_sim(p_count, w.ctp_pos, w.ctp_lucky, pot, w.ctp_jp_at, w.ctp_jp_prev, w.ctp_mini_at, w.ctp_mini_prev, ex);
  if coalesce(p_chance, false) then
    b := public.fco_ctp_sim(p_count, w.ctp_pos, w.ctp_lucky, pot, w.ctp_jp_at, w.ctp_jp_prev, w.ctp_mini_at, w.ctp_mini_prev, ex);
    insert into public.fco_ctp_pending (user_id, count, mode, price, exclude, outcomes) values (uid, p_count, p_mode, price, ex, jsonb_build_array(a, b));
    return jsonb_build_object('pending', public.fco_ctp_pending_view(uid), 'paid', price, 'wallet', public.fco_wallet_json(uid));
  end if;
  return public.fco_ctp_apply(uid, a, p_count, p_mode, price, note);
end;
$$;

-- Chọn bộ quà (0 = A, 1 = B) của lượt dùng Thẻ Cơ Hội.
create or replace function public.fco_ctp_pick(p_choice integer) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; p public.fco_ctp_pending; out jsonb;
begin
  w := public.fco_wallet_lock(uid);
  select * into p from public.fco_ctp_pending where user_id = uid for update;
  if not found then raise exception 'FCO_CTP_NO_PENDING' using errcode = 'P0001'; end if;
  if p_choice is null or p_choice not in (0, 1) then raise exception 'FCO_MILESTONE_CHOICE' using errcode = '22023'; end if;
  delete from public.fco_ctp_pending where user_id = uid;
  out := public.fco_ctp_apply(uid, p.outcomes -> p_choice, p.count, p.mode, p.price,
    ' · Thẻ Cơ Hội (bộ ' || case when p_choice = 0 then 'A' else 'B' end || ')' || case when p.exclude is not null then ' · Thẻ Khí Vận' else '' end);
  return out;
end;
$$;

-- Như 202611220002, 'ctp' thêm 'pending' (đang chờ chọn bộ quà).
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
    'ctp', jsonb_build_object('pos', w.ctp_pos, 'points', w.ctp_points, 'free', w.ctp_free, 'lucky', w.ctp_lucky, 'firstDone', w.ctp_first_done,
      'mission', public.fco_ctp_mission(w), 'claimed', to_jsonb(w.ctp_claimed), 'paid', public.fco_ctp_paid(w.user_id),
      'cards', jsonb_build_object('chance', w.ctp_card_chance, 'luck', w.ctp_card_luck), 'badges', w.ctp_badges,
      'pending', exists (select 1 from public.fco_ctp_pending p where p.user_id = w.user_id)),
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

-- Như 202611220002, reset xoá luôn lượt đang chờ chọn bộ quà.
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
    vqtg_pos = 0, vqtg_picks = 0, vqtg_tickets = 0, vqtg_tickets_at = null, vqtg_claimed = '{}',
    ctp_pos = 28, ctp_points = 0, ctp_free = 0, ctp_lucky = 1, ctp_claimed = '{}', ctp_card_chance = 0, ctp_card_luck = 0, ctp_badges = 0, updated_at = now()
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
  delete from public.fco_ctp_pending where user_id = p_user;
  insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, actor)
  values (p_user, remaining - w.fc, remaining, 'reset', jsonb_build_object('resetFc', p_reset_fc), admin_id);
  return jsonb_build_object('reset', true, 'fc', remaining);
end;
$$;

revoke all on function public.fco_ctp_shot(boolean, text[]), public.fco_ctp_sim(integer, integer, integer, bigint, timestamptz, timestamptz, timestamptz, timestamptz, text[]),
  public.fco_ctp_apply(uuid, jsonb, integer, text, integer, text), public.fco_ctp_pending_view(uuid) from public, anon, authenticated;
revoke all on function public.fco_ctp_play(integer, text, boolean, text[]), public.fco_ctp_pick(integer), public.fco_ctp_pending() from public, anon;
grant execute on function public.fco_ctp_play(integer, text, boolean, text[]), public.fco_ctp_pick(integer), public.fco_ctp_pending() to authenticated;

commit;
