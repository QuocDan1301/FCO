-- Hiện đầy đủ tên HLV (2026-11-09): bỏ che tên bằng '***' trên BXH HLV và bảng tin trúng Giải Đặc Biệt / Giải Phụ.
--   Tên HLV là tên đăng nhập (email nội bộ <tên>@players.fco.invalid, xem src/account-identity.ts), giống tên bot vốn đã hiện đủ.
--   Tài khoản cũ đăng nhập bằng email thật vẫn che như trước để không lộ địa chỉ email của người chơi.
--   Bảng tin jackpot đã lưu sẵn tên bị che: đổi lại theo cách mới cho các dòng của người chơi thật (có uid); dòng của bot giữ nguyên.
begin;

create or replace function public.fco_public_name(p_uid uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when lower(split_part(e, '@', 2)) = 'players.fco.invalid' then n
              when length(n) > 3 then left(n, 3) || '***' else left(n, 1) || '***' end
  from (select coalesce(email, 'player') as e, split_part(coalesce(email, 'player'), '@', 1) as n from auth.users where id = p_uid) u
$$;

update public.fco_jackpot set feed = (
  select coalesce(jsonb_agg(case when e ? 'uid'
      then jsonb_set(e, '{name}', to_jsonb(coalesce(public.fco_public_name((e->>'uid')::uuid), e->>'name')))
      else e end order by n), '[]'::jsonb)
  from jsonb_array_elements(feed) with ordinality as t(e, n))
where id = 1;

commit;
