create table if not exists public.email_settings (
  site_id text primary key references public.sites (id) on delete cascade,
  to_list text not null default '',
  cc_list text not null default '',
  subject_prefix text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.sites (id) on delete cascade,
  report_date date not null,
  report_time text not null default '',
  notes text not null default '',
  notes_rich text not null default '',
  linked_issue_ids jsonb not null default '[]'::jsonb,
  linked_confirm_ids jsonb not null default '[]'::jsonb,
  attachment_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null
);

create index if not exists reports_site_id_idx on public.reports (site_id);
create index if not exists reports_site_id_report_date_idx on public.reports (site_id, report_date desc);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.sites (id) on delete cascade,
  code text not null,
  title text not null default '',
  priority text not null default 'high' check (priority in ('high', 'med', 'low')),
  area text not null default '',
  environment text not null default '',
  steps text not null default '',
  status text not null default 'open' check (status in ('open', 'in review', 'fixed')),
  report_ref text,
  attachment_ids jsonb not null default '[]'::jsonb,
  event_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null,
  unique (site_id, code)
);

create index if not exists issues_site_id_idx on public.issues (site_id);
create index if not exists issues_site_id_status_idx on public.issues (site_id, status);

create table if not exists public.confirms (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.sites (id) on delete cascade,
  code text not null,
  title text not null default '',
  source text not null default '',
  confirmed_by text not null default '',
  notes text not null default '',
  report_ref text,
  resolves_issue_ref text,
  attachment_ids jsonb not null default '[]'::jsonb,
  event_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null,
  unique (site_id, code)
);

create index if not exists confirms_site_id_idx on public.confirms (site_id);

create table if not exists public.document_references (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.sites (id) on delete cascade,
  title text not null default '',
  link text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null
);

create index if not exists document_references_site_id_idx on public.document_references (site_id, created_at desc);

drop trigger if exists email_settings_set_updated_at on public.email_settings;
create trigger email_settings_set_updated_at
before update on public.email_settings
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists issues_set_updated_at on public.issues;
create trigger issues_set_updated_at
before update on public.issues
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists confirms_set_updated_at on public.confirms;
create trigger confirms_set_updated_at
before update on public.confirms
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists document_references_set_updated_at on public.document_references;
create trigger document_references_set_updated_at
before update on public.document_references
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.email_settings enable row level security;
alter table public.reports enable row level security;
alter table public.issues enable row level security;
alter table public.confirms enable row level security;
alter table public.document_references enable row level security;

revoke all on public.email_settings from anon, authenticated;
revoke all on public.reports from anon, authenticated;
revoke all on public.issues from anon, authenticated;
revoke all on public.confirms from anon, authenticated;
revoke all on public.document_references from anon, authenticated;

grant all on public.email_settings to service_role;
grant all on public.reports to service_role;
grant all on public.issues to service_role;
grant all on public.confirms to service_role;
grant all on public.document_references to service_role;

comment on table public.email_settings is 'Cloud-backed email defaults per site for qa-tracker custom backend mode.';
comment on table public.reports is 'Cloud-backed progress updates. Attachment and linked-record references stay as JSON arrays until storage and join-table migration is finished.';
comment on table public.issues is 'Cloud-backed blocker and risk records. Attachment references stay as JSON arrays during the first cloud cutover slice.';
comment on table public.confirms is 'Cloud-backed confirmation and sign-off records. Attachment references stay as JSON arrays during the first cloud cutover slice.';
comment on table public.document_references is 'Cloud-backed titled document links per site.';
