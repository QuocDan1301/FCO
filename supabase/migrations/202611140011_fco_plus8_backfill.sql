begin;

-- Bù BXH "Đập 8 liền tay" (2026-11-14): kho máy chủ chưa bắt buộc + dữ liệu lệch nên game người chơi đập thẻ ngay trên trình duyệt,
-- máy chủ không ghi được lượt +8 nào (người dùng kiểm: 0 lượt ghi / 11 lượt đập lên +8 trong 24 giờ).
-- Lấy từ lịch sử bản lưu: mục đập thẻ THÀNH CÔNG có "→ +8" từ 0h 14/11/2026 giờ VN; tên cầu thủ ở tiêu đề ("Thành công · <tên>") ghép với
-- thẻ +8 trở lên người đó đang giữ để biết đúng cầu thủ / mùa (trùng tên nhiều mùa thì lấy id nhỏ nhất; thẻ đã bán thì bỏ qua).
-- Mỗi (HLV, cầu thủ) một lần, thời điểm = lúc đập trong lịch sử. Chạy lại được (on conflict do nothing).

insert into public.fco_plus8(user_id, player_id, at)
select distinct on (s.user_id, p.id) s.user_id, p.id, to_timestamp((e->>'time')::double precision / 1000)
  from public.fco_game_saves s
  cross join lateral jsonb_array_elements(case when jsonb_typeof(s.data->'history') = 'array' then s.data->'history' else '[]'::jsonb end) e
  join lateral (
    select c.id from jsonb_array_elements(case when jsonb_typeof(s.data->'cards') = 'array' then s.data->'cards' else '[]'::jsonb end) card
      join public.fco_cat_players c on c.id = (card->>'playerId')::integer
     where (card->>'level')::integer >= 8 and c.name = regexp_replace(e->>'title', '^Thành công · ', '')
     order by c.id limit 1) p on true
 where e->>'type' = 'upgrade' and e->>'success' = 'true' and e->>'detail' ~ '→ \+8( |$)'
   and jsonb_typeof(e->'time') = 'number' and (e->>'time')::double precision >= extract(epoch from timestamptz '2026-11-14 00:00:00+07') * 1000
 order by s.user_id, p.id, (e->>'time')::double precision
on conflict do nothing;

commit;

-- Kết quả: số lượt +8 trên BXH sau khi bù.
select count(*) as so_luot_tren_bxh from public.fco_plus8;
