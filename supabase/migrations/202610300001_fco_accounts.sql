begin;

-- Email/password accounts are managed by Supabase Auth, never by the game client.
create table public.fco_game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'version' = '1' and jsonb_typeof(data->'cards') = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.fco_game_saves enable row level security;
revoke all on public.fco_game_saves from anon, authenticated;
grant select on public.fco_game_saves to authenticated;
create policy "Read own FCO save" on public.fco_game_saves for select to authenticated
  using ((select auth.uid()) = user_id);

-- Atomic compare-and-swap prevents a stale device from overwriting a newer save.
-- Only this function writes; its owner check comes from the verified JWT.
create function public.fco_commit_save(p_data jsonb, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.fco_game_saves;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_revision is null or p_revision < 0 or p_data is null or jsonb_typeof(p_data) <> 'object'
    or p_data->>'version' is distinct from '1' or jsonb_typeof(p_data->'cards') is distinct from 'array'
    or octet_length(p_data::text) > 10000000 then
    raise exception 'Invalid save' using errcode = '22023';
  end if;
  if p_revision = 0 then
    insert into public.fco_game_saves(user_id, revision, data)
    values (owner_id, 1, p_data) on conflict (user_id) do nothing returning * into saved;
  else
    update public.fco_game_saves set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = p_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'FCO_SAVE_CONFLICT' using errcode = 'P0001'; end if;
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$$;
revoke all on function public.fco_commit_save(jsonb, bigint) from public, anon;
grant execute on function public.fco_commit_save(jsonb, bigint) to authenticated;

commit;
