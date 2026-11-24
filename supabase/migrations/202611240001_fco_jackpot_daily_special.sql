-- Quỹ Jackpot: Giải Đặc Biệt chỉ nổ tối đa 1 lần mỗi ngày (2026-11-24, sau 202611090013).
--   · Thêm cột fco_jackpot.special_day = ngày (giờ Việt Nam) đã có người trúng Giải Đặc Biệt.
--   · Bot (fco_jackpot_tick) chỉ nổ Giải Đặc Biệt khi hôm nay chưa ai trúng; nhịp tick đầu tiên thấy có người chơi trúng Giải Đặc Biệt hôm nay
--     (đọc từ bảng tin trúng) cũng đặt special_day = hôm nay. Quỹ vẫn tích lũy trong ngày; qua 00:00 bot lại được nổ.
--   · Giải Phụ, tốc độ quỹ, số bot (140), tỉ lệ và mức quỹ sau khi nổ (2.000 FC) không đổi; tỉ lệ trúng của người chơi không đổi.
--   Chạy sau 202611230002_fco_inventory_cap.sql.
begin;

alter table public.fco_jackpot add column if not exists special_day date;

create or replace function public.fco_jackpot_tick() returns public.fco_jackpot
language plpgsql security definer set search_path = '' as $$
declare
  j public.fco_jackpot;
  steps bigint; run integer; gain integer; roll double precision; special double precision; mini_odds double precision;
  won_at timestamptz; amount bigint; kind text; mini_done boolean;
  hunters constant integer := 140; -- số bot cùng săn quỹ (trước 40)
  today date := public.fco_today(); day_start_ms bigint; blocked boolean; special_raw double precision;
begin
  select * into j from public.fco_jackpot where id = 1 for update;
  steps := floor(extract(epoch from (now() - j.at)) / 2);
  if steps <= 0 then return j; end if;
  j.at := j.at + make_interval(secs => steps * 2);
  run := least(steps, 1800);
  mini_odds := 1 - power(1 - .001, hunters);
  mini_done := public.fco_jackpot_mini_done(j.feed);
  -- Giải Đặc Biệt tối đa 1 lần mỗi ngày (giờ Việt Nam): hôm nay đã có người (bot hoặc người chơi) trúng thì bot không nổ Giải Đặc Biệt nữa.
  day_start_ms := (extract(epoch from (today::timestamp at time zone 'Asia/Ho_Chi_Minh')) * 1000)::bigint;
  if j.special_day is distinct from today and exists (select 1 from jsonb_array_elements(j.feed) e where e->>'kind' = 'special' and (e->>'time')::bigint >= day_start_ms) then
    j.special_day := today;
  end if;
  blocked := j.special_day is not distinct from today;
  for i in 0 .. run - 1 loop
    if j.speed > 0 then j.speed := j.speed - 1;
    elsif random() < .05 then j.speed := 10 + floor(random() * 20)::int;
    else j.speed := 0; end if;
    gain := case when j.speed > 0 then 80 + floor(random() * 121)::int else 8 + floor(random() * 17)::int end;
    j.pot := j.pot + gain;
    continue when j.pot < 13000;
    roll := random();
    special_raw := case when j.pot >= 23000 then 1 else least(.9, 1 - power(1 - least(.05, .002 * public.fco_jackpot_pressure(j.pot)), hunters)) end;
    special := case when blocked then 0 else special_raw end;
    if not mini_done then
      -- Vòng này chưa ai trúng Giải Phụ: bot chưa săn Giải Đặc Biệt, cơ hội đó dành cho Giải Phụ.
      continue when roll >= special_raw;
      kind := 'mini'; amount := floor(j.pot / 10); j.pot := j.pot - amount; mini_done := true;
    elsif roll < special then
      kind := 'special'; amount := j.pot; j.pot := 2000; mini_done := false; j.special_day := today; blocked := true;
    elsif roll < special + mini_odds and j.pot - floor(j.pot / 10) >= 13000 then
      kind := 'mini'; amount := floor(j.pot / 10); j.pot := j.pot - amount;
    else continue; end if;
    won_at := j.at - make_interval(secs => (run - 1 - i) * 2);
    j.feed := public.fco_jackpot_push(j.feed, jsonb_build_object('name', public.fco_bot_name(), 'amount', amount, 'kind', kind,
      'time', (extract(epoch from won_at) * 1000)::bigint));
  end loop;
  update public.fco_jackpot set pot = j.pot, at = j.at, speed = j.speed, feed = j.feed, special_day = j.special_day where id = 1;
  return j;
end;
$$;

commit;
