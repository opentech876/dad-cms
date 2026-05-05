-- ============================================================
-- Day After Day — Initial Schema
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgtap;

-- ─── Custom types ────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM (
  'owner',
  'chef_equipe',
  'editeur',
  'charge_communication'
);

-- ─── Tables ──────────────────────────────────────────────────

CREATE TABLE public.workspaces (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       text NOT NULL,
  logo_url   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.calendars (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  year        integer NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE public.events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_id uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  event_date  date NOT NULL,
  position    integer NOT NULL CHECK (position IN (1, 2)),
  title       text NOT NULL,
  description text,
  image_path  text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (calendar_id, event_date, position)
);

CREATE TABLE public.ad_campaigns (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  advertiser  text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  position    text NOT NULL CHECK (position IN ('header', 'footer')),
  image_path  text NOT NULL,
  link_url    text,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE public.campaign_assignments (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  event_date  date NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, event_date)
);

CREATE TABLE public.content_versions (
  year          integer PRIMARY KEY,
  version_hash  text NOT NULL,
  published_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── Functions ───────────────────────────────────────────────

-- Returns true if at least one permanent or still-active owner exists.
CREATE OR REPLACE FUNCTION public.is_app_initialized()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE role = 'owner'
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- Returns the current authenticated user's role (NULL if expired or not found).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid;
  v_role     public.app_role;
  v_expires  timestamptz;
BEGIN
  v_uid := (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid;
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT role, expires_at
  INTO v_role, v_expires
  FROM public.user_roles
  WHERE user_id = v_uid;

  IF v_expires IS NOT NULL AND v_expires < now() THEN
    RETURN NULL;
  END IF;

  RETURN v_role;
END;
$$;

-- Checks if the current user has at least the requested role.
-- Hierarchy: owner > chef_equipe > {editeur | charge_communication}
-- chef_equipe covers both editorial and communication branches.
-- editeur and charge_communication are separate leaf roles.
CREATE OR REPLACE FUNCTION public.has_role_at_least(min_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := public.current_user_role();
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

-- Trigger function: fires after INSERT on auth.users.
-- Always creates a profile. First user becomes temporary owner (24h).
-- Subsequent users get the role from their metadata if provided.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role  text;
  valid_role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role, expires_at)
    VALUES (NEW.id, 'owner', now() + interval '24 hours');
  ELSE
    meta_role := NEW.raw_user_meta_data ->> 'role';
    IF meta_role IS NOT NULL THEN
      BEGIN
        valid_role := meta_role::public.app_role;
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.id, valid_role)
        ON CONFLICT (user_id) DO NOTHING;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Creates the workspace, trims its name, and makes the owner permanent.
-- Raises an exception if called by a non-owner.
CREATE OR REPLACE FUNCTION public.finalize_workspace_creation(
  p_name    text,
  p_user_id uuid
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

  INSERT INTO public.workspaces (name)
  VALUES (TRIM(p_name))
  RETURNING workspaces.id INTO v_workspace;

  UPDATE public.user_roles
  SET expires_at = NULL
  WHERE user_id = p_user_id;

  RETURN v_workspace;
END;
$$;

-- ─── Trigger ─────────────────────────────────────────────────

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- ─── Row Level Security ──────────────────────────────────────

ALTER TABLE public.workspaces         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendars          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versions   ENABLE ROW LEVEL SECURITY;

-- workspaces
CREATE POLICY "workspaces_select" ON public.workspaces
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "workspaces_insert_owner" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_at_least('owner'::public.app_role));

CREATE POLICY "workspaces_update_owner" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (public.has_role_at_least('owner'::public.app_role))
  WITH CHECK (public.has_role_at_least('owner'::public.app_role));

CREATE POLICY "workspaces_delete_owner" ON public.workspaces
  FOR DELETE TO authenticated
  USING (public.has_role_at_least('owner'::public.app_role));

-- profiles
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'owner');

CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- user_roles
CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'owner');

CREATE POLICY "user_roles_insert_owner" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_at_least('owner'::public.app_role));

CREATE POLICY "user_roles_update_owner" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role_at_least('owner'::public.app_role))
  WITH CHECK (public.has_role_at_least('owner'::public.app_role));

CREATE POLICY "user_roles_delete_owner" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role_at_least('owner'::public.app_role));

-- calendars
CREATE POLICY "calendars_select" ON public.calendars
  FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "calendars_insert" ON public.calendars
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_at_least('editeur'::public.app_role));

CREATE POLICY "calendars_update" ON public.calendars
  FOR UPDATE TO authenticated
  USING (public.has_role_at_least('editeur'::public.app_role) AND deleted_at IS NULL)
  WITH CHECK (public.has_role_at_least('editeur'::public.app_role));

CREATE POLICY "calendars_delete_owner" ON public.calendars
  FOR DELETE TO authenticated
  USING (public.has_role_at_least('owner'::public.app_role));

-- events
CREATE POLICY "events_select" ON public.events
  FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "events_insert" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_at_least('editeur'::public.app_role));

CREATE POLICY "events_update" ON public.events
  FOR UPDATE TO authenticated
  USING (public.has_role_at_least('editeur'::public.app_role) AND deleted_at IS NULL)
  WITH CHECK (public.has_role_at_least('editeur'::public.app_role));

CREATE POLICY "events_delete" ON public.events
  FOR DELETE TO authenticated
  USING (public.has_role_at_least('owner'::public.app_role));

-- ad_campaigns
CREATE POLICY "ad_campaigns_select" ON public.ad_campaigns
  FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE POLICY "ad_campaigns_insert" ON public.ad_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_at_least('charge_communication'::public.app_role));

CREATE POLICY "ad_campaigns_update" ON public.ad_campaigns
  FOR UPDATE TO authenticated
  USING (public.has_role_at_least('charge_communication'::public.app_role) AND deleted_at IS NULL)
  WITH CHECK (public.has_role_at_least('charge_communication'::public.app_role));

CREATE POLICY "ad_campaigns_delete" ON public.ad_campaigns
  FOR DELETE TO authenticated
  USING (public.has_role_at_least('owner'::public.app_role));

-- campaign_assignments
CREATE POLICY "campaign_assignments_select" ON public.campaign_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "campaign_assignments_insert" ON public.campaign_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_at_least('charge_communication'::public.app_role));

CREATE POLICY "campaign_assignments_delete" ON public.campaign_assignments
  FOR DELETE TO authenticated
  USING (public.has_role_at_least('charge_communication'::public.app_role));

-- content_versions: read only for authenticated; writes are trigger-only (service role)
CREATE POLICY "content_versions_select" ON public.content_versions
  FOR SELECT TO authenticated USING (true);
