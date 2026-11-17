begin;

-- Bù phần khoá giao dịch của 202611130016_fco_trade_lock.sql (2026-11-17): máy chủ chưa có hàm fco_trade_locked nên chợ người chơi
-- (202611170002–0004) báo "function public.fco_trade_locked(integer) does not exist" khi mua / bán / xem sổ lệnh.
-- CHỈ tạo bảng + hàm khoá giao dịch; KHÔNG chạy lại 202611130016 vì file đó ghi đè fco_inv_buy / fco_inv_sell về bản cũ (trước chợ người chơi).
-- Thẻ mùa EL (id 4085–4176) và TSUBASA (4177–4194) không mua / bán trên TTCN. Chạy lại được.

create table if not exists public.fco_trade_locks (
  label text primary key,
  first_id integer not null,
  last_id integer not null check (last_id >= first_id)
);
alter table public.fco_trade_locks enable row level security;
revoke all on public.fco_trade_locks from anon, authenticated;
insert into public.fco_trade_locks (label, first_id, last_id) values ('EL', 4085, 4176), ('TSUBASA', 4177, 4194)
  on conflict (label) do update set first_id = excluded.first_id, last_id = excluded.last_id;

create or replace function public.fco_trade_locked(p_player integer) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fco_trade_locks where p_player between first_id and last_id)
$$;
revoke all on function public.fco_trade_locked(integer) from public, anon, authenticated;

commit;
