begin;

-- Sửa lag toàn game (2026-11-14): các lệnh người chơi gọi định kỳ để XEM số liệu đang khóa dòng dùng chung, xếp hàng sau các lượt quay
-- (lượt quay giữ khóa tới khi ghi xong kho), dồn ứ kết nối máy chủ → mọi màn đều chậm.
--   1. fco_jackpot_state (mỗi 6 giây / người ở trang sự kiện): chỉ cập nhật quỹ (bot săn) khi đã quá 4 giây và dòng Jackpot đang rảnh
--      (for update skip locked); còn lại đọc thẳng, không chờ khóa, không ghi đĩa.
--   2. fco_vqtg_sync_mini (gọi trong fco_vqtg_config mỗi 20 giây): không có lần nổ mới thì chỉ đọc; có thì khóa nếu rảnh.
-- fco_jackpot_tick (dùng trong lượt quay) giữ nguyên khóa chặt để quỹ không lệch. Chạy lại được.

create or replace function public.fco_jackpot_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); j public.fco_jackpot;
begin
  select * into j from public.fco_jackpot where id = 1;
  if j.at < now() - interval '4 seconds' then
    perform 1 from public.fco_jackpot where id = 1 for update skip locked;
    if found then j := public.fco_jackpot_tick(); end if;
  end if;
  return public.fco_jackpot_view(j, uid);
end;
$$;

-- Như 202611130013, thêm đường nhanh không khóa.
create or replace function public.fco_vqtg_sync_mini() returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare st public.fco_vqtg_state; e jsonb; newest bigint;
begin
  -- Đường nhanh không khóa: không có lần Jackpot nổ nào mới thì chỉ đọc (gọi mỗi 20 giây từ mọi người chơi, không được xếp hàng).
  select * into st from public.fco_vqtg_state where id = 1;
  if not exists (select 1 from public.fco_jackpot j, jsonb_array_elements(j.feed) x
                 where j.id = 1 and x->>'kind' = 'special' and (x->>'time')::bigint > st.jp_synced) then
    return st.feed;
  end if;
  -- Có tin mới: khóa nếu rảnh; đang có người giữ khóa (lượt quay) thì để lần sau ghi, trả tin hiện có.
  select * into st from public.fco_vqtg_state where id = 1 for update skip locked;
  if not found then return (select feed from public.fco_vqtg_state where id = 1); end if;
  newest := st.jp_synced;
  for e in select x from public.fco_jackpot j, jsonb_array_elements(j.feed) with ordinality t(x, n)
           where j.id = 1 and x->>'kind' = 'special' and (x->>'time')::bigint > st.jp_synced order by (x->>'time')::bigint loop
    st.feed := public.fco_jackpot_push(st.feed, jsonb_build_object('name', public.fco_bot_name(),
      'amount', (e->>'amount')::bigint * (public.fco_vqtg_rules()->>'bpPerJackpotFc')::bigint, 'time', (e->>'time')::bigint));
    newest := greatest(newest, (e->>'time')::bigint);
  end loop;
  if newest > st.jp_synced then update public.fco_vqtg_state set feed = st.feed, jp_synced = newest where id = 1; end if;
  return st.feed;
end;
$$;

commit;
