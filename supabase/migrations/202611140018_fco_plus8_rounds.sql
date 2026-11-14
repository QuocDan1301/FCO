begin;

-- BXH "Đập 8 liền tay" theo vòng (2026-11-14, người dùng: "Làm tương tự cho tôi với bxh đập 8"): cùng lịch vòng với BXH GLXH / Penalty
-- (202611140017: vòng 1 hết 23:59 15/11/2026 giờ VN, mỗi vòng 7 ngày). Hết vòng: Top 1–5 nhận gói p8-1 … p8-5 (EL, CU, UT, CC 114+ … 110+ (+8))
-- qua hàng chờ quà (fco_admin_gifts → game tự nhận, hiện thông báo), tin LIVE; bảng xoá (lượt +8 chuyển sang fco_plus8_archive) và tính lại từ đầu.
-- fco_plus8_from_history (tự bù khi kho chưa bắt buộc) chỉ lấy lượt đập từ đầu vòng hiện tại. Chạy SAU 202611140017. Chạy lại được.

create table if not exists public.fco_plus8_archive (
  round integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id integer not null,
  at timestamptz not null,
  primary key (round, user_id, player_id)
);
alter table public.fco_plus8_archive enable row level security;
revoke all on public.fco_plus8_archive from public, anon, authenticated;

alter table public.fco_rank_winners add column if not exists pack text;
alter table public.fco_rank_winners drop constraint if exists fco_rank_winners_board_check;
alter table public.fco_rank_winners add constraint fco_rank_winners_board_check check (board in ('ranked', 'penalty', 'plus8'));

-- Đầu vòng hiện tại (lượt +8 tính từ đây); vòng 1 tính từ 0h 14/11/2026 như trước.
create or replace function public.fco_plus8_since() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(timestamptz '2026-11-14 00:00:00+07', coalesce((select ends_at - period from public.fco_rank_round where id = 1), '-infinity'))
$$;
revoke all on function public.fco_plus8_since() from public, anon, authenticated;

-- Trao một gói (một lần duy nhất mỗi vòng / bảng / hạng) qua hàng chờ quà.
create or replace function public.fco_rank_prize_pack(p_round integer, p_board text, p_rank integer, p_uid uuid, p_score integer, p_pack text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare who text := public.fco_public_name(p_uid);
begin
  insert into public.fco_rank_winners(round, board, rank, user_id, name, score, fc, pack) values (p_round, p_board, p_rank, p_uid, who, p_score, 0, p_pack)
  on conflict do nothing;
  if not found then return; end if;
  insert into public.fco_admin_gifts(user_id, rewards, note) values (p_uid, jsonb_build_array(jsonb_build_object('pack', p_pack, 'count', 1)),
    'Quà Top ' || p_rank || ' Đập 8 liền tay');
  perform public.fco_live_post(p_uid, 'rank_prize', '🏆 Chúc mừng HLV ' || who || ' đạt Top ' || p_rank || ' Đập 8 liền tay · nhận gói EL, CU, UT, CC ' || (115 - p_rank) || '+ (+8)!', null);
end;
$$;
revoke all on function public.fco_rank_prize_pack(integer, text, integer, uuid, integer, text) from public, anon, authenticated;

create or replace function public.fco_rank_round_tick() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r public.fco_rank_round; t record; i integer;
begin
  if now() < coalesce((select ends_at from public.fco_rank_round where id = 1), 'infinity') then return; end if;
  select * into r from public.fco_rank_round where id = 1 for update;
  if not found then return; end if;
  while now() >= r.ends_at loop
    i := 0;
    for t in select x.user_id, x.points as score from public.fco_ranked x join auth.users u on u.id = x.user_id
              where x.wins + x.draws + x.losses > 0 and coalesce(u.banned_until, '-infinity') < now()
              order by x.points desc, x.updated_at limit 3 loop
      i := i + 1;
      perform public.fco_rank_prize(r.round, 'ranked', i, t.user_id, t.score, r.prizes[i]);
    end loop;
    i := 0;
    for t in select x.user_id, x.penalty_best as score from public.fco_ranks x join auth.users u on u.id = x.user_id
              where x.penalty_best > 0 and coalesce(u.banned_until, '-infinity') < now()
              order by x.penalty_best desc, x.penalty_at limit 3 loop
      i := i + 1;
      perform public.fco_rank_prize(r.round, 'penalty', i, t.user_id, t.score, r.prizes[i]);
    end loop;
    -- 202611140018: BXH Đập 8 liền tay — Top 1–5 nhận gói p8-1 … p8-5 (qua hàng chờ quà, game tự nhận), rồi xoá bảng (lưu vào kho lưu trữ).
    i := 0;
    for t in select s.user_id, s.score::integer as score from public.fco_plus8_scores() s join auth.users u on u.id = s.user_id
              where coalesce(u.banned_until, '-infinity') < now() order by s.score desc, s.reached, s.user_id limit 5 loop
      i := i + 1;
      perform public.fco_rank_prize_pack(r.round, 'plus8', i, t.user_id, t.score, 'p8-' || i);
    end loop;
    insert into public.fco_plus8_archive(round, user_id, player_id, at) select r.round, user_id, player_id, at from public.fco_plus8;
    delete from public.fco_plus8 where true;
    update public.fco_ranked set points = 1000, wins = 0, draws = 0, losses = 0 where wins + draws + losses > 0 or points <> 1000;
    update public.fco_ranks set penalty_best = 0, penalty_at = null where penalty_best > 0;
    r.round := r.round + 1;
    r.ends_at := r.ends_at + r.period;
  end loop;
  update public.fco_rank_round set round = r.round, ends_at = r.ends_at where id = 1;
end;
$$;
revoke all on function public.fco_rank_round_tick() from public, anon, authenticated;

create or replace function public.fco_rank_round_state() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); r public.fco_rank_round;
begin
  perform public.fco_rank_round_tick();
  select * into r from public.fco_rank_round where id = 1;
  return jsonb_build_object('round', r.round, 'endsAt', (extract(epoch from r.ends_at) * 1000)::bigint, 'prizes', to_jsonb(r.prizes),
    'last', coalesce((select jsonb_object_agg(board, list) from (
        select board, jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'score', score, 'fc', fc, 'pack', pack, 'mine', user_id = uid) order by rank) as list
          from public.fco_rank_winners where round = r.round - 1 group by board) w), '{}'::jsonb));
end;
$$;

create or replace function public.fco_plus8_from_history(p_uid uuid, p_data jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if p_uid is null or jsonb_typeof(p_data->'history') <> 'array' or jsonb_typeof(p_data->'cards') <> 'array' then return 0; end if;
  -- Không có mục đập +8 mới thì thôi (đa số lần lưu): khỏi ghép thẻ.
  if not exists (select 1 from jsonb_array_elements(p_data->'history') e
                  where e->>'type' = 'upgrade' and e->>'success' = 'true' and e->>'detail' ~ '→ \+8( |$)'
                    and jsonb_typeof(e->'time') = 'number' and (e->>'time')::double precision >= extract(epoch from public.fco_plus8_since()) * 1000) then
    return 0;
  end if;
  insert into public.fco_plus8(user_id, player_id, at)
  select distinct on (p.id) p_uid, p.id, to_timestamp((e->>'time')::double precision / 1000)
    from jsonb_array_elements(p_data->'history') e
    join lateral (
      select c.id from jsonb_array_elements(p_data->'cards') card
        join public.fco_cat_players c on c.id = (card->>'playerId')::integer
       where (card->>'level')::integer >= 8 and c.name = regexp_replace(e->>'title', '^Thành công · ', '')
       order by c.id limit 1) p on true
   where e->>'type' = 'upgrade' and e->>'success' = 'true' and e->>'detail' ~ '→ \+8( |$)'
     and jsonb_typeof(e->'time') = 'number' and (e->>'time')::double precision >= extract(epoch from public.fco_plus8_since()) * 1000
   order by p.id, (e->>'time')::double precision
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.fco_stp_mission_upgrade(p_uid uuid, p_player integer, p_level integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare ovr integer := public.fco_inv_ovr(p_player, p_level);
begin
  insert into public.fco_stp_missions(user_id, day, mission)
  select p_uid, public.fco_today(), d.id from public.fco_stp_mission_defs d
  where d.kind = 'upgrade' and p_level >= d.level and public.fco_inv_name(p_player) = any(d.names)
  on conflict do nothing;
  -- BXH "Đập +8 nhiều nhất" (202611140005): đập thành công lên đúng +8 → ghi cầu thủ (mỗi cầu thủ một lần / HLV).
  if p_level = 8 then
    perform public.fco_rank_round_tick();  -- 202611140018: hết vòng thì chốt trước khi ghi lượt +8 mới
    insert into public.fco_plus8(user_id, player_id) values (p_uid, p_player) on conflict do nothing;
  end if;
  if ovr > public.fco_live_min_ovr() then
    perform public.fco_live_post(p_uid, 'upgrade', '🔥 Chúc mừng HLV ' || public.fco_public_name(p_uid) || ' đập thành công ' || public.fco_inv_name(p_player)
      || ' lên +' || p_level || ' · OVR ' || ovr || '!');
  end if;
end;
$$;

commit;
