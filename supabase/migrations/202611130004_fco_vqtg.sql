begin;

-- Sự kiện Vòng Quanh Thế Giới (VQTG), thay chỗ Bi Lắc (EVENT_BILAC_ENABLED = false).
-- Bàn cờ 16 ô chạy vòng; quân của mỗi người chơi đứng ở fco_wallets.vqtg_pos (0 = ô Bắt đầu, 1..16). Mỗi lượt máy chủ lắc xúc xắc 1–6,
-- quân đi tiếp (ô 16 → ô 1) và nhận quà ô vừa dừng:
--   reward  : 1 món trong 4 quà của ô (weights tăng dần trái → phải: quà bên trái ngon hơn, hiếm hơn — cùng quy ước Bi Lắc).
--   pick    : +1 lượt "Chỉ định" (lượt sau được tự chọn số xúc xắc; không chọn được số dừng ở ô Quỹ BP / Giải Đặc Biệt).
--   bp      : Quỹ BP chung (fco_vqtg_state.bp_pool): mỗi FC trả cộng thêm vào quỹ; dừng ở đây có bpChance trúng cả quỹ,
--             không trúng thì nhận 1 quà an ủi của ô.
--   jackpot : quỹ FC chung với Bi Lắc (fco_jackpot, bot vẫn săn): có cơ hội Giải Đặc Biệt (cả quỹ) / Giải Phụ (1/10 quỹ),
--             không trúng thì nhận 1 quà an ủi của ô.
-- Vé: mỗi lượt chơi (FC hoặc miễn phí) +1 vé (fco_wallets.vqtg_tickets), vé dùng để đổi quà mốc (danh sách mốc chờ người dùng gửi).
-- Quà các ô hiện là TẠM (lấy từ bảng quà Bi Lắc) — chờ file Excel quà của người dùng; khi có thì viết migration UPDATE fco_vqtg_tiles.
-- Quà: {"fc": n} (máy chủ cộng FC), {"bp": n}, {"pack": id, "count": n} (fco_inv_grant cộng vào kho / game tự cộng khi chưa giữ kho).

create table public.fco_vqtg_tiles (
  idx smallint primary key check (idx between 1 and 16),
  kind text not null check (kind in ('reward', 'pick', 'bp', 'jackpot')),
  label text not null default '',
  rewards jsonb not null default '[]' check (jsonb_typeof(rewards) = 'array'),
  weights integer[]
);
create table public.fco_vqtg_state (
  id integer primary key default 1 check (id = 1),
  bp_pool bigint not null check (bp_pool >= 0)
);
alter table public.fco_vqtg_tiles enable row level security;
alter table public.fco_vqtg_state enable row level security;
revoke all on public.fco_vqtg_tiles, public.fco_vqtg_state from anon, authenticated;

alter table public.fco_wallets
  add column vqtg_pos smallint not null default 0 check (vqtg_pos between 0 and 16),
  add column vqtg_picks integer not null default 0 check (vqtg_picks >= 0),
  add column vqtg_tickets integer not null default 0 check (vqtg_tickets >= 0),
  add column vqtg_free_day date;           -- ngày đã dùng lượt miễn phí (1 lượt mỗi ngày)

insert into public.fco_vqtg_state values (1, 100000000);

-- Quà TẠM từ bảng quà Bi Lắc: 4 món đầu của mỗi hàng.
insert into public.fco_vqtg_tiles (idx, kind, label, rewards, weights)
select t.idx, t.kind, t.label,
  case when t.src is null then '[]'::jsonb else (select jsonb_path_query_array(r.rewards, '$[0 to 3]') from public.fco_bilac_rows r where r.id = t.src) end,
  case when t.src is null then null else '{10,20,30,40}'::integer[] end
from (values
  (1, 'reward', '', 'mixed'), (2, 'reward', '', 'bp2'), (3, 'reward', '', 'card2'), (4, 'reward', '', 'mixed'), (5, 'reward', '', 'club2'),
  (6, 'pick', 'Chỉ định', null), (7, 'reward', '', 'bp2'), (8, 'reward', '', 'card2'), (9, 'reward', '', 'fc2'),
  (10, 'bp', 'Quỹ BP', 'bp2'), (11, 'reward', '', 'club2'), (12, 'reward', '', 'bp3'), (13, 'reward', '', 'card3'),
  (14, 'jackpot', 'Giải Đặc Biệt', 'mixed'), (15, 'reward', '', 'club3'), (16, 'reward', '', 'card2')
) as t(idx, kind, label, src);

-- Hằng số sự kiện (giá lượt, quỹ BP, tỷ lệ ô đặc biệt). src/vqtg.ts ghi lại cùng số để hiện Hướng dẫn.
create function public.fco_vqtg_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'prices', '[{"count":1,"price":18},{"count":10,"price":190},{"count":50,"price":900}]'::jsonb,
    'bpBase', 100000000,      -- quỹ BP sau mỗi lần có người trúng
    'bpPerFc', 20000,         -- mỗi FC trả cộng 20.000 BP vào quỹ
    'bpChance', 0.06,         -- dừng ô Quỹ BP: 6 % trúng cả quỹ
    'miniChance', 0.02)       -- dừng ô Giải Đặc Biệt: 2 % Giải Phụ
$$;

-- Như 202611120011, thêm 'vqtg' (ô đang đứng, số lượt Chỉ định, còn lượt miễn phí hôm nay).
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
    'vqtg', jsonb_build_object('pos', w.vqtg_pos, 'picks', w.vqtg_picks, 'tickets', w.vqtg_tickets, 'freeToday', w.vqtg_free_day is distinct from public.fco_today()),
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

-- Cấu hình hiển thị: 16 ô (loại, tên, quà), giá lượt, quỹ BP hiện tại.
create function public.fco_vqtg_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  return jsonb_build_object(
    'tiles', (select jsonb_agg(jsonb_build_object('idx', idx, 'kind', kind, 'label', label, 'rewards', rewards) order by idx) from public.fco_vqtg_tiles),
    'prices', public.fco_vqtg_rules()->'prices',
    'bpPool', (select bp_pool from public.fco_vqtg_state where id = 1));
end;
$$;

-- Một quà của ô theo weights (ô không có quà thì null).
create function public.fco_vqtg_tile_reward(p_rewards jsonb, p_weights integer[]) returns jsonb language plpgsql volatile set search_path = '' as $$
begin
  if p_rewards is null or jsonb_array_length(p_rewards) = 0 then return null; end if;
  return p_rewards -> public.fco_bilac_pick(jsonb_array_length(p_rewards), p_weights);
end;
$$;

-- Chơi: p_mode 'fc' (1 / 10 / 50 lượt = 18 / 190 / 900 FC) hoặc 'free' (1 lượt miễn phí mỗi ngày).
-- p_pick 1..6: dùng 1 lượt Chỉ định cho lượt này (chỉ khi chơi 1 lượt); số dừng ở ô Quỹ BP / Giải Đặc Biệt bị chặn.
create function public.fco_vqtg_play(p_count integer, p_mode text, p_pick integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot; rules jsonb := public.fco_vqtg_rules();
  t_kind text; t_rewards jsonb; t_weights integer[];
  price integer; share bigint; pos integer; roll integer; dest integer; reward jsonb; extra jsonb; amount bigint; jp_kind text;
  picks integer; got_pick integer := 0; pool bigint; plays jsonb := '[]'; grants jsonb := '[]'; fc_won bigint := 0; granted jsonb;
  r double precision; special_chance double precision; now_ms bigint := (extract(epoch from now()) * 1000)::bigint; mini_done boolean;
begin
  if p_mode = 'fc' then
    select (p->>'price')::integer into price from jsonb_array_elements(rules->'prices') p where (p->>'count')::integer = p_count;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  elsif p_mode = 'free' then
    if p_count is distinct from 1 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    price := 0;
  else raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  if p_pick is not null and (p_count <> 1 or p_pick not between 1 and 6) then raise exception 'FCO_BAD_PICK' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  pos := w.vqtg_pos; picks := w.vqtg_picks;
  if p_pick is not null then
    if picks < 1 then raise exception 'FCO_NO_PICKS' using errcode = 'P0001'; end if;
    if (select kind from public.fco_vqtg_tiles where idx = (pos + p_pick - 1) % 16 + 1) in ('bp', 'jackpot') then
      raise exception 'FCO_PICK_BLOCKED' using errcode = 'P0001';
    end if;
    picks := picks - 1;
  end if;
  if p_mode = 'free' then
    if w.vqtg_free_day is not distinct from public.fco_today() then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
    update public.fco_wallets set vqtg_free_day = public.fco_today() where user_id = uid;
  else
    perform public.fco_apply_fc(uid, -price, 'vqtg', jsonb_build_object('count', p_count));
  end if;
  j := public.fco_jackpot_tick();
  mini_done := public.fco_jackpot_mini_done(j.feed);
  select bp_pool into pool from public.fco_vqtg_state where id = 1 for update;
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    pool := pool + share * (rules->>'bpPerFc')::bigint;
    roll := coalesce(p_pick, 1 + floor(random() * 6)::integer);
    dest := (pos + roll - 1) % 16 + 1;
    select kind, rewards, weights into t_kind, t_rewards, t_weights from public.fco_vqtg_tiles where idx = dest;
    reward := null; extra := '{}';
    if t_kind = 'pick' then
      picks := picks + 1; got_pick := got_pick + 1; extra := '{"pick": 1}';
    elsif t_kind = 'bp' then
      if random() < (rules->>'bpChance')::double precision then
        reward := jsonb_build_object('bp', pool); extra := '{"pool": true}';
        pool := (rules->>'bpBase')::bigint;
      else reward := public.fco_vqtg_tile_reward(t_rewards, t_weights); end if;
    elsif t_kind = 'jackpot' then
      -- Như Bi Lắc: từ 10.000 FC cơ hội Giải Đặc Biệt tăng theo áp lực quỹ (×16 vì ô này được dừng ~1/16 số lượt).
      special_chance := case when j.pot >= 10000 then least(.04, .0032 * public.fco_jackpot_pressure(j.pot)) else 0 end;
      r := random();
      jp_kind := case when r < special_chance then 'special' when r < special_chance + (rules->>'miniChance')::double precision then 'mini' end;
      if jp_kind = 'special' then
        -- Vòng quỹ này chưa có Giải Phụ: Giải Phụ nổ trước (bot), người chơi nhận phần quỹ còn lại.
        if not mini_done then
          amount := floor(j.pot / 10); j.pot := j.pot - amount;
          j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_bot_name(), 'amount', amount, 'kind', 'mini', 'time', now_ms - 1));
        end if;
        amount := j.pot; j.pot := 2000; mini_done := false;
      elsif jp_kind = 'mini' then amount := floor(j.pot / 10); j.pot := j.pot - amount; mini_done := true;
      end if;
      if jp_kind is not null then
        reward := jsonb_build_object('fc', amount, 'jackpot', jp_kind);
        j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', amount, 'kind', jp_kind, 'time', now_ms));
      else reward := public.fco_vqtg_tile_reward(t_rewards, t_weights); end if;
    else
      reward := public.fco_vqtg_tile_reward(t_rewards, t_weights);
    end if;
    if reward is not null then
      if reward ? 'fc' then fc_won := fc_won + (reward->>'fc')::bigint; end if;
      grants := grants || jsonb_build_array(reward);
    end if;
    plays := plays || (jsonb_build_object('roll', roll, 'from', pos, 'to', dest, 'kind', t_kind, 'reward', reward) || extra);
    pos := dest;
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_vqtg_state set bp_pool = pool where id = 1;
  update public.fco_wallets set vqtg_pos = pos, vqtg_picks = picks, vqtg_tickets = vqtg_tickets + p_count where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'vqtg_win', jsonb_build_object('count', p_count)); end if;
  granted := public.fco_inv_grant(uid, grants, 'event',
    'Vòng Quanh Thế Giới · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end || case when p_pick is not null then ' · chỉ định ' || p_pick else '' end,
    coalesce(nullif(public.fco_inv_reward_text(grants), ''), 'Không có quà') || ' · +' || p_count || ' vé' || case when got_pick > 0 then ' · +' || got_pick || ' Chỉ định' else '' end
      || case when price > 0 then ' · −' || public.fco_inv_money(price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', price, 'picks', picks, 'pos', pos, 'tickets', w.vqtg_tickets + p_count, 'bpPool', pool,
    'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

revoke all on function public.fco_vqtg_rules(), public.fco_vqtg_tile_reward(jsonb, integer[]) from public, anon, authenticated;
revoke all on function public.fco_vqtg_config(), public.fco_vqtg_play(integer, text, integer) from public, anon;
grant execute on function public.fco_vqtg_config(), public.fco_vqtg_play(integer, text, integer) to authenticated;

commit;
