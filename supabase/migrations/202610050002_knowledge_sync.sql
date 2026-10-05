begin;
create table if not exists public.businessweb_knowledge_snapshots (
 generation uuid primary key, revision bigint not null unique, vault_id text not null,
 created_at timestamptz not null default now()
);
insert into public.businessweb_knowledge_snapshots(generation,revision,vault_id)
 select generation,revision,vault_id from public.businessweb_knowledge_head where generation is not null
 on conflict do nothing;
alter table public.businessweb_knowledge_snapshots enable row level security;
revoke all on public.businessweb_knowledge_snapshots from public,anon,authenticated;
grant select,insert on public.businessweb_knowledge_snapshots to service_role;

create or replace function public.businessweb_track_knowledge_snapshot()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.generation is not null then
 insert into businessweb_knowledge_snapshots(generation,revision,vault_id) values(new.generation,new.revision,new.vault_id) on conflict do nothing;
 end if;
 return new;
end $$;
drop trigger if exists businessweb_track_knowledge_snapshot on public.businessweb_knowledge_head;
create trigger businessweb_track_knowledge_snapshot after update on public.businessweb_knowledge_head for each row execute function public.businessweb_track_knowledge_snapshot();
revoke all on function public.businessweb_track_knowledge_snapshot() from public,anon,authenticated;

create or replace function public.businessweb_sync_manifest(requested_generation uuid,after_path text default null)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare snap businessweb_knowledge_snapshots; result jsonb; last_path text; more boolean;
begin
 select * into snap from businessweb_knowledge_snapshots where generation=requested_generation;
 if not found then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object('path',path,'version',version) order by path),'[]'::jsonb),max(path)
 into result,last_path from (select path,version from businessweb_knowledge_notes where generation=requested_generation and published
 and (after_path is null or path>after_path) order by path limit 200) p;
 select exists(select 1 from businessweb_knowledge_notes where generation=requested_generation and published and path>last_path) into more;
 return jsonb_build_object('head',jsonb_build_object('revision',snap.revision,'generation',snap.generation,'vaultId',snap.vault_id),'total',(select count(*) from businessweb_knowledge_notes where generation=requested_generation and published),'notes',result,'nextCursor',case when more then last_path else null end);
end $$;
create or replace function public.businessweb_sync_note(requested_generation uuid,requested_path text)
returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('path',n.path,'content',n.payload->'note'->>'content','version',n.version)
 from businessweb_knowledge_notes n join businessweb_knowledge_snapshots s using(generation)
 where n.generation=requested_generation and n.path=requested_path and n.published
$$;

create or replace function public.businessweb_sync_stage(next_generation uuid,next_vault_id text,notes jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare n jsonb; title_text text; path_text text;
begin
 perform 1 from businessweb_knowledge_head where id=1 for update;
 if exists(select 1 from businessweb_knowledge_snapshots where generation=next_generation) or
 exists(select 1 from businessweb_knowledge_notes where generation=next_generation and published) then raise exception 'generation already published'; end if;
 if next_vault_id !~ '^[a-f0-9]{64}$' or jsonb_typeof(notes)<>'array' or jsonb_array_length(notes)>100 or jsonb_array_length(notes)=0 then raise exception 'invalid batch'; end if;
 for n in select value from jsonb_array_elements(notes) loop
  path_text=n->>'path';
  if jsonb_typeof(n->'content') is distinct from 'string' or octet_length(n->>'content')>1048576 or
   n->>'version' is distinct from encode(sha256(convert_to(n->>'content','UTF8')),'hex') or
   path_text is null or length(path_text)>500 or path_text !~ '\.md$' or path_text ~ '(^|/)\.' or path_text ~ '[\\[:cntrl:]]' or path_text ~ '(^/|//|/$)' then raise exception 'invalid note'; end if;
  title_text=coalesce(substring(n->>'content' from '(?m)^# +([^\n]+)'),regexp_replace(path_text,'^.*/|\.md$','','g'));
  insert into businessweb_knowledge_notes(generation,path,title,excerpt,version,updated_at,search_text,payload)
   values(next_generation,path_text,title_text,left(n->>'content',160),n->>'version',now(),lower(title_text||E'\n'||path_text||E'\n'||(n->>'content')),
   jsonb_build_object('note',n||jsonb_build_object('vaultId',next_vault_id,'title',title_text)))
   on conflict(generation,path) do update set title=excluded.title,excerpt=excluded.excerpt,version=excluded.version,updated_at=excluded.updated_at,search_text=excluded.search_text,payload=excluded.payload;
 end loop;
end $$;

create or replace function public.businessweb_sync_publish(expected_revision bigint,next_generation uuid,next_vault_id text,next_graph jsonb,note_count integer,relations jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare actual_count integer;
begin
 perform 1 from businessweb_knowledge_head where id=1 for update;
 if not exists(select 1 from businessweb_knowledge_head where id=1 and revision=expected_revision and (vault_id is null or vault_id=next_vault_id)) then return false; end if;
 if exists(select 1 from businessweb_knowledge_snapshots where generation=next_generation) or exists(select 1 from businessweb_knowledge_notes where generation=next_generation and published) then return false; end if;
 select count(*) into actual_count from businessweb_knowledge_notes where generation=next_generation;
 if actual_count<>note_count or note_count<0 or note_count>10000 or next_vault_id !~ '^[a-f0-9]{64}$' or next_graph->>'vaultId' is distinct from next_vault_id or jsonb_array_length(next_graph->'nodes')<>actual_count or jsonb_array_length(relations)<>actual_count then return false; end if;
 if exists(select 1 from businessweb_knowledge_notes where generation=next_generation and
  (payload->'note'->>'vaultId' is distinct from next_vault_id or version is distinct from encode(sha256(convert_to(payload->'note'->>'content','UTF8')),'hex'))) then return false; end if;
 if (select count(distinct n->>'path') from jsonb_array_elements(next_graph->'nodes') n)<>actual_count or
 exists(select 1 from jsonb_array_elements(next_graph->'nodes') n where not exists(select 1 from businessweb_knowledge_notes k where k.generation=next_generation and k.path=n->>'path')) then return false; end if;
 if exists(select 1 from jsonb_array_elements(next_graph->'edges') e where not exists(select 1 from businessweb_knowledge_notes k where k.generation=next_generation and k.path=e->>'source') or not exists(select 1 from businessweb_knowledge_notes k where k.generation=next_generation and k.path=e->>'target')) then return false; end if;
 if (select count(distinct r->>'path') from jsonb_array_elements(relations) r)<>actual_count then return false; end if;
 update businessweb_knowledge_notes n set payload=jsonb_set(n.payload,'{relations}',r.value->'relations'),published=true
 from jsonb_array_elements(relations) r where n.generation=next_generation and n.path=r.value->>'path';
 insert into businessweb_knowledge_snapshots(generation,revision,vault_id) values(next_generation,expected_revision+1,next_vault_id);
 update businessweb_knowledge_head set revision=expected_revision+1,generation=next_generation,vault_id=next_vault_id,graph=next_graph,synced_at=now() where id=1;
 return true;
end $$;
revoke all on function public.businessweb_sync_manifest(uuid,text),public.businessweb_sync_note(uuid,text),public.businessweb_sync_stage(uuid,text,jsonb),public.businessweb_sync_publish(bigint,uuid,text,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function public.businessweb_sync_manifest(uuid,text),public.businessweb_sync_note(uuid,text),public.businessweb_sync_stage(uuid,text,jsonb),public.businessweb_sync_publish(bigint,uuid,text,jsonb,integer,jsonb) to service_role;
-- Protect published generations through both the new and legacy RPCs.
create or replace function public.businessweb_guard_published_note()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if exists(select 1 from businessweb_knowledge_snapshots where generation=new.generation) then raise exception 'published snapshot is immutable'; end if;
 return new;
end $$;
drop trigger if exists businessweb_guard_published_note on public.businessweb_knowledge_notes;
create trigger businessweb_guard_published_note before insert or update on public.businessweb_knowledge_notes for each row execute function public.businessweb_guard_published_note();
create or replace function public.businessweb_guard_snapshot_head()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if exists(select 1 from businessweb_knowledge_snapshots where generation=new.generation and (revision<>new.revision or vault_id<>new.vault_id)) then raise exception 'cannot republish historical generation'; end if;
 return new;
end $$;
drop trigger if exists businessweb_guard_snapshot_head on public.businessweb_knowledge_head;
create trigger businessweb_guard_snapshot_head before update on public.businessweb_knowledge_head for each row execute function public.businessweb_guard_snapshot_head();
revoke all on function public.businessweb_guard_published_note(),public.businessweb_guard_snapshot_head() from public,anon,authenticated;
commit;
