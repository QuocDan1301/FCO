begin;

-- Sửa: người chơi đăng nhập trên điện thoại rồi sang máy tính thì không nhận được quà ngày (2026-11-17, người dùng báo).
-- Nguyên nhân: giới hạn chống clone (202611110014) xét MỌI thiết bị tài khoản dùng trong 2 ngày. Chỉ cần một trong các máy đó (máy tính
-- dùng chung, máy tiệm net, điện thoại người nhà…) đã nhận quà cho tài khoản khác là tài khoản bị chặn ở mọi máy (FCO_DEVICE_LIMIT);
-- lượt nhận cũng ghi vào mọi thiết bị của tài khoản nên chặn lây sang người khác dùng chung máy tính.
-- Nay: game gửi mã thiết bị đang dùng khi nhận quà ngày → chỉ xét và chỉ ghi đúng thiết bị đó (mỗi thiết bị vẫn chỉ 1 tài khoản nhận / ngày).
-- Lượt Bi Lắc miễn phí / gift code (không gửi mã thiết bị) giữ cách cũ. Cần game bản mới; game cũ (không gửi mã) vẫn chạy theo cách cũ.
-- Chạy sau 202611110014. Chạy lại được.

create or replace function public.fco_device_claim(p_uid uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare other text; cur text := nullif(current_setting('fco.device', true), '');
begin
  if exists (select 1 from public.fco_admins where user_id = p_uid) then return; end if;
  if cur is not null and cur ~ '^[0-9a-f-]{36}$' then
    -- Ghi nhận thiết bị đang dùng (như heartbeat) rồi chỉ xét thiết bị này.
    insert into public.fco_devices as d (user_id, device, ip) values (p_uid, cur, public.fco_request_ip())
      on conflict (user_id, device, ip) do update set last_seen = now();
    if exists (select 1 from public.fco_device_allow a where a.device = cur) then return; end if;
    if exists (select 1 from public.fco_device_claims c where c.device = cur and c.kind = p_kind and c.user_id <> p_uid) then
      raise exception 'FCO_DEVICE_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.fco_device_claims(device, kind, user_id) values (cur, p_kind, p_uid) on conflict do nothing;
    return;
  end if;
  -- Không biết thiết bị đang dùng (game cũ, Bi Lắc, gift code): như 202611110014.
  select c.user_id::text into other from public.fco_devices d
    join public.fco_device_claims c on c.device = d.device and c.kind = p_kind and c.user_id <> p_uid
   where d.user_id = p_uid and d.last_seen > now() - interval '2 days'
     and not exists (select 1 from public.fco_device_allow a where a.device = d.device)
   limit 1;
  if other is not null then raise exception 'FCO_DEVICE_LIMIT' using errcode = 'P0001'; end if;
  insert into public.fco_device_claims(device, kind, user_id)
  select distinct d.device, p_kind, p_uid from public.fco_devices d
   where d.user_id = p_uid and d.last_seen > now() - interval '2 days'
     and not exists (select 1 from public.fco_device_allow a where a.device = d.device)
  on conflict do nothing;
end;
$$;
revoke all on function public.fco_device_claim(uuid, text) from public, anon, authenticated;

drop function if exists public.fco_claim_daily();
-- Như 202611100013, thêm p_device (thiết bị đang bấm nhận).
create function public.fco_claim_daily(p_device text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); w public.fco_wallets; next smallint; bonus integer; granted jsonb;
begin
  -- Thiết bị đang bấm nhận: giới hạn chống clone chỉ xét thiết bị này (fco_device_claim đọc fco.device).
  if p_device is not null and p_device ~ '^[0-9a-f-]{36}$' then perform set_config('fco.device', p_device, true); end if;
  w := public.fco_wallet_lock(uid);
  if w.daily is not distinct from public.fco_today() then raise exception 'FCO_DAILY_CLAIMED' using errcode = 'P0001'; end if;
  next := public.fco_checkin_next(w.checkin_day, w.checkin_date, public.fco_today());
  update public.fco_wallets set daily = public.fco_today(), checkin_day = next, checkin_date = public.fco_today() where user_id = uid;
  perform public.fco_apply_fc(uid, 500, 'daily');
  bonus := (array[200, 350, 500, 650, 800, 1000, 0])[next];
  if bonus > 0 then perform public.fco_apply_fc(uid, bonus, 'checkin', jsonb_build_object('day', next)); end if;
  if next = 7 then
    granted := public.fco_inv_grant(uid, '[{"pack": "the-moment", "count": 1}]', 'gift', 'Điểm danh ngày 7',
      '+500 FC + điểm danh ngày 7: ' || public.fco_inv_reward_text('[{"pack": "the-moment", "count": 1}]'));
  end if;
  return public.fco_wallet_json(uid) || jsonb_build_object('save', granted);
end;
$$;
grant execute on function public.fco_claim_daily(text) to authenticated;
revoke execute on function public.fco_claim_daily(text) from public, anon;

commit;
