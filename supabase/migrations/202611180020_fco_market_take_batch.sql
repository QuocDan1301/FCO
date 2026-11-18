begin;

-- Sửa lỗi "Nhận tất cả" ở Lịch sử chuyển nhượng báo "Không kết nối được máy chủ" (người dùng 2026-11-18, ảnh TTCN nhiều dòng
-- "Hệ thống nhận · Chờ nhận … BP").
--   Nguyên nhân: fco_mkt_apply_kinds xử lý TỪNG dòng chờ nhận (mỗi thẻ bán là 1 dòng) và mỗi dòng chép lại cả bản lưu 3 lần
--   (balance, thêm thẻ, fco_inv_history dựng lại 200 dòng lịch sử). Từ khi bán liền tối đa 500 thẻ / lần, một người có hàng nghìn
--   dòng chờ → lệnh chạy quá giới hạn thời gian của Supabase, bị huỷ, game hiện lỗi mạng.
--   Sửa: gom cả loạt một lần — cộng tổng BP, thêm mọi thẻ một lần, đánh dấu đã nhận bằng một câu UPDATE.
--   Lịch sử: ≤ 30 dòng thì vẫn ghi từng dòng như cũ; nhiều hơn thì ghi 1 dòng tổng (BP bán được / thẻ mua được / thẻ trả về).
--   fco_mkt_take trả thêm gotBp / gotCards / count để game hiện thông báo gọn. Dùng chung cho fco_mkt_claim (fco_mkt_apply).
-- Chạy lại được.

create or replace function public.fco_mkt_apply_kinds(p_uid uuid, p_data jsonb, p_kinds text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := p_data; ids bigint[]; n integer; new_cards jsonb; got_bp bigint; got_cards integer; texts jsonb; entries jsonb;
  sell_n integer; sell_bp bigint; buy_n integer; ref_n integer; ref_bp bigint; now_ms bigint := public.fco_now_ms();
begin
  select coalesce(array_agg(s.id order by s.id), '{}') into ids from (
    select x.id from public.fco_mkt_deliveries x
    where x.user_id = p_uid and x.claimed_at is null and x.kind = any(p_kinds) order by x.id for update skip locked) s;
  n := cardinality(ids);
  if n = 0 then return jsonb_build_object('data', d, 'texts', '[]'::jsonb, 'bp', 0, 'cards', 0, 'count', 0); end if;

  select coalesce(jsonb_agg(x.card order by x.id desc) filter (where x.card is not null), '[]'::jsonb),
         coalesce(sum(x.bp), 0)::bigint,
         count(*) filter (where x.card is not null)::integer,
         coalesce(jsonb_agg(x.title || case when x.bp > 0 and x.card is null then ' (+' || public.fco_inv_money(x.bp) || ' BP)' else '' end order by x.id), '[]'::jsonb),
         count(*) filter (where x.kind = 'sell')::integer, coalesce(sum(x.bp) filter (where x.kind = 'sell'), 0)::bigint,
         count(*) filter (where x.kind = 'buy')::integer,
         count(*) filter (where x.kind = 'refund')::integer, coalesce(sum(x.bp) filter (where x.kind = 'refund'), 0)::bigint
    into new_cards, got_bp, got_cards, texts, sell_n, sell_bp, buy_n, ref_n, ref_bp
  from public.fco_mkt_deliveries x where x.id = any(ids);

  if n <= 30 then
    -- Như cũ: mỗi dòng một mục lịch sử, mới nhất lên đầu.
    select coalesce(jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'time', now_ms, 'type', 'market', 'title', x.title, 'detail', x.detail) order by x.id desc), '[]'::jsonb)
      into entries from public.fco_mkt_deliveries x where x.id = any(ids);
  else
    entries := '[]'::jsonb;
    if ref_n > 0 then entries := entries || jsonb_build_object('id', gen_random_uuid()::text, 'time', now_ms, 'type', 'market', 'title', 'TTCN · Nhận lại ' || ref_n || ' lệnh',
      'detail', 'Lệnh hết hạn / huỷ trả về' || case when ref_bp > 0 then ' · +' || public.fco_inv_money(ref_bp) || ' BP' else '' end); end if;
    if buy_n > 0 then entries := entries || jsonb_build_object('id', gen_random_uuid()::text, 'time', now_ms, 'type', 'market', 'title', 'TTCN · Nhận ' || buy_n || ' thẻ mua được',
      'detail', 'Nhận tất cả thẻ mua được vào kho'); end if;
    if sell_n > 0 then entries := entries || jsonb_build_object('id', gen_random_uuid()::text, 'time', now_ms, 'type', 'market', 'title', 'TTCN · Nhận BP ' || sell_n || ' lần bán',
      'detail', '+' || public.fco_inv_money(sell_bp) || ' BP (đã trừ phí)'); end if;
  end if;

  if got_cards > 0 then d := jsonb_set(d, '{cards}', new_cards || case when jsonb_typeof(d->'cards') = 'array' then d->'cards' else '[]'::jsonb end); end if;
  d := jsonb_set(d, '{balance}', to_jsonb(coalesce((d->>'balance')::bigint, 0) + got_bp));
  d := jsonb_set(d, '{history}', (select coalesce(jsonb_agg(e order by o), '[]'::jsonb) from (
      select e, o from jsonb_array_elements(entries) with ordinality a(e, o)
      union all
      select e, o + 100000 from jsonb_array_elements(case when jsonb_typeof(d->'history') = 'array' then d->'history' else '[]'::jsonb end) with ordinality b(e, o)
      order by o limit 200) h));
  update public.fco_mkt_deliveries set claimed_at = now() where id = any(ids);
  return jsonb_build_object('data', d, 'texts', texts, 'bp', got_bp, 'cards', got_cards, 'count', n);
end;
$$;

create or replace function public.fco_mkt_take(p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user(); d jsonb; applied jsonb;
begin
  if p_kind is null or p_kind not in ('buy', 'sell') then raise exception 'FCO_BAD_COUNT' using errcode = '22023'; end if;
  perform public.fco_mkt_settle();
  if not exists (select 1 from public.fco_mkt_deliveries where user_id = uid and claimed_at is null and kind in (p_kind, 'refund')) then
    return jsonb_build_object('texts', '[]'::jsonb, 'save', null, 'pending', public.fco_mkt_pending(uid), 'gotBp', 0, 'gotCards', 0, 'count', 0);
  end if;
  d := public.fco_inv_lock(uid);
  applied := public.fco_mkt_apply_kinds(uid, d, array[p_kind, 'refund']);
  return jsonb_build_object('texts', applied->'texts', 'save', public.fco_inv_store(uid, applied->'data'), 'pending', public.fco_mkt_pending(uid),
    'gotBp', applied->'bp', 'gotCards', applied->'cards', 'count', applied->'count');
end;
$$;

revoke all on function public.fco_mkt_apply_kinds(uuid, jsonb, text[]) from public, anon, authenticated;

commit;
