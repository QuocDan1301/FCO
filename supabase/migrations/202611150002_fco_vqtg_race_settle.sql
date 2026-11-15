begin;

-- Đua top Vòng Quanh Thế Giới: máy chủ tự chốt bảng và trao quà (2026-11-15). Chạy SAU 202611150001_fco_vqtg_jackpot_fair.sql. Chạy lại được.
-- Lỗi cũ: Đua top chỉ có đồng hồ phía game (0h 20/11 giờ VN); máy chủ không chốt — hết giờ vé vẫn tăng, bảng vẫn đổi, quà Top 1–5
-- phải admin tự gửi tay, và tài khoản đã khoá vẫn được xếp hạng.
--   · fco_vqtg_race (1 dòng): giờ kết thúc, lúc chốt, danh sách người thắng.
--   · fco_vqtg_race_tick(): lần gọi đầu tiên sau giờ kết thúc chốt Top 5 (bỏ tài khoản đang khoá), gửi quà hạng (fco_vqtg_top_rewards)
--     vào "Quà từ Admin" (fco_admin_gifts, game tự nhận) và đăng tin LIVE. Chỉ chốt một lần. Trước giờ kết thúc chỉ đọc 1 dòng, không khóa.
--   · fco_vqtg_play gọi tick trước khi cộng vé → vé quay sau giờ kết thúc không được tính.
--   · fco_vqtg_top: đã chốt thì trả bảng đã chốt (ended = true); chưa chốt thì như cũ nhưng bỏ tài khoản đang khoá.
-- Muốn đổi giờ kết thúc: update public.fco_vqtg_race set ends_at = '...' where id = 1 and settled_at is null;

create table if not exists public.fco_vqtg_race (
  id integer primary key default 1 check (id = 1),
  ends_at timestamptz not null,
  settled_at timestamptz,
  winners jsonb not null default '[]'
);
alter table public.fco_vqtg_race enable row level security;
revoke all on public.fco_vqtg_race from anon, authenticated;
insert into public.fco_vqtg_race (id, ends_at) values (1, '2026-11-20 00:00+07') on conflict (id) do nothing;

create or replace function public.fco_vqtg_race_tick() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_vqtg_race; t record; who text; rw jsonb; list jsonb := '[]';
begin
  -- Đường nhanh: chưa tới giờ hoặc đã chốt thì chỉ đọc.
  if now() < coalesce((select ends_at from public.fco_vqtg_race where id = 1 and settled_at is null), 'infinity') then return; end if;
  select * into r from public.fco_vqtg_race where id = 1 for update;
  if not found or r.settled_at is not null or now() < r.ends_at then return; end if;
  for t in select w.user_id, w.vqtg_tickets, row_number() over (order by w.vqtg_tickets desc, w.vqtg_tickets_at nulls last, w.user_id)::integer as rn
           from public.fco_wallets w join auth.users u on u.id = w.user_id
           where w.vqtg_tickets > 0 and coalesce(u.banned_until, '-infinity') < now()
           order by w.vqtg_tickets desc, w.vqtg_tickets_at nulls last, w.user_id limit 5 loop
    who := public.fco_public_name(t.user_id);
    select rewards into rw from public.fco_vqtg_top_rewards where rank = t.rn;
    if rw is not null and jsonb_array_length(rw) > 0 then
      insert into public.fco_admin_gifts(user_id, rewards, note) values (t.user_id, rw, 'Quà Top ' || t.rn || ' Đua top Vòng Quanh Thế Giới');
    end if;
    list := list || jsonb_build_object('rank', t.rn, 'uid', t.user_id, 'name', who, 'tickets', t.vqtg_tickets);
    perform public.fco_live_post(t.user_id, 'rank_prize', '🏆 Chúc mừng HLV ' || who || ' đạt Top ' || t.rn || ' Đua top Vòng Quanh Thế Giới!', null);
  end loop;
  update public.fco_vqtg_race set settled_at = now(), winners = list where id = 1;
end;
$$;
revoke all on function public.fco_vqtg_race_tick() from public, anon, authenticated;

create or replace function public.fco_vqtg_top() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); me public.fco_wallets; r public.fco_vqtg_race;
begin
  perform public.fco_vqtg_race_tick();
  select * into me from public.fco_wallets where user_id = uid;
  select * into r from public.fco_vqtg_race where id = 1;
  if r.settled_at is not null then
    return jsonb_build_object('ended', true,
      'top', coalesce((select jsonb_agg(jsonb_build_object('rank', (x->>'rank')::integer, 'name', x->>'name', 'tickets', (x->>'tickets')::bigint,
                       'mine', (x->>'uid')::uuid = uid, 'effect', public.fco_name_effect((x->>'uid')::uuid), 'club', public.fco_club_logo((x->>'uid')::uuid))
                       order by (x->>'rank')::integer) from jsonb_array_elements(r.winners) x), '[]'::jsonb),
      'me', jsonb_build_object('tickets', coalesce(me.vqtg_tickets, 0),
        'rank', (select (x->>'rank')::integer from jsonb_array_elements(r.winners) x where (x->>'uid')::uuid = uid)),
      'rewards', (select jsonb_agg(jsonb_build_object('rank', rank, 'rewards', rewards, 'note', note) order by rank) from public.fco_vqtg_top_rewards));
  end if;
  return jsonb_build_object('ended', false,
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', t.rn, 'name', public.fco_public_name(t.user_id), 'tickets', t.vqtg_tickets,
                       'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id), 'club', public.fco_club_logo(t.user_id)) order by t.rn)
                     from (select w.user_id, w.vqtg_tickets, row_number() over (order by w.vqtg_tickets desc, w.vqtg_tickets_at nulls last, w.user_id) as rn
                           from public.fco_wallets w join auth.users u on u.id = w.user_id
                           where w.vqtg_tickets > 0 and coalesce(u.banned_until, '-infinity') < now()
                           order by w.vqtg_tickets desc, w.vqtg_tickets_at nulls last, w.user_id limit 5) t), '[]'::jsonb),
    'me', jsonb_build_object(
      'tickets', coalesce(me.vqtg_tickets, 0),
      'rank', case when coalesce(me.vqtg_tickets, 0) > 0 then 1 + (select count(*) from public.fco_wallets o join auth.users u on u.id = o.user_id
              where coalesce(u.banned_until, '-infinity') < now() and (o.vqtg_tickets > me.vqtg_tickets
                 or (o.vqtg_tickets = me.vqtg_tickets and o.user_id <> me.user_id
                     and (coalesce(o.vqtg_tickets_at, 'infinity') < coalesce(me.vqtg_tickets_at, 'infinity')
                          or (o.vqtg_tickets_at is not distinct from me.vqtg_tickets_at and o.user_id < me.user_id))))) end),
    'rewards', (select jsonb_agg(jsonb_build_object('rank', rank, 'rewards', rewards, 'note', note) order by rank) from public.fco_vqtg_top_rewards));
end;
$$;
revoke all on function public.fco_vqtg_top() from public, anon;
grant execute on function public.fco_vqtg_top() to authenticated;

create or replace function public.fco_vqtg_play(p_count integer, p_mode text, p_pick integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.fco_require_user(); w public.fco_wallets; j public.fco_jackpot; rules jsonb := public.fco_vqtg_rules();
  t_kind text; t_rewards jsonb; t_weights integer[];
  price integer; share bigint; pos integer; roll integer; dest integer; reward jsonb; extra jsonb; amount bigint; jp_kind text;
  picks integer; got_pick integer := 0; got_tickets integer := 0; t_gain integer; plays jsonb := '[]'; grants jsonb := '[]'; fc_won bigint := 0; granted jsonb;
  r double precision; jp_at timestamptz; mini_at timestamptz; mini_feed jsonb; mini bigint; special_chance double precision; hit text; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  -- 202611150002: hết giờ Đua top thì chốt bảng TRƯỚC khi lượt này cộng vé.
  perform public.fco_vqtg_race_tick();
  if p_mode = 'fc' then
    select (p->>'price')::integer into price from jsonb_array_elements(rules->'prices') p where (p->>'count')::integer = p_count;
    if price is null then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  elsif p_mode = 'free' then
    if p_count is distinct from 1 then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
    price := 0;
  else raise exception 'FCO_BAD_MODE' using errcode = '22023'; end if;
  if p_pick is not null and (p_count <> 1 or p_pick not between 1 and 6) then raise exception 'FCO_BAD_PICK' using errcode = '22023'; end if;
  w := public.fco_wallet_lock(uid);
  pos := w.vqtg_pos; picks := w.vqtg_picks; jp_at := w.vqtg_jp_at; mini_at := w.vqtg_mini_at;
  if p_pick is not null then
    if picks < 1 then raise exception 'FCO_NO_PICKS' using errcode = 'P0001'; end if;
    if (select kind from public.fco_vqtg_tiles where idx = (pos + p_pick - 1) % 16 + 1) in ('bp', 'jackpot') then
      raise exception 'FCO_PICK_BLOCKED' using errcode = 'P0001';
    end if;
    picks := picks - 1;
    price := 0;   -- Lượt dùng Chỉ định miễn phí (202611130018): không trừ FC, vẫn được vé.
  end if;
  if p_mode = 'free' and p_pick is null then
    if w.vqtg_free_day is not distinct from public.fco_today() then raise exception 'FCO_NO_FREE_PLAYS' using errcode = 'P0001'; end if;
    update public.fco_wallets set vqtg_free_day = public.fco_today() where user_id = uid;
  elsif price > 0 then
    perform public.fco_apply_fc(uid, -price, 'vqtg', jsonb_build_object('count', p_count));
  end if;
  j := public.fco_jackpot_tick();
  select feed into mini_feed from public.fco_vqtg_state where id = 1 for update;
  for i in 0 .. p_count - 1 loop
    share := floor(price / p_count) + case when i < price % p_count then 1 else 0 end;
    j.pot := j.pot + share;
    roll := coalesce(p_pick, 1 + floor(random() * 6)::integer);
    dest := (pos + roll - 1) % 16 + 1;
    -- Ô 10 (Mini Jackpot) / ô 14 (Giải Đặc Biệt): quay thưởng ngay khi số lắc rơi vào ô (mỗi lượt tối đa 1 lần, tỷ lệ như cũ).
    -- Chỉ TRÚNG mới được đứng ở ô đó (202611140007); trượt, hoặc quỹ Jackpot chưa tới 10.000 FC (202611130019), thì lắc lại tới khi
    -- ra ô khác, vé tính theo số lắc cuối. Chỉ định vốn không chọn được ô 10 / 14.
    hit := null;
    if p_pick is null and dest in (10, 14) and j.pot >= 10000 then
      if dest = 10 then
        -- 202611150001: mỗi tài khoản trúng Mini Jackpot tối đa 1 lần / 24 giờ.
        if (mini_at is null or mini_at <= now() - interval '24 hours') and random() < (rules->>'bpChance')::double precision then
          hit := 'mini'; mini_at := now();
        end if;
      else
        -- 202611150001: tỷ lệ CỐ ĐỊNH 0,96 % mỗi lần dừng ô 14 (giữ mức gấp 3 của 202611140019 nhưng KHÔNG tăng theo áp lực quỹ:
        -- quỹ ≥ 15.000 FC thì mỗi lượt 18 FC lời trung bình 19–134 FC → người chơi canh quỹ cao spam lượt). Mỗi tài khoản trúng
        -- Giải Đặc Biệt tối đa 1 lần / 24 giờ.
        if (jp_at is null or jp_at <= now() - interval '24 hours') and random() < .0096 then hit := 'special'; jp_at := now(); end if;
      end if;
    end if;
    while p_pick is null and hit is null and dest in (10, 14) loop
      roll := 1 + floor(random() * 6)::integer;
      dest := (pos + roll - 1) % 16 + 1;
    end loop;
    t_gain := (rules->'rollTickets'->>(roll - 1))::integer;
    got_tickets := got_tickets + t_gain;
    select kind, rewards, weights into t_kind, t_rewards, t_weights from public.fco_vqtg_tiles where idx = dest;
    reward := null; extra := '{}';
    if t_kind = 'pick' then
      picks := picks + 1; got_pick := got_pick + 1; extra := '{"pick": 1}';
    elsif t_kind = 'bp' then
      -- Mini Jackpot: BP theo quỹ Jackpot FC hiện tại; trúng ở ô 10 không làm quỹ FC giảm.
      if hit = 'mini' then
        mini := j.pot * (rules->>'bpPerJackpotFc')::bigint;
        reward := jsonb_build_object('bp', mini); extra := '{"pool": true}';
        mini_feed := public.fco_jackpot_push(mini_feed, jsonb_build_object('name', public.fco_public_name(uid), 'uid', uid, 'amount', mini, 'time', now_ms));
      else reward := public.fco_vqtg_tile_reward(t_rewards, t_weights); end if;
    elsif t_kind = 'jackpot' then
      -- Như Bi Lắc: từ 10.000 FC cơ hội Giải Đặc Biệt tăng theo áp lực quỹ (×16 vì ô này được dừng ~1/16 số lượt).
      -- Ô 14 chỉ có Giải Đặc Biệt (cả quỹ FC), không có Giải Phụ: mini jackpot của sự kiện này là quỹ BP ở ô 10.
      -- Đã quay thưởng lúc lắc (hit); tới được đây nghĩa là đã trúng.
      jp_kind := case when hit = 'special' then 'special' end;
      -- Jackpot nổ thì Mini Jackpot nổ cùng lúc nhưng về tay HLV khác (fco_vqtg_sync_mini ghi tin sau vòng lặp); người trúng Jackpot
      -- chỉ nhận FC. Cả hai về mức thấp (Mini Jackpot tính theo quỹ FC).
      if jp_kind = 'special' then amount := j.pot; j.pot := 2000; end if;
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
  update public.fco_vqtg_state set feed = mini_feed where id = 1;
  mini_feed := public.fco_vqtg_sync_mini();
  update public.fco_wallets set vqtg_pos = pos, vqtg_picks = picks, vqtg_tickets = vqtg_tickets + got_tickets, vqtg_jp_at = jp_at, vqtg_mini_at = mini_at
    where user_id = uid;
  if fc_won > 0 then perform public.fco_apply_fc(uid, fc_won, 'vqtg_win', jsonb_build_object('count', p_count)); end if;
  granted := public.fco_inv_grant(uid, grants, 'event',
    'Vòng Quanh Thế Giới · ' || p_count || ' lượt' || case when p_mode = 'free' then ' miễn phí' else '' end || case when p_pick is not null then ' · chỉ định ' || p_pick else '' end,
    coalesce(nullif(public.fco_inv_reward_text(grants), ''), 'Không có quà') || ' · +' || got_tickets || ' vé' || case when got_pick > 0 then ' · +' || got_pick || ' Chỉ định' else '' end
      || case when price > 0 then ' · −' || public.fco_inv_money(price) || ' FC' else '' end);
  return jsonb_build_object('plays', plays, 'paid', price, 'picks', picks, 'pos', pos, 'tickets', w.vqtg_tickets + got_tickets, 'bpPool', j.pot * (rules->>'bpPerJackpotFc')::bigint, 'miniFeed', public.fco_vqtg_mini_feed(mini_feed, uid),
    'jackpot', public.fco_jackpot_view(j, uid), 'wallet', public.fco_wallet_json(uid), 'save', granted);
end;
$$;

commit;
