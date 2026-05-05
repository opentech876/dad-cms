-- ============================================================
-- Workspace isolation
-- Adds workspace_id to calendars, ad_campaigns, user_roles.
-- Updates user_roles unique constraint to (user_id, workspace_id)
-- so users can hold a role in multiple workspaces.
-- Rewrites all RLS policies to enforce workspace boundaries.
-- ============================================================

-- ── 1. user_roles: add workspace_id, change uniqueness ──────

ALTER TABLE public.user_roles
  ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Backfill: assign every existing role to the first workspace.
DO $$
DECLARE v_ws uuid;
BEGIN
  SELECT id INTO v_ws FROM public.workspaces ORDER BY created_at LIMIT 1;
  IF v_ws IS NOT NULL THEN
    UPDATE public.user_roles SET workspace_id = v_ws WHERE workspace_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.user_roles ALTER COLUMN workspace_id SET NOT NULL;

-- Drop the old global-unique constraint; a user may have a role in each workspace.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_workspace_unique UNIQUE (user_id, workspace_id);

-- ── 2. calendars: add workspace_id ──────────────────────────

ALTER TABLE public.calendars
  ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

DO $$
DECLARE v_ws uuid;
BEGIN
  SELECT id INTO v_ws FROM public.workspaces ORDER BY created_at LIMIT 1;
  IF v_ws IS NOT NULL THEN
    UPDATE public.calendars SET workspace_id = v_ws WHERE workspace_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.calendars ALTER COLUMN workspace_id SET NOT NULL;

-- ── 3. ad_campaigns: add workspace_id ───────────────────────

ALTER TABLE public.ad_campaigns
  ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

DO $$
DECLARE v_ws uuid;
BEGIN
  SELECT id INTO v_ws FROM public.workspaces ORDER BY created_at LIMIT 1;
  IF v_ws IS NOT NULL THEN
    UPDATE public.ad_campaigns SET workspace_id = v_ws WHERE workspace_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.ad_campaigns ALTER COLUMN workspace_id SET NOT NULL;

-- ── 4. Helper: workspace IDs the current user belongs to ────
--    SECURITY DEFINER so it bypasses RLS on user_roles.

CREATE OR REPLACE FUNCTION public.user_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT workspace_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND (expires_at IS NULL OR expires_at > now());
$$;

-- ── 5. current_user_role — now workspace-scoped ──────────────

CREATE OR REPLACE FUNCTION public.current_user_role(p_workspace_id uuid DEFAULT NULL)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid;
  v_role    public.app_role;
  v_expires timestamptz;
  v_ws      uuid;
BEGIN
  v_uid := (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid;
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  IF p_workspace_id IS NULL THEN
    -- Backward-compat: fall back to the user's first workspace.
    SELECT workspace_id INTO v_ws
    FROM public.user_roles
    WHERE user_id = v_uid
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at
    LIMIT 1;
  ELSE
    v_ws := p_workspace_id;
  END IF;

  SELECT role, expires_at INTO v_role, v_expires
  FROM public.user_roles
  WHERE user_id = v_uid AND workspace_id = v_ws;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_expires IS NOT NULL AND v_expires < now() THEN RETURN NULL; END IF;

  RETURN v_role;
END;
$$;

-- ── 6. has_role_at_least — now workspace-scoped ──────────────

CREATE OR REPLACE FUNCTION public.has_role_at_least(
  min_role       public.app_role,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := public.current_user_role(p_workspace_id);
  IF v_role IS NULL THEN RETURN false; END IF;

  CASE min_role
    WHEN 'owner' THEN
      RETURN v_role = 'owner';
    WHEN 'chef_equipe' THEN
      RETURN v_role IN ('owner', 'chef_equipe');
    WHEN 'editeur' THEN
      RETURN v_role IN ('owner', 'chef_equipe', 'editeur');
    WHEN 'charge_communication' THEN
      RETURN v_role IN ('owner', 'chef_equipe', 'charge_communication');
    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- ── 7. finalize_workspace_creation — link role to workspace ──

CREATE OR REPLACE FUNCTION public.finalize_workspace_creation(
  p_name      text,
  p_user_id   uuid,
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      public.app_role;
  v_expires   timestamptz;
  v_workspace uuid;
BEGIN
  -- The calling user must already be a (possibly temporary) owner.
  SELECT role, expires_at INTO v_role, v_expires
  FROM public.user_roles
  WHERE user_id = p_user_id
  ORDER BY created_at LIMIT 1;

  IF v_role IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'Seul le propriétaire peut créer un espace de travail';
  END IF;

  IF v_expires IS NOT NULL AND v_expires < now() THEN
    RAISE EXCEPTION 'Session expirée — reconnectez-vous';
  END IF;

  INSERT INTO public.workspaces (name, created_by)
  VALUES (TRIM(p_name), p_user_id)
  RETURNING id INTO v_workspace;

  -- Attach the owner's role to the new workspace and make it permanent.
  UPDATE public.user_roles
  SET workspace_id = v_workspace,
      expires_at   = NULL,
      created_by   = p_user_id
  WHERE user_id = p_user_id
    AND (workspace_id IS NULL OR workspace_id = v_workspace);

  -- Persist profile fields if provided.
  IF p_full_name IS NOT NULL OR p_phone IS NOT NULL THEN
    UPDATE public.profiles
    SET full_name  = COALESCE(p_full_name, full_name),
        phone      = COALESCE(p_phone, phone),
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN v_workspace;
END;
$$;

-- ── 8. RLS: workspaces — only show workspaces user belongs to

DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
CREATE POLICY "workspaces_select" ON public.workspaces
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_workspace_ids()));

-- ── 9. RLS: user_roles — workspace-aware visibility ──────────

DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR workspace_id IN (
      SELECT workspace_id FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'owner'
        AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- ── 10. RLS: calendars ───────────────────────────────────────

DROP POLICY IF EXISTS "calendars_select"       ON public.calendars;
DROP POLICY IF EXISTS "calendars_insert"       ON public.calendars;
DROP POLICY IF EXISTS "calendars_update"       ON public.calendars;
DROP POLICY IF EXISTS "calendars_delete_owner" ON public.calendars;

CREATE POLICY "calendars_select" ON public.calendars
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "calendars_insert" ON public.calendars
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT public.user_workspace_ids())
    AND public.has_role_at_least('editeur'::public.app_role, workspace_id)
  );

CREATE POLICY "calendars_update" ON public.calendars
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND workspace_id IN (SELECT public.user_workspace_ids())
    AND public.has_role_at_least('editeur'::public.app_role, workspace_id)
  )
  WITH CHECK (
    workspace_id IN (SELECT public.user_workspace_ids())
    AND public.has_role_at_least('editeur'::public.app_role, workspace_id)
  );

CREATE POLICY "calendars_delete_owner" ON public.calendars
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
    AND public.has_role_at_least('owner'::public.app_role, workspace_id)
  );

-- ── 11. RLS: events (workspace via calendar FK join) ─────────

DROP POLICY IF EXISTS "events_select" ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
DROP POLICY IF EXISTS "events_update" ON public.events;
DROP POLICY IF EXISTS "events_delete" ON public.events;

CREATE POLICY "events_select" ON public.events
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.calendars c
      WHERE c.id = calendar_id
        AND c.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY "events_insert" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.calendars c
      WHERE c.id = calendar_id
        AND c.workspace_id IN (SELECT public.user_workspace_ids())
        AND public.has_role_at_least('editeur'::public.app_role, c.workspace_id)
    )
  );

CREATE POLICY "events_update" ON public.events
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.calendars c
      WHERE c.id = calendar_id
        AND c.workspace_id IN (SELECT public.user_workspace_ids())
        AND public.has_role_at_least('editeur'::public.app_role, c.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.calendars c
      WHERE c.id = calendar_id
        AND c.workspace_id IN (SELECT public.user_workspace_ids())
        AND public.has_role_at_least('editeur'::public.app_role, c.workspace_id)
    )
  );

CREATE POLICY "events_delete" ON public.events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calendars c
      WHERE c.id = calendar_id
        AND c.workspace_id IN (SELECT public.user_workspace_ids())
        AND public.has_role_at_least('owner'::public.app_role, c.workspace_id)
    )
  );

-- ── 12. RLS: ad_campaigns ────────────────────────────────────

DROP POLICY IF EXISTS "ad_campaigns_select" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_insert" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_update" ON public.ad_campaigns;
DROP POLICY IF EXISTS "ad_campaigns_delete" ON public.ad_campaigns;

CREATE POLICY "ad_campaigns_select" ON public.ad_campaigns
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "ad_campaigns_insert" ON public.ad_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (SELECT public.user_workspace_ids())
    AND public.has_role_at_least('charge_communication'::public.app_role, workspace_id)
  );

CREATE POLICY "ad_campaigns_update" ON public.ad_campaigns
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND workspace_id IN (SELECT public.user_workspace_ids())
    AND public.has_role_at_least('charge_communication'::public.app_role, workspace_id)
  )
  WITH CHECK (
    workspace_id IN (SELECT public.user_workspace_ids())
    AND public.has_role_at_least('charge_communication'::public.app_role, workspace_id)
  );

CREATE POLICY "ad_campaigns_delete" ON public.ad_campaigns
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (SELECT public.user_workspace_ids())
    AND public.has_role_at_least('owner'::public.app_role, workspace_id)
  );

-- ── 13. RLS: campaign_assignments (workspace via calendar) ───

DROP POLICY IF EXISTS "campaign_assignments_select" ON public.campaign_assignments;
DROP POLICY IF EXISTS "campaign_assignments_insert" ON public.campaign_assignments;
DROP POLICY IF EXISTS "campaign_assignments_delete" ON public.campaign_assignments;

CREATE POLICY "campaign_assignments_select" ON public.campaign_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calendars c
      WHERE c.id = calendar_id
        AND c.workspace_id IN (SELECT public.user_workspace_ids())
    )
  );

CREATE POLICY "campaign_assignments_insert" ON public.campaign_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.calendars c
      WHERE c.id = calendar_id
        AND c.workspace_id IN (SELECT public.user_workspace_ids())
        AND public.has_role_at_least('charge_communication'::public.app_role, c.workspace_id)
    )
  );

CREATE POLICY "campaign_assignments_delete" ON public.campaign_assignments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calendars c
      WHERE c.id = calendar_id
        AND c.workspace_id IN (SELECT public.user_workspace_ids())
        AND public.has_role_at_least('charge_communication'::public.app_role, c.workspace_id)
    )
  );
