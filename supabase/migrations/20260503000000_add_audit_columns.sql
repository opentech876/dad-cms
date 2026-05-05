-- ============================================================
-- Migration: Add missing audit columns to all tables
-- + fix finalize_workspace_creation RPC to set created_by
-- ============================================================

-- ─── workspaces: add created_by ──────────────────────────────
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- ─── calendars: add updated_by, deleted_by, published_at ─────
ALTER TABLE public.calendars
  ADD COLUMN IF NOT EXISTS updated_by   uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deleted_by   uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- ─── events: add updated_by, deleted_by, historical_year ─────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS updated_by      uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deleted_by      uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS historical_year integer;

-- ─── ad_campaigns: add updated_by, deleted_by ────────────────
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

-- ─── finalize_workspace_creation: accept full_name & phone ───
-- Drops and recreates to change signature (adds p_full_name, p_phone,
-- sets created_by on workspace, updates profile).
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
  v_role       public.app_role;
  v_expires    timestamptz;
  v_workspace  uuid;
BEGIN
  SELECT role, expires_at
  INTO v_role, v_expires
  FROM public.user_roles
  WHERE user_id = p_user_id;

  IF v_role IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'Seul le propriétaire peut créer un espace de travail';
  END IF;

  IF v_expires IS NOT NULL AND v_expires < now() THEN
    RAISE EXCEPTION 'Session expirée — reconnectez-vous';
  END IF;

  -- Create workspace and set created_by
  INSERT INTO public.workspaces (name, created_by)
  VALUES (TRIM(p_name), p_user_id)
  RETURNING workspaces.id INTO v_workspace;

  -- Make owner permanent
  UPDATE public.user_roles
  SET expires_at = NULL
  WHERE user_id = p_user_id;

  -- Update profile with provided name and phone
  UPDATE public.profiles
  SET
    full_name  = COALESCE(TRIM(p_full_name), full_name),
    phone      = COALESCE(TRIM(p_phone), phone),
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_workspace;
END;
$$;
