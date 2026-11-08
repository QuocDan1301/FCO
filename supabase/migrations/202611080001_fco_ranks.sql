-- Bảng xếp hạng HLV (2026-11-08): mục "BXH" trên thanh menu dưới, hai bảng top 10.
--   · Đập thẻ OVR cao nhất: kỷ lục OVR của thẻ vừa đập THÀNH CÔNG (game gửi lên sau mỗi lần đập thành công); chỉ ghi khi
--     cao hơn kỷ lục cũ, nên bán / đập rớt thẻ sau đó không làm mất kỷ lục. Kèm cầu thủ + cấp để hiện thẻ.
--   · Giá trị đội hình: tổng giá 11 cầu thủ đá chính của đội hình đang dùng (số "Giá trị ĐH" ở màn Đội hình),
--     game gửi lên mỗi khi số này đổi.
-- OVR / giá thẻ chỉ tính được trong game (dữ liệu cầu thủ, bảng giá ở src/), nên máy chủ tin số game gửi — như bản lưu.
-- Tên HLV che bớt như bảng tin jackpot (fco_public_name). Chỉ tài khoản đăng nhập gọi được.
begin;

create table public.fco_ranks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  best_ovr integer not null default 0 check (best_ovr between 0 and 999),
  best_player integer,
  best_level smallint,
  best_at timestamptz,
  squad_value bigint not null default 0 check (squad_value between 0 and 1000000000000000000),
  squad_at timestamptz
);
create index fco_ranks_ovr on public.fco_ranks(best_ovr desc, best_at);
create index fco_ranks_squad on public.fco_ranks(squad_value desc, squad_at);
alter table public.fco_ranks enable row level security;
revoke all on public.fco_ranks from anon, authenticated;

-- Đập thành công: ghi kỷ lục nếu cao hơn kỷ lục cũ (bằng thì giữ người đạt trước).
create function public.fco_rank_upgrade(p_ovr integer, p_player integer, p_level integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if p_ovr is null or p_ovr not between 1 and 999 or p_player is null or p_player < 1 or p_level is null or p_level not between 1 and 30 then
    raise exception 'FCO_RANK_INVALID' using errcode = 'P0001';
  end if;
  insert into public.fco_ranks as r (user_id, best_ovr, best_player, best_level, best_at) values (uid, p_ovr, p_player, p_level, now())
  on conflict (user_id) do update set best_ovr = excluded.best_ovr, best_player = excluded.best_player, best_level = excluded.best_level, best_at = excluded.best_at
  where excluded.best_ovr > r.best_ovr;
end;
$$;

-- Giá trị đội hình đang dùng: thay bằng số mới (lên hay xuống đều ghi).
create function public.fco_rank_squad(p_value bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if p_value is null or p_value not between 0 and 1000000000000000000 then raise exception 'FCO_RANK_INVALID' using errcode = 'P0001'; end if;
  insert into public.fco_ranks as r (user_id, squad_value, squad_at) values (uid, p_value, now())
  on conflict (user_id) do update set squad_value = excluded.squad_value, squad_at = excluded.squad_at
  where r.squad_value is distinct from excluded.squad_value;
end;
$$;

-- Hai bảng top 10 + hạng của người xem (null nếu chưa có số).
create function public.fco_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); me public.fco_ranks;
begin
  select * into me from public.fco_ranks where user_id = uid;
  return jsonb_build_object(
    'ovr', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'ovr', t.best_ovr, 'playerId', t.best_player,
                       'level', t.best_level, 'mine', t.user_id = uid) order by t.best_ovr desc, t.best_at)
                     from (select * from public.fco_ranks where best_ovr > 0 order by best_ovr desc, best_at limit 10) t), '[]'::jsonb),
    'squad', coalesce((select jsonb_agg(jsonb_build_object('name', public.fco_public_name(t.user_id), 'value', t.squad_value, 'mine', t.user_id = uid)
                       order by t.squad_value desc, t.squad_at)
                     from (select * from public.fco_ranks where squad_value > 0 order by squad_value desc, squad_at limit 10) t), '[]'::jsonb),
    'me', jsonb_build_object(
      'ovr', case when coalesce(me.best_ovr, 0) > 0 then me.best_ovr end,
      'ovrRank', case when coalesce(me.best_ovr, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                 where o.best_ovr > me.best_ovr or (o.best_ovr = me.best_ovr and o.best_at < me.best_at)) end,
      'squad', case when coalesce(me.squad_value, 0) > 0 then me.squad_value end,
      'squadRank', case when coalesce(me.squad_value, 0) > 0 then 1 + (select count(*) from public.fco_ranks o
                   where o.squad_value > me.squad_value or (o.squad_value = me.squad_value and o.squad_at < me.squad_at)) end));
end;
$$;

revoke all on function public.fco_rank_upgrade(integer, integer, integer), public.fco_rank_squad(bigint), public.fco_leaderboard() from public, anon;
grant execute on function public.fco_rank_upgrade(integer, integer, integer), public.fco_rank_squad(bigint), public.fco_leaderboard() to authenticated;

commit;
