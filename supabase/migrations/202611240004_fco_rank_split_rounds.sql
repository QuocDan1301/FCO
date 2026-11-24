-- BXH GLXH, Penalty, Đập 8 liền tay chia 2 đợt mỗi tuần (người dùng 2026-11-24: "chia bxh glxh, penalty, đập 8 thành 2 đợt, 1 đợt 3 ngày, 1 đợt 4 ngày").
--   · Đợt 1: Thứ 2 → Thứ 4 (3 ngày), kết thúc 23:59 Thứ 4. Đợt 2: Thứ 5 → Chủ nhật (4 ngày), kết thúc 23:59 Chủ nhật (giờ Việt Nam).
--   · Hết mỗi đợt giữ nguyên cách chốt cũ (202611140017 / 0018): Top 1–3 GLXH + Penalty nhận 4.000 / 3.000 / 2.000 FC, Top 1–5 Đập 8 nhận gói
--     p8-1…p8-5, rồi reset cả 3 bảng. Mỗi tuần có 2 lần trao quà (trước 1 lần).
--   · Vòng đang chạy (hết 23:59 Chủ nhật) được rút về mốc Thứ 4 / Chủ nhật gần nhất sau lúc chạy migration (đang trong T2–T4 thì hết 23:59 Thứ 4 này).
--   · fco_rank_round.period không dùng nữa; đầu vòng (lượt +8 tính từ đây) = mốc kết thúc vòng trước (fco_rank_round_start).
--   Chạy SAU 202611240003_fco_royal.sql. Chạy lại được.
begin;

-- Mốc 23:59 (giờ VN) Thứ 4 hoặc Chủ nhật đầu tiên SAU thời điểm p.
create or replace function public.fco_rank_next_end(p timestamptz) returns timestamptz language plpgsql stable set search_path = '' as $$
declare d date := (p at time zone 'Asia/Ho_Chi_Minh')::date; c timestamptz;
begin
  for k in 0 .. 8 loop
    c := ((d + k)::timestamp + time '23:59') at time zone 'Asia/Ho_Chi_Minh';
    if c > p and extract(isodow from d + k) in (3, 7) then return c; end if;
  end loop;
  return p + interval '3 days';
end;
$$;

-- Đầu vòng có mốc kết thúc p_end = mốc Thứ 4 / Chủ nhật liền trước đó.
create or replace function public.fco_rank_round_start(p_end timestamptz) returns timestamptz language plpgsql stable set search_path = '' as $$
declare d date := (p_end at time zone 'Asia/Ho_Chi_Minh')::date; c timestamptz;
begin
  for k in 1 .. 8 loop
    c := ((d - k)::timestamp + time '23:59') at time zone 'Asia/Ho_Chi_Minh';
    if c < p_end and extract(isodow from d - k) in (3, 7) then return c; end if;
  end loop;
  return p_end - interval '3 days';
end;
$$;
revoke all on function public.fco_rank_next_end(timestamptz) from public, anon, authenticated;
revoke all on function public.fco_rank_round_start(timestamptz) from public, anon, authenticated;

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
    r.ends_at := public.fco_rank_next_end(r.ends_at);  -- 202611240004: vòng 3 ngày (T2–T4) / 4 ngày (T5–CN) xen kẽ
  end loop;
  update public.fco_rank_round set round = r.round, ends_at = r.ends_at where id = 1;
end;
$$;

-- Đầu vòng hiện tại (lượt +8 tính từ đây); vòng 1 tính từ 0h 14/11/2026 như trước.
create or replace function public.fco_plus8_since() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(timestamptz '2026-11-14 00:00:00+07', coalesce((select public.fco_rank_round_start(ends_at) from public.fco_rank_round where id = 1), '-infinity'))
$$;
revoke all on function public.fco_plus8_since() from public, anon, authenticated;

-- Vòng đang chạy: rút mốc kết thúc về mốc Thứ 4 / Chủ nhật gần nhất (chỉ khi sớm hơn mốc đang đặt).
update public.fco_rank_round set ends_at = public.fco_rank_next_end(now()) where id = 1 and public.fco_rank_next_end(now()) < ends_at;

commit;