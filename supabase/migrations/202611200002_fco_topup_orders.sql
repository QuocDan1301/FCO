begin;

-- Trang nạp FC riêng: đơn nạp + admin duyệt một chạm + mốc khuyến mãi (người dùng 2026-11-20: "tạo ra 1 trang nạp riêng, để admin quản lí
-- dễ dàng, có các mốc x nạp"; chốt: mỗi mốc nạp có FC khuyến mãi riêng, đạt mốc nào lấy KM mốc đó; đơn nạp + admin duyệt; chỉ FC).
--   Người chơi (nút "+" cạnh ô FC): nhập số tiền / chọn mốc → máy chủ tính FC gốc (tỉ giá fco_topup_rates mới nhất) + FC khuyến mãi
--     (mốc cao nhất ≤ số tiền, bảng fco_topup_tiers) → tạo đơn có mã riêng (ghi vào nội dung chuyển khoản) → bấm "Tôi đã chuyển khoản".
--   Admin (Quản trị FC → Đơn nạp): danh sách đơn chờ; Duyệt = cộng FC gốc (lý do 'admin' → tính doanh thu, Đã nạp, Top Đặc Huấn y như
--     nạp theo bill) + FC khuyến mãi (lý do 'topup_bonus', KHÔNG tính doanh thu / Top Đặc Huấn); Từ chối = không cộng gì. Sửa mốc KM.
--   Số FC luôn lấy từ đơn đã lưu trên máy chủ, game không gửi số FC. Mỗi người tối đa 5 đơn đang mở.
-- Chạy lại được.

create table if not exists public.fco_topup_tiers (
  min_vnd bigint primary key check (min_vnd >= 1000 and min_vnd % 1000 = 0),
  bonus_fc bigint not null check (bonus_fc >= 0 and bonus_fc <= 1000000000),
  updated_at timestamptz not null default now()
);
alter table public.fco_topup_tiers enable row level security;
revoke all on public.fco_topup_tiers from public, anon, authenticated;
-- Mốc mặc định (admin sửa trong trang quản trị). Chỉ thêm khi bảng còn trống.
insert into public.fco_topup_tiers (min_vnd, bonus_fc)
select v, b from (values (50000, 1000), (100000, 3000), (200000, 8000), (500000, 25000), (1000000, 60000), (2000000, 150000)) t(v, b)
where not exists (select 1 from public.fco_topup_tiers);

create table if not exists public.fco_topup_orders (
  id bigint generated always as identity primary key,
  code text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  vnd bigint not null check (vnd > 0),
  base_fc bigint not null check (base_fc > 0),
  bonus_fc bigint not null default 0 check (bonus_fc >= 0),
  tier_vnd bigint,
  status text not null default 'pending' check (status in ('pending', 'paid', 'approved', 'rejected', 'cancelled')),
  admin_note text not null default '',
  admin_id uuid,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  decided_at timestamptz
);
create index if not exists fco_topup_orders_user on public.fco_topup_orders (user_id, created_at desc);
create index if not exists fco_topup_orders_status on public.fco_topup_orders (status, created_at desc);
alter table public.fco_topup_orders enable row level security;
revoke all on public.fco_topup_orders from public, anon, authenticated;

-- Tỉ giá hiện tại (VND cho 1.000 FC) và giới hạn mỗi đơn.
create or replace function public.fco_topup_rate_now() returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select r.vnd_per_1000 from public.fco_topup_rates r where r.effective_from <= now() order by r.effective_from desc limit 1), 5000)
$$;
create or replace function public.fco_topup_tiers_json() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('vnd', t.min_vnd, 'bonus', t.bonus_fc) order by t.min_vnd), '[]'::jsonb) from public.fco_topup_tiers t
$$;
create or replace function public.fco_topup_order_json(o public.fco_topup_orders) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', o.id, 'code', o.code, 'vnd', o.vnd, 'baseFc', o.base_fc, 'bonusFc', o.bonus_fc, 'tierVnd', o.tier_vnd, 'status', o.status,
    'adminNote', o.admin_note, 'createdAt', (extract(epoch from o.created_at) * 1000)::bigint,
    'paidAt', (extract(epoch from o.paid_at) * 1000)::bigint, 'decidedAt', (extract(epoch from o.decided_at) * 1000)::bigint)
$$;

-- ===== Người chơi =====
create or replace function public.fco_topup_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fco_require_user();
  return jsonb_build_object('vndPer1000', public.fco_topup_rate_now(), 'minVnd', 5000, 'maxVnd', 50000000, 'tiers', public.fco_topup_tiers_json());
end;
$$;

create or replace function public.fco_topup_order_create(p_vnd bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); rate integer := public.fco_topup_rate_now(); t public.fco_topup_tiers; o public.fco_topup_orders;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; new_code text; i integer;
begin
  if p_vnd is null or p_vnd < 5000 or p_vnd > 50000000 or p_vnd % 1000 <> 0 then raise exception 'FCO_TOPUP_BAD_AMOUNT' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('fco_topup_order:' || uid::text));
  if (select count(*) from public.fco_topup_orders where user_id = uid and status in ('pending', 'paid')) >= 5 then
    raise exception 'FCO_TOPUP_TOO_MANY' using errcode = 'P0001';
  end if;
  select * into t from public.fco_topup_tiers where min_vnd <= p_vnd order by min_vnd desc limit 1;
  for attempt in 1..10 loop
    new_code := 'FCO';
    for i in 1..6 loop new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1); end loop;
    exit when not exists (select 1 from public.fco_topup_orders where code = new_code);
  end loop;
  insert into public.fco_topup_orders (code, user_id, vnd, base_fc, bonus_fc, tier_vnd)
  values (new_code, uid, p_vnd, floor(p_vnd * 1000.0 / rate)::bigint, coalesce(t.bonus_fc, 0), t.min_vnd)
  returning * into o;
  return public.fco_topup_order_json(o);
end;
$$;

-- Người chơi báo đã chuyển khoản (đơn chuyển lên đầu danh sách chờ của admin).
create or replace function public.fco_topup_order_paid(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); o public.fco_topup_orders;
begin
  update public.fco_topup_orders set status = 'paid', paid_at = now() where id = p_id and user_id = uid and status = 'pending' returning * into o;
  if not found then select * into o from public.fco_topup_orders where id = p_id and user_id = uid; end if;
  if o.id is null then raise exception 'FCO_TOPUP_NOT_FOUND' using errcode = 'P0001'; end if;
  return public.fco_topup_order_json(o);
end;
$$;

-- Người chơi huỷ đơn chưa duyệt.
create or replace function public.fco_topup_order_cancel(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); o public.fco_topup_orders;
begin
  update public.fco_topup_orders set status = 'cancelled', decided_at = now() where id = p_id and user_id = uid and status in ('pending', 'paid') returning * into o;
  if not found then select * into o from public.fco_topup_orders where id = p_id and user_id = uid; end if;
  if o.id is null then raise exception 'FCO_TOPUP_NOT_FOUND' using errcode = 'P0001'; end if;
  return public.fco_topup_order_json(o);
end;
$$;

create or replace function public.fco_topup_my_orders() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  return coalesce((select jsonb_agg(public.fco_topup_order_json(o) order by o.created_at desc)
    from (select * from public.fco_topup_orders where user_id = uid order by created_at desc limit 20) o), '[]'::jsonb);
end;
$$;

-- ===== Admin =====
-- p_status: 'open' (chờ duyệt: đã báo chuyển + chưa báo), 'approved', 'rejected' (gồm huỷ), 'all'. p_search: mã đơn / Gmail.
create or replace function public.fco_admin_topup_orders(p_status text default 'open', p_search text default null, p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform public.fco_require_admin();
  return jsonb_build_object(
    'counts', (select jsonb_build_object('paid', count(*) filter (where status = 'paid'), 'pending', count(*) filter (where status = 'pending'),
        'approvedToday', count(*) filter (where status = 'approved' and decided_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'),
        'vndToday', coalesce(sum(vnd) filter (where status = 'approved' and decided_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh'), 0))
      from public.fco_topup_orders),
    'orders', coalesce((select jsonb_agg(public.fco_topup_order_json(o) || jsonb_build_object('login', public.fco_login_name(u.email), 'name', public.fco_public_name(o.user_id), 'user', o.user_id)
        order by case o.status when 'paid' then 0 when 'pending' then 1 else 2 end, coalesce(o.decided_at, o.paid_at, o.created_at) desc)
      from (select * from public.fco_topup_orders x
            where case coalesce(p_status, 'open') when 'open' then x.status in ('pending', 'paid') when 'approved' then x.status = 'approved'
                    when 'rejected' then x.status in ('rejected', 'cancelled') else true end
            order by case x.status when 'paid' then 0 when 'pending' then 1 else 2 end, coalesce(x.decided_at, x.paid_at, x.created_at) desc
            limit least(greatest(coalesce(p_limit, 200), 1), 500)) o
      join auth.users u on u.id = o.user_id
      where q is null or position(q in lower(o.code)) > 0 or position(q in public.fco_login_name(u.email)) > 0), '[]'::jsonb));
end;
$$;

-- Duyệt / từ chối. Duyệt: cộng FC gốc ('admin', tính doanh thu + Top Đặc Huấn) và FC khuyến mãi ('topup_bonus'). Bấm lại đơn đã xử lý thì trả trạng thái cũ.
create or replace function public.fco_admin_topup_decide(p_id bigint, p_approve boolean, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me_admin uuid := public.fco_require_admin(); o public.fco_topup_orders; note text := left(trim(coalesce(p_note, '')), 200); fc bigint;
begin
  if p_approve is null then raise exception 'FCO_BAD_REQUEST' using errcode = '22023'; end if;
  select * into o from public.fco_topup_orders where id = p_id for update;
  if not found then raise exception 'FCO_TOPUP_NOT_FOUND' using errcode = 'P0001'; end if;
  if o.status not in ('pending', 'paid') then return public.fco_topup_order_json(o) || jsonb_build_object('repeat', true); end if;
  if p_approve then
    perform public.fco_wallet_lock(o.user_id);
    fc := public.fco_apply_fc(o.user_id, o.base_fc, 'admin', jsonb_build_object('note', 'Đơn nạp ' || o.code, 'order', o.code, 'vnd', o.vnd), me_admin);
    if o.bonus_fc > 0 then
      fc := public.fco_apply_fc(o.user_id, o.bonus_fc, 'topup_bonus', jsonb_build_object('note', 'Khuyến mãi mốc ' || o.tier_vnd || 'đ · đơn ' || o.code, 'order', o.code), me_admin);
    end if;
  end if;
  update public.fco_topup_orders set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), admin_id = me_admin, admin_note = note
  where id = o.id returning * into o;
  return public.fco_topup_order_json(o) || jsonb_build_object('repeat', false, 'fc', fc);
end;
$$;

-- Lưu toàn bộ bảng mốc khuyến mãi: [{vnd, bonus}], tối đa 20 mốc, số tiền bội 1.000đ, không trùng.
create or replace function public.fco_admin_topup_tiers_save(p_tiers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.fco_require_admin();
  if jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) > 20 or exists (
      select 1 from jsonb_array_elements(p_tiers) e
      where jsonb_typeof(e->'vnd') <> 'number' or jsonb_typeof(e->'bonus') <> 'number'
        or (e->>'vnd')::numeric < 1000 or (e->>'vnd')::numeric > 50000000 or (e->>'vnd')::numeric % 1000 <> 0
        or (e->>'bonus')::numeric < 0 or (e->>'bonus')::numeric > 1000000000 or (e->>'bonus')::numeric <> floor((e->>'bonus')::numeric))
     or (select count(*) <> count(distinct e->>'vnd') from jsonb_array_elements(p_tiers) e) then
    raise exception 'FCO_TOPUP_BAD_TIERS' using errcode = '22023';
  end if;
  delete from public.fco_topup_tiers where true;
  insert into public.fco_topup_tiers (min_vnd, bonus_fc) select (e->>'vnd')::bigint, (e->>'bonus')::bigint from jsonb_array_elements(p_tiers) e;
  return public.fco_topup_tiers_json();
end;
$$;

revoke all on function public.fco_topup_rate_now(), public.fco_topup_tiers_json(), public.fco_topup_order_json(public.fco_topup_orders) from public, anon, authenticated;
revoke all on function public.fco_topup_config(), public.fco_topup_order_create(bigint), public.fco_topup_order_paid(bigint), public.fco_topup_order_cancel(bigint),
  public.fco_topup_my_orders(), public.fco_admin_topup_orders(text, text, integer), public.fco_admin_topup_decide(bigint, boolean, text),
  public.fco_admin_topup_tiers_save(jsonb) from public, anon;
grant execute on function public.fco_topup_config(), public.fco_topup_order_create(bigint), public.fco_topup_order_paid(bigint), public.fco_topup_order_cancel(bigint),
  public.fco_topup_my_orders(), public.fco_admin_topup_orders(text, text, integer), public.fco_admin_topup_decide(bigint, boolean, text),
  public.fco_admin_topup_tiers_save(jsonb) to authenticated;

commit;
