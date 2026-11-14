-- 候选池每日提醒邮件的去重记录（server/candidate-alerts-digest.ts）。只在独立的 BusinessWeb Supabase 项目执行；幂等，重复执行不清空数据。
-- 每发出一项写一行：fingerprint 形如 price-hit|cn:600519|2026-11-13|price-below|1500（同一交易日同一条件只发一次），
-- 另有 digest|YYYY-MM-DD 一行保证每天最多一封。发信失败时函数会删除本次认领的行，下次再发。
begin;

create table if not exists public.businessweb_candidate_alert_log (
  fingerprint text primary key check (char_length(fingerprint) between 1 and 300),
  day date not null,
  kind text not null check (kind in ('digest', 'price-hit', 'review', 'rating')),
  sent_at timestamptz not null default now()
);
create index if not exists businessweb_candidate_alert_log_day on public.businessweb_candidate_alert_log (day);
alter table public.businessweb_candidate_alert_log enable row level security;
revoke all on public.businessweb_candidate_alert_log from public, anon, authenticated;
grant select, insert, delete on public.businessweb_candidate_alert_log to service_role;

notify pgrst, 'reload schema';
commit;
