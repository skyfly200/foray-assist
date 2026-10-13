-- Columns added for Review Mode / iNaturalist publishing, unassigned photos,
-- and server-side-only storage of third-party OAuth tokens.

alter table public.specimens add column if not exists inat_status text
  check (inat_status in ('draft','queued','published','failed'));
alter table public.specimens add column if not exists inat_error text;

-- Imported photos can be unassigned (sync sends null) until clustering assigns them.
alter table public.photos alter column specimen_row_id drop not null;
alter table public.photos add column if not exists external_id text;
alter table public.photos add column if not exists width integer;
alter table public.photos add column if not exists height integer;

-- OAuth tokens for Google Photos / iNaturalist. RLS is enabled with NO policies:
-- the browser (anon/authenticated roles) can never read them. Only Nitro server
-- routes, using the service-role key, read and write this table.
create table if not exists public.integration_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google','inat')),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.integration_tokens enable row level security;
