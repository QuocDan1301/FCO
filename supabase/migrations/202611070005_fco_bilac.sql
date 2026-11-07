begin;

-- Sự kiện Bi Lắc: mỗi lượt đá 3 quả bóng vào 5 ô (CLB, FC, Special, BP, Thẻ). 3 quả cùng ô → hàng "x3" của ô đó,
-- 2 quả cùng ô → hàng "x2", 3 ô khác nhau → hàng "mixed". Trúng hàng nào thì nhận ngẫu nhiên 1 món trong hàng đó và cộng điểm hàng;
-- điểm mở quà mốc. Hàng x3 / x2 của ô Special trả Giải Đặc Biệt / Giải Phụ từ quỹ chung fco_jackpot (bot vẫn săn như trước).
-- Tỷ lệ bóng, quà từng hàng, điểm và quà mốc nằm trong bảng bên dưới: đổi quà chỉ cần sửa dữ liệu (xem supabase/README.md).
-- Quà: {"fc": n} (máy chủ cộng), {"bp": n} và {"pack": id, "count": n} (trình duyệt thêm vào bản lưu), {"jackpot": "special" | "mini"}.

create table public.fco_bilac_symbols (
  id text primary key, label text not null, weight integer not null check (weight >= 0), sort integer not null
);
create table public.fco_bilac_rows (
  id text primary key,
  symbol text references public.fco_bilac_symbols(id),     -- null cho hàng "mixed"
  kind text not null check (kind in ('triple', 'pair', 'mixed')),
  points integer not null check (points >= 0),
  rewards jsonb not null check (jsonb_typeof(rewards) = 'array' and jsonb_array_length(rewards) > 0),
  sort integer not null,
  unique (symbol, kind)
);
create table public.fco_bilac_milestones (
  idx integer primary key, points integer not null check (points > 0), rewards jsonb not null check (jsonb_typeof(rewards) = 'array')
);
alter table public.fco_bilac_symbols enable row level security;
alter table public.fco_bilac_rows enable row level security;
alter table public.fco_bilac_milestones enable row level security;
revoke all on public.fco_bilac_symbols, public.fco_bilac_rows, public.fco_bilac_milestones from anon, authenticated;

alter table public.fco_wallets
  add column bilac_points bigint not null default 0 check (bilac_points >= 0),
  add column bilac_claimed integer[] not null default '{}',
  add column bilac_free_day date;          -- ngày đã dùng lượt miễn phí (1 lượt mỗi ngày)

-- Dữ liệu ban đầu (TẠM, chờ danh sách quà chính thức). Tỷ lệ mỗi quả bóng: CLB 22, FC 20, Special 6, BP 26, Thẻ 26.
insert into public.fco_bilac_symbols values
  ('club', 'CLB', 22, 1), ('fc', 'FC', 20, 2), ('special', 'Special', 6, 3), ('bp', 'BP', 26, 4), ('card', 'Thẻ', 26, 5);
insert into public.fco_bilac_rows values
  ('special3', 'special', 'triple', 10, '[{"jackpot":"special"}]', 1),
  ('fc3', 'fc', 'triple', 5, '[{"fc":3000},{"fc":2000},{"fc":1500},{"fc":1000}]', 2),
  ('club3', 'club', 'triple', 5, '[{"pack":"event-7-le","count":1},{"pack":"event-6-wb","count":1},{"pack":"event-5-bld30","count":1},{"pack":"event-2-uc80","count":1}]', 3),
  ('bp3', 'bp', 'triple', 5, '[{"bp":400000000},{"bp":350000000},{"bp":300000000},{"bp":250000000}]', 4),
  ('card3', 'card', 'triple', 5, '[{"pack":"infinite-prime","count":1},{"pack":"prime-2","count":1},{"pack":"eternal","count":1},{"pack":"the-moment","count":1}]', 5),
  ('special2', 'special', 'pair', 2, '[{"jackpot":"mini"}]', 6),
  ('fc2', 'fc', 'pair', 2, '[{"fc":300},{"fc":200},{"bp":20000000},{"fc":100},{"bp":10000000},{"pack":"event-4-all","count":1}]', 7),
  ('club2', 'club', 'pair', 2, '[{"pack":"ms-1-1","count":1},{"pack":"event-4-all","count":1},{"pack":"event-5-all","count":1},{"pack":"ms-150-1","count":1},{"pack":"ms-200-2","count":1},{"pack":"event-6-108","count":1}]', 8),
  ('bp2', 'bp', 'pair', 2, '[{"bp":50000000},{"bp":40000000},{"bp":30000000},{"bp":25000000},{"bp":20000000},{"bp":15000000}]', 9),
  ('card2', 'card', 'pair', 2, '[{"pack":"eternal","count":1},{"pack":"event-2-118","count":1},{"bp":10000000},{"pack":"event-4-all","count":1},{"bp":8000000},{"pack":"event-6-108","count":1}]', 10),
  ('mixed', null, 'mixed', 1, '[{"bp":2000000},{"bp":3000000},{"bp":5000000},{"pack":"ms-1-1","count":1},{"bp":1000000},{"bp":4000000}]', 11);
insert into public.fco_bilac_milestones values
  (0, 10, '[{"pack":"ms-1-1","count":1},{"bp":5000000}]'),
  (1, 30, '[{"pack":"event-2-118","count":1},{"bp":10000000}]'),
  (2, 60, '[{"pack":"event-4-all","count":1},{"bp":20000000}]'),
  (3, 100, '[{"pack":"eternal","count":1},{"bp":40000000}]'),
  (4, 150, '[{"pack":"prime-2","count":1},{"bp":60000000}]'),
  (5, 220, '[{"pack":"event-6-wb","count":1},{"bp":80000000}]'),
  (6, 300, '[{"pack":"infinite-prime","count":1},{"bp":120000000}]');

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
    'admin', exists (select 1 from public.fco_admins a where a.user_id = w.user_id))
  from public.fco_wallets w where w.user_id = p_uid
$$;

-- Cấu hình hiển thị (bảng quà, quà mốc, giá lượt).
create function public.fco_bilac_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  return jsonb_build_object(
    'symbols', (select jsonb_agg(jsonb_build_object('id', id, 'label', label) order by sort) from public.fco_bilac_symbols),
    'rows', (select jsonb_agg(jsonb_build_object('id', id, 'symbol', symbol, 'kind', kind, 'points', points, 'rewards', rewards) order by sort) from public.fco_bilac_rows),
    'milestones', (select coalesce(jsonb_agg(jsonb_build_object('points', points, 'rewards', rewards) order by idx), '[]') from public.fco_bilac_milestones),
    'prices', '[{"count":1,"price":20},{"count":10,"price":190},{"count":50,"price":900}]'::jsonb);
end;
$$;

create function public.fco_bilac_roll() returns text language plpgsql volatile set search_path = '' as $$
declare total integer; r double precision; acc integer := 0; s record;
begin
  select sum(weight) into total from public.fco_bilac_symbols;
  r := random() * total;
  for s in select id, weight from public.fco_bilac_symbols order by sort loop
    acc := acc + s.weight;
    if r < acc then return s.id; end if;
  end loop;
  return (select id from public.fco_bilac_symbols order by sort desc limit 1);
end;
$$;

-- Chơi: p_mode 'fc' (1 / 10 / 50 lượt = 20 / 190 / 900 FC) hoặc 'free' (1 lượt miễn phí mỗi ngày).
create function public.fco_bilac_play(p_count integer, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot;
  price integer; balls text[]; top text; top_n integer; row_id text; row_points integer; row_rewards jsonb; reward jsonb;
  plays jsonb := '[]'; fc_won bigint := 0; gained bigint := 0; share bigint; amount bigint; jp_kind text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_mode = 'fc' then
    price := case p_count when 1 then 20 when 10 then 190 when 50 then 900 end;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  elsif p_mode = 'free' then
    if p_count is distinct from 1 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    price := 0;
  else raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  if p_mode = 'free' then
    if w.bilac_free_day is not distinct from public.fco_today() then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
    update public.fco_wallets set bilac_free_day = public.fco_today() where user_id = uid;
  else
    perform public.fco_apply_fc(uid, -price, 'bilac', jsonb_build_object('count', p_count));
  end if;
  j := public.fco_jackpot_tick();
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    balls := array[public.fco_bilac_roll(), public.fco_bilac_roll(), public.fco_bilac_roll()];
    select b, count(*) into top, top_n from unnest(balls) b group by b order by count(*) desc, min(array_position(balls, b)) limit 1;
    select r.id, r.points, r.rewards into row_id, row_points, row_rewards from public.fco_bilac_rows r
      where (top_n = 3 and r.kind = 'triple' and r.symbol = top) or (top_n = 2 and r.kind = 'pair' and r.symbol = top) or (top_n = 1 and r.kind = 'mixed');
    reward := row_rewards -> floor(random() * jsonb_array_length(row_rewards))::int;
    if reward ? 'jackpot' then
      jp_kind := reward->>'jackpot';
      if jp_kind = 'special' then amount := j.pot; j.pot := 2000; else amount := floor(j.pot / 10); j.pot := j.pot - amount; end if;
      reward := jsonb_build_object('fc', amount, 'jackpot', jp_kind);
      j.feed := (jsonb_build_array(jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', jp_kind, 'time', now_ms)) || j.feed);
      j.feed := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(j.feed) with ordinality as t(e, n) where n <= 10);
    end if;
    if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
    gained := gained + row_points;
    plays := plays || jsonb_build_object('balls', to_jsonb(balls), 'row', row_id, 'points', row_points, 'reward', reward);
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set bilac_points = bilac_points + gained where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'bilac_win', jsonb_build_object('count', p_count)); end if;
  return jsonb_build_object('plays', plays, 'paid', price, 'points', gained, 'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid));
end;
$$;

-- Nhận quà mốc (mỗi mốc một lần). FC máy chủ cộng; BP / gói trả về để trình duyệt thêm.
create function public.fco_bilac_claim(p_index integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; m public.fco_bilac_milestones; fc bigint;
begin
  w := public.fco_wallet_lock(uid);
  select * into m from public.fco_bilac_milestones where idx = p_index;
  if not found then raise exception 'FCO_MILESTONE_UNKNOWN' using errcode = '22023'; end if;
  if p_index = any(w.bilac_claimed) then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  if w.bilac_points < m.points then raise exception 'FCO_MILESTONE_LOCKED' using errcode = 'P0001'; end if;
  update public.fco_wallets set bilac_claimed = bilac_claimed || p_index where user_id = uid;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(m.rewards) r where r ? 'fc';
  if fc > 0 then perform public.fco_apply_fc(uid, fc, 'bilac_milestone', jsonb_build_object('index', p_index)); end if;
  return jsonb_build_object('rewards', m.rewards, 'wallet', public.fco_wallet_json(uid));
end;
$$;

revoke all on function public.fco_bilac_roll() from public, anon, authenticated;
revoke all on function public.fco_bilac_config(), public.fco_bilac_play(integer, text), public.fco_bilac_claim(integer) from public, anon;
grant execute on function public.fco_bilac_config(), public.fco_bilac_play(integer, text), public.fco_bilac_claim(integer) to authenticated;

commit;
