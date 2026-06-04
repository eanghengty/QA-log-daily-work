-- Run via Supabase CLI with `supabase db push`.
-- It creates profile and organization tables that the Vue app can use immediately.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role text not null default 'member' check (role in ('member', 'manager', 'admin')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'manager', 'editor', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = case
      when public.profiles.full_name = '' then excluded.full_name
      else public.profiles.full_name
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
on public.organizations
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = organizations.id
      and members.user_id = auth.uid()
  )
);

drop policy if exists "organizations_insert_authenticated" on public.organizations;
create policy "organizations_insert_authenticated"
on public.organizations
for insert
to authenticated
with check (true);

drop policy if exists "organizations_update_owner_manager" on public.organizations;
create policy "organizations_update_owner_manager"
on public.organizations
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = organizations.id
      and members.user_id = auth.uid()
      and members.role in ('owner', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = organizations.id
      and members.user_id = auth.uid()
      and members.role in ('owner', 'manager')
  )
);

drop policy if exists "organization_members_select_own_orgs" on public.organization_members;
create policy "organization_members_select_own_orgs"
on public.organization_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.organization_members members
    where members.organization_id = organization_members.organization_id
      and members.user_id = auth.uid()
      and members.role in ('owner', 'manager')
  )
);

drop policy if exists "organization_members_insert_owner_manager" on public.organization_members;
create policy "organization_members_insert_owner_manager"
on public.organization_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = organization_members.organization_id
      and members.user_id = auth.uid()
      and members.role in ('owner', 'manager')
  )
);

drop policy if exists "organization_members_update_owner_manager" on public.organization_members;
create policy "organization_members_update_owner_manager"
on public.organization_members
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = organization_members.organization_id
      and members.user_id = auth.uid()
      and members.role in ('owner', 'manager')
  )
)
with check (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = organization_members.organization_id
      and members.user_id = auth.uid()
      and members.role in ('owner', 'manager')
  )
);

create or replace function public.create_organization_with_owner(org_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  created_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organizations (name)
  values (trim(org_name))
  returning * into created_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (created_org.id, auth.uid(), 'owner')
  on conflict (organization_id, user_id) do nothing;

  return created_org;
end;
$$;

comment on table public.profiles is 'User profile rows mirrored from auth.users for the telecom site tracker.';
comment on table public.organization_members is 'Foundation for user-to-organization access before site tables move to Supabase.';
comment on function public.create_organization_with_owner(text) is 'Creates an organization and immediately assigns the authenticated user as owner.';
