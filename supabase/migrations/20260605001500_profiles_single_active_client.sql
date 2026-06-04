alter table public.profiles
add column if not exists active_client_id text,
add column if not exists active_client_seen_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

comment on column public.profiles.active_client_id is 'Current browser or device instance that owns the active qa-tracker session.';
comment on column public.profiles.active_client_seen_at is 'UTC timestamp for the last client-session ownership claim.';
