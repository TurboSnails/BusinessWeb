begin;
create table if not exists public.businessweb_company_research_notes (
  id uuid primary key,
  market text not null check (market in ('us','cn','hk','adr','ndx')),
  code text not null check (code ~ '^[A-Za-z0-9_.^=\-]{1,32}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null check (char_length(btrim(content)) > 0 and octet_length(content) <= 1048576),
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists businessweb_company_notes_lookup on public.businessweb_company_research_notes(market,code,updated_at desc,id);
alter table public.businessweb_company_research_notes enable row level security;
revoke all on public.businessweb_company_research_notes from public, anon, authenticated;
grant select, insert, update on public.businessweb_company_research_notes to service_role;

create or replace function public.businessweb_create_company_note(note_id uuid,note_market text,note_code text,note_title text,note_content text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.businessweb_company_research_notes;
begin
  insert into public.businessweb_company_research_notes(id,market,code,title,content)
  values(note_id,note_market,note_code,note_title,note_content)
  on conflict(id) do nothing returning * into saved;
  if not found then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','ok','note',to_jsonb(saved));
end;
$$;
create or replace function public.businessweb_update_company_note(note_id uuid,expected_revision bigint,note_title text,note_content text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.businessweb_company_research_notes;
begin
  select * into saved from public.businessweb_company_research_notes where id=note_id for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if saved.revision <> expected_revision then return jsonb_build_object('status','conflict'); end if;
  update public.businessweb_company_research_notes
  set title=note_title,content=note_content,revision=revision+1,updated_at=clock_timestamp()
  where id=note_id returning * into saved;
  return jsonb_build_object('status','ok','note',to_jsonb(saved));
end;
$$;
revoke all on function public.businessweb_create_company_note(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.businessweb_update_company_note(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.businessweb_create_company_note(uuid,text,text,text,text) to service_role;
grant execute on function public.businessweb_update_company_note(uuid,bigint,text,text) to service_role;
commit;
