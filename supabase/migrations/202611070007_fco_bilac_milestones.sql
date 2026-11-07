begin;

-- Quà mốc Bi Lắc chính thức theo file quamocbilac.xlsx của người dùng (2026-11-07), thay quà mốc tạm của 202611070005.
-- Giống quà tích lũy Nâng Cấp Siêu Sao: mốc có 1 lựa chọn thì nhận luôn, mốc có nhiều lựa chọn thì chọn 1. Mỗi vòng = điểm của
-- mốc cuối (1.250): mỗi mốc được nhận thêm 1 lần mỗi vòng, trừ mốc once (mốc 1 điểm, chỉ nhận 1 lần).
-- 25VB → VIETNAM, 24HR → 25HR theo lựa chọn của người dùng. Gói blm-* là gói sự kiện mới trong src/packs.json.
-- bilac_claimed đổi nghĩa: phần tử thứ i (từ 1) = số lần đã nhận mốc i - 1.

alter table public.fco_bilac_milestones
  add column if not exists options jsonb check (options is null or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) > 0)),
  add column if not exists once boolean not null default false;
delete from public.fco_bilac_milestones;
insert into public.fco_bilac_milestones(idx, points, rewards, options, once) values
  (0, 1, '[{"pack":"blm-1-1","count":1}]', '[[{"pack":"blm-1-1","count":1}]]', true),
  (1, 10, '[{"pack":"blm-10-1","count":1},{"bp":800000}]', '[[{"pack":"blm-10-1","count":1},{"bp":800000}]]', false),
  (2, 25, '[{"pack":"blm-25-1","count":1},{"bp":2000000}]', '[[{"pack":"blm-25-1","count":1},{"bp":2000000}]]', false),
  (3, 35, '[{"pack":"blm-35-1","count":1},{"bp":3000000}]', '[[{"pack":"blm-35-1","count":1},{"bp":3000000}]]', false),
  (4, 50, '[{"pack":"blm-50-1","count":1},{"bp":4000000}]', '[[{"pack":"blm-50-1","count":1},{"bp":4000000}]]', false),
  (5, 70, '[{"pack":"event-4-top150","count":1},{"bp":5000000}]', '[[{"pack":"event-4-top150","count":1},{"bp":5000000}],[{"pack":"blm-70-2","count":1},{"bp":5000000}],[{"pack":"blm-70-3","count":1},{"bp":5000000}]]', false),
  (6, 100, '[{"pack":"blm-100-1","count":1},{"bp":6000000}]', '[[{"pack":"blm-100-1","count":1},{"bp":6000000}],[{"pack":"blm-100-2","count":1},{"bp":6000000}],[{"pack":"blm-100-3","count":1},{"bp":6000000}]]', false),
  (7, 125, '[{"pack":"blm-125-1","count":1},{"bp":8000000}]', '[[{"pack":"blm-125-1","count":1},{"bp":8000000}],[{"pack":"blm-125-2","count":1},{"bp":8000000}],[{"pack":"blm-125-3","count":1},{"bp":8000000}]]', false),
  (8, 150, '[{"pack":"ms-600-3","count":1},{"bp":10000000}]', '[[{"pack":"ms-600-3","count":1},{"bp":10000000}],[{"pack":"blm-150-2","count":1},{"bp":10000000}],[{"pack":"ms-400-1","count":1},{"bp":10000000}]]', false),
  (9, 200, '[{"pack":"blm-200-1","count":1},{"bp":12000000}]', '[[{"pack":"blm-200-1","count":1},{"bp":12000000}],[{"pack":"blm-200-2","count":1},{"bp":12000000}],[{"pack":"ms-750-3","count":1},{"bp":12000000}]]', false),
  (10, 250, '[{"pack":"ms-850-2","count":1},{"bp":14000000}]', '[[{"pack":"ms-850-2","count":1},{"bp":14000000}],[{"pack":"blm-250-2","count":1},{"bp":14000000}],[{"pack":"blm-250-3","count":1},{"bp":14000000}]]', false),
  (11, 300, '[{"pack":"ms-1000-1","count":1},{"bp":16000000}]', '[[{"pack":"ms-1000-1","count":1},{"bp":16000000}],[{"pack":"blm-300-2","count":1},{"bp":16000000}],[{"pack":"ms-1000-3","count":1},{"bp":16000000}]]', false),
  (12, 350, '[{"pack":"ms-1200-3","count":1},{"bp":20000000}]', '[[{"pack":"ms-1200-3","count":1},{"bp":20000000}],[{"pack":"blm-350-2","count":1},{"bp":20000000}],[{"pack":"blm-350-3","count":1},{"bp":20000000}]]', false),
  (13, 400, '[{"pack":"blm-400-1","count":1},{"bp":30000000}]', '[[{"pack":"blm-400-1","count":1},{"bp":30000000}],[{"pack":"blm-400-2","count":1},{"bp":30000000}],[{"pack":"bl-tp-60","count":1},{"bp":30000000}]]', false),
  (14, 500, '[{"pack":"bl-110-lwbb","count":1},{"bp":40000000}]', '[[{"pack":"bl-110-lwbb","count":1},{"bp":40000000}],[{"pack":"blm-500-2","count":1},{"bp":40000000}],[{"pack":"blm-500-3","count":1},{"bp":40000000}]]', false),
  (15, 600, '[{"pack":"blm-600-1","count":1},{"bp":50000000}]', '[[{"pack":"blm-600-1","count":1},{"bp":50000000}],[{"pack":"blm-600-2","count":1},{"bp":50000000}],[{"pack":"blm-600-3","count":1},{"bp":50000000}]]', false),
  (16, 700, '[{"pack":"blm-700-1","count":1},{"bp":70000000}]', '[[{"pack":"blm-700-1","count":1},{"bp":70000000}],[{"pack":"blm-700-2","count":1},{"bp":70000000}],[{"pack":"blm-700-3","count":1},{"bp":70000000}]]', false),
  (17, 800, '[{"pack":"blm-800-1","count":1},{"bp":90000000}]', '[[{"pack":"blm-800-1","count":1},{"bp":90000000}],[{"pack":"blm-800-2","count":1},{"bp":90000000}],[{"pack":"bl-111-lwbb","count":1},{"bp":90000000}]]', false),
  (18, 900, '[{"pack":"blm-900-1","count":1},{"bp":110000000}]', '[[{"pack":"blm-900-1","count":1},{"bp":110000000}],[{"pack":"blm-900-2","count":1},{"bp":110000000}],[{"pack":"blm-900-3","count":1},{"bp":110000000}]]', false),
  (19, 950, '[{"pack":"blm-950-1","count":1},{"bp":130000000}]', '[[{"pack":"blm-950-1","count":1},{"bp":130000000}],[{"pack":"bl-up26-50","count":1},{"bp":130000000}],[{"pack":"blm-950-3","count":1},{"bp":130000000}]]', false),
  (20, 1050, '[{"pack":"blm-1050-1","count":1},{"bp":140000000}]', '[[{"pack":"blm-1050-1","count":1},{"bp":140000000}],[{"pack":"blm-1050-2","count":1},{"bp":140000000}],[{"pack":"blm-1050-3","count":1},{"bp":140000000}]]', false),
  (21, 1150, '[{"pack":"blm-1150-1","count":1},{"bp":160000000}]', '[[{"pack":"blm-1150-1","count":1},{"bp":160000000}],[{"pack":"blm-1150-2","count":1},{"bp":160000000}],[{"pack":"blm-1150-3","count":1},{"bp":160000000}]]', false),
  (22, 1250, '[{"pack":"blm-1250-1","count":1},{"bp":180000000}]', '[[{"pack":"blm-1250-1","count":1},{"bp":180000000}],[{"pack":"blm-1250-2","count":1},{"bp":180000000}],[{"pack":"blm-1250-3","count":1},{"bp":180000000}],[{"pack":"blm-1250-4","count":1},{"bp":180000000}]]', false);
update public.fco_wallets set bilac_claimed = '{}';

create or replace function public.fco_bilac_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  return jsonb_build_object(
    'symbols', (select jsonb_agg(jsonb_build_object('id', id, 'label', label) order by sort) from public.fco_bilac_symbols),
    'rows', (select jsonb_agg(jsonb_build_object('id', id, 'symbol', symbol, 'kind', kind, 'points', points, 'rewards', rewards) order by sort) from public.fco_bilac_rows),
    'milestones', (select coalesce(jsonb_agg(jsonb_build_object('points', points, 'options', coalesce(options, jsonb_build_array(rewards)), 'once', once) order by idx), '[]') from public.fco_bilac_milestones),
    'round', (select max(points) from public.fco_bilac_milestones),
    'prices', '[{"count":1,"price":20},{"count":10,"price":190},{"count":50,"price":900}]'::jsonb);
end;
$$;

drop function if exists public.fco_bilac_claim(integer);
create or replace function public.fco_bilac_claim(p_index integer, p_choice integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; m public.fco_bilac_milestones;
  opts jsonb; round_size bigint; reached bigint; done integer; rewards jsonb; fc bigint; claimed integer[];
begin
  w := public.fco_wallet_lock(uid);
  select * into m from public.fco_bilac_milestones where idx = p_index;
  if not found then raise exception 'FCO_MILESTONE_UNKNOWN' using errcode = '22023'; end if;
  select max(points) into round_size from public.fco_bilac_milestones;
  reached := case when w.bilac_points < m.points then 0 when m.once then 1 else 1 + (w.bilac_points - m.points) / round_size end;
  done := coalesce(w.bilac_claimed[p_index + 1], 0);
  if reached = 0 then raise exception 'FCO_MILESTONE_LOCKED' using errcode = 'P0001'; end if;
  if done >= reached then raise exception 'FCO_MILESTONE_CLAIMED' using errcode = 'P0001'; end if;
  opts := coalesce(m.options, jsonb_build_array(m.rewards));
  if jsonb_array_length(opts) = 1 then rewards := opts -> 0;
  elsif p_choice is null or p_choice < 0 or p_choice >= jsonb_array_length(opts) then raise exception 'FCO_MILESTONE_CHOICE' using errcode = '22023';
  else rewards := opts -> p_choice; end if;
  claimed := w.bilac_claimed;
  claimed[p_index + 1] := done + 1;
  update public.fco_wallets set bilac_claimed = claimed where user_id = uid;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(rewards) r where r ? 'fc';
  if fc > 0 then perform public.fco_apply_fc(uid, fc, 'bilac_milestone', jsonb_build_object('index', p_index)); end if;
  return jsonb_build_object('rewards', rewards, 'wallet', public.fco_wallet_json(uid));
end;
$$;
revoke all on function public.fco_bilac_claim(integer, integer) from public, anon;
grant execute on function public.fco_bilac_claim(integer, integer) to authenticated;

commit;
