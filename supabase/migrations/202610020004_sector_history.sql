-- 板块原始数据缓存；按实际交易日期 + 涨停模式隔离，保留 stock_list 供热门股票使用。
begin;
create table if not exists public.businessweb_sector_history (
  trade_date date not null,
  up_limit smallint not null check (up_limit in (0, 1)),
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (trade_date, up_limit),
  check (payload ->> 'code' = '200' and jsonb_typeof(payload #> '{data,plate_stock}') = 'array')
);
alter table public.businessweb_sector_history enable row level security;
revoke all on public.businessweb_sector_history from public, anon, authenticated;
grant select, insert, update on public.businessweb_sector_history to service_role;
commit;
