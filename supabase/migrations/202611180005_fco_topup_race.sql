begin;

-- Top Đặc Huấn (2026-11-18, người dùng: "làm 1 mục top đặc huấn cho những ai đã nạp trong này hôm nay để nhận quà đặc huấn ở cuối sự kiện vqtg").
-- Người dùng chọn: xếp theo TỔNG FC NẠP từ 0h 18/11/2026 (giờ VN) tới lúc sự kiện VQTG kết thúc (fco_vqtg_race.ends_at), TOP 50 nhận quà,
-- quà gửi sau, hiển thị thành bản tin riêng ở trang chủ.
--   • FC nạp = dòng sổ fco_fc_ledger lý do 'admin' (admin cộng sau khi kiểm bill; lệnh trừ lý do 'admin' cũng tính để sửa nhầm).
--     Không tính quà admin tặng ('admin_gift'), quà sự kiện, hoàn tiền. Bỏ tài khoản admin và tài khoản đang khoá.
--   • Bằng FC: ai đạt tổng đó sớm hơn (lần nạp cuối sớm hơn) xếp trên.
--   • Quà theo hạng ở fco_topup_race_rewards (rank_from..rank_to → rewards, như quà gói / BP / FC của fco_admin_gifts) — điền sau
--     bằng migration mới. Hết sự kiện, lần đầu có người mở bảng sau khi đã có quà thì máy chủ tự gửi quà vào "Quà từ Admin"
--     (fco_admin_gifts, game tự nhận), mỗi người đúng 1 lần (fco_topup_race_awarded). Điền quà sau giờ kết thúc vẫn trao được.
-- Chạy được nhiều lần.

create table if not exists public.fco_topup_race (
  id integer primary key default 1 check (id = 1),
  starts_at timestamptz not null,
  top_n integer not null default 50 check (top_n between 1 and 500)
);
alter table public.fco_topup_race enable row level security;
revoke all on public.fco_topup_race from anon, authenticated;
insert into public.fco_topup_race (id, starts_at, top_n) values (1, '2026-11-18 00:00+07', 50)
  on conflict (id) do update set starts_at = excluded.starts_at, top_n = excluded.top_n;

create table if not exists public.fco_topup_race_rewards (
  rank_from integer not null check (rank_from >= 1),
  rank_to integer not null,
  rewards jsonb not null check (jsonb_typeof(rewards) = 'array'),
  note text not null default '',
  primary key (rank_from),
  check (rank_to >= rank_from)
);
alter table public.fco_topup_race_rewards enable row level security;
revoke all on public.fco_topup_race_rewards from anon, authenticated;

create table if not exists public.fco_topup_race_awarded (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rank integer not null,
  amount bigint not null,
  rewards jsonb not null,
  at timestamptz not null default now()
);
alter table public.fco_topup_race_awarded enable row level security;
revoke all on public.fco_topup_race_awarded from anon, authenticated;

-- Hết giờ = lúc Đua top VQTG kết thúc (đổi giờ VQTG thì Top Đặc Huấn theo luôn).
create or replace function public.fco_topup_race_ends() returns timestamptz language sql stable security definer set search_path = '' as $$
  select coalesce((select ends_at from public.fco_vqtg_race where id = 1), '2026-11-21 00:00+07'::timestamptz)
$$;

-- Bảng xếp hạng đầy đủ trong khung giờ (mọi người có tổng nạp > 0).
create or replace function public.fco_topup_race_rows() returns table(user_id uuid, amount bigint, last_at timestamptz, rn bigint)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.amount, s.last_at, row_number() over (order by s.amount desc, s.last_at, s.user_id) as rn
  from (
    select l.user_id, sum(l.delta)::bigint as amount, max(l.created_at) as last_at
    from public.fco_fc_ledger l
    where l.reason = 'admin'
      and l.created_at >= (select starts_at from public.fco_topup_race where id = 1)
      and l.created_at < public.fco_topup_race_ends()
      and not exists (select 1 from public.fco_admins a where a.user_id = l.user_id)
      and not exists (select 1 from auth.users u where u.id = l.user_id and u.banned_until > now())
    group by l.user_id
    having sum(l.delta) > 0
  ) s
$$;

-- Hết giờ + đã có quà: gửi quà cho người trong top chưa nhận (mỗi người 1 lần). Gọi từ fco_topup_top (không khoá khi chưa tới lượt trao).
create or replace function public.fco_topup_race_award() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer := 0; top integer := (select top_n from public.fco_topup_race where id = 1);
begin
  if now() < public.fco_topup_race_ends() or not exists (select 1 from public.fco_topup_race_rewards) then return 0; end if;
  if not pg_try_advisory_xact_lock(hashtext('fco_topup_race_award')) then return 0; end if;
  with winners as (
    select r.user_id, r.rn::integer as rank, r.amount, w.rewards, w.note
    from public.fco_topup_race_rows() r
    join public.fco_topup_race_rewards w on r.rn between w.rank_from and w.rank_to
    where r.rn <= top and not exists (select 1 from public.fco_topup_race_awarded a where a.user_id = r.user_id)
  ), ins as (
    insert into public.fco_topup_race_awarded (user_id, rank, amount, rewards)
    select user_id, rank, amount, rewards from winners
    on conflict (user_id) do nothing
    returning user_id, rank, rewards
  )
  insert into public.fco_admin_gifts (user_id, rewards, note)
  select ins.user_id, ins.rewards, 'Top Đặc Huấn · Hạng ' || ins.rank from ins;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Bảng cho trang chủ: top N, hạng / tổng nạp của mình, giờ bắt đầu / kết thúc, quà theo hạng (nếu đã điền).
create or replace function public.fco_topup_top() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); top integer := (select top_n from public.fco_topup_race where id = 1); mine record;
begin
  perform public.fco_topup_race_award();
  select r.rn, r.amount into mine from public.fco_topup_race_rows() r where r.user_id = uid;
  return jsonb_build_object(
    'startsAt', (extract(epoch from (select starts_at from public.fco_topup_race where id = 1)) * 1000)::bigint,
    'endsAt', (extract(epoch from public.fco_topup_race_ends()) * 1000)::bigint,
    'ended', now() >= public.fco_topup_race_ends(),
    'topN', top,
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', r.rn, 'name', public.fco_public_name(r.user_id), 'amount', r.amount, 'mine', r.user_id = uid,
                       'effect', public.fco_name_effect(r.user_id), 'club', public.fco_club_logo(r.user_id)) order by r.rn)
                     from public.fco_topup_race_rows() r where r.rn <= top), '[]'::jsonb),
    'me', jsonb_build_object('rank', mine.rn, 'amount', coalesce(mine.amount, 0)),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('from', rank_from, 'to', rank_to, 'rewards', rewards, 'note', note) order by rank_from)
                         from public.fco_topup_race_rewards), '[]'::jsonb),
    'awarded', exists (select 1 from public.fco_topup_race_awarded where user_id = uid));
end;
$$;

revoke all on function public.fco_topup_race_ends(), public.fco_topup_race_rows(), public.fco_topup_race_award() from public, anon, authenticated;
revoke all on function public.fco_topup_top() from public, anon;
grant execute on function public.fco_topup_top() to authenticated;

commit;
