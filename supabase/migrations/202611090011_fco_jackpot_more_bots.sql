-- Quỹ jackpot: tăng số bot săn quỹ từ 40 lên 140 (2026-11-09, sau 202611090009).
--   Mỗi nhịp 2 giây khi quỹ ≥ 10.000 FC, xác suất có bot trúng = 1 − (1 − tỉ lệ mỗi bot)^140:
--   · Giải Phụ (vòng chưa có Giải Phụ) / Giải Đặc Biệt ở quỹ 10.000 FC: ~7,7 % → ~24 % mỗi nhịp (≈ 26 giây → ≈ 8 giây).
--   · Giải Phụ thêm (vòng đã có Giải Phụ, quỹ còn ≥ 10.000 sau khi trả): ~3,9 % → ~13 % mỗi nhịp.
--   Luật Giải Phụ trước Giải Đặc Biệt, cách quỹ tăng và tỉ lệ của người chơi không đổi.
begin;

-- Như 202611090009, chỉ đổi số bot.
create or replace function public.fco_jackpot_tick() returns public.fco_jackpot
language plpgsql security definer set search_path = '' as $$
declare
  j public.fco_jackpot;
  steps bigint; run integer; gain integer; roll double precision; special double precision; mini_odds double precision;
  won_at timestamptz; amount bigint; kind text; mini_done boolean;
  hunters constant integer := 140; -- số bot cùng săn quỹ (trước 40)
begin
  select * into j from public.fco_jackpot where id = 1 for update;
  steps := floor(extract(epoch from (now() - j.at)) / 2);
  if steps <= 0 then return j; end if;
  j.at := j.at + make_interval(secs => steps * 2);
  run := least(steps, 1800);
  mini_odds := 1 - power(1 - .001, hunters);
  mini_done := public.fco_jackpot_mini_done(j.feed);
  for i in 0 .. run - 1 loop
    if j.speed > 0 then j.speed := j.speed - 1;
    elsif random() < .05 then j.speed := 10 + floor(random() * 20)::int;
    else j.speed := 0; end if;
    gain := case when j.speed > 0 then 80 + floor(random() * 121)::int else 8 + floor(random() * 17)::int end;
    j.pot := j.pot + gain;
    continue when j.pot < 10000;
    roll := random();
    special := case when j.pot >= 20000 then 1 else least(.9, 1 - power(1 - least(.05, .002 * public.fco_jackpot_pressure(j.pot)), hunters)) end;
    if not mini_done then
      -- Vòng này chưa ai trúng Giải Phụ: bot chưa săn Giải Đặc Biệt, cơ hội đó dành cho Giải Phụ.
      continue when roll >= special;
      kind := 'mini'; amount := floor(j.pot / 10); j.pot := j.pot - amount; mini_done := true;
    elsif roll < special then
      kind := 'special'; amount := j.pot; j.pot := 2000; mini_done := false;
    elsif roll < special + mini_odds and j.pot - floor(j.pot / 10) >= 10000 then
      kind := 'mini'; amount := floor(j.pot / 10); j.pot := j.pot - amount;
    else continue; end if;
    won_at := j.at - make_interval(secs => (run - 1 - i) * 2);
    j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_bot_name(), 'amount', amount, 'kind', kind,
      'time', (extract(epoch from won_at) * 1000)::bigint));
  end loop;
  update public.fco_jackpot set pot = j.pot, at = j.at, speed = j.speed, feed = j.feed where id = 1;
  return j;
end;
$$;

commit;
