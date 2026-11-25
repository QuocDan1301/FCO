-- Quỹ Jackpot: bot lại được trúng Giải Đặc Biệt NHIỀU LẦN mỗi ngày + tăng số bot (người dùng 2026-11-25: "bot có thể trúng nhiều lần 1 ngày,
-- tăng số lượng bot lên").
--   · Bỏ giới hạn bot 1 lần Giải Đặc Biệt / ngày của 202611240001_fco_jackpot_daily_special.sql (và nhánh chạy lên trần của
--     202611240013_fco_jackpot_unstuck.sql): fco_jackpot_tick trở lại luật 202611090013 (Giải Phụ trước, rồi Giải Đặc Biệt; quỹ chạm 23.000 thì
--     chắc chắn có bot nổ). Cột special_day giữ lại nhưng không dùng.
--   · Số bot cùng săn quỹ: 140 → 300. Mỗi nhịp 2 giây, khi quỹ 13.000: bot nổ Giải Đặc Biệt ~45% (trước ~24%); bot trúng Giải Phụ ~26% (trước ~13%).
--     Quỹ bị bot ăn nhanh hơn → quỹ trung bình thấp hơn, người chơi khó gặp quỹ lớn hơn.
--   · Người chơi KHÔNG đổi: mỗi người vẫn tối đa 1 lần Giải Đặc Biệt / ngày (202611240002_fco_jackpot_player_daily.sql), tỉ lệ trúng giữ nguyên.
--   Khớp src/jackpot.ts (BOT_HUNTERS) — tests/bilac.test.ts, supabase/tests/fco-jackpot-daily-special.pglite.mjs.
--   Chạy SAU 202611240013_fco_jackpot_unstuck.sql. Chạy lại được.
begin;

create or replace function public.fco_jackpot_tick() returns public.fco_jackpot
language plpgsql security definer set search_path = '' as $$
declare
  j public.fco_jackpot;
  steps bigint; run integer; gain integer; roll double precision; special double precision; mini_odds double precision;
  won_at timestamptz; amount bigint; kind text; mini_done boolean;
  hunters constant integer := 300; -- số bot cùng săn quỹ (2026-11-25: 140 → 300; trước nữa 40)
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
    continue when j.pot < 13000;
    roll := random();
    special := case when j.pot >= 23000 then 1 else least(.9, 1 - power(1 - least(.05, .002 * public.fco_jackpot_pressure(j.pot)), hunters)) end;
    if not mini_done then
      -- Vòng này chưa ai trúng Giải Phụ: bot chưa săn Giải Đặc Biệt, cơ hội đó dành cho Giải Phụ.
      continue when roll >= special;
      kind := 'mini'; amount := floor(j.pot / 10); j.pot := j.pot - amount; mini_done := true;
    elsif roll < special then
      kind := 'special'; amount := j.pot; j.pot := 2000; mini_done := false;
    elsif roll < special + mini_odds and j.pot - floor(j.pot / 10) >= 13000 then
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
