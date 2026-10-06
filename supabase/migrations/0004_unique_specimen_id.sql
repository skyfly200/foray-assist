-- Specimen IDs (e.g. SF-M042K) must be unique per user. Two of the user's devices could
-- in rare cases draw the same random block before syncing; this index makes that surface
-- as a failed (and then parked) sync item in Settings instead of silently merging records.
create unique index if not exists specimens_user_specimen_id_key
  on public.specimens (user_id, specimen_id);
