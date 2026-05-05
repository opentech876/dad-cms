-- ============================================================
-- Migration: audit_log table + generic trigger
-- Tracks every INSERT / UPDATE / DELETE on key tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name  text NOT NULL,
  record_id   text NOT NULL,
  action      text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_id    uuid REFERENCES auth.users(id),
  old_data    jsonb,
  new_data    jsonb,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by table + record
CREATE INDEX IF NOT EXISTS audit_log_table_record_idx
  ON public.audit_log (table_name, record_id);

-- RLS: only owner can read audit logs
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_owner" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'owner');

-- ─── Generic trigger function ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_record_id text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  -- Resolve actor from JWT claim (NULL when called by service role)
  BEGIN
    v_actor := (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id::text;
    v_old       := to_jsonb(OLD);
    v_new       := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id::text;
    v_old       := NULL;
    v_new       := to_jsonb(NEW);
  ELSE -- UPDATE
    v_record_id := NEW.id::text;
    v_old       := to_jsonb(OLD);
    v_new       := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_actor, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── Attach trigger to all tracked tables ─────────────────────

CREATE OR REPLACE TRIGGER trg_audit_workspaces
  AFTER INSERT OR UPDATE OR DELETE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_calendars
  AFTER INSERT OR UPDATE OR DELETE ON public.calendars
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_events
  AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_ad_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_campaign_assignments
  AFTER INSERT OR UPDATE OR DELETE ON public.campaign_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE OR REPLACE TRIGGER trg_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
