begin;

-- Cờ tỷ phú · QUÀ MỐC TÍCH LŨY theo Tài liệu/quamocctp.xlsx (2026-11-22). Chạy SAU 202611220001_fco_ctp.sql. Chạy lại được.
--   · 24 mốc thường (1 → 1.800 điểm): đủ điểm thì chọn 1 trong các lựa chọn của mốc; mỗi vòng 1.800 điểm nhận lại được (như Shop Đổi Vé VQTG).
--     Mốc 1 điểm chỉ nhận 1 lần và phải có lượt trả FC (sổ FC 'ctp' sau lần reset gần nhất) — như mốc 1 vé VQTG.
--   · 12 mốc ĐẶC BIỆT (9.000 → 63.000 điểm, "mở khoá sau N điểm"): nhận 1 lần khi tổng điểm ≥ N và đã nhận ít nhất 1 quà mốc thường
--     (luật: "số lần chọn quà tối thiểu là 1").
--   · Quà: gói / BP / phiếu thuế (kho máy chủ), Thẻ Cơ Hội / Thẻ Khí Vận / Huy Hiệu Tuyển Chọn (cột ví ctp_card_chance / ctp_card_luck /
--     ctp_badges — cách dùng làm ở bước sau). Excel có "ICON TM Coin x 5" (mốc 100) và "TC x 10000" (mốc 1.800): game chưa có → bỏ.
--   · Phiếu giảm giá thuế 35 % / 40 % (mốc đặc biệt) là loại phiếu mới → fco_mkt_sell nhận thêm 35 / 40.
--   · 59 gói mới ctpm-* (src/packs.json); mốc khác dùng lại gói sẵn có.

do $$
begin
  if (select count(*) from public.fco_cat_packs where id in ('ctpm-1-1', 'ctpm-100-1', 'ctpm-100-2', 'ctpm-100-3', 'ctpm-1000-1', 'ctpm-1000-2', 'ctpm-1000-3', 'ctpm-1100-1', 'ctpm-1100-2', 'ctpm-1100-3', 'ctpm-1200-1', 'ctpm-1200-2', 'ctpm-1200-3', 'ctpm-12600-1', 'ctpm-1300-1', 'ctpm-1300-2', 'ctpm-1300-3', 'ctpm-1400-2', 'ctpm-1400-3', 'ctpm-15-1', 'ctpm-150-1', 'ctpm-150-2', 'ctpm-150-3', 'ctpm-1500-2', 'ctpm-1500-3', 'ctpm-1600-1', 'ctpm-1600-2', 'ctpm-1700-1', 'ctpm-1700-2', 'ctpm-1700-3', 'ctpm-1800-1', 'ctpm-1800-2', 'ctpm-1800-3', 'ctpm-18000', 'ctpm-200-1', 'ctpm-200-2', 'ctpm-25-1', 'ctpm-250-1', 'ctpm-250-2', 'ctpm-27000', 'ctpm-32400-1', 'ctpm-32400-2', 'ctpm-350-1', 'ctpm-350-2', 'ctpm-36000', 'ctpm-450-2', 'ctpm-45000', 'ctpm-50-1', 'ctpm-54000-1', 'ctpm-54000-2', 'ctpm-550-1', 'ctpm-550-3', 'ctpm-63000', 'ctpm-800-1', 'ctpm-800-2', 'ctpm-800-3', 'ctpm-900-1', 'ctpm-900-2', 'ctpm-900-3')) < 59 then
    raise exception 'Chưa có các gói ctpm-* trên máy chủ: đưa bản game mới lên → Quản trị FC → Đồng bộ dữ liệu, rồi chạy lại migration này.';
  end if;
end $$;

create table if not exists public.fco_ctp_milestones (
  idx smallint primary key check (idx >= 0),
  points integer not null check (points > 0),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 1 and 3),
  once boolean not null default false,
  paid_only boolean not null default false,
  special boolean not null default false
);
alter table public.fco_ctp_milestones enable row level security;
revoke all on public.fco_ctp_milestones from anon, authenticated;
delete from public.fco_ctp_milestones;
insert into public.fco_ctp_milestones (idx, points, options, once, paid_only, special) values
  (0, 1, '[[{"pack":"ctpm-1-1","count":1},{"voucher":30,"count":1}]]', true, true, false),
  (1, 15, '[[{"pack":"ctpm-15-1","count":1},{"bp":1000000}],[{"pack":"ms-100-2","count":1},{"bp":1000000}]]', false, false, false),
  (2, 25, '[[{"pack":"ctpm-25-1","count":1},{"bp":2000000}]]', false, false, false),
  (3, 50, '[[{"pack":"ctpm-50-1","count":1},{"bp":3000000}]]', false, false, false),
  (4, 70, '[[{"pack":"ms-150-1","count":1},{"bp":4000000}]]', false, false, false),
  (5, 100, '[[{"pack":"ctpm-100-1","count":1},{"bp":5000000}],[{"pack":"ctpm-100-2","count":1},{"bp":5000000}],[{"pack":"ctpm-100-3","count":1},{"bp":5000000}]]', false, false, false),
  (6, 150, '[[{"pack":"ctpm-150-1","count":1},{"bp":7000000}],[{"pack":"ctpm-150-2","count":1},{"bp":7000000}],[{"pack":"ctpm-150-3","count":1},{"bp":7000000}]]', false, false, false),
  (7, 200, '[[{"pack":"ctpm-200-1","count":1},{"ctpCard":"chance","count":1},{"voucher":30,"count":1},{"bp":10000000}],[{"pack":"ctpm-200-2","count":1},{"ctpCard":"chance","count":1},{"voucher":30,"count":1},{"bp":10000000}],[{"pack":"vqm-150-3","count":1},{"ctpCard":"chance","count":1},{"voucher":30,"count":1},{"bp":10000000}]]', false, false, false),
  (8, 250, '[[{"pack":"ctpm-250-1","count":1},{"bp":12000000}],[{"pack":"ctpm-250-2","count":1},{"bp":12000000}],[{"pack":"ms-350-1","count":1},{"bp":12000000}]]', false, false, false),
  (9, 350, '[[{"pack":"ctpm-350-1","count":1},{"bp":15000000}],[{"pack":"ctpm-350-2","count":1},{"bp":15000000}],[{"pack":"vqm-300-2","count":1},{"bp":15000000}]]', false, false, false),
  (10, 450, '[[{"pack":"ms-450-3","count":1},{"ctpCard":"luck","count":1},{"voucher":30,"count":1},{"bp":20000000}],[{"pack":"ctpm-450-2","count":1},{"ctpCard":"luck","count":1},{"voucher":30,"count":1},{"bp":20000000}],[{"pack":"event-5-bld30","count":1},{"ctpCard":"luck","count":1},{"voucher":30,"count":1},{"bp":20000000}]]', false, false, false),
  (11, 550, '[[{"pack":"ctpm-550-1","count":1},{"bp":25000000}],[{"pack":"event-3-112","count":1},{"bp":25000000}],[{"pack":"ctpm-550-3","count":1},{"bp":25000000}]]', false, false, false),
  (12, 650, '[[{"pack":"blm-250-3","count":1},{"bp":30000000}],[{"pack":"ms-700-3","count":1},{"bp":30000000}],[{"pack":"blm-250-2","count":1},{"bp":30000000}]]', false, false, false),
  (13, 800, '[[{"pack":"ctpm-800-1","count":1},{"bp":40000000}],[{"pack":"ctpm-800-2","count":1},{"bp":40000000}],[{"pack":"ctpm-800-3","count":1},{"bp":40000000}]]', false, false, false),
  (14, 900, '[[{"pack":"ctpm-900-1","count":1},{"bp":50000000}],[{"pack":"ctpm-900-2","count":1},{"bp":50000000}],[{"pack":"ctpm-900-3","count":1},{"bp":50000000}]]', false, false, false),
  (15, 1000, '[[{"pack":"ctpm-1000-1","count":1},{"bp":60000000}],[{"pack":"ctpm-1000-2","count":1},{"bp":60000000}],[{"pack":"ctpm-1000-3","count":1},{"bp":60000000}]]', false, false, false),
  (16, 1100, '[[{"pack":"ctpm-1100-1","count":1},{"bp":70000000}],[{"pack":"ctpm-1100-2","count":1},{"bp":70000000}],[{"pack":"ctpm-1100-3","count":1},{"bp":70000000}]]', false, false, false),
  (17, 1200, '[[{"pack":"ctpm-1200-1","count":1},{"bp":80000000}],[{"pack":"ctpm-1200-2","count":1},{"bp":80000000}],[{"pack":"ctpm-1200-3","count":1},{"bp":80000000}]]', false, false, false),
  (18, 1300, '[[{"pack":"ctpm-1300-1","count":1},{"bp":90000000}],[{"pack":"ctpm-1300-2","count":1},{"bp":90000000}],[{"pack":"ctpm-1300-3","count":1},{"bp":90000000}]]', false, false, false),
  (19, 1400, '[[{"pack":"blm-1150-3","count":1},{"bp":110000000}],[{"pack":"ctpm-1400-2","count":1},{"bp":110000000}],[{"pack":"ctpm-1400-3","count":1},{"bp":110000000}]]', false, false, false),
  (20, 1500, '[[{"pack":"bl-up26-30","count":1},{"bp":130000000}],[{"pack":"ctpm-1500-2","count":1},{"bp":130000000}],[{"pack":"ctpm-1500-3","count":1},{"bp":130000000}]]', false, false, false),
  (21, 1600, '[[{"pack":"ctpm-1600-1","count":1},{"bp":140000000}],[{"pack":"ctpm-1600-2","count":1},{"bp":140000000}],[{"pack":"blm-800-2","count":1},{"bp":140000000}]]', false, false, false),
  (22, 1700, '[[{"pack":"ctpm-1700-1","count":1},{"bp":160000000}],[{"pack":"ctpm-1700-2","count":1},{"bp":160000000}],[{"pack":"ctpm-1700-3","count":1},{"bp":160000000}]]', false, false, false),
  (23, 1800, '[[{"pack":"ctpm-1800-1","count":1},{"voucher":30,"count":1},{"bp":180000000}],[{"pack":"ctpm-1800-2","count":1},{"voucher":30,"count":1},{"bp":180000000}],[{"pack":"ctpm-1800-3","count":1},{"voucher":30,"count":1},{"bp":180000000}]]', false, false, false),
  (24, 9000, '[[{"pack":"the-moment","count":1},{"voucher":35,"count":1},{"bp":200000000}]]', true, false, true),
  (25, 12600, '[[{"pack":"ctpm-12600-1","count":1},{"voucher":35,"count":1},{"bp":220000000}]]', true, false, true),
  (26, 12600, '[[{"ctpBadge":1},{"voucher":40,"count":1},{"bp":230000000}]]', true, false, true),
  (27, 18000, '[[{"pack":"ctpm-18000","count":1},{"voucher":40,"count":1},{"bp":250000000}]]', true, false, true),
  (28, 27000, '[[{"pack":"ctpm-27000","count":1},{"voucher":40,"count":1},{"bp":260000000}]]', true, false, true),
  (29, 32400, '[[{"pack":"ctpm-32400-1","count":1},{"voucher":40,"count":1},{"bp":280000000}]]', true, false, true),
  (30, 32400, '[[{"pack":"ctpm-32400-2","count":1},{"voucher":40,"count":1},{"bp":280000000}]]', true, false, true),
  (31, 36000, '[[{"pack":"ctpm-36000","count":1},{"voucher":40,"count":1},{"bp":300000000}]]', true, false, true),
  (32, 45000, '[[{"pack":"ctpm-45000","count":1},{"voucher":40,"count":1},{"bp":310000000}]]', true, false, true),
  (33, 54000, '[[{"pack":"ctpm-54000-1","count":1},{"voucher":40,"count":1},{"bp":320000000}]]', true, false, true),
  (34, 54000, '[[{"pack":"ctpm-54000-2","count":1},{"voucher":40,"count":1},{"bp":320000000}]]', true, false, true),
  (35, 63000, '[[{"pack":"ctpm-63000","count":1},{"voucher":40,"count":1},{"bp":350000000}]]', true, false, true);

alter table public.fco_wallets
  add column if not exists ctp_claimed integer[] not null default '{}',
  add column if not exists ctp_card_chance integer not null default 0 check (ctp_card_chance >= 0),
  add column if not exists ctp_card_luck integer not null default 0 check (ctp_card_luck >= 0),
  add column if not exists ctp_badges integer not null default 0 check (ctp_badges >= 0);

-- Đã từng trả FC chơi Cờ tỷ phú (sau lần reset gần nhất).
create or replace function public.fco_ctp_paid(p_uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fco_fc_ledger l where l.user_id = p_uid and l.reason = 'ctp'
                   and l.id > coalesce((select max(r.id) from public.fco_fc_ledger r where r.user_id = p_uid and r.reason = 'reset'), 0))
$$;

-- Số lần đã đạt (được nhận) của mốc với số điểm hiện có.
create or replace function public.fco_ctp_reached(m public.fco_ctp_milestones, p_points integer, p_claimed integer[]) returns integer
language sql stable set search_path = '' as $$
  select case
    when p_points < m.points then 0
    when m.special then case when exists (select 1 from public.fco_ctp_milestones n
                                          where not n.special and coalesce(p_claimed[n.idx + 1], 0) > 0) then 1 else 0 end
    when m.once then 1
    else 1 + (p_points - m.points) / (select max(points) from public.fco_ctp_milestones where not special) end
$$;

-- Như 202611220001, 'ctp' thêm mốc đã nhận, thẻ, huy hiệu, đã chơi trả phí.
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
      'cards', jsonb_build_object('chance', w.ctp_card_chance, 'luck', w.ctp_card_luck), 'badges', w.ctp_badges),
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
  return jsonb_build_object('open', public.fco_ctp_open(), 'rules', public.fco_ctp_rules(),
    'round', (select max(points) from public.fco_ctp_milestones where not special),
    'milestones', (select coalesce(jsonb_agg(jsonb_build_object('idx', idx, 'points', points, 'options', options, 'once', once, 'paidOnly', paid_only, 'special', special) order by idx), '[]')
                   from public.fco_ctp_milestones));
end;
$$;

-- Nhận quà mốc: p_choices = lựa chọn từng lượt (1..100 lượt, mỗi phần tử 0.. theo options). Một lượt thường = mảng 1 phần tử.
create or replace function public.fco_ctp_claim(p_index integer, p_choices integer[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; m public.fco_ctp_milestones;
  reached integer; done integer; n integer := coalesce(array_length(p_choices, 1), 0); opts integer; c integer;
  raw jsonb := '[]'; rewards jsonb; claimed integer[]; granted jsonb; chance integer; luck integer; badges integer; extra text;
begin
  if not public.fco_ctp_open() then raise exception 'FCO_EVENT_CLOSED' using errcode = 'P0001'; end if;
  if n < 1 or n > 100 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  select * into m from public.fco_ctp_milestones where idx = p_index;
  if not found then raise exception 'FCO_MILESTONE_UNKNOWN' using errcode = '22023'; end if;
  if m.paid_only and not public.fco_ctp_paid(uid) then raise exception 'FCO_MILESTONE_PAID_ONLY' using errcode = 'P0001'; end if;
  reached := public.fco_ctp_reached(m, w.ctp_points, w.ctp_claimed);
  done := coalesce(w.ctp_claimed[p_index + 1], 0);
  if reached = 0 then raise exception 'FCO_MILESTONE_LOCKED' using errcode = 'P0001'; end if;
  if done + n > reached then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  opts := jsonb_array_length(m.options);
  foreach c in array p_choices loop
    if c is null or c < 0 or c >= opts then raise exception 'FCO_MILESTONE_CHOICE' using errcode = '22023'; end if;
    raw := raw || (m.options -> c);
  end loop;
  -- Gộp quà cùng loại (gói cùng id, BP, phiếu cùng %, thẻ cùng loại, huy hiệu).
  rewards := coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('pack', r->>'pack', 'count', sum(coalesce((r->>'count')::bigint, 1))) x from jsonb_array_elements(raw) r where r ? 'pack' group by r->>'pack'
      union all select jsonb_build_object('bp', sum((r->>'bp')::bigint)) from jsonb_array_elements(raw) r where r ? 'bp' having count(*) > 0
      union all select jsonb_build_object('voucher', (r->>'voucher')::integer, 'count', sum(coalesce((r->>'count')::bigint, 1))) from jsonb_array_elements(raw) r where r ? 'voucher' group by (r->>'voucher')::integer
      union all select jsonb_build_object('ctpCard', r->>'ctpCard', 'count', sum(coalesce((r->>'count')::bigint, 1))) from jsonb_array_elements(raw) r where r ? 'ctpCard' group by r->>'ctpCard'
      union all select jsonb_build_object('ctpBadge', sum((r->>'ctpBadge')::bigint)) from jsonb_array_elements(raw) r where r ? 'ctpBadge' having count(*) > 0) t), '[]');
  claimed := array(select case when i = p_index + 1 then done + n else coalesce(w.ctp_claimed[i], 0) end
                   from generate_series(1, greatest(coalesce(array_upper(w.ctp_claimed, 1), 0), p_index + 1)) i order by i);
  select coalesce(sum((r->>'count')::integer) filter (where r->>'ctpCard' = 'chance'), 0), coalesce(sum((r->>'count')::integer) filter (where r->>'ctpCard' = 'luck'), 0),
         coalesce(sum((r->>'ctpBadge')::integer), 0)
    into chance, luck, badges from jsonb_array_elements(rewards) r;
  update public.fco_wallets set ctp_claimed = claimed, ctp_card_chance = ctp_card_chance + chance, ctp_card_luck = ctp_card_luck + luck, ctp_badges = ctp_badges + badges
    where user_id = uid;
  extra := concat_ws(', ',
    (select string_agg('Phiếu giảm giá thuế các mùa ' || (r->>'voucher') || '%' || case when (r->>'count')::integer > 1 then ' x ' || (r->>'count') else '' end, ', ')
       from jsonb_array_elements(rewards) r where r ? 'voucher'),
    case when chance > 0 then 'Thẻ Cơ Hội' || case when chance > 1 then ' x ' || chance else '' end end,
    case when luck > 0 then 'Thẻ Khí Vận' || case when luck > 1 then ' x ' || luck else '' end end,
    case when badges > 0 then 'Huy Hiệu Tuyển Chọn' || case when badges > 1 then ' x ' || badges else '' end end);
  granted := public.fco_inv_grant(uid, (select coalesce(jsonb_agg(r), '[]') from jsonb_array_elements(rewards) r where r ? 'pack' or r ? 'bp' or r ? 'voucher'), 'event',
    'Cờ tỷ phú · Quà mốc ' || public.fco_inv_money(m.points) || ' điểm' || case when n > 1 then ' × ' || n else '' end,
    concat_ws(', ', nullif(public.fco_inv_reward_text(rewards), ''), nullif(extra, '')));
  return jsonb_build_object('rewards', rewards, 'count', n, 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

-- Như 202611220001, reset thêm mốc đã nhận / thẻ / huy hiệu Cờ tỷ phú.
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
  insert into public.fco_fc_ledger(user_id, delta, balance, reason, detail, actor)
  values (p_user, remaining - w.fc, remaining, 'reset', jsonb_build_object('resetFc', p_reset_fc), admin_id);
  return jsonb_build_object('reset', true, 'fc', remaining);
end;
$$;

-- Như 202611180010, nhận thêm phiếu giảm thuế 35 % / 40 % (quà mốc đặc biệt Cờ tỷ phú).
create or replace function public.fco_mkt_sell(p_catalog text, p_items jsonb, p_voucher integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); rules jsonb := public.fco_inv_check(p_catalog); d jsonb; mr jsonb := public.fco_mkt_rules();
  item jsonb; card jsonb; asked bigint; band integer := (rules->>'sellBand')::integer; tax double precision;
  uids text[] := '{}'; n integer; placed integer := 0; matched integer := 0; took integer := 0; o public.fco_mkt_orders; b public.fco_mkt_orders; applied jsonb;
begin
  perform public.fco_mkt_settle();
  d := public.fco_inv_lock(uid);
  tax := public.fco_inv_tax(uid, rules);
  if p_voucher is not null then
    if p_voucher not in (10, 20, 30, 35, 40) then raise exception 'FCO_BAD_VOUCHER' using errcode = '22023'; end if;
    if public.fco_inv_voucher(d, p_voucher) < 1 then raise exception 'FCO_NO_VOUCHER' using errcode = 'P0001'; end if;
    if public.fco_account_tier(uid) in ('premium', 'luxury') then
      if greatest(0, (rules->>'marketFee')::double precision - p_voucher) >= tax then raise exception 'FCO_VOUCHER_USELESS' using errcode = 'P0001'; end if;
      tax := greatest(0, (rules->>'marketFee')::double precision - p_voucher);
    else
      tax := greatest(0, tax - p_voucher);
    end if;
    d := public.fco_inv_set_voucher(d, p_voucher, public.fco_inv_voucher(d, p_voucher) - 1);
  end if;
  n := case when jsonb_typeof(p_items) = 'array' then jsonb_array_length(p_items) else 0 end;
  if n < 1 or n > (rules->>'maxBulkSell')::integer then raise exception 'FCO_BAD_SELL' using errcode = '22023'; end if;
  if (select count(*) from public.fco_mkt_orders where user_id = uid and side = 'sell' and status = 'open') + n > (mr->>'maxOpenSell')::integer then
    raise exception 'FCO_TOO_MANY_ORDERS' using errcode = 'P0001';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'uid' = any(uids) then raise exception 'FCO_BAD_SELL' using errcode = '22023'; end if;
    uids := uids || (item->>'uid');
    card := public.fco_inv_card(d, item->>'uid');
    if card is null then raise exception 'FCO_CARD_MISSING' using errcode = 'P0001'; end if;
    if public.fco_inv_locked(d, item->>'uid') then raise exception 'FCO_CARD_LOCKED' using errcode = 'P0001'; end if;
    if public.fco_trade_locked((card->>'playerId')::integer) then raise exception 'FCO_TRADE_LOCKED' using errcode = 'P0001'; end if;
    if jsonb_typeof(item->'price') <> 'number' or (item->>'price')::numeric <> floor((item->>'price')::numeric) then raise exception 'FCO_BAD_PRICE' using errcode = 'P0001'; end if;
    asked := (item->>'price')::bigint;
    perform public.fco_mkt_check_price((card->>'playerId')::integer, (card->>'level')::integer, asked, band);
    insert into public.fco_mkt_orders (user_id, side, player_id, level, price, tax, card)
      values (uid, 'sell', (card->>'playerId')::integer, (card->>'level')::integer, asked, tax, card) returning * into o;
    placed := placed + 1;
    select * into b from public.fco_mkt_orders where status = 'open' and side = 'buy' and player_id = o.player_id and level = o.level
      and price >= asked and user_id <> uid order by price desc, created_at limit 1 for update skip locked;
    if found then perform public.fco_mkt_fill(o, b, b.price); matched := matched + 1;
    else perform public.fco_mkt_system_take(o); took := took + 1; end if;
  end loop;
  d := d || jsonb_build_object('cards', (select coalesce(jsonb_agg(c order by ord), '[]') from jsonb_array_elements(d->'cards') with ordinality x(c, ord) where not (c->>'uid' = any(uids))));
  d := public.fco_inv_history(d, 'market', 'Bán · ' || case when n = 1 then public.fco_mkt_label((card->>'playerId')::integer, (card->>'level')::integer) else n || ' cầu thủ' end,
    'Thuế ' || public.fco_inv_num(tax) || '%' || case when p_voucher is not null then ' (phiếu −' || p_voucher || '%)' else '' end
      || case when matched > 0 then ' · Khớp ' || matched || ' thẻ với lệnh mua của người chơi' else '' end
      || case when took > 0 then ' · Hệ thống mua ngay ' || took || ' thẻ đúng giá bán' else '' end || ' · BP chờ nhận ở Lịch sử chuyển nhượng');
  applied := public.fco_mkt_apply(uid, d);
  return jsonb_build_object('placed', placed, 'matched', matched, 'system', took, 'tax', tax, 'texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'));
end;
$$;

revoke all on function public.fco_ctp_paid(uuid), public.fco_ctp_reached(public.fco_ctp_milestones, integer, integer[]) from public, anon, authenticated;
revoke all on function public.fco_ctp_claim(integer, integer[]) from public, anon;
grant execute on function public.fco_ctp_claim(integer, integer[]) to authenticated;

commit;
