create table if not exists public.snag_reports (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.sites (id) on delete cascade,
  category text not null default 'GDC' check (category in ('GDC', 'PTA', 'Nokia')),
  report_date date not null,
  report_time text not null default '',
  notes text not null default '',
  notes_rich text not null default '',
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists snag_reports_site_date_idx on public.snag_reports (site_id, report_date desc, report_time desc);

drop trigger if exists snag_reports_set_updated_at on public.snag_reports;
create trigger snag_reports_set_updated_at
before update on public.snag_reports
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.snag_reports enable row level security;

revoke all on public.snag_reports from anon, authenticated;

grant all on public.snag_reports to service_role;

comment on table public.snag_reports is 'Cloud-backed snag history records exported from snag summary boards.';
