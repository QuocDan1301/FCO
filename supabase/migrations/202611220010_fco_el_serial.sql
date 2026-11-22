begin;

-- SỐ THỨ TỰ SỞ HỮU thẻ mùa EL (2026-11-22, người dùng): mỗi cầu thủ EL có dãy số riêng — thẻ Messi EL mở ra đầu tiên là #1, thẻ thứ hai #2…
-- Số nằm trên thẻ (card.serial), đi theo thẻ khi nâng cấp (jsonb_set giữ trường) / treo bán / chuyển nhượng; thẻ tạo mới ở bất kỳ đâu
-- (mở gói, mua từ hệ thống, Tuyển chọn, quà…) đều đi qua fco_inv_new_card nên tự nhận số tiếp theo.
-- Đánh số bù cho thẻ EL đang tồn tại (kho người chơi, lệnh bán đang treo, thẻ chờ nhận ở chợ) theo thời điểm nhận thẻ (received), bằng nhau thì
-- theo mã thẻ. Thẻ đã bán cho hệ thống / mất trước đây không còn dữ liệu nên không chiếm số. Chạy lại được (chỉ đánh số thẻ chưa có số).

create table if not exists public.fco_serial_players (player_id integer primary key);
create table if not exists public.fco_card_serials (player_id integer primary key, last integer not null default 0 check (last >= 0));
alter table public.fco_serial_players enable row level security;
alter table public.fco_card_serials enable row level security;
revoke all on public.fco_serial_players, public.fco_card_serials from anon, authenticated;
-- 92 cầu thủ ETERNAL LEGENDS (tier el, id 4085–4176).
insert into public.fco_serial_players (player_id) values (4085), (4086), (4087), (4088), (4089), (4090), (4091), (4092), (4093), (4094), (4095), (4096), (4097), (4098), (4099), (4100), (4101), (4102), (4103), (4104), (4105), (4106), (4107), (4108), (4109), (4110), (4111), (4112), (4113), (4114), (4115), (4116), (4117), (4118), (4119), (4120), (4121), (4122), (4123), (4124), (4125), (4126), (4127), (4128), (4129), (4130), (4131), (4132), (4133), (4134), (4135), (4136), (4137), (4138), (4139), (4140), (4141), (4142), (4143), (4144), (4145), (4146), (4147), (4148), (4149), (4150), (4151), (4152), (4153), (4154), (4155), (4156), (4157), (4158), (4159), (4160), (4161), (4162), (4163), (4164), (4165), (4166), (4167), (4168), (4169), (4170), (4171), (4172), (4173), (4174), (4175), (4176) on conflict do nothing;

-- Như 202611100013 + số thứ tự cho cầu thủ có dãy số.
create or replace function public.fco_inv_new_card(p_player integer, p_level integer, p_market boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare s integer;
begin
  if exists (select 1 from public.fco_serial_players where player_id = p_player) then
    insert into public.fco_card_serials (player_id, last) values (p_player, 1)
    on conflict (player_id) do update set last = public.fco_card_serials.last + 1 returning last into s;
  end if;
  return jsonb_build_object('uid', gen_random_uuid()::text, 'playerId', p_player, 'level', p_level, 'received', public.fco_now_ms())
    || case when p_market then '{"fromMarket": true}'::jsonb else '{}'::jsonb end
    || case when s is not null then jsonb_build_object('serial', s) else '{}'::jsonb end;
end;
$$;
revoke all on function public.fco_inv_new_card(integer, integer, boolean) from public, anon, authenticated;

-- Đánh số bù.
create temp table _el_cards on commit drop as
  select 's'::text as src, s.user_id::text as owner, c->>'uid' as uid, (c->>'playerId')::integer as pid, coalesce((c->>'received')::double precision, 0) as rcv
    from public.fco_game_saves s, jsonb_array_elements(case when jsonb_typeof(s.data->'cards') = 'array' then s.data->'cards' else '[]'::jsonb end) c
    where jsonb_typeof(c) = 'object' and not (c ? 'serial') and (c->>'playerId')::integer in (select player_id from public.fco_serial_players)
  union all
  select 'o', o.id::text, o.card->>'uid', (o.card->>'playerId')::integer, coalesce((o.card->>'received')::double precision, 0)
    from public.fco_mkt_orders o
    where o.status = 'open' and jsonb_typeof(o.card) = 'object' and not (o.card ? 'serial') and (o.card->>'playerId')::integer in (select player_id from public.fco_serial_players)
  union all
  select 'd', d.id::text, d.card->>'uid', (d.card->>'playerId')::integer, coalesce((d.card->>'received')::double precision, 0)
    from public.fco_mkt_deliveries d
    where d.claimed_at is null and jsonb_typeof(d.card) = 'object' and not (d.card ? 'serial') and (d.card->>'playerId')::integer in (select player_id from public.fco_serial_players);
create temp table _el_num on commit drop as
  select e.*, coalesce((select last from public.fco_card_serials c where c.player_id = e.pid), 0)
              + row_number() over (partition by e.pid order by e.rcv, e.uid)::integer as serial
  from _el_cards e;
update public.fco_game_saves s set revision = revision + 1, updated_at = now(), data = jsonb_set(s.data, '{cards}', (
    select coalesce(jsonb_agg(case when n.serial is not null then c || jsonb_build_object('serial', n.serial) else c end order by o), '[]'::jsonb)
    from jsonb_array_elements(s.data->'cards') with ordinality x(c, o)
    left join _el_num n on n.src = 's' and n.owner = s.user_id::text and n.uid = c->>'uid'))
  where s.user_id::text in (select owner from _el_num where src = 's');
update public.fco_mkt_orders o set card = o.card || jsonb_build_object('serial', n.serial) from _el_num n where n.src = 'o' and n.owner = o.id::text;
update public.fco_mkt_deliveries d set card = d.card || jsonb_build_object('serial', n.serial) from _el_num n where n.src = 'd' and n.owner = d.id::text;
insert into public.fco_card_serials (player_id, last) select pid, max(serial) from _el_num group by pid
on conflict (player_id) do update set last = greatest(public.fco_card_serials.last, excluded.last);
do $$ begin raise notice 'Đã đánh số % thẻ EL đang có.', (select count(*) from _el_num); end $$;

commit;
