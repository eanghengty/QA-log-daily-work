create table if not exists public.site_scopes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null
);

create unique index if not exists site_scopes_name_lower_idx on public.site_scopes (lower(name));

create table if not exists public.confirm_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null
);

create unique index if not exists confirm_sources_name_lower_idx on public.confirm_sources (lower(name));

create table if not exists public.sites (
  id text primary key,
  name text not null,
  hop_reviewer text not null default '',
  scope text not null default '',
  comment text not null default '',
  url text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null
);

drop trigger if exists site_scopes_set_updated_at on public.site_scopes;
create trigger site_scopes_set_updated_at
before update on public.site_scopes
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists confirm_sources_set_updated_at on public.confirm_sources;
create trigger confirm_sources_set_updated_at
before update on public.confirm_sources
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists sites_set_updated_at on public.sites;
create trigger sites_set_updated_at
before update on public.sites
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.site_scopes enable row level security;
alter table public.confirm_sources enable row level security;
alter table public.sites enable row level security;

revoke all on public.site_scopes from anon, authenticated;
revoke all on public.confirm_sources from anon, authenticated;
revoke all on public.sites from anon, authenticated;

grant all on public.site_scopes to service_role;
grant all on public.confirm_sources to service_role;
grant all on public.sites to service_role;

comment on table public.site_scopes is 'Cloud-backed site scope lookup values for qa-tracker custom backend mode.';
comment on table public.confirm_sources is 'Cloud-backed confirmation-source lookup values for qa-tracker custom backend mode.';
comment on table public.sites is 'Cloud-backed telecom site headers for qa-tracker custom backend mode.';
