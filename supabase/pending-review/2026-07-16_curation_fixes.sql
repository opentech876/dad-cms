-- ═════════════════════════════════════════════════════════════════════════
-- CURATION FIXES — run this whole file once in Supabase Studio → SQL Editor.
-- Idempotent: safe to re-run. One transaction: all-or-nothing.
--
-- Fixes three things:
--
-- 1. REPLACEMENT SEMANTICS. Applying a recommendation used to UPDATE the
--    existing calendar_entries row in place (ON CONFLICT DO UPDATE), which
--    kept the old row's identity/authorship. It now REMOVES the current
--    occupant of the slot and INSERTS the curated event as a fresh row.
--    If the curated event already sits on the day's OTHER position, that
--    row is removed too — the event MOVES, it is never duplicated. This
--    also eliminates the 23505 "duplicate key" abort
--    (uq_calendar_entry_one_position_per_event) seen when applying.
--
-- 2. ONE EVENT = ONE POSITION PER DAY, at recommendation time too:
--    duplicate recommendation rows are cleaned up, then mirrored as a
--    UNIQUE constraint on presidency_recommendations. The CMS pre-checks
--    and maps the 23505 to a readable French message.
--
-- 3. CURATION NOTIFICATIONS. presidency_recommendations had no
--    notification trigger, so the Curateur's feed (now filtered to her
--    workflow) was empty. This emits: soumise / publiée / mise à jour /
--    retirée. The editorial team also sees "soumise" (they must apply it).
-- ═════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1a. Bulk apply — replace, don't update in place ────────────────────────
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

    -- Replacement semantics: clear the slot's current occupant AND any row
    -- where this event already sits elsewhere on the day (→ it moves).
    DELETE FROM public.calendar_entries ce
    WHERE ce.calendar_id = r.calendar_id AND ce.mmdd = r.mmdd
      AND (ce.position = r.position OR ce.event_id = r.event_id);

    INSERT INTO public.calendar_entries (calendar_id, mmdd, position, event_id, workspace_id, created_by)
    VALUES (r.calendar_id, r.mmdd, r.position, r.event_id, r.workspace_id, auth.uid());

    UPDATE public.presidency_recommendations
      SET status = 'applied', applied_at = now(), applied_by = auth.uid()
      WHERE id = r.id;

    v_applied_count := v_applied_count + 1;
  END LOOP;

  RETURN jsonb_build_object('applied', v_applied_count, 'skipped', v_skipped_count);
END;
$$;

-- ─── 1b. Single apply — same replacement semantics ──────────────────────────
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

  DELETE FROM public.calendar_entries ce
  WHERE ce.calendar_id = r.calendar_id AND ce.mmdd = r.mmdd
    AND (ce.position = r.position OR ce.event_id = r.event_id);

  INSERT INTO public.calendar_entries (calendar_id, mmdd, position, event_id, workspace_id, created_by)
  VALUES (r.calendar_id, r.mmdd, r.position, r.event_id, r.workspace_id, auth.uid());

  UPDATE public.presidency_recommendations
    SET status = 'applied', applied_at = now(), applied_by = auth.uid()
    WHERE id = r.id;
END;
$$;

-- ─── 2a. Clean up recommendations duplicated on one day ─────────────────────
-- Same (calendar, day, event) recommended on both positions: keep the
-- applied one when there is one, else the most recently updated.
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

-- ─── 2b. Mirror the rule at recommendation time ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_presidency_one_position_per_event'
  ) THEN
    ALTER TABLE public.presidency_recommendations
      ADD CONSTRAINT uq_presidency_one_position_per_event UNIQUE (calendar_id, mmdd, event_id);
  END IF;
END $$;

-- ─── 3. Curation notifications ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_notification_from_recommendation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _workspace_id uuid;
  _title text;
  _body text;
  _record_id uuid;
  _event_title text;
  _pos_label text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _record_id := OLD.id; _workspace_id := OLD.workspace_id;
    SELECT title INTO _event_title FROM public.events WHERE id = OLD.event_id;
    _pos_label := CASE OLD.position WHEN 1 THEN 'Événement principal' ELSE 'C''est aussi' END;
  ELSE
    _record_id := NEW.id; _workspace_id := NEW.workspace_id;
    SELECT title INTO _event_title FROM public.events WHERE id = NEW.event_id;
    _pos_label := CASE NEW.position WHEN 1 THEN 'Événement principal' ELSE 'C''est aussi' END;
  END IF;
  _event_title := COALESCE(_event_title, 'Sans titre');

  IF TG_OP = 'INSERT' THEN
    _title := 'Recommandation soumise';
    _body  := 'La recommandation « ' || _event_title || ' » (' || _pos_label ||
              ', ' || NEW.mmdd || ') attend sa publication.';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status = 'applied' THEN
      _title := 'Recommandation publiée';
      _body  := '« ' || _event_title || ' » est parue sur le calendrier (' ||
                _pos_label || ', ' || NEW.mmdd || ').';
    ELSIF OLD.event_id IS DISTINCT FROM NEW.event_id THEN
      _title := 'Recommandation mise à jour';
      _body  := 'La proposition du ' || NEW.mmdd || ' (' || _pos_label ||
                ') porte maintenant sur « ' || _event_title || ' ».';
    END IF; -- other updates (timestamps…) stay silent
  ELSE
    _title := 'Recommandation retirée';
    _body  := 'La proposition « ' || _event_title || ' » (' || _pos_label ||
              ', ' || OLD.mmdd || ') a été retirée.';
  END IF;

  IF _workspace_id IS NOT NULL AND _title IS NOT NULL THEN
    INSERT INTO public.notifications (workspace_id, actor_id, category, title, body, link_path, table_name, record_id, action)
    VALUES (_workspace_id, auth.uid(), 'editorial', _title, _body,
            '/curation/mes-recommandations', TG_TABLE_NAME, _record_id, TG_OP);
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS tr_notify_recommendations ON public.presidency_recommendations;
CREATE TRIGGER tr_notify_recommendations
  AFTER INSERT OR UPDATE OR DELETE ON public.presidency_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.create_notification_from_recommendation();

COMMIT;
