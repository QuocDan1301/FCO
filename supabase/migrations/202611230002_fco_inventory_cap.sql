-- Giới hạn kho thẻ 200 (2026-11-23, người dùng: "Cầu thủ của tôi 15/200", chọn "giới hạn kho thật 200 thẻ").
--   · Kho tối đa 200 thẻ: mọi thao tác làm tăng số thẻ vượt 200 (mở gói, mua từ hệ thống, nhận thẻ đã mua, quà sự kiện, quà admin dạng thẻ…) bị từ chối
--     với FCO_INVENTORY_FULL và hoàn tác nguyên thao tác (không mất BP / gói / FC).
--   · Chặn bằng trigger trên fco_game_saves nên mọi hàm ghi kho (fco_inv_store…) đều chịu chung, không sót đường nào.
--   · Miễn giới hạn: tài khoản ĐANG có trên 200 thẻ lúc chạy migration (ghi vào fco_inv_cap_exempt, giữ thẻ, vẫn nhận thêm) và acc phụ (fco_sub_accounts).
--   · Chỉ chặn khi số thẻ TĂNG và vượt 200; bán / xoá / đập thẻ làm giảm số thẻ luôn được.
-- Chạy lại được (không xoá danh sách miễn đã có; chạy lại chỉ thêm tài khoản đang >200).
begin;

create table if not exists public.fco_inv_cap_exempt (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cards integer not null,
  created_at timestamptz not null default now()
);
alter table public.fco_inv_cap_exempt enable row level security;
revoke all on public.fco_inv_cap_exempt from anon, authenticated;

insert into public.fco_inv_cap_exempt (user_id, cards)
select s.user_id, jsonb_array_length(s.data->'cards')
from public.fco_game_saves s
where jsonb_typeof(s.data->'cards') = 'array' and jsonb_array_length(s.data->'cards') > 200
on conflict (user_id) do nothing;

create or replace function public.fco_inv_cap_guard() returns trigger language plpgsql security definer set search_path = '' as $$
declare n_new integer; n_old integer;
begin
  n_new := case when jsonb_typeof(new.data->'cards') = 'array' then jsonb_array_length(new.data->'cards') else 0 end;
  if n_new <= 200 then return new; end if;
  n_old := case when jsonb_typeof(old.data->'cards') = 'array' then jsonb_array_length(old.data->'cards') else 0 end;
  if n_new <= n_old then return new; end if;
  if exists (select 1 from public.fco_inv_cap_exempt x where x.user_id = new.user_id) or public.fco_is_sub(new.user_id) then return new; end if;
  raise exception 'FCO_INVENTORY_FULL' using errcode = 'P0001';
end;
$$;
revoke all on function public.fco_inv_cap_guard() from public, anon, authenticated;

drop trigger if exists fco_inv_cap_guard on public.fco_game_saves;
create trigger fco_inv_cap_guard before update of data on public.fco_game_saves
  for each row execute function public.fco_inv_cap_guard();

commit;
