create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  role text not null default 'admin' check (role in ('admin', 'manager', 'member')),
  password_salt text not null,
  password_hash text not null,
  is_active boolean not null default true,
  active_session_id uuid,
  active_session_seen_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists app_users_email_lower_idx on public.app_users (lower(email));

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  client_id text not null,
  token_hash text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '30 days',
  revoked_at timestamptz
);

alter table public.app_users
  add constraint app_users_active_session_id_fkey
  foreign key (active_session_id) references public.app_sessions (id)
  on delete set null;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists app_sessions_set_updated_at on public.app_sessions;
create trigger app_sessions_set_updated_at
before update on public.app_sessions
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;

revoke all on public.app_users from anon, authenticated;
revoke all on public.app_sessions from anon, authenticated;

grant all on public.app_users to service_role;
grant all on public.app_sessions to service_role;

comment on table public.app_users is 'Custom backend login accounts for qa-tracker without Supabase Auth email verification.';
comment on table public.app_sessions is 'Opaque custom backend sessions for qa-tracker account sign-in and takeover handling.';
