-- Quà nhiệm vụ cày chay mới (2026-11-16, người dùng: "gói bất kì nhưng đều +11, nhiệm vụ tuần +12, đừng để lỗ hổng kinh tế").
-- Gói hỗn hợp mọi cầu thủ, cấp cố định, mùa giá thấp → giữ giá trị BP trung bình gần mức quà cũ (src/packs.json gr-*):
--   ngày +11: gr-d1 RTN·DC·CC (TB ~18 tr BP), gr-d2 LOL·FA·BOE21·EBS (~22 tr), gr-d3 SPL·CAP·CHELSEA·MEDALIST (~36 tr), gr-d4 HG·LN·BLD (~83 tr)
--   tuần +12 (mùa rẻ để tổng tuần không vượt ~1,5 lần quà cũ): gr-w1 HG·LN·BLD·CAP (~212 tr), gr-w2 BTB·BDO·23HW (~347 tr), gr-w3 WB·GRU·AMB (~564 tr), gr-w4 EBS·SPL·CHELSEA·LOL (~75 tr)
-- Không dùng mùa đắt (EL, ICON TM, INFINITE PRIME, PRIME, 26TS, 26UP, UC, WS…): ở +11/+12 trung bình hàng chục tỉ – nghìn tỉ BP.
-- Tổng tối đa mỗi người / tuần (7 ngày đủ nhiệm vụ ngày + 4 nhiệm vụ tuần): ~2,3 tỉ BP giá thị trường (~1,4 tỉ sau thuế bán 40 %), cũ ~1,6 tỉ;
-- giữ nguyên mục tiêu nhiệm vụ,
-- nhận quà vẫn mỗi kỳ 1 lần (fco_grind_claims). Gói phải được admin "Đồng bộ dữ liệu" trước khi chạy (catalog máy chủ).
begin;

do $$
begin
  if (select count(*) from public.fco_cat_packs where id in ('gr-d1', 'gr-d2', 'gr-d3', 'gr-d4', 'gr-w1', 'gr-w2', 'gr-w3', 'gr-w4')) < 8 then
    raise exception 'Chưa có gói gr-* trên máy chủ: mở game bản mới → Quản trị FC → Đồng bộ dữ liệu, rồi chạy lại migration này.';
  end if;
end $$;

update public.fco_grind_defs d set rewards = v.rewards
from (values
  ('d_win3',      '[{"pack":"gr-d4","count":1}]'::jsonb),
  ('d_unbeaten5', '[{"pack":"gr-d3","count":1}]'::jsonb),
  ('d_pen20',     '[{"pack":"gr-d2","count":1}]'::jsonb),
  ('d_up10',      '[{"pack":"gr-d1","count":1}]'::jsonb),
  ('w_win20',     '[{"pack":"gr-w4","count":1}]'::jsonb),
  ('w_pen150',    '[{"pack":"gr-w2","count":1}]'::jsonb),
  ('w_up60',      '[{"pack":"gr-w1","count":1}]'::jsonb),
  ('w_daily20',   '[{"pack":"gr-w3","count":1}]'::jsonb)
) as v(id, rewards)
where d.id = v.id;

commit;
