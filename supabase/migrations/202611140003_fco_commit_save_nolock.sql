begin;

-- Giảm Disk IO (2026-11-14): fco_commit_save chiếm ~1,2 GB ghi log (72.868 lần, pg_stat_statements). Game nay gom thay đổi 6 giây mới gửi
-- (src/cloud-save.ts); máy chủ so bản gửi lên với bản đang có KHÔNG khóa trước — giống hệt thì trả luôn, chỉ khóa + ghi khi thật sự khác.
-- Như 202611120014, chỉ thêm bước so không khóa. Chạy lại được.

create or replace function public.fco_commit_save(p_data jsonb, p_revision bigint, p_merge boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := public.fco_require_account();
  saved public.fco_game_saves;
  previous jsonb;
  merge boolean := coalesce(p_merge, false) or coalesce((select enforced from public.fco_inventory where id = 1), false);
begin
  if p_revision is null or p_revision < 0 or p_data is null or jsonb_typeof(p_data) <> 'object'
    or p_data->>'version' is distinct from '1' or jsonb_typeof(p_data->'cards') is distinct from 'array'
    or octet_length(p_data::text) > 10000000 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  p_data := p_data - 'fc' - 'stp';
  if merge then
    -- So trước KHÔNG khóa (202611140003): gửi lại giống hệt bản đang có thì trả luôn, khỏi khóa dòng (khóa dòng cũng ghi đĩa).
    select * into saved from public.fco_game_saves where user_id = owner_id;
    if found and public.fco_inv_merge(saved.data, p_data - 'fc' - 'stp') = saved.data then
      return jsonb_build_object('revision', saved.revision, 'data', saved.data);
    end if;
    saved := null;
    select data into previous from public.fco_game_saves where user_id = owner_id for update;
    if found then
      p_data := public.fco_inv_merge(previous, p_data);
      -- Gộp xong giống hệt bản đang có (game gửi lại sau một thao tác kho, chỉ khác FC / phần máy chủ giữ): không ghi lại.
      if p_data = previous then
        select * into saved from public.fco_game_saves where user_id = owner_id;
        return jsonb_build_object('revision', saved.revision, 'data', saved.data);
      end if;
      update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now() where user_id = owner_id returning * into saved;
    else
      if coalesce((select enforced from public.fco_inventory where id = 1), false) then
        p_data := p_data || '{"cards": [], "balance": 0, "unopened": {}, "opened": 0, "upgrades": 0, "taxVouchers": {}}'::jsonb;
      end if;
      insert into public.fco_game_saves(user_id, revision, data) values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
    end if;
  elsif p_revision = 0 then
    insert into public.fco_game_saves(user_id, revision, data)
    values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
  else
    select data into previous from public.fco_game_saves where user_id = owner_id and revision = p_revision for update;
    update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'FCO_SAVE_CONFLICT' using errcode = 'P0001'; end if;
  perform public.fco_audit_save(owner_id, saved.revision, previous, saved.data);
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$$;

commit;
