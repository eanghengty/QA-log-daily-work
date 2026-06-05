create table if not exists public.tracker_attachments (
  id text primary key,
  file_name text not null default '',
  content_type text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  data_base64 text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null
);

drop trigger if exists tracker_attachments_set_updated_at on public.tracker_attachments;
create trigger tracker_attachments_set_updated_at
before update on public.tracker_attachments
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.tracker_attachments enable row level security;
revoke all on public.tracker_attachments from anon, authenticated;
grant all on public.tracker_attachments to service_role;

comment on table public.tracker_attachments is 'Cloud-backed field proof attachment files for qa-tracker custom backend mode.';
