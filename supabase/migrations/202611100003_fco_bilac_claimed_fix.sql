-- Bi Lắc: sửa lỗi mốc đã nhận vẫn hiện "Bấm để nhận" (2026-11-10, sau 202611070007).
-- Nguyên nhân: fco_bilac_claim gán claimed[p_index + 1] vào mảng rỗng / ngắn hơn. Postgres không đệm từ vị trí 1 mà dời
-- chỉ số đầu mảng (vd. nhận mốc 5 đầu tiên → '[6:6]={1}'), còn to_jsonb bỏ chỉ số đầu → game nhận [1] và hiểu là mốc 0
-- đã nhận, mốc 5 vẫn nhận được (máy chủ thì vẫn đọc đúng nên bấm vào báo đã nhận).
-- Sửa: luôn ghi mảng bắt đầu từ 1, ô chưa nhận = 0; chuẩn hoá lại dữ liệu ví đang lệch (giữ đúng số lần đã nhận từng mốc).
begin;

update public.fco_wallets
  set bilac_claimed = array(select coalesce(bilac_claimed[i], 0) from generate_series(1, coalesce(array_upper(bilac_claimed, 1), 0)) i order by i)
  where array_lower(bilac_claimed, 1) <> 1 or array_position(bilac_claimed, null) is not null;

-- Như 202611070007, chỉ đổi cách ghi mảng claimed.
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
  -- Mảng luôn bắt đầu từ 1 (phần tử i = số lần đã nhận mốc i - 1), đệm 0 tới mốc vừa nhận.
  claimed := array(select case when i = p_index + 1 then done + 1 else coalesce(w.bilac_claimed[i], 0) end
                   from generate_series(1, greatest(coalesce(array_upper(w.bilac_claimed, 1), 0), p_index + 1)) i order by i);
  update public.fco_wallets set bilac_claimed = claimed where user_id = uid;
  select coalesce(sum((r->>'fc')::bigint), 0) into fc from jsonb_array_elements(rewards) r where r ? 'fc';
  if fc > 0 then perform public.fco_apply_fc(uid, fc, 'bilac_milestone', jsonb_build_object('index', p_index)); end if;
  return jsonb_build_object('rewards', rewards, 'wallet', public.fco_wallet_json(uid));
end;
$$;
revoke all on function public.fco_bilac_claim(integer, integer) from public, anon;
grant execute on function public.fco_bilac_claim(integer, integer) to authenticated;

commit;
