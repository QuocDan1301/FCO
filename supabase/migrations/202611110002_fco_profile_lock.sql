-- Thông tin HLV chỉ lưu một lần (2026-11-11, sau 202611110001): giới tính / sinh nhật đã có trên máy chủ thì giữ nguyên,
-- trình duyệt chỉ điền thêm mục còn trống (src/ProfileCard.tsx). Áp dụng khi máy chủ gộp bản lưu (game bản mới đang để máy chủ
-- giữ kho, hoặc đã bật bắt buộc); bản lưu ghi đè kiểu cũ (chưa bắt buộc) thì như trước.
begin;

-- Như 202611100013, thêm khoá profile: các mục đã có của bản máy chủ thắng mục cùng tên của trình duyệt.
create or replace function public.fco_inv_merge(p_server jsonb, p_client jsonb) returns jsonb language sql stable set search_path = '' as $$
  select p_client - 'fc' || jsonb_build_object(
    'cards', coalesce(p_server->'cards', '[]'),
    'balance', coalesce(p_server->'balance', '0'),
    'unopened', coalesce(p_server->'unopened', '{}'),
    'opened', coalesce(p_server->'opened', '0'),
    'upgrades', coalesce(p_server->'upgrades', '0'),
    'history', coalesce((
      select jsonb_agg(e order by t desc, k)
      from (
        select e, t, k from (
          select distinct on (e->>'id') e, coalesce((e->>'time')::double precision, 0) as t, e->>'id' as k
          from (
            select e, 0 as src from jsonb_array_elements(case when jsonb_typeof(p_server->'history') = 'array' then p_server->'history' else '[]'::jsonb end) e
            union all
            select e, 1 from jsonb_array_elements(case when jsonb_typeof(p_client->'history') = 'array' then p_client->'history' else '[]'::jsonb end) e
          ) u where jsonb_typeof(e) = 'object'
          order by e->>'id', src
        ) d order by t desc, k limit 200
      ) top), '[]'))
  || case when jsonb_typeof(p_server->'profile') = 'object' or jsonb_typeof(p_client->'profile') = 'object'
       then jsonb_build_object('profile',
         (case when jsonb_typeof(p_client->'profile') = 'object' then p_client->'profile' else '{}'::jsonb end)
         || (case when jsonb_typeof(p_server->'profile') = 'object' then jsonb_strip_nulls(p_server->'profile') else '{}'::jsonb end))
       else '{}'::jsonb end
$$;
revoke all on function public.fco_inv_merge(jsonb, jsonb) from public, anon, authenticated;

commit;
