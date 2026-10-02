-- 研究笔记「候选池」云同步。只在独立的 BusinessWeb Supabase 项目执行；幂等，重复执行不清空数据。
begin;

create table if not exists public.businessweb_candidates_snapshot (
  id integer primary key check (id = 1),
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null default '{"schemaVersion":1,"items":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object'
    and payload @> '{"schemaVersion":1}'::jsonb
    and jsonb_typeof(payload -> 'items') = 'array'
    and jsonb_array_length(payload -> 'items') <= 2000)
);
alter table public.businessweb_candidates_snapshot enable row level security;
revoke all on public.businessweb_candidates_snapshot from public, anon, authenticated;
grant select, update on public.businessweb_candidates_snapshot to service_role;
insert into public.businessweb_candidates_snapshot (id) values (1) on conflict (id) do nothing;

-- 乐观并发：'ok' 写入成功（revision + 1）；'conflict' 版本号不匹配，其他设备已更新
create or replace function public.businessweb_put_candidates_snapshot(expected_revision bigint, next_payload jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cur_revision bigint;
begin
  select revision into cur_revision from public.businessweb_candidates_snapshot where id = 1 for update;
  if not found or cur_revision <> expected_revision then return 'conflict'; end if;
  update public.businessweb_candidates_snapshot
    set payload = next_payload, revision = revision + 1, updated_at = now()
    where id = 1;
  return 'ok';
end;
$$;
revoke all on function public.businessweb_put_candidates_snapshot(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.businessweb_put_candidates_snapshot(bigint, jsonb) to service_role;

commit;
