-- Which diagnostic shot a photo is (cap, underside, stem, habitat), set by the AR guide.
-- Used for the Thoroughness score (utils/score.ts). Nullable: photos taken elsewhere have none.
alter table public.photos
  add column if not exists angle text
  check (angle is null or angle in ('cap', 'underside', 'stem', 'habitat'));
