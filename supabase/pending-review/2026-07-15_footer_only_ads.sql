-- ─────────────────────────────────────────────────────────────────────────────
-- Footer-only ads normalization — drafted 2026-07-15 (NOT applied)
--
-- Business rule (client decision, in force since project start): the mobile
-- app shows ONE ad at a time, in the footer slot only. Advertisers rent the
-- slot for 7 or 14 days sequentially — a "header" position never existed in
-- the product. This migration makes the database enforce that rule so the
-- wrong assumption can never resurface through data.
--
-- The `position` column is deliberately KEPT (not dropped): the mobile app's
-- sync RPCs (`get_active_ads`, `get_today_content`) may include it in their
-- payload and the mobile client may pattern-match on it. Dropping or renaming
-- it is a coordinated mobile+CMS change for later.
--
-- BEFORE APPLYING, verify with the mobile dev:
--   1. Mobile never WRITES ad_campaigns rows (CMS-only writes) — expected yes.
--   2. Mobile tolerates position always being 'footer' — expected yes, since
--      that is all it has ever rendered.
--
-- Follow-up (deferred to the metrics chart redesign): rework
-- `metrics_extra_stats` (fill_rate: drop header_days/footer_days split) and
-- `dashboard_operational_stats` (inventory h/f flags → single sold boolean).
-- After this migration, `header_days` simply reads 0 everywhere, which the
-- CMS already assumes (it renders footer_days only as of 2026-07-15).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Normalize any legacy rows that were saved as 'header' back when the
--    campaign form still offered a position choice.
UPDATE public.ad_campaigns
SET    position = 'footer'
WHERE  position <> 'footer';

-- 2. New rows default to footer (the CMS already hardcodes it client-side).
ALTER TABLE public.ad_campaigns
  ALTER COLUMN position SET DEFAULT 'footer';

-- 3. Enforce the business rule at the database level. Idempotent guard so a
--    re-run doesn't abort the transaction.
DO $$
BEGIN
  ALTER TABLE public.ad_campaigns
    ADD CONSTRAINT ad_campaigns_position_footer_only CHECK (position = 'footer');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
