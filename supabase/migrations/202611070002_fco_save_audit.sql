begin;

-- Theo dõi bất thường (phát hiện, không chặn): mỗi lần đồng bộ bản lưu, máy chủ so bản mới với bản cũ.
-- Mọi thao tác hợp lệ trong game đều thêm một dòng lịch sử (history) vào bản lưu, nên tăng mà không có dòng lịch sử tương ứng là đáng ngờ:
--   bp_no_source     BP tăng nhưng không có lịch sử bán thẻ (market), sự kiện (event) hay quà (gift)
--   packs_no_source  số gói chưa mở tăng nhưng không có lịch sử Shop (shop), sự kiện (event) hay quà (gift)
--   cards_no_source  số thẻ tăng nhưng không có lịch sử mở gói (pack) hay mua thẻ (market)
--   level_no_source  thẻ đang có lên cấp nhưng không có lịch sử nâng cấp (upgrade)
--   new_account_items  tài khoản mới mà bản lưu đầu tiên đã có BP / thẻ / gói
-- Người gian lận khéo vẫn giả được lịch sử; đây chỉ để admin biết tài khoản nào cần xem. Lỗi trong phần kiểm tra không bao giờ chặn việc lưu.

create table public.fco_save_audit (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  flags text[] not null,
  bp_before bigint, bp_after bigint,
  cards_before integer, cards_after integer,
  packs_before bigint, packs_after bigint,
  history_types text[] not null default '{}',
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);
create index fco_save_audit_time on public.fco_save_audit(reviewed, created_at desc);
alter table public.fco_save_audit enable row level security;
revoke all on public.fco_save_audit from anon, authenticated;

create function public.fco_save_numbers(p_data jsonb, out bp bigint, out cards integer, out packs bigint)
language plpgsql immutable set search_path = '' as $$
begin
  bp := case when jsonb_typeof(p_data->'balance') = 'number' then floor((p_data->>'balance')::numeric) else 0 end;
  cards := case when jsonb_typeof(p_data->'cards') = 'array' then jsonb_array_length(p_data->'cards') else 0 end;
  packs := coalesce((select sum(floor(v::text::numeric)) from jsonb_each(case when jsonb_typeof(p_data->'unopened') = 'object' then p_data->'unopened' else '{}' end) as t(k, v)
                     where jsonb_typeof(v) = 'number'), 0);
end;
$$;

create function public.fco_audit_save(p_uid uuid, p_revision bigint, p_old jsonb, p_new jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n record; ob bigint; oc integer; op bigint; flags text[] := '{}'; types text[]; raised boolean;
begin
  select * into n from public.fco_save_numbers(p_new);
  if p_old is null then
    if n.bp > 0 or n.cards > 0 or n.packs > 0 then flags := array['new_account_items']; end if;
    types := '{}';
  else
    select bp, cards, packs into ob, oc, op from public.fco_save_numbers(p_old);
    -- Loại dòng lịch sử mới (id chưa có trong bản cũ).
    select coalesce(array_agg(distinct e->>'type'), '{}') into types
    from jsonb_array_elements(case when jsonb_typeof(p_new->'history') = 'array' then p_new->'history' else '[]' end) e
    where not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_old->'history') = 'array' then p_old->'history' else '[]' end) x
                      where x->>'id' = e->>'id');
    if n.bp > ob and not types && array['market', 'event', 'gift'] then flags := flags || 'bp_no_source'::text; end if;
    if n.packs > op and not types && array['shop', 'event', 'gift'] then flags := flags || 'packs_no_source'::text; end if;
    if n.cards > oc and not types && array['pack', 'market'] then flags := flags || 'cards_no_source'::text; end if;
    if not 'upgrade' = any(types) then
      select exists (
        select 1 from jsonb_array_elements(p_new->'cards') c join jsonb_array_elements(p_old->'cards') d on d->>'uid' = c->>'uid'
        where jsonb_typeof(c->'level') = 'number' and jsonb_typeof(d->'level') = 'number' and (c->>'level')::numeric > (d->>'level')::numeric
      ) into raised;
      if raised then flags := flags || 'level_no_source'::text; end if;
    end if;
  end if;
  if cardinality(flags) > 0 then
    insert into public.fco_save_audit(user_id, revision, flags, bp_before, bp_after, cards_before, cards_after, packs_before, packs_after, history_types)
    values (p_uid, p_revision, flags, ob, n.bp, oc, n.cards, op, n.packs, types);
  end if;
exception when others then
  return; -- Kiểm tra lỗi (bản lưu lạ) thì bỏ qua, không chặn việc lưu.
end;
$$;

-- fco_commit_save: như bản 202611070001 (bỏ "fc"), thêm bước kiểm tra bất thường sau khi lưu.
create or replace function public.fco_commit_save(p_data jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.fco_game_saves;
  previous jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_revision is null or p_revision < 0 or p_data is null or jsonb_typeof(p_data) <> 'object'
    or p_data->>'version' is distinct from '1' or jsonb_typeof(p_data->'cards') is distinct from 'array'
    or octet_length(p_data::text) > 10000000 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  p_data := p_data - 'fc';
  if p_revision = 0 then
    insert into public.fco_game_saves(user_id, revision, data)
    values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
  else
    select data into previous from public.fco_game_saves where user_id = owner_id and revision = p_revision for update;
    update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'FCO_SAVE_CONFLICT' using errcode = 'P0001'; end if;
  perform public.fco_audit_save(owner_id, saved.revision, previous, p_data);
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$$;

-- Admin: danh sách bất thường (mới nhất trước), mặc định chỉ dòng chưa xem.
create function public.fco_admin_anomalies(p_limit integer default 100, p_include_reviewed boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform public.fco_require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'time', (extract(epoch from a.created_at) * 1000)::bigint, 'login', split_part(u.email, '@', 1),
      'flags', to_jsonb(a.flags), 'bpBefore', a.bp_before, 'bpAfter', a.bp_after, 'cardsBefore', a.cards_before, 'cardsAfter', a.cards_after,
      'packsBefore', a.packs_before, 'packsAfter', a.packs_after, 'history', to_jsonb(a.history_types), 'reviewed', a.reviewed) order by a.created_at desc), '[]')
  into result
  from (select * from public.fco_save_audit where p_include_reviewed or not reviewed order by created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) a
  join auth.users u on u.id = a.user_id;
  return result;
end;
$$;

-- Admin: đánh dấu đã xem (một dòng, hoặc mọi dòng của một tài khoản khi p_all = true).
create function public.fco_admin_anomaly_review(p_id bigint, p_all boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  perform public.fco_require_admin();
  select user_id into target from public.fco_save_audit where id = p_id;
  update public.fco_save_audit set reviewed = true where id = p_id or (p_all and user_id = target);
  return public.fco_admin_anomalies();
end;
$$;

revoke all on function public.fco_save_numbers(jsonb), public.fco_audit_save(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fco_admin_anomalies(integer, boolean), public.fco_admin_anomaly_review(bigint, boolean) from public, anon;
grant execute on function public.fco_admin_anomalies(integer, boolean), public.fco_admin_anomaly_review(bigint, boolean) to authenticated;

commit;
