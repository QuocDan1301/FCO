begin;

-- Shop Đổi Vé của Vòng Quanh Thế Giới (quà mốc theo Tài liệu/quamocvqtg.xlsx, 2026-11-13).
-- Vé tích lũy, không bị trừ (người dùng chọn): đủ vé của mốc là nhận. Mỗi vòng = số vé của mốc cuối (1.900): mỗi mốc được nhận thêm
-- 1 lần mỗi vòng, trừ mốc once. Mốc có 1 lựa chọn nhận luôn, mốc có nhiều lựa chọn thì chọn 1 (p_choice) — giống quà mốc Bi Lắc.
-- Mốc 1 vé: once + paid_only = "chỉ nhận bằng lượt quay trả phí" → phải từng chơi trả FC (sổ FC có lý do 'vqtg').
-- Bỏ 3 món game chưa có (người dùng chọn): ICON TM Coin x5 (mốc 500), Gói HLV kỹ năng khéo léo (mốc 100), TC x10000 (mốc 1.900).
-- Gói vqm-* là gói mốc mới (src/packs.json, eventOnly, luật tỷ lệ gói mốc như blm-*); các gói trùng thì dùng lại gói đã có.
-- vqtg_claimed: phần tử thứ i (từ 1) = số lần đã nhận mốc i - 1; luôn ghi mảng bắt đầu từ 1 (bài học 202611100003).

create table public.fco_vqtg_milestones (
  idx smallint primary key check (idx >= 0),
  tickets integer not null check (tickets > 0),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) > 0),
  once boolean not null default false,
  paid_only boolean not null default false
);
alter table public.fco_vqtg_milestones enable row level security;
revoke all on public.fco_vqtg_milestones from anon, authenticated;

alter table public.fco_wallets add column vqtg_claimed integer[] not null default '{}';

insert into public.fco_vqtg_milestones (idx, tickets, options, once, paid_only) values
  (0, 1, '[[{"pack":"blm-1-1","count":1},{"voucher":30,"count":1}]]', true, true),
  (1, 10, '[[{"pack":"vqm-10-1","count":1},{"bp":800000}]]', false, false),
  (2, 20, '[[{"pack":"ms-100-2","count":1},{"bp":2000000}]]', false, false),
  (3, 30, '[[{"pack":"vqm-30-1","count":1},{"bp":3000000}]]', false, false),
  (4, 50, '[[{"pack":"vqm-50-1","count":1},{"bp":4000000}]]', false, false),
  (5, 70, '[[{"pack":"vqm-70-1","count":1},{"bp":5000000}],[{"pack":"vqm-70-2","count":1},{"bp":5000000}],[{"pack":"vqm-70-3","count":1},{"bp":5000000}]]', false, false),
  (6, 100, '[[{"pack":"vqm-100-1","count":1},{"bp":6000000}],[{"pack":"vqm-100-2","count":1},{"bp":6000000}],[{"pack":"vqm-100-3","count":1},{"bp":6000000}]]', false, false),
  (7, 150, '[[{"pack":"vqm-150-1","count":1},{"bp":8000000}],[{"pack":"event-7-le","count":1},{"bp":8000000}],[{"pack":"vqm-150-3","count":1},{"bp":8000000}]]', false, false),
  (8, 200, '[[{"pack":"vqm-200-1","count":1},{"bp":10000000}],[{"pack":"vqm-200-2","count":1},{"bp":10000000}],[{"pack":"vqm-200-3","count":1},{"bp":10000000}]]', false, false),
  (9, 300, '[[{"pack":"vqm-300-1","count":1},{"bp":12000000}],[{"pack":"vqm-300-2","count":1},{"bp":12000000}],[{"pack":"vqm-300-3","count":1},{"bp":12000000}]]', false, false),
  (10, 400, '[[{"pack":"ms-850-2","count":1},{"bp":14000000}],[{"pack":"vqm-400-2","count":1},{"bp":14000000}],[{"pack":"vqm-400-3","count":1},{"bp":14000000}]]', false, false),
  (11, 500, '[[{"pack":"blm-350-2","count":1},{"bp":16000000}],[{"pack":"vqm-500-2","count":1},{"bp":16000000}],[{"pack":"vqm-500-3","count":1},{"bp":16000000}]]', false, false),
  (12, 600, '[[{"pack":"blm-250-2","count":1},{"bp":20000000}],[{"pack":"event-3-112","count":1},{"bp":20000000}],[{"pack":"vqm-600-3","count":1},{"bp":20000000}]]', false, false),
  (13, 700, '[[{"pack":"vqm-700-1","count":1},{"bp":30000000}],[{"pack":"vqm-700-2","count":1},{"bp":30000000}],[{"pack":"blm-600-2","count":1},{"bp":30000000}]]', false, false),
  (14, 800, '[[{"pack":"vqm-800-1","count":1},{"bp":40000000}],[{"pack":"vqm-800-2","count":1},{"bp":40000000}],[{"pack":"vqm-800-3","count":1},{"bp":40000000}]]', false, false),
  (15, 950, '[[{"pack":"vqm-950-1","count":1},{"bp":50000000}],[{"pack":"event-4-112","count":1},{"bp":50000000}],[{"pack":"ms-1100-3","count":1},{"bp":50000000}]]', false, false),
  (16, 1100, '[[{"pack":"vqm-1100-1","count":1},{"bp":70000000}],[{"pack":"vqm-1100-2","count":1},{"bp":70000000}],[{"pack":"vqm-1100-3","count":1},{"bp":70000000}]]', false, false),
  (17, 1250, '[[{"pack":"vqm-1250-1","count":1},{"bp":90000000}],[{"pack":"blm-1150-3","count":1},{"bp":90000000}],[{"pack":"vqm-1250-3","count":1},{"bp":90000000}]]', false, false),
  (18, 1400, '[[{"pack":"vqm-1400-1","count":1},{"bp":110000000}],[{"pack":"vqm-1400-2","count":1},{"bp":110000000}],[{"pack":"vqm-1400-3","count":1},{"bp":110000000}]]', false, false),
  (19, 1500, '[[{"pack":"vqm-1500-1","count":1},{"bp":130000000}],[{"pack":"bl-up26-50","count":1},{"bp":130000000}],[{"pack":"vqm-1500-3","count":1},{"bp":130000000}]]', false, false),
  (20, 1600, '[[{"pack":"vqm-1600-1","count":1},{"bp":140000000}],[{"pack":"vqm-1600-2","count":1},{"bp":140000000}],[{"pack":"blm-1250-2","count":1},{"bp":140000000}]]', false, false),
  (21, 1750, '[[{"pack":"vqm-1750-1","count":1},{"bp":160000000}],[{"pack":"vqm-1750-2","count":1},{"bp":160000000}],[{"pack":"vqm-1750-3","count":1},{"bp":160000000}]]', false, false),
  (22, 1900, '[[{"pack":"blm-1250-1","count":1},{"bp":180000000}],[{"pack":"vqm-1900-2","count":1},{"bp":180000000}],[{"pack":"vqm-1900-3","count":1},{"voucher":30,"count":1},{"bp":180000000}],[{"pack":"vqm-1900-4","count":1},{"bp":180000000}]]', false, false);

-- Như 202611130004, thêm 'claimed' (số lần đã nhận từng mốc) và 'paid' (đã từng chơi trả phí) vào 'vqtg'.
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
      'claimed', to_jsonb(w.vqtg_claimed), 'paid', exists (select 1 from public.fco_fc_ledger l where l.user_id = w.user_id and l.reason = 'vqtg')),
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

-- Như 202611130004, thêm danh sách mốc và cỡ vòng.
create or replace function public.fco_vqtg_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  return jsonb_build_object(
    'tiles', (select jsonb_agg(jsonb_build_object('idx', idx, 'kind', kind, 'label', label, 'rewards', rewards) order by idx) from public.fco_vqtg_tiles),
    'prices', public.fco_vqtg_rules()->'prices',
    'bpPool', (select bp_pool from public.fco_vqtg_state where id = 1),
    'milestones', (select jsonb_agg(jsonb_build_object('idx', idx, 'tickets', tickets, 'options', options, 'once', once, 'paidOnly', paid_only) order by idx) from public.fco_vqtg_milestones),
    'round', (select max(tickets) from public.fco_vqtg_milestones));
end;
$$;

-- Nhận quà mốc p_index (p_choice = lựa chọn 0.. khi mốc có nhiều lựa chọn). Không trừ vé.
create function public.fco_vqtg_claim(p_index integer, p_choice integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; m public.fco_vqtg_milestones;
  round_size bigint; reached bigint; done integer; rewards jsonb; fc bigint; claimed integer[]; granted jsonb;
begin
  w := public.fco_wallet_lock(uid);
  select * into m from public.fco_vqtg_milestones where idx = p_index;
  if not found then raise exception 'FCO_MILESTONE_UNKNOWN' using errcode = '22023'; end if;
  if m.paid_only and not exists (select 1 from public.fco_fc_ledger l where l.user_id = uid and l.reason = 'vqtg') then
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
revoke all on function public.fco_vqtg_claim(integer, integer) from public, anon;
grant execute on function public.fco_vqtg_claim(integer, integer) to authenticated;

commit;
