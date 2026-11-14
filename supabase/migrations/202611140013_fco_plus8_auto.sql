begin;

-- BXH "Đập 8 liền tay" tự bù (2026-11-14, người dùng: "bxh thiếu người chơi đập lên 8 từ 9h30 rồi"): khi kho thẻ CHƯA bắt buộc, game người
-- chơi đập thẻ ngay trên trình duyệt nên máy chủ không ghi được lượt +8; 202611140011 chỉ bù một lần. Từ đây mỗi lần game lưu lên
-- (fco_commit_save) máy chủ đọc lịch sử của chính bản lưu đó và ghi lượt +8 còn thiếu — cùng luật 202611140011: mục THÀNH CÔNG "→ +8" từ
-- 0h 14/11/2026 giờ VN, ghép tên với thẻ +8 trở lên đang giữ. Chỉ chạy khi kho chưa bắt buộc. Chạy lại được; cuối file bù lại cho mọi người.

create or replace function public.fco_plus8_from_history(p_uid uuid, p_data jsonb) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare n integer;
begin
  if p_uid is null or jsonb_typeof(p_data->'history') <> 'array' or jsonb_typeof(p_data->'cards') <> 'array' then return 0; end if;
  -- Không có mục đập +8 mới thì thôi (đa số lần lưu): khỏi ghép thẻ.
  if not exists (select 1 from jsonb_array_elements(p_data->'history') e
                  where e->>'type' = 'upgrade' and e->>'success' = 'true' and e->>'detail' ~ '→ \+8( |$)'
                    and jsonb_typeof(e->'time') = 'number' and (e->>'time')::double precision >= extract(epoch from timestamptz '2026-11-14 00:00:00+07') * 1000) then
    return 0;
  end if;
  insert into public.fco_plus8(user_id, player_id, at)
  select distinct on (p.id) p_uid, p.id, to_timestamp((e->>'time')::double precision / 1000)
    from jsonb_array_elements(p_data->'history') e
    join lateral (
      select c.id from jsonb_array_elements(p_data->'cards') card
        join public.fco_cat_players c on c.id = (card->>'playerId')::integer
       where (card->>'level')::integer >= 8 and c.name = regexp_replace(e->>'title', '^Thành công · ', '')
       order by c.id limit 1) p on true
   where e->>'type' = 'upgrade' and e->>'success' = 'true' and e->>'detail' ~ '→ \+8( |$)'
     and jsonb_typeof(e->'time') = 'number' and (e->>'time')::double precision >= extract(epoch from timestamptz '2026-11-14 00:00:00+07') * 1000
   order by p.id, (e->>'time')::double precision
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.fco_plus8_from_history(uuid, jsonb) from public, anon, authenticated;

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
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$function$;

-- Bù ngay cho mọi người (lượt +8 từ sau lần chạy 202611140011).
select sum(public.fco_plus8_from_history(user_id, data)) as so_luot_vua_bu from public.fco_game_saves;

commit;

select count(*) as so_luot_tren_bxh from public.fco_plus8;
