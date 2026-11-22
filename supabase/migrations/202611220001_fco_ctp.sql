begin;

-- Sự kiện Cờ tỷ phú (2026-11-22) — CÁCH CHƠI CHÍNH theo luật Tỷ Phú 2.0 người dùng gửi. Chạy SAU 202611210001_fco_vqtg_hide.sql.
-- Mốc tích lũy (Tài liệu/quamocctp.xlsx), Thẻ Cơ Hội / Khí Vận, Huy Hiệu Tuyển Chọn: làm ở migration sau.
--
-- Bàn 28 ô chạy vòng, quân ở fco_wallets.ctp_pos (1..28; 28 = ô LUCKY = ô xuất phát). Mỗi lượt máy chủ lắc 1–6:
--   · Điểm = số lắc. Lắc ra 6 (số lớn nhất) được đi thêm maxRollBonus bước.
--   · Ô bóng (24 ô thường): cầu thủ sút trúng 1 quà trên 8 dải kệ màu (fco_ctp_rails: chọn dải theo rail_weight, rồi 1 trong 5 quà
--     theo weights; quà càng giá trị càng hiếm — giá trị TB mỗi lần sút ≈ mỗi ô quà VQTG, FC rất hiếm).
--   · Ô 14 SPECIAL: được đi tiếp 1 bước lắc ngay (không tính tiền, không tính là lượt), quà + điểm của bước đó ×2.
--   · Ô 28 LUCKY: 1 quà sút + lượt chơi miễn phí: số lắc > số may mắn đang hiện → +2 lượt, ngược lại +1; rồi đổi số may mắn mới (1–6).
--   · Ô 21 ULTIMATE PRIZE: quỹ Jackpot FC chung ≥ 10.000 thì 0,8 % trúng CẢ QUỸ (như VQTG); trượt → 1 quà sút.
--   · Ô 7 MINI PRIZE: quỹ ≥ 10.000 thì 6 % trúng 1/10 quỹ (FC, trừ thẳng vào quỹ, như Giải Phụ Bi Lắc); trượt → 1 quà sút.
--     Mỗi tài khoản trúng mỗi loại tối đa 2 lần / 24 giờ. Tin trúng ghi vào bảng tin Jackpot chung (kind special / mini).
--   · Mỗi lượt chơi góp 1 FC vào quỹ Ultimate Prize.
-- Giá (người dùng chốt): lượt ĐẦU TIÊN của mỗi tài khoản 10 FC; sau đó 1 / 10 / 50 / 100 lượt = 20 / 190 / 900 / 1.800 FC. Chỉ FC (không MC).
-- Lượt miễn phí (ctp_free): từ ô LUCKY và nhiệm vụ ngày: bấm Nhận nhiệm vụ rồi THẮNG 1 trận GLXH → +1 lượt (mỗi ngày 1 lần).
-- Sự kiện đóng (fco_ctp_state.open = false) thì chỉ admin chơi được để thử; mở: update public.fco_ctp_state set open = true where id = 1;
-- và đặt EVENT_CTP_ENABLED = true trong src/config.ts.
-- Sổ FC: 'ctp' (trả lượt), 'ctp_win' (quà FC + Mini / Ultimate). Quà khác vào kho máy chủ qua fco_inv_grant.

-- Gói quà kệ phải có trên máy chủ trước (kho máy chủ mở gói theo dữ liệu đã đồng bộ).
do $$
begin
  if (select count(*) from public.fco_cat_packs where id in ('ctp-120-ucs-24', 'ctp-121-ucs-24', 'ctp-122-ucs-13', 'ctp-111-gcum-89', 'ctp-110-bgc-89', 'ctp-114-cu-9', 'ctp-119-uspw-35', 'ctp-112-lwb-78', 'ctp-111-lwb-8', 'ctp-113-lwb-8', 'ctp-114-lwbbg-8', 'ctp-114-bbgc-8', 'ctp-107-hg-11', 'ctp-107-fca-11')) < 14 then
    raise exception 'Chưa có các gói ctp-* trên máy chủ: đưa bản game mới lên → Quản trị FC → Đồng bộ dữ liệu, rồi chạy lại migration này.';
  end if;
end $$;

create table if not exists public.fco_ctp_rails (
  idx smallint primary key check (idx between 1 and 8),
  id text not null unique,
  rewards jsonb not null check (jsonb_typeof(rewards) = 'array' and jsonb_array_length(rewards) = 5),
  weights integer[] not null check (array_length(weights, 1) = 5),
  rail_weight integer not null check (rail_weight > 0)
);
create table if not exists public.fco_ctp_state (
  id integer primary key default 1 check (id = 1),
  open boolean not null default false
);
alter table public.fco_ctp_rails enable row level security;
alter table public.fco_ctp_state enable row level security;
revoke all on public.fco_ctp_rails, public.fco_ctp_state from anon, authenticated;
insert into public.fco_ctp_state (id, open) values (1, false) on conflict (id) do nothing;

alter table public.fco_wallets
  add column if not exists ctp_pos smallint not null default 28 check (ctp_pos between 1 and 28),
  add column if not exists ctp_points integer not null default 0 check (ctp_points >= 0),
  add column if not exists ctp_free integer not null default 0 check (ctp_free >= 0),
  add column if not exists ctp_lucky smallint not null default 1 check (ctp_lucky between 1 and 6),
  add column if not exists ctp_first_done boolean not null default false,
  add column if not exists ctp_mission_at timestamptz,      -- lúc bấm Nhận nhiệm vụ gần nhất
  add column if not exists ctp_mission_day date,            -- ngày đã nhận lượt miễn phí từ nhiệm vụ
  add column if not exists ctp_jp_at timestamptz, add column if not exists ctp_jp_prev timestamptz,
  add column if not exists ctp_mini_at timestamptz, add column if not exists ctp_mini_prev timestamptz;

-- Quà 8 dải kệ theo Tài liệu/quaracctp.xlsx (cột B..F), khớp src/ctp-prizes.ts (tests/ctp.test.ts so khớp).
-- weights: phần vạn trong dải; rail_weight: phần vạn chọn dải (sinh bởi D:\FCOvv-tmp\tmp\ctp_calib.py).
insert into public.fco_ctp_rails (idx, id, rewards, weights, rail_weight) values
  (1, 'orange', '[{"bp":350000000},{"fc":1000},{"pack":"ctp-114-lwbbg-8","count":1},{"fc":2000},{"pack":"ctp-107-fca-11","count":1}]', '{5437,25,2314,13,2211}', 239),
  (2, 'green', '[{"bp":300000000},{"bp":350000000},{"bp":400000000},{"bp":450000000},{"bp":500000000}]', '{2407,2156,1961,1803,1673}', 601),
  (3, 'red', '[{"pack":"ctp-114-bbgc-8","count":1},{"fc":200},{"pack":"ctp-113-lwb-8","count":1},{"fc":500},{"pack":"event-5-bld30","count":1}]', '{1750,261,2384,65,5540}', 307),
  (4, 'purple', '[{"bp":55000000},{"pack":"ctp-111-lwb-8","count":1},{"bp":70000000},{"pack":"vq-112-lwb-8","count":1},{"pack":"ctp-107-hg-11","count":1}]', '{3974,954,3347,868,857}', 1219),
  (5, 'yellow', '[{"bp":55000000},{"bp":65000000},{"bp":75000000},{"bp":85000000},{"bp":450000000}]', '{2742,2434,2199,2011,614}', 1767),
  (6, 'cyan', '[{"pack":"ctp-111-gcum-89","count":1},{"bp":35000000},{"pack":"ctp-122-ucs-13","count":1},{"pack":"ctp-110-bgc-89","count":1},{"pack":"ctp-114-cu-9","count":1}]', '{893,5121,2601,1151,234}', 1305),
  (7, 'white', '[{"bp":27000000},{"pack":"ctp-119-uspw-35","count":1},{"bp":30000000},{"pack":"ctp-112-lwb-78","count":1},{"pack":"ctp-114-lwbbg-8","count":1}]', '{3683,1701,3417,946,253}', 2183),
  (8, 'pink', '[{"bp":25000000},{"pack":"ctp-120-ucs-24","count":1},{"bp":27000000},{"pack":"ctp-121-ucs-24","count":1},{"pack":"eternal","count":1}]', '{3571,1666,3381,1374,8}', 2379)
on conflict (idx) do update set id = excluded.id, rewards = excluded.rewards, weights = excluded.weights, rail_weight = excluded.rail_weight;

-- Hằng số (src/ctp.ts CTP_RULES ghi cùng số — tests/ctp.test.ts so khớp).
create or replace function public.fco_ctp_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'prices', '[{"count":1,"price":20},{"count":10,"price":190},{"count":50,"price":900},{"count":100,"price":1800}]'::jsonb,
    'firstPrice', 10,          -- lượt đầu tiên của mỗi tài khoản
    'potPerPlay', 1,           -- mỗi lượt góp 1 FC vào quỹ Ultimate
    'jackpotMin', 10000,       -- quỹ tối thiểu để Ultimate / Mini có thể nổ
    'ultimateChance', 0.008,   -- dừng ô 21
    'miniChance', 0.06,        -- dừng ô 7
    'winsPerDay', 2,           -- mỗi loại tối đa 2 lần / 24 giờ
    'maxRollBonus', 1,         -- lắc ra 6 đi thêm 1 bước
    'luckyMore', 2, 'luckyLess', 1)
$$;

create or replace function public.fco_ctp_open() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select open from public.fco_ctp_state where id = 1), false)
      or exists (select 1 from public.fco_admins a where a.user_id = auth.uid())
$$;

-- Một cú sút: dải theo rail_weight, quà trong dải theo weights; p_double nhân đôi (BP / FC / số gói).
create or replace function public.fco_ctp_shot(p_double boolean) returns jsonb language plpgsql volatile set search_path = '' as $$
declare ws integer[]; k integer; r public.fco_ctp_rails; slot integer; reward jsonb;
begin
  select array_agg(rail_weight order by idx) into ws from public.fco_ctp_rails;
  k := public.fco_bilac_pick(array_length(ws, 1), ws) + 1;
  select * into r from public.fco_ctp_rails where idx = k;
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

-- Trạng thái nhiệm vụ ngày: none (chưa nhận) / accepted (đã nhận, chờ thắng GLXH) / ready (đã thắng, bấm nhận lượt) / done (đã nhận lượt hôm nay).
create or replace function public.fco_ctp_mission(w public.fco_wallets) returns text language sql stable security definer set search_path = '' as $$
  select case
    when w.ctp_mission_day is not distinct from public.fco_today() then 'done'
    when w.ctp_mission_at is null or (w.ctp_mission_at at time zone 'Asia/Ho_Chi_Minh')::date <> public.fco_today() then 'none'
    when exists (select 1 from public.fco_ranked_matches m where m.user_id = w.user_id and m.at >= w.ctp_mission_at and m.goals_for > m.goals_against) then 'ready'
    else 'accepted' end
$$;

-- Như 202611130009, thêm 'ctp'.
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
      'mission', public.fco_ctp_mission(w)),
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

create or replace function public.fco_ctp_config() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  return jsonb_build_object('open', public.fco_ctp_open(), 'rules', public.fco_ctp_rules());
end;
$$;

-- Chơi: p_mode 'fc' (p_count 1 / 10 / 50 / 100) hoặc 'free' (p_count 1..100, không quá số lượt miễn phí đang có).
create or replace function public.fco_ctp_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot; rules jsonb := public.fco_ctp_rules();
  price integer; pos integer; points integer; free integer; lucky integer; first_done boolean;
  jp_at timestamptz; jp_prev timestamptz; mini_at timestamptz; mini_prev timestamptz;
  moves integer; dbl boolean; next_dbl boolean; is_bonus boolean; roll integer; steps integer; dest integer; pts integer; kind text;
  shot jsonb; reward jsonb; extra jsonb; amount bigint; gain integer; old_lucky integer; free_won integer := 0; pts_won integer := 0;
  plays jsonb := '[]'; grants jsonb := '[]'; fc_won bigint := 0; granted jsonb; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  jmin bigint := (rules->>'jackpotMin')::bigint;
begin
  if not public.fco_ctp_open() then raise exception 'FCO_EVENT_CLOSED' using errcode = 'P0001'; end if;
  if p_mode not in ('fc', 'free') then raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  if p_mode = 'fc' then
    select (p->>'price')::integer into price from jsonb_array_elements(rules->'prices') p where (p->>'count')::integer = p_count;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    if p_count = 1 and not w.ctp_first_done then price := (rules->>'firstPrice')::integer; end if;
  else
    if p_count is null or p_count not between 1 and 100 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    if w.ctp_free < p_count then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
    price := 0;
  end if;
  pos := w.ctp_pos; points := w.ctp_points; free := w.ctp_free - case when p_mode = 'free' then p_count else 0 end; lucky := w.ctp_lucky;
  first_done := w.ctp_first_done or p_mode = 'fc';
  jp_at := w.ctp_jp_at; jp_prev := w.ctp_jp_prev; mini_at := w.ctp_mini_at; mini_prev := w.ctp_mini_prev;
  if price > 0 then perform public.fco_apply_fc(uid, -price, 'ctp', jsonb_build_object('count', p_count)); end if;
  j := public.fco_jackpot_tick();
  for i in 1 .. p_count loop
    j.pot := j.pot + (rules->>'potPerPlay')::bigint;
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
      elsif kind = 'ultimate' and j.pot >= jmin and (jp_prev is null or jp_prev <= now() - interval '24 hours')
            and random() < (rules->>'ultimateChance')::double precision then
        amount := j.pot; j.pot := 2000; jp_prev := jp_at; jp_at := now();
        reward := jsonb_build_object('fc', amount, 'jackpot', 'special');
        j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', 'special', 'time', now_ms));
      elsif kind = 'mini' and j.pot >= jmin and (mini_prev is null or mini_prev <= now() - interval '24 hours')
            and random() < (rules->>'miniChance')::double precision then
        amount := floor(j.pot / 10); j.pot := j.pot - amount; mini_prev := mini_at; mini_at := now();
        reward := jsonb_build_object('fc', amount, 'jackpot', 'mini');
        j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', 'mini', 'time', now_ms));
      else
        shot := public.fco_ctp_shot(dbl); reward := shot->'reward';
        extra := jsonb_build_object('rail', shot->>'rail', 'slot', (shot->>'slot')::integer);
        if kind = 'lucky' then
          old_lucky := lucky;
          gain := case when roll > lucky then (rules->>'luckyMore')::integer else (rules->>'luckyLess')::integer end;
          free := free + gain; free_won := free_won + gain;
          lucky := 1 + floor(random() * 6)::integer;
          extra := extra || jsonb_build_object('free', gain, 'lucky', old_lucky);
        end if;
      end if;
      if reward is not null then
        if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
        grants := grants || jsonb_build_array(reward);
      end if;
      points := points + pts; pts_won := pts_won + pts;
      plays := plays || (jsonb_build_object('roll', roll, 'steps', steps, 'from', pos, 'to', dest, 'kind', kind, 'reward', reward,
        'points', pts, 'double', dbl, 'bonus', is_bonus) || extra);
      pos := dest; dbl := next_dbl; is_bonus := next_dbl;
    end loop;
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set ctp_pos = pos, ctp_points = points, ctp_free = free, ctp_lucky = lucky, ctp_first_done = first_done,
    ctp_jp_at = jp_at, ctp_jp_prev = jp_prev, ctp_mini_at = mini_at, ctp_mini_prev = mini_prev
    where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'ctp_win', jsonb_build_object('count', p_count)); end if;
  granted := public.fco_inv_grant(uid, grants, 'event',
    'Cờ tỷ phú · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end,
    coalesce(nullif(public.fco_inv_reward_text(grants), ''), 'Không có quà') || ' · +' || pts_won || ' điểm'
      || case when free_won > 0 then ' · +' || free_won || ' lượt miễn phí' else '' end
      || case when price > 0 then ' · −' || public.fco_inv_money(price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', price, 'pos', pos, 'points', points, 'free', free, 'lucky', lucky,
    'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

-- Nhiệm vụ ngày: bấm Nhận nhiệm vụ (ghi thời điểm), thắng 1 trận GLXH SAU thời điểm đó, rồi bấm nhận +1 lượt miễn phí (1 lần / ngày).
create or replace function public.fco_ctp_mission_accept() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets;
begin
  if not public.fco_ctp_open() then raise exception 'FCO_EVENT_CLOSED' using errcode = 'P0001'; end if;
  w := public.fco_wallet_lock(uid);
  if public.fco_ctp_mission(w) = 'none' then update public.fco_wallets set ctp_mission_at = now() where user_id = uid; end if;
  return jsonb_build_object('wallet', public.fco_wallet_json(uid));
end;
$$;

create or replace function public.fco_ctp_mission_claim() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets;
begin
  if not public.fco_ctp_open() then raise exception 'FCO_EVENT_CLOSED' using errcode = 'P0001'; end if;
  w := public.fco_wallet_lock(uid);
  case public.fco_ctp_mission(w)
    when 'done' then raise exception 'FCO_MISSION_DONE' using errcode = 'P0001';
    when 'ready' then update public.fco_wallets set ctp_free = ctp_free + 1, ctp_mission_day = public.fco_today() where user_id = uid;
    else raise exception 'FCO_MISSION_NOT_READY' using errcode = 'P0001';
  end case;
  return jsonb_build_object('wallet', public.fco_wallet_json(uid));
end;
$$;

-- Như 202611130009, reset thêm tiến trình Cờ tỷ phú (giữ lượt nhiệm vụ trong ngày như VQTG giữ lượt miễn phí).
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
    ctp_pos = 28, ctp_points = 0, ctp_free = 0, ctp_lucky = 1, updated_at = now()
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

revoke all on function public.fco_ctp_rules(), public.fco_ctp_open(), public.fco_ctp_shot(boolean), public.fco_ctp_mission(public.fco_wallets) from public, anon, authenticated;
revoke all on function public.fco_ctp_config(), public.fco_ctp_play(integer, text), public.fco_ctp_mission_accept(), public.fco_ctp_mission_claim() from public, anon;
grant execute on function public.fco_ctp_config(), public.fco_ctp_play(integer, text), public.fco_ctp_mission_accept(), public.fco_ctp_mission_claim() to authenticated;

commit;
