create table if not exists public.snag_summaries (
  site_id text primary key references public.sites (id) on delete cascade,
  source_text text not null default '',
  sections jsonb not null default '[]'::jsonb,
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists snag_summaries_set_updated_at on public.snag_summaries;
create trigger snag_summaries_set_updated_at
before update on public.snag_summaries
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.snag_summaries enable row level security;

revoke all on public.snag_summaries from anon, authenticated;

grant all on public.snag_summaries to service_role;

comment on table public.snag_summaries is 'Cloud-backed generated snag-summary board per site for qa-tracker custom backend mode.';
