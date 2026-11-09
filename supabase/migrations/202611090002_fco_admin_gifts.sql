-- Admin tặng quà cho người chơi (2026-11-09): Quản trị FC → Tài khoản → Quản lý → Tặng quà. Quà là FC hoặc gói cầu thủ.
--   · FC cộng vào ví ngay, sổ cái ghi lý do 'admin_gift'. Mọi thống kê nạp / doanh thu chỉ tính lý do 'admin' nên quà không vào Đã nạp hay doanh thu.
--   · Gói nằm trong bản lưu của người chơi nên không ghi thẳng từ máy chủ (sẽ làm mất tiến trình chưa đồng bộ). Quà chờ trong fco_admin_gifts;
--     game lấy quà chờ, thêm vào bản lưu kèm dòng lịch sử id admin-gift-<id> (loại 'gift', hợp lệ với kiểm tra bất thường), rồi mới báo đã nhận.
--     Lưu xong mà báo lỗi thì lần sau thấy id đã có trong lịch sử, chỉ báo lại, không cộng lần hai.
--   · Quà FC cũng có dòng trong fco_admin_gifts để người chơi được báo và có lịch sử; FC không cộng lại khi nhận.
begin;

create table public.fco_admin_gifts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rewards jsonb not null,
  note text not null default '',
  actor uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index fco_admin_gifts_pending on public.fco_admin_gifts(user_id) where claimed_at is null;
create index fco_admin_gifts_user on public.fco_admin_gifts(user_id, created_at desc);
alter table public.fco_admin_gifts enable row level security;
revoke all on public.fco_admin_gifts from public, anon, authenticated;
revoke all on sequence public.fco_admin_gifts_id_seq from public, anon, authenticated;

-- Tặng đúng một loại: p_fc, hoặc p_pack + p_count.
create function public.fco_admin_send_gift(p_user uuid, p_fc bigint default null, p_pack text default null, p_count integer default null, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin_id uuid := public.fco_require_admin();
  note text := left(trim(coalesce(p_note, '')), 200);
  reward jsonb;
  balance bigint;
  gift_id bigint;
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  if (p_fc is null) = (p_pack is null) then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
  if p_fc is not null then
    if p_fc <= 0 or p_fc > 1000000000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
    perform public.fco_wallet_lock(p_user);
    balance := public.fco_apply_fc(p_user, p_fc, 'admin_gift', jsonb_build_object('note', note), admin_id);
    reward := jsonb_build_object('fc', p_fc);
  else
    if p_pack !~ '^[A-Za-z0-9._-]{1,64}$' or p_count is null or p_count < 1 or p_count > 1000 then raise exception 'FCO_GIFT_BAD_REWARDS' using errcode = '22023'; end if;
    reward := jsonb_build_object('pack', p_pack, 'count', p_count);
  end if;
  insert into public.fco_admin_gifts(user_id, rewards, note, actor) values (p_user, jsonb_build_array(reward), note, admin_id) returning id into gift_id;
  return jsonb_build_object('id', gift_id, 'fc', balance);
end;
$$;

-- 20 quà gần nhất của một tài khoản, cho admin xem đã nhận chưa.
create function public.fco_admin_gift_list(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.fco_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'rewards', g.rewards, 'note', g.note,
      'time', (extract(epoch from g.created_at) * 1000)::bigint, 'claimed', g.claimed_at is not null) order by g.id desc), '[]')
  into result from (select * from public.fco_admin_gifts where user_id = p_user order by id desc limit 20) g;
  return result;
end;
$$;

-- Quà đang chờ của chính người chơi.
create function public.fco_my_admin_gifts() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'rewards', g.rewards, 'note', g.note,
      'time', (extract(epoch from g.created_at) * 1000)::bigint) order by g.id), '[]')
  into result from public.fco_admin_gifts g where g.user_id = uid and g.claimed_at is null;
  return result;
end;
$$;

-- Báo đã thêm quà vào bản lưu; chỉ tác động đến quà của chính mình.
create function public.fco_my_admin_gifts_ack(p_ids bigint[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); changed integer;
begin
  update public.fco_admin_gifts set claimed_at = now() where user_id = uid and claimed_at is null and id = any(coalesce(p_ids, '{}'));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.fco_admin_send_gift(uuid, bigint, text, integer, text), public.fco_admin_gift_list(uuid), public.fco_my_admin_gifts(), public.fco_my_admin_gifts_ack(bigint[]) from public, anon;
grant execute on function public.fco_admin_send_gift(uuid, bigint, text, integer, text), public.fco_admin_gift_list(uuid), public.fco_my_admin_gifts(), public.fco_my_admin_gifts_ack(bigint[]) to authenticated;

commit;
