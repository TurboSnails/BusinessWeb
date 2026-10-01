-- Run only in a NEW, dedicated BusinessWeb Supabase project.
begin;

create table if not exists public.businessweb_grid_snapshot (
  id integer primary key check (id = 1),
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null default '{"schemaVersion":1,"records":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object'
    and payload @> '{"schemaVersion":1}'::jsonb
    and jsonb_typeof(payload -> 'records') = 'array')
);
alter table public.businessweb_grid_snapshot enable row level security;
revoke all on public.businessweb_grid_snapshot from public, anon, authenticated;
grant select, update on public.businessweb_grid_snapshot to service_role;

insert into public.businessweb_grid_snapshot (id) values (1) on conflict (id) do nothing;

-- UPDATE's row lock and revision predicate make concurrent writes atomic.
create or replace function public.businessweb_put_grid_snapshot(expected_revision bigint, next_payload jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.businessweb_grid_snapshot
  set payload = next_payload, revision = revision + 1, updated_at = now()
  where id = 1 and revision = expected_revision;
  return found;
end;
$$;
revoke all on function public.businessweb_put_grid_snapshot(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.businessweb_put_grid_snapshot(bigint, jsonb) to service_role;

commit;
