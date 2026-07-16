-- ─────────────────────────────────────────────────────────────────────────
-- Curation notifications — presidency_recommendations has NO notification
-- trigger today, so the Curateur's feed shows everyone else's noise and
-- nothing about her own workflow. This draft generates the three events of
-- her lifecycle (soumise / publiée / retirée), mirroring the approved
-- claude.design prototype. The CMS filters the presidence feed + badge to
-- table_name = 'presidency_recommendations', so:
--   · Curateur  → sees exactly these
--   · Éditorial → also sees "Recommandation soumise" (they must apply it)
--
-- Review then run in Supabase Studio → SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

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
