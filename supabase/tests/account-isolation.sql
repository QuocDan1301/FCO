-- Run in SQL Editor as postgres. All test identities and saves are rolled back.
begin;
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  result jsonb;
  visible_rows integer;
begin
  insert into auth.users(id, aud, role) values (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated');
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  result := public.fco_commit_save('{"version":1,"cards":[],"marker":"a"}', 0);
  if result->>'revision' <> '1' then raise exception 'Initial revision failed'; end if;
  result := public.fco_commit_save('{"version":1,"cards":[],"marker":"a-new"}', 1);
  if result->>'revision' <> '2' then raise exception 'Revision increment failed'; end if;
  begin
    perform public.fco_commit_save('{"version":1,"cards":[],"marker":"stale"}', 1);
    raise exception 'Stale write was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'FCO_SAVE_CONFLICT' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', b::text, true);
  select count(*) into visible_rows from public.fco_game_saves;
  if visible_rows <> 0 then raise exception 'Account B can read account A'; end if;
  perform public.fco_commit_save('{"version":1,"cards":[],"marker":"b"}', 0);
  select count(*) into visible_rows from public.fco_game_saves;
  if visible_rows <> 1 then raise exception 'Own save is not readable'; end if;
  begin
    update public.fco_game_saves set data = '{}' where user_id = a;
    raise exception 'Direct writes were accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.fco_commit_save('{"version":1,"cards":[]}', 0);
    raise exception 'Unauthenticated write was accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;
rollback;
select 'PASS: isolated accounts, own reads, revision conflicts, direct-write and unauthenticated protection; test data rolled back' as result;
