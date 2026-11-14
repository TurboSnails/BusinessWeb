begin;
create table if not exists public.businessweb_plan_snapshot (
  id integer primary key check (id = 1),
  revision bigint not null default 0 check (revision between 0 and 9007199254740990),
  payload jsonb null,
  updated_at timestamptz not null default now(),
  check (payload is null or (
    jsonb_typeof(payload) = 'object'
    and payload @> '{"schemaVersion":1}'::jsonb
    and octet_length(payload::text) <= 524288
  ))
);
alter table public.businessweb_plan_snapshot enable row level security;
revoke all on public.businessweb_plan_snapshot from public, anon, authenticated;
grant select, update on public.businessweb_plan_snapshot to service_role;
insert into public.businessweb_plan_snapshot (id) values (1)
  on conflict (id) do nothing;

create or replace function public.businessweb_put_plan_snapshot(
  expected_revision bigint, next_payload jsonb
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare result_revision bigint;
begin
  if expected_revision < 0 or expected_revision >= 9007199254740990
    or next_payload is null
    or jsonb_typeof(next_payload) <> 'object'
    or not (next_payload @> '{"schemaVersion":1}'::jsonb)
    or octet_length(next_payload::text) > 524288 then
    raise exception 'invalid plan payload';
  end if;
  update public.businessweb_plan_snapshot
    set payload = next_payload, revision = revision + 1, updated_at = now()
    where id = 1 and revision = expected_revision
    returning revision into result_revision;
  return result_revision; -- NULL means CAS conflict; UPDATE holds row lock
end;
$$;
revoke all on function public.businessweb_put_plan_snapshot(bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.businessweb_put_plan_snapshot(bigint,jsonb)
  to service_role;
notify pgrst, 'reload schema';
commit;
