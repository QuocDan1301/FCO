begin;

-- Cờ tỷ phú · QUÀ ĐUA TOP (2026-11-22, người dùng gửi), áp cho CẢ 2 đợt. Chạy SAU 202611220008_fco_ctp_rails_harder.sql. Chạy lại được.
--   Top 1: EL chỉ định 5 · TSUBASA chỉ định 5 (+5) · UC chỉ định 5 (+12)
--   Top 2: EL chỉ định 7 · TSUBASA chỉ định 7 (+5) · UC chỉ định 7 (+12)
--   Top 3: EL chỉ định 10 · TSUBASA chỉ định 10 (+5) · UC chỉ định 10 (+12)
--   Top 4: TSUBASA chỉ định 10 (+5) · UC chỉ định 10 (+12)
--   Top 5: TSUBASA chỉ định 15 (+5) · UC chỉ định 15 (+12)
--   (EL người dùng không ghi cấp → thẻ +1.) 11 gói mới ctpt-* trong src/packs.json.
-- Đợt nào đã chốt trước khi có quà thì gửi bù quà cho người thắng đã lưu (winners.gifted = false), mỗi người 1 lần.

do $$
begin
  if (select count(*) from public.fco_cat_packs where id in ('ctpt-el1-10', 'ctpt-el1-5', 'ctpt-el1-7', 'ctpt-tsu5-10', 'ctpt-tsu5-15', 'ctpt-tsu5-5', 'ctpt-tsu5-7', 'ctpt-uc12-10', 'ctpt-uc12-15', 'ctpt-uc12-5', 'ctpt-uc12-7')) < 11 then
    raise exception 'Chưa có các gói ctpt-* trên máy chủ: đưa bản game mới lên → Quản trị FC → Đồng bộ dữ liệu, rồi chạy lại migration này.';
  end if;
end $$;

update public.fco_ctp_race_rewards set rewards = '[{"pack":"ctpt-el1-5","count":1},{"pack":"ctpt-tsu5-5","count":1},{"pack":"ctpt-uc12-5","count":1}]' where rank = 1;
update public.fco_ctp_race_rewards set rewards = '[{"pack":"ctpt-el1-7","count":1},{"pack":"ctpt-tsu5-7","count":1},{"pack":"ctpt-uc12-7","count":1}]' where rank = 2;
update public.fco_ctp_race_rewards set rewards = '[{"pack":"ctpt-el1-10","count":1},{"pack":"ctpt-tsu5-10","count":1},{"pack":"ctpt-uc12-10","count":1}]' where rank = 3;
update public.fco_ctp_race_rewards set rewards = '[{"pack":"ctpt-tsu5-10","count":1},{"pack":"ctpt-uc12-10","count":1}]' where rank = 4;
update public.fco_ctp_race_rewards set rewards = '[{"pack":"ctpt-tsu5-15","count":1},{"pack":"ctpt-uc12-15","count":1}]' where rank = 5;

-- Gửi bù cho đợt đã chốt mà chưa gửi quà.
do $$
declare r public.fco_ctp_races; x jsonb; rw jsonb; list jsonb;
begin
  for r in select * from public.fco_ctp_races where settled_at is not null for update loop
    list := '[]';
    for x in select value from jsonb_array_elements(r.winners) loop
      if not coalesce((x->>'gifted')::boolean, false) then
        select rewards into rw from public.fco_ctp_race_rewards where round = r.round and rank = (x->>'rank')::integer;
        if rw is not null and jsonb_array_length(rw) > 0 then
          insert into public.fco_admin_gifts(user_id, rewards, note) values ((x->>'uid')::uuid, rw, 'Quà Top ' || (x->>'rank') || ' Đua top Cờ tỷ phú đợt ' || r.round);
          x := x || '{"gifted": true}';
        end if;
      end if;
      list := list || jsonb_build_array(x);
    end loop;
    update public.fco_ctp_races set winners = list where round = r.round;
  end loop;
end $$;

commit;
