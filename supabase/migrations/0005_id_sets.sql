-- 0005: server-issued specimen ID networks and sets.
--
-- A specimen ID is 9 characters: class+network (4), set (2), observation (2), check (1).
-- IDs identify the AUTHOR. The server issues each network to exactly one user and each
-- set to exactly one device; a device counts up inside its own sets. Only these
-- functions write id_networks / id_sets, and a trigger on specimens refuses any ID that
-- was not issued to the row's owner. '' means "ID pending" and is always allowed.

-- 1. Uniqueness: IDs are now globally unique (they carry the author), not per user.
drop index if exists public.specimens_user_specimen_id_key;
create unique index if not exists specimens_specimen_id_key
  on public.specimens (specimen_id) where specimen_id <> '';

-- 2. Tables. RLS on, owners may read their own rows, nobody may write directly.
create sequence if not exists public.id_network_seq minvalue 0 maxvalue 262143 start 0 no cycle;

create table if not exists public.id_networks (
  net_no int primary key check (net_no between 0 and 262143),
  code text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- net_no is set only by claim_id_sets, which draws one sequence value for both net_no and
-- code. (An earlier version also had a column default, which burned a second value per network.)
alter table public.id_networks alter column net_no drop default;
create index if not exists id_networks_user_idx on public.id_networks (user_id, net_no);

create table if not exists public.id_sets (
  network text not null references public.id_networks (code) on delete cascade,
  set_no int not null check (set_no between 0 and 1023),
  device_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (network, set_no)
);
create index if not exists id_sets_user_idx on public.id_sets (user_id, claimed_at);

alter table public.id_networks enable row level security;
alter table public.id_sets enable row level security;
drop policy if exists "id_networks select own" on public.id_networks;
create policy "id_networks select own" on public.id_networks
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "id_sets select own" on public.id_sets;
create policy "id_sets select own" on public.id_sets
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.id_networks, public.id_sets from anon, authenticated;
grant select on public.id_networks, public.id_sets to authenticated;

-- 3. Pure helpers (mirror utils/idCode.ts).
create or replace function public.fa_alphabet() returns text
language sql immutable parallel safe as $$ select 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'::text $$;

create or replace function public.fa_encode_b32(n bigint, width int) returns text
language plpgsql immutable parallel safe as $$
declare out text := ''; v bigint := n; i int;
begin
  if n is null or width is null or width < 1 or n < 0 or n >= (32::bigint ^ width)::bigint then
    raise exception 'value % does not fit % characters', n, width;
  end if;
  for i in 1..width loop
    out := substr(public.fa_alphabet(), (v % 32)::int + 1, 1) || out;
    v := v / 32;
  end loop;
  return out;
end $$;

-- Returns null when s is empty or has a character outside the alphabet.
create or replace function public.fa_decode_b32(s text) returns bigint
language plpgsql immutable parallel safe as $$
declare n bigint := 0; i int; p int;
begin
  if s is null or s = '' then return null; end if;
  for i in 1..length(s) loop
    p := strpos(public.fa_alphabet(), substr(s, i, 1));
    if p = 0 then return null; end if;
    n := n * 32 + (p - 1);
  end loop;
  return n;
end $$;

-- Remainder over GF(32) = GF(2)[x]/(x^5+x^2+1); null for an invalid character.
create or replace function public.fa_id_remainder(s text) returns int
language plpgsql immutable parallel safe as $$
declare r int := 0; i int; p int;
begin
  if s is null then return null; end if;
  for i in 1..length(s) loop
    p := strpos(public.fa_alphabet(), substr(s, i, 1));
    if p = 0 then return null; end if;
    r := (((r << 1) & 31) # (case when (r & 16) <> 0 then 5 else 0 end)) # (p - 1);
  end loop;
  return r;
end $$;

create or replace function public.fa_id_check_char(payload text) returns text
language plpgsql immutable parallel safe as $$
declare r int := public.fa_id_remainder(payload);
begin
  if r is null then return null; end if;
  r := ((r << 1) & 31) # (case when (r & 16) <> 0 then 5 else 0 end);
  return substr(public.fa_alphabet(), r + 1, 1);
end $$;

-- Shape only: known class, right length for that class, alphabet characters.
create or replace function public.fa_id_shape_ok(id text) returns boolean
language plpgsql immutable parallel safe as $$
declare c int;
begin
  if id is null or id = '' then return false; end if;
  c := strpos(public.fa_alphabet(), substr(id, 1, 1)) - 1;
  if c < 0 or c > 23 then return false; end if;           -- 2-9 are reserved
  if public.fa_id_remainder(id) is null then return false; end if;
  return length(id) = case when c between 8 and 12 then 12 else 9 end;
end $$;

create or replace function public.fa_id_valid(id text) returns boolean
language sql immutable parallel safe as $$
  select coalesce(public.fa_id_shape_ok(id) and public.fa_id_remainder(id) = 0, false)
$$;

-- Network code from sequence number n: a bijection over 0..262143.
create or replace function public.fa_network_code(n bigint) returns text
language plpgsql immutable parallel safe as $$
declare s bigint;
begin
  if n is null or n < 0 or n > 262143 then raise exception 'network number out of range'; end if;
  s := (n * 98317 + 12345) % 262144;
  return substr(public.fa_alphabet(), (s / 32768)::int + 1, 1) || public.fa_encode_b32(s % 32768, 3);
end $$;

-- 4. claim_id_sets: hand this device the next free sets of the caller's newest network.
create or replace function public.claim_id_sets(p_device_id uuid, p_count int default 4)
returns table (network text, set_no int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_left int := p_count;
  v_net text;
  v_next int;
  v_claimed int;
  v_no bigint;
begin
  if v_uid is null
     or not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'verified email required';
  end if;
  if p_device_id is null then raise exception 'device id required'; end if;
  if p_count is null or p_count < 1 or p_count > 16 then raise exception 'count must be between 1 and 16'; end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  select count(*) into v_claimed from public.id_sets s
   where s.user_id = v_uid and s.claimed_at > now() - interval '24 hours';
  if v_claimed + p_count > 64 then raise exception 'id set claim limit reached'; end if;

  select n.code into v_net from public.id_networks n where n.user_id = v_uid order by n.net_no desc limit 1;
  if v_net is not null then
    select coalesce(max(s.set_no), -1) + 1 into v_next from public.id_sets s where s.network = v_net;
  end if;

  while v_left > 0 loop
    if v_net is null or v_next > 1023 then
      v_no := nextval('public.id_network_seq');
      insert into public.id_networks (net_no, code, user_id)
        values (v_no, public.fa_network_code(v_no), v_uid)
        returning code into v_net;
      v_next := 0;
    end if;
    insert into public.id_sets (network, set_no, device_id, user_id) values (v_net, v_next, p_device_id, v_uid);
    network := v_net; set_no := v_next;
    return next;
    v_next := v_next + 1;
    v_left := v_left - 1;
  end loop;
end $$;

revoke all on function public.claim_id_sets(uuid, int) from public, anon;
grant execute on function public.claim_id_sets(uuid, int) to authenticated;

-- 5. verify_ids: report problems for the caller's IDs; good IDs return nothing.
create or replace function public.verify_ids(p_ids text[])
returns table (id text, problem text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); x text;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  foreach x in array coalesce(p_ids, array[]::text[]) loop
    if x is null or x = '' then continue; end if;
    id := x;
    if not public.fa_id_shape_ok(x) then
      problem := 'bad format'; return next;
    elsif public.fa_id_remainder(x) <> 0 then
      problem := 'bad check character'; return next;
    elsif length(x) <> 9 or not exists (
      select 1 from public.id_sets s
       where s.user_id = v_uid and s.network = substr(x, 1, 4)
         and s.set_no = public.fa_decode_b32(substr(x, 5, 2))) then
      problem := 'not issued to you'; return next;
    end if;
  end loop;
end $$;

revoke all on function public.verify_ids(text[]) from public, anon;
grant execute on function public.verify_ids(text[]) to authenticated;

-- 6. Guard on specimens: only IDs issued to the row's owner (or '' = pending).
create or replace function public.fa_specimen_id_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.specimen_id is null or new.specimen_id = '' then return new; end if;
  if not public.fa_id_valid(new.specimen_id) then
    raise exception 'specimen id is not valid (format or check character)';
  end if;
  if substr(new.specimen_id, 1, 1) > 'H' then
    raise exception 'only personal specimen ids (class A-H) are accepted for now';
  end if;
  if not exists (
    select 1 from public.id_sets s
     where s.user_id = new.user_id and s.network = substr(new.specimen_id, 1, 4)
       and s.set_no = public.fa_decode_b32(substr(new.specimen_id, 5, 2))) then
    raise exception 'specimen id was not issued to this account';
  end if;
  return new;
end $$;

revoke all on function public.fa_specimen_id_guard() from public, anon, authenticated;

drop trigger if exists specimens_id_guard on public.specimens;
create trigger specimens_id_guard
  before insert or update of specimen_id on public.specimens
  for each row execute function public.fa_specimen_id_guard();
