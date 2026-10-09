-- 0006: shared forays, find comments, societies and society voucher numbers (roadmap
-- Phase 12), plus device public keys for signed nearby alerts (Phase 13).
--
-- Model:
--   * A foray stays owned by the person who started it. Sharing gives it an 8-character join
--     code (shown as XXXX-XXXX or a QR). Members join with the code; nobody edits anyone
--     else's rows. Each member's finds keep the member's own author ID and simply point at the
--     shared foray's id.
--   * Members read each other's finds only through foray_feed(), which applies each find's
--     location setting (open = exact, obscured = 0.2 degree cell, private = no location).
--     Specimens RLS stays owner-only, so precise coordinates never leave the author's rows.
--   * Comments, ID suggestions and agreements are separate rows (find_comments).
--   * Societies (FRMS, CMS, ...) get a society network in the U-Z ID class. Officers and
--     leaders claim sets of voucher numbers; members record a voucher number on their own
--     finds (specimens.voucher_id). Personal specimen IDs are unchanged.
-- Only the functions below write membership, codes, societies and voucher sets.

-- 1. Columns on forays. join_code / society_id / mesh_key are written only by functions
--    (guarded by a trigger), never by the owner's sync upsert.
alter table public.forays add column if not exists join_code text;
alter table public.forays add column if not exists society_id uuid;
alter table public.forays add column if not exists mesh_key text;
create unique index if not exists forays_join_code_key on public.forays (join_code) where join_code is not null;

alter table public.specimens add column if not exists voucher_id text;
create unique index if not exists specimens_voucher_id_key on public.specimens (voucher_id) where voucher_id is not null;

-- 2. Tables.
create table if not exists public.foray_members (
  foray_id uuid not null references public.forays (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner','leader','member')),
  display_name text not null default '' check (length(display_name) <= 60),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (foray_id, user_id)
);
create index if not exists foray_members_user_idx on public.foray_members (user_id);

create table if not exists public.find_comments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  foray_id uuid not null,
  specimen_row_id uuid not null,
  kind text not null default 'comment' check (kind in ('comment','suggestion','agree')),
  body text not null default '' check (length(body) <= 2000),
  taxon text check (taxon is null or length(taxon) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);
create index if not exists find_comments_foray_idx on public.find_comments (foray_id, specimen_row_id);

create sequence if not exists public.society_network_seq minvalue 0 maxvalue 196607 start 0 no cycle;

create table if not exists public.societies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,32}$'),
  name text not null check (length(name) between 2 and 120),
  network text not null unique,
  join_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.society_members (
  society_id uuid not null references public.societies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('officer','leader','member')),
  display_name text not null default '' check (length(display_name) <= 60),
  joined_at timestamptz not null default now(),
  primary key (society_id, user_id)
);
create index if not exists society_members_user_idx on public.society_members (user_id);

create table if not exists public.society_id_sets (
  network text not null references public.societies (network) on delete cascade,
  set_no int not null check (set_no between 0 and 1023),
  device_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (network, set_no)
);

create table if not exists public.device_keys (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id uuid not null,
  key_id text not null check (key_id ~ '^[0-9a-f]{8}$'),
  public_key text not null check (length(public_key) between 40 and 200), -- base64 raw P-256 point
  created_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

-- 3. Helpers.
create or replace function public.fa_uid_verified() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null or not exists (select 1 from auth.users u where u.id = v and u.email_confirmed_at is not null) then
    raise exception 'verified email required';
  end if;
  return v;
end $$;

-- 8 random characters from the ID alphabet (256 is a multiple of 32, so no bias).
create or replace function public.fa_random_code(len int default 8) returns text
language plpgsql volatile as $$
declare b bytea := decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex');
        out text := ''; i int;
begin
  for i in 0..len - 1 loop
    -- uuid v4 has fixed version/variant bits in bytes 6 and 8; skip them.
    out := out || substr(public.fa_alphabet(), (get_byte(b, case when i < 6 then i else i + 3 end) % 32) + 1, 1);
  end loop;
  return out;
end $$;

-- Normalise user input: upper case, keep alphabet characters only.
create or replace function public.fa_norm_code(s text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(s, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function public.fa_mesh_key() returns text
language sql volatile as $$
  select encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64')
$$;

create or replace function public.fa_is_foray_member(p_foray uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.foray_members m
                  where m.foray_id = p_foray and m.user_id = auth.uid() and m.left_at is null)
$$;

create or replace function public.fa_society_role(p_society uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.society_members m where m.society_id = p_society and m.user_id = auth.uid()
$$;

-- Society network code from n: a bijection over 0..196607 onto classes U-Z (6 x 32^3).
create or replace function public.fa_society_network_code(n bigint) returns text
language plpgsql immutable parallel safe as $$
declare s bigint;
begin
  if n is null or n < 0 or n > 196607 then raise exception 'society network number out of range'; end if;
  s := (n * 98317 + 4242) % 196608;
  return substr(public.fa_alphabet(), 19 + (s / 32768)::int, 1) || public.fa_encode_b32(s % 32768, 3);
end $$;

-- Obscure a coordinate to the centre of a 0.2 degree cell (like iNaturalist).
create or replace function public.fa_obscure(v double precision) returns double precision
language sql immutable as $$ select case when v is null then null else floor(v / 0.2) * 0.2 + 0.1 end $$;

-- 4. Guard: only the functions below may set join_code / society_id / mesh_key.
create or replace function public.fa_foray_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('fa.internal', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.join_code := null; new.society_id := null; new.mesh_key := null;
  else
    new.join_code := old.join_code; new.society_id := old.society_id; new.mesh_key := old.mesh_key;
  end if;
  return new;
end $$;
drop trigger if exists forays_guard on public.forays;
create trigger forays_guard before insert or update on public.forays
  for each row execute function public.fa_foray_guard();

-- Voucher numbers: society-class IDs from a set claimed for a society the author belongs to.
create or replace function public.fa_voucher_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.voucher_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.voucher_id is not distinct from old.voucher_id then return new; end if;
  if not public.fa_id_valid(new.voucher_id) or length(new.voucher_id) <> 9
     or substr(new.voucher_id, 1, 1) not in ('U','V','W','X','Y','Z') then
    raise exception 'voucher number is not a valid society number';
  end if;
  if not exists (
    select 1 from public.society_id_sets s
      join public.societies so on so.network = s.network
      join public.society_members m on m.society_id = so.id and m.user_id = new.user_id
     where s.network = substr(new.voucher_id, 1, 4)
       and s.set_no = public.fa_decode_b32(substr(new.voucher_id, 5, 2))) then
    raise exception 'voucher number was not issued to a society you belong to';
  end if;
  return new;
end $$;
revoke all on function public.fa_voucher_guard() from public, anon, authenticated;
drop trigger if exists specimens_voucher_guard on public.specimens;
create trigger specimens_voucher_guard before insert or update of voucher_id on public.specimens
  for each row execute function public.fa_voucher_guard();

-- 5. RLS.
alter table public.foray_members enable row level security;
alter table public.find_comments enable row level security;
alter table public.societies enable row level security;
alter table public.society_members enable row level security;
alter table public.society_id_sets enable row level security;
alter table public.device_keys enable row level security;

drop policy if exists "forays select member" on public.forays;
create policy "forays select member" on public.forays for select to authenticated
  using (public.fa_is_foray_member(id));

drop policy if exists "foray_members select" on public.foray_members;
create policy "foray_members select" on public.foray_members for select to authenticated
  using (user_id = (select auth.uid()) or public.fa_is_foray_member(foray_id));

create or replace function public.fa_can_comment(p_foray uuid, p_specimen uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.fa_is_foray_member(p_foray)
     and exists (select 1 from public.specimens s where s.id = p_specimen and s.foray_id = p_foray)
$$;

drop policy if exists "find_comments select" on public.find_comments;
create policy "find_comments select" on public.find_comments for select to authenticated
  using (user_id = (select auth.uid()) or public.fa_is_foray_member(foray_id));
drop policy if exists "find_comments insert" on public.find_comments;
create policy "find_comments insert" on public.find_comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.fa_can_comment(foray_id, specimen_row_id));
drop policy if exists "find_comments update own" on public.find_comments;
create policy "find_comments update own" on public.find_comments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.fa_can_comment(foray_id, specimen_row_id));
drop policy if exists "find_comments delete own" on public.find_comments;
create policy "find_comments delete own" on public.find_comments for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "societies select member" on public.societies;
create policy "societies select member" on public.societies for select to authenticated
  using (public.fa_society_role(id) is not null);
drop policy if exists "society_members select" on public.society_members;
create policy "society_members select" on public.society_members for select to authenticated
  using (public.fa_society_role(society_id) is not null);
drop policy if exists "society_id_sets select own" on public.society_id_sets;
create policy "society_id_sets select own" on public.society_id_sets for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "device_keys select own" on public.device_keys;
create policy "device_keys select own" on public.device_keys for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "device_keys insert own" on public.device_keys;
create policy "device_keys insert own" on public.device_keys for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "device_keys update own" on public.device_keys;
create policy "device_keys update own" on public.device_keys for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.foray_members, public.societies, public.society_members, public.society_id_sets from anon, authenticated;
grant select on public.foray_members, public.societies, public.society_members, public.society_id_sets to authenticated;
revoke all on public.find_comments, public.device_keys from anon;
grant select, insert, update, delete on public.find_comments to authenticated;
grant select, insert, update on public.device_keys to authenticated;

-- Members may read the media of shared finds (not of private finds).
create or replace function public.fa_can_read_shared_media(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.photos p
      join public.specimens s on s.id = p.specimen_row_id
      join public.foray_members am on am.foray_id = s.foray_id and am.user_id = s.user_id
     where p.storage_path = p_path and s.geoprivacy <> 'private'
       and public.fa_is_foray_member(s.foray_id))
$$;
drop policy if exists "foray-media select shared" on storage.objects;
create policy "foray-media select shared" on storage.objects for select to authenticated
  using (bucket_id = 'foray-media' and public.fa_can_read_shared_media(name));

-- 6. Shared foray functions.
create or replace function public.share_foray(
  p_foray_id uuid, p_name text, p_started_at timestamptz,
  p_display_name text default '', p_society_id uuid default null)
returns table (join_code text, mesh_key text, society_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := public.fa_uid_verified(); v_owner uuid; v_code text; v_soc text;
begin
  perform set_config('fa.internal', 'on', true);
  -- The foray row may not have synced yet: create it for the caller if it is missing.
  insert into public.forays (id, user_id, name, started_at, updated_at)
    values (p_foray_id, v_uid, coalesce(nullif(trim(p_name), ''), 'Foray'), coalesce(p_started_at, now()), now())
    on conflict (id) do nothing;
  select f.user_id, f.join_code into v_owner, v_code from public.forays f where f.id = p_foray_id;
  if v_owner is distinct from v_uid then raise exception 'only the person who started this foray can share it'; end if;

  if p_society_id is not null then
    if coalesce(public.fa_society_role(p_society_id), '') not in ('officer', 'leader') then
      raise exception 'only society officers and leaders can run a society foray';
    end if;
    update public.forays f set society_id = p_society_id where f.id = p_foray_id;
  end if;

  if v_code is null then
    loop
      v_code := public.fa_random_code(8);
      exit when not exists (select 1 from public.forays f where f.join_code = v_code);
    end loop;
    update public.forays f set join_code = v_code, mesh_key = coalesce(f.mesh_key, public.fa_mesh_key())
     where f.id = p_foray_id;
  end if;

  insert into public.foray_members (foray_id, user_id, role, display_name)
    values (p_foray_id, v_uid, 'owner', left(coalesce(p_display_name, ''), 60))
    on conflict (foray_id, user_id) do update
      set role = 'owner', left_at = null,
          display_name = coalesce(nullif(left(excluded.display_name, 60), ''), foray_members.display_name);

  select s.name into v_soc from public.forays f left join public.societies s on s.id = f.society_id where f.id = p_foray_id;
  return query select f.join_code, f.mesh_key, v_soc from public.forays f where f.id = p_foray_id;
end $$;

create or replace function public.join_foray(p_code text, p_display_name text default '')
returns table (foray_id uuid, name text, started_at timestamptz, ended_at timestamptz,
               join_code text, mesh_key text, role text, society_name text, owner_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := public.fa_uid_verified(); v_id uuid; v_code text := public.fa_norm_code(p_code);
begin
  select f.id into v_id from public.forays f where f.join_code = v_code;
  if v_id is null then raise exception 'join code not found'; end if;
  insert into public.foray_members (foray_id, user_id, role, display_name)
    values (v_id, v_uid, 'member', left(coalesce(p_display_name, ''), 60))
    on conflict on constraint foray_members_pkey do update
      set left_at = null,
          display_name = coalesce(nullif(left(excluded.display_name, 60), ''), foray_members.display_name);
  return query
    select f.id, f.name, f.started_at, f.ended_at, f.join_code, f.mesh_key, m.role, s.name,
           (select o.display_name from public.foray_members o where o.foray_id = f.id and o.role = 'owner' limit 1)
      from public.forays f
      join public.foray_members m on m.foray_id = f.id and m.user_id = v_uid
      left join public.societies s on s.id = f.society_id
     where f.id = v_id;
end $$;

create or replace function public.leave_foray(p_foray_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if exists (select 1 from public.forays f where f.id = p_foray_id and f.user_id = v_uid) then
    raise exception 'the person who started a foray cannot leave it; turn sharing off instead';
  end if;
  update public.foray_members m set left_at = now() where m.foray_id = p_foray_id and m.user_id = v_uid;
end $$;

-- Owner or leader: issue a new join code (old one stops working), or turn joining off.
create or replace function public.rotate_foray_code(p_foray_id uuid, p_disable boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text;
begin
  if not exists (select 1 from public.foray_members m where m.foray_id = p_foray_id and m.user_id = v_uid
                   and m.left_at is null and m.role in ('owner', 'leader')) then
    raise exception 'only the foray owner or a leader can change the join code';
  end if;
  perform set_config('fa.internal', 'on', true);
  if p_disable then
    update public.forays f set join_code = null where f.id = p_foray_id;
    return null;
  end if;
  loop
    v_code := public.fa_random_code(8);
    exit when not exists (select 1 from public.forays f where f.join_code = v_code);
  end loop;
  update public.forays f set join_code = v_code where f.id = p_foray_id;
  return v_code;
end $$;

create or replace function public.set_foray_role(p_foray_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('leader', 'member') then raise exception 'role must be leader or member'; end if;
  if not exists (select 1 from public.forays f where f.id = p_foray_id and f.user_id = auth.uid()) then
    raise exception 'only the foray owner can change roles';
  end if;
  update public.foray_members m set role = p_role
   where m.foray_id = p_foray_id and m.user_id = p_user_id and m.role <> 'owner';
end $$;

-- Members (current and past) with their device keys, for showing names and verifying alerts.
create or replace function public.foray_member_list(p_foray_id uuid)
returns table (user_id uuid, display_name text, role text, joined_at timestamptz, left_at timestamptz, keys jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.fa_is_foray_member(p_foray_id) then raise exception 'not a member of this foray'; end if;
  return query
    select m.user_id, m.display_name, m.role, m.joined_at, m.left_at,
           coalesce((select jsonb_agg(jsonb_build_object('device_id', k.device_id, 'key_id', k.key_id, 'public_key', k.public_key))
                       from public.device_keys k where k.user_id = m.user_id), '[]'::jsonb)
      from public.foray_members m where m.foray_id = p_foray_id
     order by m.joined_at;
end $$;

-- Everyone's finds in the foray, with each find's location setting applied. Only finds by
-- people who are or were members are included, so nobody can inject rows by foray_id alone.
create or replace function public.foray_feed(p_foray_id uuid)
returns table (id uuid, user_id uuid, author_name text, specimen_id text, voucher_id text,
               "timestamp" timestamptz, latitude double precision, longitude double precision,
               geoprivacy text, field_notes jsonb, updated_at timestamptz, photos jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.fa_is_foray_member(p_foray_id) then raise exception 'not a member of this foray'; end if;
  return query
    select s.id, s.user_id, m.display_name, s.specimen_id, s.voucher_id, s."timestamp",
           case s.geoprivacy when 'open' then s.latitude when 'obscured' then public.fa_obscure(s.latitude) end,
           case s.geoprivacy when 'open' then s.longitude when 'obscured' then public.fa_obscure(s.longitude) end,
           s.geoprivacy, s.field_notes, s.updated_at,
           case when s.geoprivacy = 'private' then '[]'::jsonb else coalesce((
             select jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'is_selected', p.is_selected,
                                                 'captured_at', p.captured_at) order by p.is_selected desc, p.captured_at)
               from public.photos p where p.specimen_row_id = s.id and p.storage_path is not null), '[]'::jsonb) end
      from public.specimens s
      join public.foray_members m on m.foray_id = s.foray_id and m.user_id = s.user_id
     where s.foray_id = p_foray_id
     order by s."timestamp";
end $$;

create or replace function public.foray_comments(p_foray_id uuid)
returns table (id uuid, user_id uuid, author_name text, specimen_row_id uuid, kind text, body text,
               taxon text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.fa_is_foray_member(p_foray_id) then raise exception 'not a member of this foray'; end if;
  return query
    select c.id, c.user_id, coalesce(m.display_name, ''), c.specimen_row_id, c.kind, c.body, c.taxon, c.created_at, c.updated_at
      from public.find_comments c
      left join public.foray_members m on m.foray_id = c.foray_id and m.user_id = c.user_id
     where c.foray_id = p_foray_id
     order by c.created_at;
end $$;

-- 7. Society functions. create_society is for the project admin (SQL editor / service role).
create or replace function public.create_society(p_slug text, p_name text, p_officer_email text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid;
begin
  insert into public.societies (slug, name, network, join_code)
    values (lower(p_slug), p_name, public.fa_society_network_code(nextval('public.society_network_seq')), public.fa_random_code(8))
    returning id into v_id;
  if p_officer_email is not null then
    select u.id into v_user from auth.users u where lower(u.email) = lower(p_officer_email);
    if v_user is null then raise exception 'no account with email %', p_officer_email; end if;
    insert into public.society_members (society_id, user_id, role) values (v_id, v_user, 'officer');
  end if;
  return v_id;
end $$;

create or replace function public.join_society(p_code text, p_display_name text default '')
returns table (society_id uuid, slug text, name text, network text, role text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := public.fa_uid_verified(); v_id uuid;
begin
  select s.id into v_id from public.societies s where s.join_code = public.fa_norm_code(p_code);
  if v_id is null then raise exception 'society code not found'; end if;
  insert into public.society_members (society_id, user_id, role, display_name)
    values (v_id, v_uid, 'member', left(coalesce(p_display_name, ''), 60))
    on conflict on constraint society_members_pkey do nothing;
  return query select s.id, s.slug, s.name, s.network, m.role
    from public.societies s join public.society_members m on m.society_id = s.id and m.user_id = v_uid
   where s.id = v_id;
end $$;

create or replace function public.my_societies()
returns table (society_id uuid, slug text, name text, network text, role text, join_code text)
language sql stable security definer set search_path = public as $$
  select s.id, s.slug, s.name, s.network, m.role,
         case when m.role in ('officer', 'leader') then s.join_code end
    from public.society_members m join public.societies s on s.id = m.society_id
   where m.user_id = auth.uid()
   order by s.name
$$;

create or replace function public.set_society_role(p_society_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_role not in ('officer', 'leader', 'member') then raise exception 'unknown role'; end if;
  if public.fa_society_role(p_society_id) is distinct from 'officer' then raise exception 'only officers can change roles'; end if;
  update public.society_members m set role = p_role where m.society_id = p_society_id and m.user_id = p_user_id;
end $$;

create or replace function public.rotate_society_code(p_society_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if public.fa_society_role(p_society_id) is distinct from 'officer' then raise exception 'only officers can change the society code'; end if;
  loop
    v_code := public.fa_random_code(8);
    exit when not exists (select 1 from public.societies s where s.join_code = v_code);
  end loop;
  update public.societies s set join_code = v_code where s.id = p_society_id;
  return v_code;
end $$;

-- Shared forays run by the society, for members to join from the society list.
create or replace function public.society_forays(p_society_id uuid)
returns table (foray_id uuid, name text, started_at timestamptz, ended_at timestamptz, join_code text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if public.fa_society_role(p_society_id) is null then raise exception 'not a member of this society'; end if;
  return query select f.id, f.name, f.started_at, f.ended_at, f.join_code
    from public.forays f where f.society_id = p_society_id and f.join_code is not null
   order by f.started_at desc limit 50;
end $$;

-- Officers and leaders claim sets of society voucher numbers (for preprinted sheets).
create or replace function public.claim_society_sets(p_society_id uuid, p_device_id uuid, p_count int default 1)
returns table (network text, set_no int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := public.fa_uid_verified(); v_net text; v_next int; v_left int := p_count; v_recent int;
begin
  if coalesce(public.fa_society_role(p_society_id), '') not in ('officer', 'leader') then
    raise exception 'only society officers and leaders can claim voucher numbers';
  end if;
  if p_device_id is null then raise exception 'device id required'; end if;
  if p_count is null or p_count < 1 or p_count > 4 then raise exception 'count must be between 1 and 4'; end if;
  select s.network into v_net from public.societies s where s.id = p_society_id;
  perform pg_advisory_xact_lock(hashtext('society:' || v_net));
  select count(*) into v_recent from public.society_id_sets s where s.network = v_net and s.claimed_at > now() - interval '24 hours';
  if v_recent + p_count > 16 then raise exception 'voucher claim limit reached'; end if;
  select coalesce(max(s.set_no), -1) + 1 into v_next from public.society_id_sets s where s.network = v_net;
  while v_left > 0 loop
    if v_next > 1023 then raise exception 'society network is full'; end if;
    insert into public.society_id_sets (network, set_no, device_id, user_id) values (v_net, v_next, p_device_id, v_uid);
    network := v_net; set_no := v_next;
    return next;
    v_next := v_next + 1; v_left := v_left - 1;
  end loop;
end $$;

-- 8. Grants.
revoke all on function public.share_foray(uuid, text, timestamptz, text, uuid) from public, anon;
grant execute on function public.share_foray(uuid, text, timestamptz, text, uuid) to authenticated;
revoke all on function public.join_foray(text, text) from public, anon;
grant execute on function public.join_foray(text, text) to authenticated;
revoke all on function public.leave_foray(uuid) from public, anon;
grant execute on function public.leave_foray(uuid) to authenticated;
revoke all on function public.rotate_foray_code(uuid, boolean) from public, anon;
grant execute on function public.rotate_foray_code(uuid, boolean) to authenticated;
revoke all on function public.set_foray_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_foray_role(uuid, uuid, text) to authenticated;
revoke all on function public.foray_member_list(uuid) from public, anon;
grant execute on function public.foray_member_list(uuid) to authenticated;
revoke all on function public.foray_feed(uuid) from public, anon;
grant execute on function public.foray_feed(uuid) to authenticated;
revoke all on function public.foray_comments(uuid) from public, anon;
grant execute on function public.foray_comments(uuid) to authenticated;
revoke all on function public.create_society(text, text, text) from public, anon, authenticated;
revoke all on function public.join_society(text, text) from public, anon;
grant execute on function public.join_society(text, text) to authenticated;
revoke all on function public.my_societies() from public, anon;
grant execute on function public.my_societies() to authenticated;
revoke all on function public.set_society_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_society_role(uuid, uuid, text) to authenticated;
revoke all on function public.rotate_society_code(uuid) from public, anon;
grant execute on function public.rotate_society_code(uuid) to authenticated;
revoke all on function public.society_forays(uuid) from public, anon;
grant execute on function public.society_forays(uuid) to authenticated;
revoke all on function public.claim_society_sets(uuid, uuid, int) from public, anon;
grant execute on function public.claim_society_sets(uuid, uuid, int) to authenticated;
