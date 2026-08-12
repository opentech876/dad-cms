-- ─────────────────────────────────────────────────────────────────────────────
-- S-5 — block anonymous enumeration (listing) of the public buckets
--
-- All four buckets (historical-images, ads-banners, avatars, workspace-logos)
-- are public-flagged (verified 2026-08-12: storage.buckets.public = true), so
-- every read goes through the public CDN URL (`getPublicUrl`), which BYPASSES
-- storage.objects RLS entirely. Confirmed neither client uses the list/download
-- API:
--   • mobile  → getPublicUrl only (Mondésir inventory, docs/mondesir functions.md)
--   • CMS     → getPublicUrl only (no .list()/.download() anywhere in src/)
--
-- So these anon/public SELECT policies are redundant for reads and their ONLY
-- effect is letting anonymous clients enumerate every object in the buckets.
-- Dropping them blocks enumeration without touching reads. Upload/update/delete
-- keep their own `authenticated` policies (not listed here — untouched).
--
-- Reversible: if some future flow needs authenticated listing, add a scoped
-- `FOR SELECT TO authenticated` policy back (do NOT restore the `anon`/`public`
-- ones — that re-opens enumeration).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Ads Banners - Public read for mobile"       ON storage.objects;
DROP POLICY IF EXISTS "Historical Images - Public read for mobile" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly readable"              ON storage.objects;
DROP POLICY IF EXISTS "Workspace logos are publicly readable"      ON storage.objects;
DROP POLICY IF EXISTS "ads_banners_public_read"                    ON storage.objects;
DROP POLICY IF EXISTS "historical_images_public_read"              ON storage.objects;

-- Sanity check after applying — should return NO anon/public SELECT rows:
--   SELECT policyname, roles, cmd FROM pg_policies
--   WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT';
