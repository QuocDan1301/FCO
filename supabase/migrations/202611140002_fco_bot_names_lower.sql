begin;

-- Tên bot luôn chữ thường (2026-11-14, người dùng): bỏ kiểu viết hoa 3 chữ đầu (vd. "KHAphuc598" → "khaphuc598").
-- Đổi luôn tên bot đã có trong bảng tin Jackpot FC (fco_jackpot.feed) và tin Mini Jackpot VQTG (fco_vqtg_state.feed): chỉ tin không có uid
-- (bot); tên người chơi thật giữ nguyên. Tên đội máy GLXH ("FC Sấm Sét"…) là tên CLB, không đổi. Chạy lại được.

-- Như 202611070001, bỏ dòng viết hoa.
create or replace function public.fco_bot_name() returns text language plpgsql volatile set search_path = '' as $$
declare
  s text[] := array['thim','trinh','duc','anh','khoa','minh','tuan','huy','nam','long','quan','bao','phuc','dat','vinh','son','kha','hieu'];
  n text;
begin
  n := s[1 + floor(random() * 18)::int] || s[1 + floor(random() * 18)::int];
  if random() < .5 then n := n || left(s[1 + floor(random() * 18)::int], 2); end if;
  if random() < .7 then n := n || floor(random() * 1000)::int::text; end if;
  return n;
end;
$$;

update public.fco_jackpot set feed = coalesce((select jsonb_agg(case when e ? 'uid' then e else jsonb_set(e, '{name}', to_jsonb(lower(e->>'name'))) end order by n)
  from jsonb_array_elements(feed) with ordinality t(e, n)), '[]'::jsonb) where id = 1;
update public.fco_vqtg_state set feed = coalesce((select jsonb_agg(case when e ? 'uid' then e else jsonb_set(e, '{name}', to_jsonb(lower(e->>'name'))) end order by n)
  from jsonb_array_elements(feed) with ordinality t(e, n)), '[]'::jsonb) where id = 1;

commit;
