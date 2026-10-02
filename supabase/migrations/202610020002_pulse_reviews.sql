-- 每日复盘云同步。只在独立的 BusinessWeb Supabase 项目执行；幂等，重复执行不清空数据。
begin;

create table if not exists public.businessweb_pulse_snapshot (
  id integer primary key check (id = 1),
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null default '{"schemaVersion":1,"reviews":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(payload) = 'object'
    and payload @> '{"schemaVersion":1}'::jsonb
    and jsonb_typeof(payload -> 'reviews') = 'array'
    and jsonb_array_length(payload -> 'reviews') <= 500)
);
alter table public.businessweb_pulse_snapshot enable row level security;
revoke all on public.businessweb_pulse_snapshot from public, anon, authenticated;
grant select, update on public.businessweb_pulse_snapshot to service_role;
insert into public.businessweb_pulse_snapshot (id) values (1) on conflict (id) do nothing;

-- 历史版本：每次成功写入前保存上一版，保留最近 30 份，误删/误覆盖时可在 SQL Editor 找回。
create table if not exists public.businessweb_pulse_history (
  id bigint generated always as identity primary key,
  revision bigint not null,
  payload jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.businessweb_pulse_history enable row level security;
revoke all on public.businessweb_pulse_history from public, anon, authenticated;
grant select, insert, delete on public.businessweb_pulse_history to service_role;

-- 乐观并发 + 防大面积误删：
--  'ok'       写入成功（revision + 1，并保存旧版本到历史）
--  'conflict' 版本号不匹配，其他设备已更新
--  'shrink'   有效记录数相比现有版本减少超过一半（现有 ≥ 6 条）且未显式允许
create or replace function public.businessweb_put_pulse_snapshot(expected_revision bigint, next_payload jsonb, allow_shrink boolean default false)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cur record;
  old_active integer;
  new_active integer;
begin
  select revision, payload into cur from public.businessweb_pulse_snapshot where id = 1 for update;
  if not found or cur.revision <> expected_revision then return 'conflict'; end if;

  select count(*) into old_active from jsonb_array_elements(cur.payload -> 'reviews') e where coalesce(e ->> 'deleted', 'false') <> 'true';
  select count(*) into new_active from jsonb_array_elements(next_payload -> 'reviews') e where coalesce(e ->> 'deleted', 'false') <> 'true';
  if not allow_shrink and old_active >= 6 and new_active * 2 < old_active then return 'shrink'; end if;

  insert into public.businessweb_pulse_history (revision, payload) values (cur.revision, cur.payload);
  delete from public.businessweb_pulse_history
    where id not in (select id from public.businessweb_pulse_history order by id desc limit 30);
  update public.businessweb_pulse_snapshot
    set payload = next_payload, revision = revision + 1, updated_at = now()
    where id = 1;
  return 'ok';
end;
$$;
revoke all on function public.businessweb_put_pulse_snapshot(bigint, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.businessweb_put_pulse_snapshot(bigint, jsonb, boolean) to service_role;

commit;
