-- ─────────────────────────────────────────────────────────────────────────
-- FIX — "duplicate key value violates unique constraint" when applying
-- recommendations (uq_calendar_entry_one_position_per_event).
--
-- calendar_entries enforces TWO unique constraints:
--   1. uq_calendar_entry_one_event_per_position  (calendar_id, mmdd, position)
--   2. uq_calendar_entry_one_position_per_event  (calendar_id, mmdd, event_id)
-- The apply RPCs only handled #1 (ON CONFLICT on the slot). When a pending
-- recommendation targets position P with an event that already sits on the
-- OTHER position of the same day, the INSERT violates #2 and the whole call
-- aborts with a raw 23505 — the "duplicate values" error seen in the CMS.
--
-- This draft:
--   A. makes both apply RPCs handle that case gracefully
--      (bulk → counted as skipped; single → readable 22023 error),
--   B. removes any already-duplicated recommendation rows, then
--   C. mirrors the one-position-per-event rule onto
--      presidency_recommendations so the bad state can no longer be created
--      (the CMS also blocks it client-side with a French message).
--
-- Review then run in Supabase Studio → SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── A1. Bulk apply: skip recs whose event already occupies the other slot ──
CREATE OR REPLACE FUNCTION public.apply_presidency_recommendations(
  p_calendar_id uuid,
  p_overwrite   boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_applied_count int := 0;
  v_skipped_count int := 0;
  r record;
BEGIN
  IF NOT public.has_role_at_least('chef_equipe'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT id, calendar_id, mmdd, position, event_id, workspace_id
    FROM public.presidency_recommendations
    WHERE calendar_id = p_calendar_id AND status = 'pending'
  LOOP
    IF NOT p_overwrite AND EXISTS (
      SELECT 1 FROM public.calendar_entries ce
      WHERE ce.calendar_id = r.calendar_id AND ce.mmdd = r.mmdd AND ce.position = r.position
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- One event may only occupy one position per day: if it already sits on
    -- the OTHER position, applying would violate
    -- uq_calendar_entry_one_position_per_event — skip instead of aborting.
    IF EXISTS (
      SELECT 1 FROM public.calendar_entries ce
      WHERE ce.calendar_id = r.calendar_id AND ce.mmdd = r.mmdd
        AND ce.event_id = r.event_id AND ce.position <> r.position
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.calendar_entries (calendar_id, mmdd, position, event_id, workspace_id, created_by)
    VALUES (r.calendar_id, r.mmdd, r.position, r.event_id, r.workspace_id, auth.uid())
    ON CONFLICT (calendar_id, mmdd, position) DO UPDATE
      SET event_id = EXCLUDED.event_id, updated_at = now();

    UPDATE public.presidency_recommendations
      SET status = 'applied', applied_at = now(), applied_by = auth.uid()
      WHERE id = r.id;

    v_applied_count := v_applied_count + 1;
  END LOOP;

  RETURN jsonb_build_object('applied', v_applied_count, 'skipped', v_skipped_count);
END;
$$;

-- ── A2. Single apply: same check, explicit readable error ──────────────────
CREATE OR REPLACE FUNCTION public.apply_single_recommendation(p_recommendation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  r record;
BEGIN
  IF NOT public.has_role_at_least('chef_equipe'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT id, calendar_id, mmdd, position, event_id, workspace_id
    INTO r
  FROM public.presidency_recommendations
  WHERE id = p_recommendation_id
    AND status = 'pending'
    AND workspace_id IN (SELECT public.get_my_workspace_ids());

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'recommendation_not_applicable' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.calendar_entries ce
    WHERE ce.calendar_id = r.calendar_id AND ce.mmdd = r.mmdd
      AND ce.event_id = r.event_id AND ce.position <> r.position
  ) THEN
    RAISE EXCEPTION 'event_already_on_other_position' USING ERRCODE = '22023',
      HINT = 'Cet événement occupe déjà l''autre position de cette date.';
  END IF;

  INSERT INTO public.calendar_entries (calendar_id, mmdd, position, event_id, workspace_id, created_by)
  VALUES (r.calendar_id, r.mmdd, r.position, r.event_id, r.workspace_id, auth.uid())
  ON CONFLICT (calendar_id, mmdd, position) DO UPDATE
    SET event_id = EXCLUDED.event_id, updated_at = now();

  UPDATE public.presidency_recommendations
    SET status = 'applied', applied_at = now(), applied_by = auth.uid()
    WHERE id = r.id;
END;
$$;

-- ── B. Clean up recommendations already duplicated on one day ──────────────
-- Same (calendar, day, event) recommended on both positions: keep the
-- applied one when there is one, else the most recently updated; drop the
-- rest so the constraint below can be created.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY calendar_id, mmdd, event_id
           ORDER BY (status = 'applied') DESC, updated_at DESC
         ) AS rn
  FROM public.presidency_recommendations
)
DELETE FROM public.presidency_recommendations pr
USING ranked
WHERE pr.id = ranked.id AND ranked.rn > 1;

-- ── C. Mirror the rule at recommendation time ───────────────────────────────
-- One event can be recommended on at most one position per day. The CMS
-- maps 23505 to a readable French message and pre-checks before submitting.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_presidency_one_position_per_event'
  ) THEN
    ALTER TABLE public.presidency_recommendations
      ADD CONSTRAINT uq_presidency_one_position_per_event UNIQUE (calendar_id, mmdd, event_id);
  END IF;
END $$;

COMMIT;
