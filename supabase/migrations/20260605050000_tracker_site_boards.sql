create table if not exists public.tracker_site_boards (
  site_id text not null references public.sites (id) on delete cascade,
  board_key text not null check (
    board_key in (
      'site-checklist',
      'cable-matrix',
      'antenna-checklist',
      'dcpl-checklist',
      'cable-checklist'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null,
  primary key (site_id, board_key)
);

create index if not exists tracker_site_boards_site_id_idx on public.tracker_site_boards (site_id);

drop trigger if exists tracker_site_boards_set_updated_at on public.tracker_site_boards;
create trigger tracker_site_boards_set_updated_at
before update on public.tracker_site_boards
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.tracker_site_boards enable row level security;

revoke all on public.tracker_site_boards from anon, authenticated;
grant all on public.tracker_site_boards to service_role;

comment on table public.tracker_site_boards is 'Cloud-backed site board payloads for checklist and asset-board workflows. IndexedDB remains a reactive local mirror.';
