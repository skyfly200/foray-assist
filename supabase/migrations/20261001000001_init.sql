create table public.forays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) default auth.uid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  foray_id uuid not null references public.forays (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.forays enable row level security;
alter table public.transcript_segments enable row level security;

-- Prototype policies: open access for the anon key. Tighten to
-- `user_id = auth.uid()` once Supabase Auth is wired into the UI.
create policy "forays open" on public.forays for all using (true) with check (true);
create policy "segments open" on public.transcript_segments for all using (true) with check (true);
