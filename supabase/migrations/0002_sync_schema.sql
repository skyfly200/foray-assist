-- 0002: sync schema + auth-gated RLS. Local Dexie is the source of truth;
-- these tables are a per-user sync target (SPEC 4.3). Rows are keyed by the
-- client-generated uuid.

-- 1. Remove the prototype open policies (anyone with the anon key had full access).
drop policy if exists "forays open" on public.forays;
drop policy if exists "segments open" on public.transcript_segments;

-- 2. The prototype tables have a different shape (title, no updated_at) and
-- hold no real data. transcript_segments is dropped rather than kept: voice
-- transcripts now live in voice_notes, so a second owner-less table would only
-- be dead schema. forays is recreated below with the client row shape.
drop table if exists public.transcript_segments;
drop table if exists public.forays cascade;

-- 3. Synced tables. No cross-table FKs: the outbox drains in order but rows may
-- arrive late or be deleted independently; the client is authoritative.
create table public.forays (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create table public.specimens (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  specimen_id text not null,
  foray_id uuid not null,
  "timestamp" timestamptz not null,
  latitude double precision,
  longitude double precision,
  geoprivacy text not null default 'obscured' check (geoprivacy in ('open','obscured','private')),
  field_notes jsonb not null default '{}'::jsonb,
  inat_observation_id bigint,
  printed_label_at timestamptz,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  specimen_row_id uuid not null,
  foray_id uuid not null,
  source text not null,
  mime_type text not null,
  captured_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  blur_score double precision,
  is_selected boolean not null default false,
  storage_path text,              -- set once the blob is uploaded to foray-media
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create table public.voice_notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  specimen_row_id uuid,
  foray_id uuid not null,
  transcript text not null default '',
  model text not null default '',
  at timestamptz not null,
  storage_path text,              -- audio blob, if any
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create index on public.specimens (user_id, foray_id);
create index on public.photos (user_id, specimen_row_id);
create index on public.voice_notes (user_id, foray_id);
create index on public.forays (user_id);

-- 4. RLS: owner-only, per operation.
do $$
declare t text;
begin
  foreach t in array array['forays','specimens','photos','voice_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s select own" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s insert own" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s update own" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s delete own" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- 5. Private media bucket; object path must start with the owner's uid:
--    <uid>/photos/<id>  and  <uid>/voice/<id>
insert into storage.buckets (id, name, public)
values ('foray-media', 'foray-media', false)
on conflict (id) do update set public = false;

create policy "foray-media select own" on storage.objects for select to authenticated
  using (bucket_id = 'foray-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "foray-media insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'foray-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "foray-media update own" on storage.objects for update to authenticated
  using (bucket_id = 'foray-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'foray-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "foray-media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'foray-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
