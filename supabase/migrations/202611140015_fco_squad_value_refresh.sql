begin;

-- Sửa báo nhầm "Khai khống giá trị đội hình" (2026-11-14, người dùng: "tại sao vẫn còn lỗi khai khống đội hình"):
-- game báo giá trị đội hình ~3 giây sau khi đổi đội hình nhưng bản lưu (chứa đội hình mới) gửi sau ~6 giây, nên máy chủ tính trên
-- đội hình CŨ và ghi nhầm squad_value. Từ đây:
--   • fco_rank_squad bỏ ghi sổ nghi vấn (không phân biệt được với lệch thời gian), vẫn tự tính số thật.
--   • fco_commit_save tính lại giá trị đội hình mỗi lần lưu (chỉ ghi fco_ranks khi số đổi) → BXH đúng đội hình mới.
--   • Xoá các dòng squad_value đã ghi nhầm.
-- Chạy lại được.

create or replace function public.fco_squad_rank_refresh(p_uid uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v bigint := public.fco_squad_value(p_uid);
begin
  if v is null then return; end if;
  if v = 0 and not exists (select 1 from public.fco_ranks where user_id = p_uid) then return; end if;
  insert into public.fco_ranks as r (user_id, squad_value, squad_at) values (p_uid, v, now())
  on conflict (user_id) do update set squad_value = excluded.squad_value, squad_at = excluded.squad_at
  where r.squad_value is distinct from excluded.squad_value;
end;
$$;
revoke all on function public.fco_squad_rank_refresh(uuid) from public, anon, authenticated;

create or replace function public.fco_rank_squad(p_value bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.fco_require_user();
begin
  if p_value is null or p_value not between 0 and 1000000000000000000 then raise exception 'FCO_RANK_INVALID' using errcode = 'P0001'; end if;
  perform public.fco_squad_rank_refresh(uid);
end;
$$;

create or replace function public.fco_commit_save(p_data jsonb, p_revision bigint, p_merge boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- 202611140010: kho máy chủ bắt buộc mà bản gửi lên có BP / gói / thẻ vượt xa máy chủ = sửa bản lưu (máy chủ vẫn giữ số của mình) -> ghi sổ.
    -- Kiểm trước bước "giống bản cũ" vì bản bị sửa chỉ khác phần máy chủ giữ nên sẽ trả về sớm ở đó.
    if found and coalesce((select enforced from public.fco_inventory where id = 1), false) and (
         coalesce((p_data->>'balance')::numeric, 0) > coalesce((saved.data->>'balance')::numeric, 0) * 10 + 10000000000
      or (select coalesce(sum(case when jsonb_typeof(v) = 'number' then v::text::numeric else 0 end), 0) from jsonb_each(case when jsonb_typeof(p_data->'unopened') = 'object' then p_data->'unopened' else '{}'::jsonb end) e(k, v)) > (select coalesce(sum(case when jsonb_typeof(v) = 'number' then v::text::numeric else 0 end), 0) from jsonb_each(case when jsonb_typeof(saved.data->'unopened') = 'object' then saved.data->'unopened' else '{}'::jsonb end) e(k, v)) + 100
      or jsonb_array_length(case when jsonb_typeof(p_data->'cards') = 'array' then p_data->'cards' else '[]'::jsonb end) > jsonb_array_length(case when jsonb_typeof(saved.data->'cards') = 'array' then saved.data->'cards' else '[]'::jsonb end) + 200) then
      perform public.fco_flag(owner_id, 'save_tamper', jsonb_build_object('bp', p_data->'balance', 'serverBp', saved.data->'balance',
        'cards', jsonb_array_length(case when jsonb_typeof(p_data->'cards') = 'array' then p_data->'cards' else '[]'::jsonb end), 'serverCards', jsonb_array_length(case when jsonb_typeof(saved.data->'cards') = 'array' then saved.data->'cards' else '[]'::jsonb end)));
    end if;
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
  -- 202611140013: kho chưa bắt buộc thì game đập thẻ ngay trên trình duyệt (máy chủ không thấy): ghi lượt +8 từ lịch sử bản lưu vừa lưu.
  -- Kho đã bắt buộc thì KHÔNG đọc lịch sử (máy chủ tự ghi khi đập; lịch sử gửi lên có thể bị chèn giả).
  if not coalesce((select enforced from public.fco_inventory where id = 1), false) then
    perform public.fco_plus8_from_history(owner_id, saved.data);
  end if;
  -- 202611140015: giá trị đội hình trên BXH cập nhật ngay khi bản lưu (đội hình mới) tới máy chủ.
  perform public.fco_squad_rank_refresh(owner_id);
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$function$;

delete from public.fco_cheat_flags where kind = 'squad_value';

commit;
