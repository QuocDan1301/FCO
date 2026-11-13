begin;

-- Vòng Quanh Thế Giới (2026-11-13, người dùng): Mini Jackpot (BP ô 10) tăng theo Jackpot FC — cứ 1.000 FC Jackpot thì Mini Jackpot 5B BP
-- (bpPerJackpotFc = 5.000.000 BP mỗi FC); Jackpot nổ thì Mini Jackpot nổ theo. Bỏ quỹ BP riêng (fco_vqtg_state.bp_pool không dùng nữa).
--   ô 10: 6 % trúng Mini Jackpot = quỹ FC hiện tại × 5.000.000 BP (quỹ FC giữ nguyên);
--   ô 14 trúng Giải Đặc Biệt: nhận cả quỹ FC + Mini Jackpot BP, cả hai về mức thấp (2.000 FC → 10B BP); bot trúng thì cả hai cũng về mức thấp.
-- Chỉ định nghĩa lại hàm (như 202611130010 / 0008) nên chạy lại được.

create or replace function public.fco_vqtg_rules() returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'prices', '[{"count":1,"price":18},{"count":10,"price":190},{"count":50,"price":900}]'::jsonb,
    'bpPerJackpotFc', 5000000, -- Mini Jackpot (ô 10) = quỹ Jackpot FC × 5.000.000 BP (1.000 FC → 5B BP)
    'bpChance', 0.06,         -- dừng ô 10 (Mini Jackpot = quỹ BP): 6 % trúng cả quỹ
    'rollTickets', '[1,2,2,2,3,6]'::jsonb)  -- vé theo số lắc 1..6 (vé in cạnh số trên vòng quay)
$$;

create or replace function public.fco_vqtg_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  return jsonb_build_object(
    'tiles', (select jsonb_agg(jsonb_build_object('idx', idx, 'kind', kind, 'label', label, 'rewards', rewards) order by idx) from public.fco_vqtg_tiles),
    'prices', public.fco_vqtg_rules()->'prices',
    'bpPool', (select pot from public.fco_jackpot where id = 1) * (public.fco_vqtg_rules()->>'bpPerJackpotFc')::bigint,
    'milestones', (select jsonb_agg(jsonb_build_object('idx', idx, 'tickets', tickets, 'options', options, 'once', once, 'paidOnly', paid_only) order by idx) from public.fco_vqtg_milestones),
    'round', (select max(tickets) from public.fco_vqtg_milestones),
    'rollTickets', public.fco_vqtg_rules()->'rollTickets');
end;
$$;

-- Như 202611130010, Mini Jackpot tính theo quỹ Jackpot FC.
create or replace function public.fco_vqtg_play(p_count integer, p_mode text, p_pick integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot; rules jsonb := public.fco_vqtg_rules();
  t_kind text; t_rewards jsonb; t_weights integer[];
  price integer; share bigint; pos integer; roll integer; dest integer; reward jsonb; extra jsonb; amount bigint; jp_kind text;
  picks integer; got_pick integer := 0; got_tickets integer := 0; t_gain integer; plays jsonb := '[]'; grants jsonb := '[]'; fc_won bigint := 0; granted jsonb;
  r double precision; special_chance double precision; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
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
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    roll := coalesce(p_pick, 1 + floor(random() * 6)::integer);
    dest := (pos + roll - 1) % 16 + 1;
    t_gain := (rules->'rollTickets'->>(roll - 1))::integer;
    got_tickets := got_tickets + t_gain;
    select kind, rewards, weights into t_kind, t_rewards, t_weights from public.fco_vqtg_tiles where idx = dest;
    reward := null; extra := '{}';
    if t_kind = 'pick' then
      picks := picks + 1; got_pick := got_pick + 1; extra := '{"pick": 1}';
    elsif t_kind = 'bp' then
      -- Mini Jackpot: BP theo quỹ Jackpot FC hiện tại; trúng ở ô 10 không làm quỹ FC giảm.
      if random() < (rules->>'bpChance')::double precision then
        reward := jsonb_build_object('bp', j.pot * (rules->>'bpPerJackpotFc')::bigint); extra := '{"pool": true}';
      else reward := public.fco_vqtg_tile_reward(t_rewards, t_weights); end if;
    elsif t_kind = 'jackpot' then
      -- Như Bi Lắc: từ 10.000 FC cơ hội Giải Đặc Biệt tăng theo áp lực quỹ (×16 vì ô này được dừng ~1/16 số lượt).
      special_chance := case when j.pot >= 10000 then least(.04, .0032 * public.fco_jackpot_pressure(j.pot)) else 0 end;
      r := random();
      -- Ô 14 chỉ có Giải Đặc Biệt (cả quỹ FC), không có Giải Phụ: mini jackpot của sự kiện này là quỹ BP ở ô 10.
      jp_kind := case when r < special_chance then 'special' end;
      -- Jackpot nổ thì Mini Jackpot nổ theo: người trúng nhận cả quỹ FC lẫn Mini Jackpot BP, cả hai về mức thấp.
      if jp_kind = 'special' then
        amount := j.pot; j.pot := 2000;
        grants := grants || jsonb_build_array(jsonb_build_object('bp', amount * (rules->>'bpPerJackpotFc')::bigint));
        extra := jsonb_build_object('miniBp', amount * (rules->>'bpPerJackpotFc')::bigint);
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
    plays := plays || (jsonb_build_object('roll', roll, 'from', pos, 'to', dest, 'kind', t_kind, 'reward', reward, 'tickets', t_gain) || extra);
    pos := dest;
  end loop;
  update public.fco_jackpot set pot = j.pot, feed = j.feed where id = 1;
  update public.fco_wallets set vqtg_pos = pos, vqtg_picks = picks, vqtg_tickets = vqtg_tickets + got_tickets where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'vqtg_win', jsonb_build_object('count', p_count)); end if;
  granted := public.fco_inv_grant(uid, grants, 'event',
    'Vòng Quanh Thế Giới · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end || case when p_pick is not null then ' · chỉ định ' || p_pick else '' end,
    coalesce(nullif(public.fco_inv_reward_text(grants), ''), 'Không có quà') || ' · +' || got_tickets || ' vé' || case when got_pick > 0 then ' · +' || got_pick || ' Chỉ định' else '' end
      || case when price > 0 then ' · −' || public.fco_inv_money(price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', price, 'picks', picks, 'pos', pos, 'tickets', w.vqtg_tickets + got_tickets, 'bpPool', j.pot * (rules->>'bpPerJackpotFc')::bigint,
    'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

commit;
