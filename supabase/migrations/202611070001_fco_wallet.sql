begin;

-- FC do máy chủ giữ (chống gian lận mức 2). Trình duyệt không ghi được số FC: mọi thay đổi đi qua các hàm
-- security definer bên dưới, mỗi lần cộng/trừ ghi một dòng sổ cái. fco_commit_save bỏ trường "fc" trong bản lưu.
-- Số dư bắt đầu từ 0 cho mọi tài khoản (FC cũ trong bản lưu không được mang sang). Thời gian "ngày" theo giờ Việt Nam.
-- Chỉ phần FC được bảo vệ; BP, thẻ, gói vẫn nằm trong bản lưu trên máy người chơi.

create table public.fco_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  fc bigint not null default 0 check (fc >= 0),
  daily date,                                   -- ngày đã nhận Quà mỗi ngày gần nhất
  event_points bigint not null default 0 check (event_points >= 0),   -- điểm sự kiện (quyết định cấp hũ)
  event_free integer not null default 0 check (event_free >= 0),      -- lượt chơi miễn phí còn lại
  event_day date,                               -- ngày của event_paid / event_missions
  event_paid integer not null default 0 check (event_paid >= 0),      -- lượt trả FC trong ngày
  event_missions text[] not null default '{}',  -- nhiệm vụ đã nhận thưởng trong ngày
  updated_at timestamptz not null default now()
);
create table public.fco_fc_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta bigint not null,
  balance bigint not null,
  reason text not null,
  detail jsonb not null default '{}',
  actor uuid,                                   -- admin thực hiện (nạp FC), null nếu là người chơi
  created_at timestamptz not null default now()
);
create index fco_fc_ledger_user on public.fco_fc_ledger(user_id, created_at desc);
create index fco_fc_ledger_time on public.fco_fc_ledger(created_at desc);
create table public.fco_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table public.fco_gift_codes (
  hash text primary key check (hash ~ '^[0-9a-f]{64}$'),   -- SHA-256 của "fco-gift:<CODE>"; không lưu code gốc
  hint text not null,
  rewards jsonb not null,
  expires date,                                 -- ngày cuối còn dùng được, null = không hết hạn
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create table public.fco_gift_redemptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  hash text not null references public.fco_gift_codes(hash) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (user_id, hash)
);
-- Quỹ Giải Đặc Biệt chung của mọi người chơi (một dòng). Bot vẫn săn như bản giả lập cũ (src/jackpot.ts).
create table public.fco_jackpot (
  id integer primary key default 1 check (id = 1),
  pot bigint not null,
  at timestamptz not null,
  speed integer not null default 0,
  feed jsonb not null default '[]'
);
insert into public.fco_jackpot(id, pot, at) values (1, 2000, now());

-- Không ai đọc / ghi trực tiếp: chỉ qua hàm.
alter table public.fco_wallets enable row level security;
alter table public.fco_fc_ledger enable row level security;
alter table public.fco_admins enable row level security;
alter table public.fco_gift_codes enable row level security;
alter table public.fco_gift_redemptions enable row level security;
alter table public.fco_jackpot enable row level security;
revoke all on public.fco_wallets, public.fco_fc_ledger, public.fco_admins, public.fco_gift_codes, public.fco_gift_redemptions, public.fco_jackpot from anon, authenticated;

-- ===== Hàm nội bộ (không cấp quyền cho người chơi) =====
create function public.fco_today() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create function public.fco_require_user() returns uuid language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  return uid;
end;
$$;

-- Tạo ví nếu chưa có, khoá dòng cho tới hết giao dịch, sang ngày mới thì đặt lại lượt trả phí / nhiệm vụ trong ngày.
create function public.fco_wallet_lock(p_uid uuid, p_seed_points bigint default 0) returns public.fco_wallets
language plpgsql security definer set search_path = '' as $$
declare w public.fco_wallets;
begin
  insert into public.fco_wallets(user_id, event_points)
  values (p_uid, least(greatest(coalesce(p_seed_points, 0), 0), 10000000))
  on conflict (user_id) do nothing;
  select * into w from public.fco_wallets where user_id = p_uid for update;
  if w.event_day is distinct from public.fco_today() then
    update public.fco_wallets set event_day = public.fco_today(), event_paid = 0, event_missions = '{}'
    where user_id = p_uid returning * into w;
  end if;
  return w;
end;
$$;

-- Cộng (delta > 0) hoặc trừ (delta < 0) FC; không đủ thì báo FCO_NOT_ENOUGH_FC. Ghi sổ cái.
create function public.fco_apply_fc(p_uid uuid, p_delta bigint, p_reason text, p_detail jsonb default '{}', p_actor uuid default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare b bigint;
begin
  if p_delta = 0 then select fc into b from public.fco_wallets where user_id = p_uid; return b; end if;
  update public.fco_wallets set fc = fc + p_delta, updated_at = now()
  where user_id = p_uid and fc + p_delta >= 0 returning fc into b;
  if not found then raise exception 'FCO_NOT_ENOUGH_FC' using errcode = 'P0001'; end if;
  insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, actor) values (p_uid, p_delta, b, p_reason, coalesce(p_detail, '{}'), p_actor);
  return b;
end;
$$;

create function public.fco_wallet_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'fc', w.fc,
    'dailyClaimed', w.daily is not distinct from public.fco_today(),
    'event', jsonb_build_object(
      'points', w.event_points, 'free', w.event_free,
      'paid', case when w.event_day = public.fco_today() then w.event_paid else 0 end,
      'missions', case when w.event_day = public.fco_today() then to_jsonb(w.event_missions) else '[]'::jsonb end),
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

create function public.fco_require_admin() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if not exists (select 1 from public.fco_admins where user_id = uid) then raise exception 'FCO_ADMIN_ONLY' using errcode = '42501'; end if;
  return uid;
end;
$$;

-- Tên hiển thị trên bảng tin jackpot: che bớt tên đăng nhập.
create function public.fco_public_name(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when length(n) > 3 then left(n, 3) || '***' else left(n, 1) || '***' end
  from (select split_part(coalesce(email, 'player'), '@', 1) as n from auth.users where id = p_uid) u
$$;

-- Tên bot kiểu tên tài khoản (giống botName ở src/jackpot.ts).
create function public.fco_bot_name() returns text language plpgsql volatile set search_path = '' as $$
declare
  s text[] := array['thim','trinh','duc','anh','khoa','minh','tuan','huy','nam','long','quan','bao','phuc','dat','vinh','son','kha','hieu'];
  n text;
begin
  n := s[1 + floor(random() * 18)::int] || s[1 + floor(random() * 18)::int];
  if random() < .5 then n := n || left(s[1 + floor(random() * 18)::int], 2); end if;
  if random() < .4 then n := upper(left(n, 3)) || substr(n, 4); end if;
  if random() < .7 then n := n || floor(random() * 1000)::int::text; end if;
  return n;
end;
$$;

-- Hằng số jackpot giống src/jackpot.ts: MIN 10.000, RESET 2.000, MAX 20.000, nhịp 2 s, 40 bot.
create function public.fco_jackpot_pressure(p_pot bigint) returns double precision language sql immutable set search_path = '' as $$
  select power(1 + greatest(0, p_pot - 10000) / 5000.0, 2)
$$;

-- Chạy các nhịp từ lần cập nhật trước tới bây giờ (tối đa 1 giờ bù): quỹ tăng, bot có thể trúng. Khoá dòng quỹ.
create function public.fco_jackpot_tick() returns public.fco_jackpot
language plpgsql security definer set search_path = '' as $$
declare
  j public.fco_jackpot;
  steps bigint; run integer; gain integer; roll double precision; special double precision; mini_odds double precision;
  won_at timestamptz; amount bigint;
begin
  select * into j from public.fco_jackpot where id = 1 for update;
  steps := floor(extract(epoch from (now() - j.at)) / 2);
  if steps <= 0 then return j; end if;
  j.at := j.at + make_interval(secs => steps * 2);
  run := least(steps, 1800);
  mini_odds := 1 - power(1 - .001, 40);
  for i in 0 .. run - 1 loop
    if j.speed > 0 then j.speed := j.speed - 1;
    elsif random() < .05 then j.speed := 10 + floor(random() * 20)::int;
    else j.speed := 0; end if;
    gain := case when j.speed > 0 then 80 + floor(random() * 121)::int else 8 + floor(random() * 17)::int end;
    j.pot := j.pot + gain;
    continue when j.pot < 10000;
    roll := random();
    special := case when j.pot >= 20000 then 1 else least(.9, 1 - power(1 - least(.05, .002 * public.fco_jackpot_pressure(j.pot)), 40)) end;
    won_at := j.at - make_interval(secs => (run - 1 - i) * 2);
    if roll < special then
      amount := j.pot; j.pot := 2000;
    elsif roll < special + mini_odds and j.pot - floor(j.pot / 10) >= 10000 then
      amount := floor(j.pot / 10); j.pot := j.pot - amount;
    else continue; end if;
    j.feed := (jsonb_build_array(jsonb_build_object('name', public.fco_bot_name(), 'amount', amount, 'kind', case when roll < special then 'special' else 'mini' end,
      'time', (extract(epoch from won_at) * 1000)::bigint)) || j.feed);
    j.feed := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(j.feed) with ordinality as t(e, n) where n <= 10);
  end loop;
  update public.fco_jackpot set pot = j.pot, at = j.at, speed = j.speed, feed = j.feed where id = 1;
  return j;
end;
$$;

create function public.fco_jackpot_view(p_jackpot public.fco_jackpot, p_uid uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('pot', p_jackpot.pot, 'feed', coalesce((
    select jsonb_agg(jsonb_build_object('name', e->>'name', 'amount', (e->>'amount')::bigint, 'kind', e->>'kind', 'time', (e->>'time')::bigint,
      'mine', (e->>'uid') is not null and (e->>'uid')::uuid = p_uid) order by n)
    from jsonb_array_elements(p_jackpot.feed) with ordinality as t(e, n)), '[]'))
$$;

-- Kiểm tra bộ quà gift code: 1–10 phần, mỗi phần là { fc } / { bp } số nguyên dương hoặc { pack, count 1–1000 }.
create function public.fco_valid_rewards(p_rewards jsonb) returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_rewards) = 'array' and jsonb_array_length(p_rewards) between 1 and 10 and not exists (
    select 1 from jsonb_array_elements(p_rewards) r where not (
      (r ? 'fc' and jsonb_typeof(r->'fc') = 'number' and (r->>'fc')::numeric > 0 and (r->>'fc')::numeric = floor((r->>'fc')::numeric) and (r->>'fc')::numeric <= 1000000000000) or
      (r ? 'bp' and jsonb_typeof(r->'bp') = 'number' and (r->>'bp')::numeric > 0 and (r->>'bp')::numeric = floor((r->>'bp')::numeric) and (r->>'bp')::numeric <= 9000000000000000) or
      (r ? 'pack' and jsonb_typeof(r->'pack') = 'string' and jsonb_typeof(r->'count') = 'number' and (r->>'count')::numeric between 1 and 1000 and (r->>'count')::numeric = floor((r->>'count')::numeric))))
$$;

-- ===== Hàm người chơi gọi =====
-- Số dư và tiến trình sự kiện. Lần đầu tạo ví, điểm sự kiện lấy từ bản lưu (p_seed_points, chỉ quyết định cấp hũ); FC và lượt miễn phí bắt đầu từ 0.
create function public.fco_wallet(p_seed_points bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  perform public.fco_wallet_lock(uid, p_seed_points);
  return public.fco_wallet_json(uid);
end;
$$;

-- Quà mỗi ngày: +1.000 FC, một lần mỗi ngày (giờ Việt Nam).
create function public.fco_claim_daily() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets;
begin
  w := public.fco_wallet_lock(uid);
  if w.daily is not distinct from public.fco_today() then raise exception 'FCO_DAILY_CLAIMED' using errcode = 'P0001'; end if;
  update public.fco_wallets set daily = public.fco_today() where user_id = uid;
  perform public.fco_apply_fc(uid, 1000, 'daily');
  return public.fco_wallet_json(uid);
end;
$$;

-- Trừ FC khi mua gói trong Shop. Giá gói nằm ở trình duyệt; máy chủ chỉ bảo đảm FC không bị tạo ra hay xuống dưới 0.
create function public.fco_spend_fc(p_amount bigint, p_reason text, p_detail jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
  if p_reason is distinct from 'shop' then raise exception 'FCO_BAD_REASON' using errcode = '22023'; end if;
  perform public.fco_wallet_lock(uid);
  perform public.fco_apply_fc(uid, -p_amount, p_reason, coalesce(p_detail, '{}'));
  return public.fco_wallet_json(uid);
end;
$$;

-- Đổi gift code: trình duyệt gửi mã băm; mỗi tài khoản dùng mỗi code một lần. FC cộng ở máy chủ, BP / gói trả về để trình duyệt cộng.
create function public.fco_redeem_gift(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); g public.fco_gift_codes; fc bigint;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'FCO_GIFT_INVALID' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(uid);
  select * into g from public.fco_gift_codes where hash = p_hash;
  if not found then raise exception 'FCO_GIFT_INVALID' using errcode = 'P0001'; end if;
  if g.expires is not null and public.fco_today() > g.expires then raise exception 'FCO_GIFT_EXPIRED' using errcode = 'P0001'; end if;
  insert into public.fco_gift_redemptions(user_id, hash) values (uid, p_hash) on conflict do nothing;
  if not found then raise exception 'FCO_GIFT_USED' using errcode = 'P0001'; end if;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(g.rewards) r where r ? 'fc';
  perform public.fco_apply_fc(uid, fc, 'gift', jsonb_build_object('hint', g.hint));
  return jsonb_build_object('rewards', g.rewards, 'wallet', public.fco_wallet_json(uid));
end;
$$;

-- Nhiệm vụ ngày → lượt miễn phí. "daily" và "play" máy chủ tự kiểm; "pack" / "upgrade" diễn ra trong trình duyệt nên tin trình duyệt
-- (tối đa 1 lượt mỗi nhiệm vụ mỗi ngày).
create function public.fco_event_mission(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; reward integer;
begin
  reward := case p_id when 'daily' then 1 when 'pack' then 1 when 'upgrade' then 1 when 'play' then 2 end;
  if reward is null then raise exception 'FCO_MISSION_UNKNOWN' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  if p_id = any(w.event_missions) then raise exception 'FCO_MISSION_DONE' using errcode = 'P0001'; end if;
  if (p_id = 'daily' and w.daily is distinct from public.fco_today()) or (p_id = 'play' and w.event_paid < 10) then
    raise exception 'FCO_MISSION_INCOMPLETE' using errcode = 'P0001';
  end if;
  update public.fco_wallets set event_free = event_free + reward, event_missions = event_missions || p_id where user_id = uid;
  return public.fco_wallet_json(uid);
end;
$$;

-- Chơi sự kiện: máy chủ trừ FC / lượt miễn phí, quay hũ theo cấp (bảng EVENT_LEVELS ở src/event.ts: chỉ hũ thứ 7 là FC),
-- góp FC vào quỹ chung và thử trúng Giải Đặc Biệt / Mini cho từng lượt. Trả về hũ trúng để trình duyệt cộng BP / gói.
create function public.fco_event_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user();
  w public.fco_wallets; j public.fco_jackpot;
  thresholds integer[] := array[0, 50, 200, 500, 900, 1400, 2000];
  jar_points integer[] := array[1, 1, 2, 3, 5, 10, 15, 20];
  jar_weights integer[] := array[420, 310, 140, 60, 30, 20, 13, 7];
  jar_fc integer[] := array[100, 300, 500, 700, 900, 1100, 1300];
  price integer; points bigint; lvl integer; r double precision; acc integer; jar integer;
  hits jsonb := '[]'; jar_won bigint := 0; share bigint; roll double precision; special double precision; amount bigint; kind text;
  wins jsonb := '[]'; jackpot_won bigint := 0; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_mode = 'fc' then
    price := case p_count when 1 then 20 when 10 then 190 when 50 then 900 when 100 then 1800 end;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  elsif p_mode = 'free' then
    if p_count is null or p_count < 1 or p_count > 100 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    price := 0;
  else raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  if p_mode = 'free' and w.event_free < p_count then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
  if price > 0 then perform public.fco_apply_fc(uid, -price, 'event', jsonb_build_object('count', p_count)); end if;
  points := w.event_points;
  for i in 1 .. p_count loop
    lvl := 0;
    for k in 1 .. 7 loop if points >= thresholds[k] then lvl := k - 1; end if; end loop;
    r := random() * 1000; acc := 0; jar := 8;
    for k in 1 .. 8 loop acc := acc + jar_weights[k]; if r < acc then jar := k; exit; end if; end loop;
    hits := hits || jsonb_build_object('level', lvl, 'jar', jar - 1);
    points := points + jar_points[jar];
    if jar = 7 then jar_won := jar_won + jar_fc[lvl + 1]; end if;
  end loop;
  update public.fco_wallets set event_points = points,
    event_free = event_free - case when p_mode = 'free' then p_count else 0 end,
    event_paid = event_paid + case when p_mode = 'fc' then p_count else 0 end
  where user_id = uid;
  if jar_won > 0 then perform public.fco_apply_fc(uid, jar_won, 'event_jar', jsonb_build_object('count', p_count)); end if;
  -- Giải Đặc Biệt: FC trả chia đều vào quỹ theo từng lượt; từ 10.000 FC mỗi lượt có tỷ lệ trúng (PLAYER_ODDS ở src/jackpot.ts).
  j := public.fco_jackpot_tick();
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    continue when j.pot < 10000;
    roll := random();
    special := least(.05, .0002 * public.fco_jackpot_pressure(j.pot));
    if roll < special then kind := 'special'; amount := j.pot; j.pot := 2000;
    elsif roll < special + .0015 then kind := 'mini'; amount := floor(j.pot / 10); j.pot := j.pot - amount;
    else continue; end if;
    jackpot_won := jackpot_won + amount;
    wins := wins || jsonb_build_object('kind', kind, 'amount', amount, 'time', now_ms);
    j.feed := (jsonb_build_array(jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', kind, 'time', now_ms)) || j.feed);
    j.feed := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(j.feed) with ordinality as t(e, n) where n <= 10);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  if jackpot_won > 0 then perform public.fco_apply_fc(uid, jackpot_won, 'jackpot', jsonb_build_object('wins', wins)); end if;
  return jsonb_build_object('hits', hits, 'paid', price, 'jarFc', jar_won, 'jackpotWins', wins,
    'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid));
end;
$$;

-- Quỹ chung để hiển thị (trình duyệt hỏi định kỳ khi mở trang sự kiện).
create function public.fco_jackpot_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return public.fco_jackpot_view(public.fco_jackpot_tick(), uid);
end;
$$;

-- ===== Hàm admin =====
-- Cộng (hoặc trừ, số âm) FC cho một tên đăng nhập sau khi kiểm tra bill chuyển khoản.
create function public.fco_admin_credit(p_login text, p_amount bigint, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin(); login text := lower(trim(coalesce(p_login, ''))); target uuid; b bigint;
begin
  if login = '' then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
  select id into target from auth.users where lower(email) = case when position('@' in login) > 0 then login else login || '@players.fco.invalid' end;
  if target is null then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.fco_wallet_lock(target);
  b := public.fco_apply_fc(target, p_amount, 'admin', jsonb_build_object('note', left(coalesce(p_note, ''), 200)), admin_id);
  return jsonb_build_object('login', login, 'fc', b);
end;
$$;

-- Sổ cái gần nhất (mọi người chơi) cho admin; p_login lọc theo một tài khoản.
create function public.fco_admin_ledger(p_limit integer default 50, p_login text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.fco_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('time', (extract(epoch from l.created_at) * 1000)::bigint, 'login', split_part(u.email, '@', 1),
      'delta', l.delta, 'balance', l.balance, 'reason', l.reason, 'note', l.detail->>'note', 'admin', l.actor is not null) order by l.created_at desc), '[]')
  into result
  from (select * from public.fco_fc_ledger l2
        where p_login is null or l2.user_id = (select id from auth.users where lower(email) = lower(trim(p_login)) || '@players.fco.invalid' or lower(email) = lower(trim(p_login)))
        order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) l
  join auth.users u on u.id = l.user_id;
  return result;
end;
$$;

create function public.fco_admin_gift_codes() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.fco_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('hash', g.hash, 'hint', g.hint, 'rewards', g.rewards, 'expires', g.expires, 'created', g.created_at::date,
      'used', (select count(*) from public.fco_gift_redemptions r where r.hash = g.hash)) order by g.created_at desc), '[]')
  into result from public.fco_gift_codes g;
  return result;
end;
$$;

create function public.fco_admin_gift_save(p_hash text, p_hint text, p_rewards jsonb, p_expires date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin_id uuid := public.fco_require_admin();
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or coalesce(p_hint, '') = '' or length(p_hint) > 40 then raise exception 'FCO_GIFT_BAD' using errcode = '22023'; end if;
  if not public.fco_valid_rewards(p_rewards) then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
  insert into public.fco_gift_codes(hash, hint, rewards, expires, created_by) values (p_hash, p_hint, p_rewards, p_expires, admin_id) on conflict do nothing;
  if not found then raise exception 'FCO_GIFT_EXISTS' using errcode = 'P0001'; end if;
  return public.fco_admin_gift_codes();
end;
$$;

create function public.fco_admin_gift_delete(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  delete from public.fco_gift_codes where hash = p_hash;
  return public.fco_admin_gift_codes();
end;
$$;

-- Bản lưu trên máy chủ không còn chứa FC: số FC chỉ lấy từ fco_wallets.
create or replace function public.fco_commit_save(p_data jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.fco_game_saves;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_revision is null or p_revision < 0 or p_data is null or jsonb_typeof(p_data) <> 'object'
    or p_data->>'version' is distinct from '1' or jsonb_typeof(p_data->'cards') is distinct from 'array'
    or octet_length(p_data::text) > 10000000 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  p_data := p_data - 'fc';
  if p_revision = 0 then
    insert into public.fco_game_saves(user_id, revision, data)
    values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
  else
    update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'FCO_SAVE_CONFLICT' using errcode = 'P0001'; end if;
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$$;
update public.fco_game_saves set data = data - 'fc' where data ? 'fc';

-- Quyền: hàm nội bộ không ai gọi được trực tiếp; hàm người chơi / admin chỉ cho tài khoản đã đăng nhập.
revoke all on function public.fco_today(), public.fco_require_user(), public.fco_wallet_lock(uuid, bigint), public.fco_apply_fc(uuid, bigint, text, jsonb, uuid),
  public.fco_wallet_json(uuid), public.fco_require_admin(), public.fco_public_name(uuid), public.fco_bot_name(), public.fco_jackpot_pressure(bigint),
  public.fco_jackpot_tick(), public.fco_jackpot_view(public.fco_jackpot, uuid), public.fco_valid_rewards(jsonb) from public, anon, authenticated;
revoke all on function public.fco_wallet(bigint), public.fco_claim_daily(), public.fco_spend_fc(bigint, text, jsonb), public.fco_redeem_gift(text),
  public.fco_event_mission(text), public.fco_event_play(integer, text), public.fco_jackpot_state(),
  public.fco_admin_credit(text, bigint, text), public.fco_admin_ledger(integer, text), public.fco_admin_gift_codes(),
  public.fco_admin_gift_save(text, text, jsonb, date), public.fco_admin_gift_delete(text) from public, anon;
grant execute on function public.fco_wallet(bigint), public.fco_claim_daily(), public.fco_spend_fc(bigint, text, jsonb), public.fco_redeem_gift(text),
  public.fco_event_mission(text), public.fco_event_play(integer, text), public.fco_jackpot_state(),
  public.fco_admin_credit(text, bigint, text), public.fco_admin_ledger(integer, text), public.fco_admin_gift_codes(),
  public.fco_admin_gift_save(text, text, jsonb, date), public.fco_admin_gift_delete(text) to authenticated;

-- Gift code đã tạo trước đây (13.000 FC, gợi ý "FC…") chuyển từ src/gift-codes.json lên máy chủ.
insert into public.fco_gift_codes(hash, hint, rewards, expires)
values ('5dbefde7749360e8ea7930196e08fd86058c8d8904254b77906489fb54c0aa51', 'FC•••••••••••', '[{"fc": 13000}]', null)
on conflict do nothing;

-- Admin: tài khoản game "quocdan06" (nếu chưa đăng ký thì chạy lại câu này sau khi đăng ký).
insert into public.fco_admins(user_id) select id from auth.users where lower(email) = 'quocdan06@players.fco.invalid' on conflict do nothing;

commit;
