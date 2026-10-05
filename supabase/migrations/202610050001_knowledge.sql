begin;
create table if not exists public.businessweb_knowledge_head (
 id smallint primary key check (id=1), revision bigint not null default 0,
 generation uuid, vault_id text, graph jsonb not null default '{}', synced_at timestamptz
);
insert into public.businessweb_knowledge_head(id) values (1) on conflict do nothing;
create table if not exists public.businessweb_knowledge_notes (
 generation uuid not null, path text not null, title text not null,
 excerpt text not null, version text not null, updated_at timestamptz,
 search_text text not null, payload jsonb not null, published boolean not null default false, primary key(generation,path)
);
alter table public.businessweb_knowledge_head enable row level security;
alter table public.businessweb_knowledge_notes enable row level security;
revoke all on public.businessweb_knowledge_head, public.businessweb_knowledge_notes from public, anon, authenticated;
grant select, insert, update on public.businessweb_knowledge_head, public.businessweb_knowledge_notes to service_role;
create or replace function public.businessweb_upload_knowledge_batch(next_generation uuid, notes jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from businessweb_knowledge_head where id=1 for update;
 if exists(select 1 from businessweb_knowledge_notes where generation=next_generation and published) then raise exception 'generation is published'; end if;
 insert into businessweb_knowledge_notes(generation,path,title,excerpt,version,updated_at,search_text,payload)
 select next_generation, n->'note'->>'path', n->'note'->>'title', left(n->'note'->>'content',160),
 n->'note'->>'version', (n->'note'->>'updatedAt')::timestamptz,
 lower((n->'note'->>'title') || E'\n' || (n->'note'->>'path') || E'\n' || (n->'note'->>'content')), n
 from jsonb_array_elements(notes) n
 on conflict(generation,path) do update set title=excluded.title,excerpt=excluded.excerpt,version=excluded.version,
 updated_at=excluded.updated_at,search_text=excluded.search_text,payload=excluded.payload;
end $$;
create or replace function public.businessweb_publish_knowledge(expected_revision bigint,next_generation uuid,next_vault_id text,next_graph jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare actual_count integer;
begin
 perform 1 from businessweb_knowledge_head where id=1 for update;
 if not exists(select 1 from businessweb_knowledge_head where id=1 and revision=expected_revision and generation is distinct from next_generation) then return false; end if;
 select count(*) into actual_count from businessweb_knowledge_notes where generation=next_generation;
 if actual_count=0 or actual_count<>jsonb_array_length(next_graph->'nodes') then return false; end if;
 if exists(select 1 from jsonb_array_elements(next_graph->'nodes') n where not exists(
 select 1 from businessweb_knowledge_notes k where k.generation=next_generation and k.path=n->>'path' and k.payload->'note'->>'vaultId'=next_vault_id)) then return false; end if;
 if (select count(distinct n->>'path') from jsonb_array_elements(next_graph->'nodes') n) <> actual_count then return false; end if;
 update businessweb_knowledge_notes set published=true where generation=next_generation;
 update businessweb_knowledge_head set revision=revision+1,generation=next_generation,vault_id=next_vault_id,graph=next_graph,synced_at=now() where id=1;
 return true;
end $$;
revoke all on function public.businessweb_upload_knowledge_batch(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.businessweb_publish_knowledge(bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.businessweb_upload_knowledge_batch(uuid,jsonb) to service_role;
grant execute on function public.businessweb_publish_knowledge(bigint,uuid,text,jsonb) to service_role;
create or replace function public.businessweb_search_knowledge(next_generation uuid,query_text text,investment_only boolean default false)
returns table(path text,title text,excerpt text,version text,"updatedAt" timestamptz)
language sql stable security invoker set search_path=public as $$
 select n.path,n.title,n.excerpt,n.version,n.updated_at from businessweb_knowledge_notes n
 where n.generation=next_generation
 and (not investment_only or starts_with(n.path,'01-Investment/') or strpos(n.path,'/投资研究/')>0)
 and not exists(select 1 from regexp_split_to_table(lower(trim(query_text)), E'\\s+') term where term<>'' and strpos(n.search_text,term)=0)
 order by n.path limit 100
$$;
revoke all on function public.businessweb_search_knowledge(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.businessweb_search_knowledge(uuid,text,boolean) to service_role;
commit;
