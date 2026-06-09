create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null default '',
  detail text not null default '',
  user_id uuid references public.app_users (id) on delete set null,
  user_name text not null default '',
  user_email text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

revoke all on public.activity_log from anon, authenticated;
grant all on public.activity_log to service_role;

comment on table public.activity_log is 'Shared custom-backend activity log for tracker actions shown to all signed-in field users.';
