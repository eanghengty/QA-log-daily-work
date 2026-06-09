create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.sites (id) on delete cascade,
  code text not null,
  title text not null default '',
  source text not null default 'PE' check (source in ('PE', 'Customer')),
  notes text not null default '',
  status text not null default 'open' check (status in ('open', 'in progress', 'done')),
  attachment_ids jsonb not null default '[]'::jsonb,
  event_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.app_users (id) on delete set null,
  updated_by uuid references public.app_users (id) on delete set null,
  unique (site_id, code)
);

create index if not exists action_items_site_id_idx on public.action_items (site_id);
create index if not exists action_items_site_id_status_idx on public.action_items (site_id, status);

drop trigger if exists action_items_set_updated_at on public.action_items;
create trigger action_items_set_updated_at
before update on public.action_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.action_items enable row level security;

revoke all on public.action_items from anon, authenticated;
grant all on public.action_items to service_role;

comment on table public.action_items is 'Cloud-backed PE / Customer action items for telecom site follow-up tasks.';
