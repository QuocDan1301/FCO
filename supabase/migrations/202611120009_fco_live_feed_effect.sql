-- Dòng LIVE (2026-11-12, sau 202611120008): mỗi tin kèm tên + hiệu ứng tên Premium hiện tại của HLV
-- để game tô hiệu ứng lên tên trong câu (giống BXH). Hiệu ứng chỉ có khi Premium còn hạn (fco_name_effect).
begin;

create or replace function public.fco_live_feed() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', (extract(epoch from at) * 1000)::bigint, 'kind', kind, 'text', text,
      'name', case when user_id is null then null else public.fco_public_name(user_id) end,
      'effect', case when user_id is null then null else public.fco_name_effect(user_id) end) order by id desc), '[]')
  from (select * from public.fco_live_feed where at > now() - interval '24 hours' order by id desc limit 20) s
$$;

commit;
