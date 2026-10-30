begin;
-- This function never accepts another user's UUID. Deletion requires a fresh
-- password sign-in, rather than merely possessing an old refresh/access token.
create function public.fco_delete_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  recent_password boolean;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
    where method->>'method' = 'password'
      and (method->>'timestamp')::numeric >= extract(epoch from now()) - 300
      and (method->>'timestamp')::numeric <= extract(epoch from now()) + 30
  ) into recent_password;
  if not recent_password then raise exception 'FCO_REAUTH_REQUIRED' using errcode = '42501'; end if;
  delete from auth.users where id = owner_id;
  if not found then raise exception 'FCO_ACCOUNT_NOT_FOUND' using errcode = '42501'; end if;
  -- fco_game_saves and Auth sessions/identities cascade from auth.users.
  return jsonb_build_object('deleted', true);
end;
$$;
revoke all on function public.fco_delete_account() from public, anon;
grant execute on function public.fco_delete_account() to authenticated;
commit;
