-- 0007: app admins can create groups (societies) from the app instead of the SQL Editor.
-- Admins are listed in app_admins, which only the project owner edits (SQL Editor, see SETUP.md 2.6).
-- Groups are still stored as societies; create_society stays SQL-only.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create or replace function public.am_i_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid())
$$;

-- Create a group. The officer is the account with p_officer_email, or the admin when it is blank.
-- The short name (slug) defaults to the name with anything but letters and numbers turned into dashes.
create or replace function public.admin_create_group(p_name text, p_slug text default null, p_officer_email text default null)
returns table (society_id uuid, slug text, name text, network text, join_code text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := public.fa_uid_verified(); v_id uuid; v_officer uuid;
        v_name text := btrim(coalesce(p_name, ''));
        v_slug text := lower(btrim(coalesce(nullif(btrim(p_slug), ''), v_name)));
begin
  if not exists (select 1 from public.app_admins a where a.user_id = v_uid) then
    raise exception 'only app admins can create groups';
  end if;
  if length(v_name) not between 2 and 120 then raise exception 'group name must be 2 to 120 characters'; end if;
  v_slug := btrim(left(btrim(regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g'), '-'), 32), '-');
  if v_slug !~ '^[a-z0-9-]{2,32}$' then raise exception 'group short name must be 2 to 32 letters, numbers or dashes'; end if;
  if exists (select 1 from public.societies s where s.slug = v_slug) then raise exception 'group short name already taken'; end if;

  if nullif(btrim(p_officer_email), '') is null then
    v_officer := v_uid;
  else
    select u.id into v_officer from auth.users u where lower(u.email) = lower(btrim(p_officer_email));
    if v_officer is null then raise exception 'no account with that officer email'; end if;
  end if;

  v_id := public.create_society(v_slug, v_name, null);
  insert into public.society_members (society_id, user_id, role) values (v_id, v_officer, 'officer');
  return query select s.id, s.slug, s.name, s.network, s.join_code from public.societies s where s.id = v_id;
end $$;

revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;
revoke all on function public.admin_create_group(text, text, text) from public, anon;
grant execute on function public.admin_create_group(text, text, text) to authenticated;
