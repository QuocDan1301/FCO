begin;

-- "Đua top nhận quà hot" của Vòng Quanh Thế Giới (2026-11-13): bảng xếp hạng số vé (fco_wallets.vqtg_tickets), hiện top 5 kèm quà từng hạng.
-- Bằng vé thì ai đạt số vé đó trước đứng trên (vqtg_tickets_at, trigger tự ghi mỗi khi số vé tăng — không phải sửa fco_vqtg_play).
-- Quà top 5 theo người dùng (2026-11-13): Top 1 EL All + GRU chỉ định 10 (+11), Top 2 TSUBASA All + GRU chỉ định 15 (+11),
-- Top 3 GRU chỉ định 20 (+11), Top 4 GRU chỉ định 25 (+11), Top 5 GRU chỉ định 30 (+11). Gói vqt-* trong packs.json.
-- Chưa tự trao quà: hết sự kiện admin trao theo bảng này (tặng quà admin).
-- Chạy lại được nhiều lần (bản đầu đã chạy trên máy chủ trước khi đổi quà): if not exists / or replace, quà ghi đè theo hạng.

alter table public.fco_wallets add column if not exists vqtg_tickets_at timestamptz;
create index if not exists fco_wallets_vqtg_top on public.fco_wallets (vqtg_tickets desc, vqtg_tickets_at) where vqtg_tickets > 0;

create or replace function public.fco_vqtg_tickets_at() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.vqtg_tickets > old.vqtg_tickets then new.vqtg_tickets_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists fco_wallets_vqtg_tickets_at on public.fco_wallets;
create trigger fco_wallets_vqtg_tickets_at before update of vqtg_tickets on public.fco_wallets
  for each row execute function public.fco_vqtg_tickets_at();
revoke all on function public.fco_vqtg_tickets_at() from public, anon, authenticated;

create table if not exists public.fco_vqtg_top_rewards (
  rank smallint primary key check (rank between 1 and 5),
  rewards jsonb not null check (jsonb_typeof(rewards) = 'array'),
  note text not null default ''           -- ghi chú hiện khi quà chưa có (vd. gói mùa sắp ra)
);
alter table public.fco_vqtg_top_rewards add column if not exists note text not null default '';
alter table public.fco_vqtg_top_rewards enable row level security;
revoke all on public.fco_vqtg_top_rewards from anon, authenticated;
insert into public.fco_vqtg_top_rewards (rank, rewards, note) values
  (1, '[{"pack":"vqt-1","count":1},{"pack":"vqt-1g","count":1}]', ''),
  (2, '[{"pack":"vqt-2","count":1},{"pack":"vqt-2g","count":1}]', ''),
  (3, '[{"pack":"vqt-3","count":1}]', ''),
  (4, '[{"pack":"vqt-4","count":1}]', ''),
  (5, '[{"pack":"vqt-5","count":1}]', '')
on conflict (rank) do update set rewards = excluded.rewards, note = excluded.note;

-- Top 5 theo vé + hạng của mình + quà từng hạng.
create or replace function public.fco_vqtg_top() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); me public.fco_wallets;
begin
  select * into me from public.fco_wallets where user_id = uid;
  return jsonb_build_object(
    'top', coalesce((select jsonb_agg(jsonb_build_object('rank', t.rn, 'name', public.fco_public_name(t.user_id), 'tickets', t.vqtg_tickets,
                       'mine', t.user_id = uid, 'effect', public.fco_name_effect(t.user_id), 'club', public.fco_club_logo(t.user_id)) order by t.rn)
                     from (select w.user_id, w.vqtg_tickets, row_number() over (order by w.vqtg_tickets desc, w.vqtg_tickets_at nulls last, w.user_id) as rn
                           from public.fco_wallets w where w.vqtg_tickets > 0 order by w.vqtg_tickets desc, w.vqtg_tickets_at nulls last, w.user_id limit 5) t), '[]'::jsonb),
    'me', jsonb_build_object(
      'tickets', coalesce(me.vqtg_tickets, 0),
      'rank', case when coalesce(me.vqtg_tickets, 0) > 0 then 1 + (select count(*) from public.fco_wallets o
              where o.vqtg_tickets > me.vqtg_tickets
                 or (o.vqtg_tickets = me.vqtg_tickets and o.user_id <> me.user_id
                     and (coalesce(o.vqtg_tickets_at, 'infinity') < coalesce(me.vqtg_tickets_at, 'infinity')
                          or (o.vqtg_tickets_at is not distinct from me.vqtg_tickets_at and o.user_id < me.user_id)))) end),
    'rewards', (select jsonb_agg(jsonb_build_object('rank', rank, 'rewards', rewards, 'note', note) order by rank) from public.fco_vqtg_top_rewards));
end;
$$;
revoke all on function public.fco_vqtg_top() from public, anon;
grant execute on function public.fco_vqtg_top() to authenticated;

commit;
