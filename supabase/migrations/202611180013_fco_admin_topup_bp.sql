begin;

-- Admin nạp BP cho người chơi theo tiền VND (người dùng 2026-11-18: "Thêm tính năng nạp bp cho admin 1k vnd = 10B bp").
--   • Tỉ giá: 1.000đ = 10.000.000.000 BP (1đ = 10.000.000 BP). Mỗi lần 1.000đ – 50.000.000đ (≤ 5 × 10^14 BP).
--   • Cộng thẳng vào kho máy chủ (fco_inv_grant, lịch sử "Nạp BP"). Tài khoản chưa có kho / bản lưu trên máy chủ → vào hàng chờ
--     Quà từ Admin (fco_admin_gifts), game tự nhận khi vào.
--   • Ghi sổ fco_bp_topups (doanh thu BP theo VND). Mã đợt p_request: bấm lại sau lỗi mạng không cộng hai lần.
--   • KHÔNG tính vào Top Đặc Huấn (chỉ tính FC nạp) và không đụng ví FC.
-- Chạy lại được.

create table if not exists public.fco_bp_topups (
  id bigserial primary key,
  request uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid,
  vnd bigint not null check (vnd > 0),
  bp bigint not null check (bp > 0),
  note text not null default '',
  delivered boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists fco_bp_topups_user on public.fco_bp_topups (user_id, created_at desc);
alter table public.fco_bp_topups enable row level security;
revoke all on public.fco_bp_topups from anon, authenticated;

create or replace function public.fco_bp_per_vnd() returns bigint language sql immutable set search_path = '' as $$ select 10000000::bigint $$;

create or replace function public.fco_admin_topup_bp(p_request uuid, p_user uuid, p_vnd bigint, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin_id uuid := public.fco_require_admin(); prev public.fco_bp_topups; bp bigint; note text := left(trim(coalesce(p_note, '')), 200);
  granted jsonb; delivered boolean := true; rewards jsonb;
begin
  if p_request is null then raise exception 'FCO_BAD_REQUEST' using errcode = '22023'; end if;
  select * into prev from public.fco_bp_topups where request = p_request;
  if found then
    return jsonb_build_object('repeat', true, 'vnd', prev.vnd, 'bp', prev.bp, 'delivered', prev.delivered,
      'balance', (select (data->>'balance')::bigint from public.fco_game_saves where user_id = prev.user_id));
  end if;
  if p_vnd is null or p_vnd < 1000 or p_vnd > 50000000 then raise exception 'FCO_BAD_AMOUNT' using errcode = '22023'; end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'FCO_USER_NOT_FOUND' using errcode = 'P0001'; end if;
  bp := p_vnd * public.fco_bp_per_vnd();
  rewards := jsonb_build_array(jsonb_build_object('bp', bp));
  if exists (select 1 from public.fco_game_saves where user_id = p_user) then
    granted := public.fco_inv_grant(p_user, rewards, 'gift', 'Nạp BP',
      '+' || public.fco_inv_money(bp) || ' BP (' || public.fco_inv_money(p_vnd) || 'đ)' || case when note <> '' then ' · ' || note else '' end);
  end if;
  if granted is null then
    -- Chưa có kho trên máy chủ: để BP chờ ở Quà từ Admin, game tự nhận.
    insert into public.fco_admin_gifts (user_id, rewards, note, actor) values (p_user, rewards, 'Nạp BP · ' || public.fco_inv_money(p_vnd) || 'đ' || case when note <> '' then ' · ' || note else '' end, admin_id);
    delivered := false;
  end if;
  insert into public.fco_bp_topups (request, user_id, admin_id, vnd, bp, note, delivered) values (p_request, p_user, admin_id, p_vnd, bp, note, delivered);
  return jsonb_build_object('repeat', false, 'vnd', p_vnd, 'bp', bp, 'delivered', delivered,
    'balance', (select (data->>'balance')::bigint from public.fco_game_saves where user_id = p_user));
end;
$$;

-- Sổ nạp BP của một tài khoản (mới trước) + tổng, cho mục Tài khoản trong Quản trị FC.
create or replace function public.fco_admin_bp_topups(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  return jsonb_build_object(
    'totalVnd', coalesce((select sum(vnd) from public.fco_bp_topups where user_id = p_user), 0),
    'totalBp', coalesce((select sum(bp) from public.fco_bp_topups where user_id = p_user), 0),
    'items', coalesce((select jsonb_agg(jsonb_build_object('vnd', vnd, 'bp', bp, 'note', note, 'delivered', delivered,
        'at', (extract(epoch from created_at) * 1000)::bigint) order by created_at desc)
      from (select * from public.fco_bp_topups where user_id = p_user order by created_at desc limit 50) t), '[]'::jsonb));
end;
$$;

revoke all on function public.fco_bp_per_vnd(), public.fco_admin_topup_bp(uuid, uuid, bigint, text), public.fco_admin_bp_topups(uuid) from public, anon, authenticated;
grant execute on function public.fco_admin_topup_bp(uuid, uuid, bigint, text), public.fco_admin_bp_topups(uuid) to authenticated;

commit;