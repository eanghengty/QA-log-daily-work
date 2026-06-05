create table if not exists public.pending_summaries (
  site_id text primary key references public.sites (id) on delete cascade,
  source_text text not null default '',
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null
);

drop trigger if exists pending_summaries_set_updated_at on public.pending_summaries;
create trigger pending_summaries_set_updated_at
before update on public.pending_summaries
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.pending_summaries enable row level security;

revoke all on public.pending_summaries from anon, authenticated;

grant all on public.pending_summaries to service_role;

comment on table public.pending_summaries is 'Cloud-backed generated pending-summary board per site for qa-tracker custom backend mode.';
