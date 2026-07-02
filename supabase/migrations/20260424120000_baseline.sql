-- ============================================================
-- Baseline schema — single canonical migration.
--
-- Generated 2026-06-17 by introspecting the live Supabase DB.
-- It supersedes every prior local migration file and reproduces
-- the production schema bit-for-bit when applied to an empty DB.
-- ============================================================

-- ─── 1. Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"          WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto             WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net               WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ─── 2. Enums ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner', 'chef_equipe', 'editeur', 'charge_communication', 'presidence', 'chef_equipe_commerciale', 'system_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ad_position AS ENUM ('header', 'footer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.event_position AS ENUM ('1', '2');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Tables ──────────────────────────────────────────────

-- 3.1 workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT 'Day After Day',
  logo_url    text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  deleted_at  timestamptz,
  deleted_by  uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS workspaces_deleted_at_idx
  ON public.workspaces (deleted_at) WHERE deleted_at IS NULL;

-- 3.2 workspace_members
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              public.app_role NOT NULL DEFAULT 'editeur',
  joined_at         timestamptz NOT NULL DEFAULT now(),
  last_accessed_at  timestamptz,
  CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id)
);

-- 3.3 profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Per-tenant identity. A user can have a different display name / phone /
  -- avatar in each workspace they're a member of.
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  full_name    text,
  phone        text,
  avatar_url   text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT profiles_user_workspace_unique UNIQUE (user_id, workspace_id)
);

-- 3.4 user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  expires_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- 3.5 calendars
CREATE TABLE IF NOT EXISTS public.calendars (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year          integer NOT NULL,
  name          text NOT NULL,
  status        text DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  deleted_at    timestamptz,
  updated_by    uuid REFERENCES auth.users(id),
  deleted_by    uuid REFERENCES auth.users(id),
  published_at  timestamptz,
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id),
  CONSTRAINT calendars_year_workspace_unique UNIQUE (year, workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_calendars_workspace_year_live
  ON public.calendars (workspace_id, year) WHERE deleted_at IS NULL;

-- 3.6 events
CREATE TABLE IF NOT EXISTS public.events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date    date NOT NULL,
  title         text NOT NULL,
  description   text,
  image_path    text,
  -- Free text / URL pointing to the historical reference work backing this entry.
  source        text,
  -- Name of the human who entered/curated this entry (carried over from the
  -- Excel "Historien" column on import; defaults to the current user's
  -- display_name on new rows created from the CMS).
  historian     text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  deleted_at    timestamptz,
  updated_by    uuid REFERENCES auth.users(id),
  deleted_by    uuid REFERENCES auth.users(id),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id)
);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events (event_date);

-- 3.7 calendar_entries
CREATE TABLE IF NOT EXISTS public.calendar_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id   uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  mmdd          character(5) NOT NULL CHECK (mmdd ~ '^\d{2}-\d{2}$'),
  position      smallint NOT NULL CHECK (position IN (1,2)),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id),
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_entries_calendar_id_mmdd_position_key UNIQUE (calendar_id, mmdd, position),
  CONSTRAINT uq_calendar_entry_one_event_per_position       UNIQUE (calendar_id, mmdd, position),
  CONSTRAINT uq_calendar_entry_one_position_per_event       UNIQUE (calendar_id, mmdd, event_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_calendar_event ON public.calendar_entries (calendar_id, event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_event_calendar ON public.calendar_entries (event_id, calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_updated_at    ON public.calendar_entries (updated_at);

-- 3.8 companies
-- Advertisers registered in the workspace. Each ad_campaign references one.
CREATE TABLE IF NOT EXISTS public.companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('telecom','banque','energie','distribution','services','gouvernement','ong','medias','sante','autre')),
  business_domain text,
  website         text,
  contact_email   text,
  contact_phone   text,
  notes           text,
  logo_url        text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id),
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id),
  CONSTRAINT uq_companies_name_per_workspace UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_companies_workspace_live
  ON public.companies (workspace_id) WHERE deleted_at IS NULL;

-- 3.9 ad_campaigns
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  company_id    uuid NOT NULL REFERENCES public.companies(id),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  position      public.ad_position NOT NULL,
  image_path    text NOT NULL,
  link_url      text,
  active        boolean DEFAULT true,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  deleted_at    timestamptz,
  updated_by    uuid REFERENCES auth.users(id),
  deleted_by    uuid REFERENCES auth.users(id),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id),
  -- ── Validation workflow (Round 3) ──
  paid_at                timestamptz,
  paid_by                uuid REFERENCES auth.users(id),
  manager_confirmed_at   timestamptz,
  manager_confirmed_by   uuid REFERENCES auth.users(id),
  validated_at           timestamptz GENERATED ALWAYS AS (
    CASE WHEN paid_at IS NOT NULL AND manager_confirmed_at IS NOT NULL
         THEN GREATEST(paid_at, manager_confirmed_at)
         ELSE NULL END
  ) STORED
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_start_end_active
  ON public.ad_campaigns (start_date, end_date, active);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_company
  ON public.ad_campaigns (company_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_validated
  ON public.ad_campaigns (workspace_id, validated_at) WHERE deleted_at IS NULL;

-- 3.9 devices
CREATE TABLE IF NOT EXISTS public.devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_push_token  text NOT NULL UNIQUE,
  device_id        text,
  address_ip       text,
  platform         text CHECK (platform IN ('ios','android')),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- 3.10 devices_logs
CREATE TABLE IF NOT EXISTS public.devices_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  action          text NOT NULL,
  outcome         text NOT NULL CHECK (outcome IN ('success','error')),
  device_uuid     uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  expo_push_token text,
  platform        text,
  error_message   text,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS devices_logs_action_idx     ON public.devices_logs (action);
CREATE INDEX IF NOT EXISTS devices_logs_created_at_idx ON public.devices_logs (created_at DESC);

-- 3.11 ad_campaign_device_views
CREATE TABLE IF NOT EXISTS public.ad_campaign_device_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  campaign_id  uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  viewed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_device_views_campaign_viewed_at
  ON public.ad_campaign_device_views (campaign_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_device_views_device_campaign
  ON public.ad_campaign_device_views (device_id, campaign_id);

-- 3.11b ad_campaign_device_clicks (Round 4 — clicks tracking)
CREATE TABLE IF NOT EXISTS public.ad_campaign_device_clicks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  campaign_id  uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  clicked_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_device_clicks_campaign_clicked_at
  ON public.ad_campaign_device_clicks (campaign_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_device_clicks_device_campaign
  ON public.ad_campaign_device_clicks (device_id, campaign_id);

-- 3.12 content_versions
CREATE TABLE IF NOT EXISTS public.content_versions (
  year          integer PRIMARY KEY,
  version_hash  text NOT NULL,
  published_at  timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 3.13 audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   text NOT NULL,
  record_id    uuid NOT NULL,
  action       text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  actor_id     uuid,
  old_data     jsonb,
  new_data     jsonb,
  changed_at   timestamptz NOT NULL DEFAULT now(),
  -- NULL = platform-level / legacy row. Visible only to system_admin.
  -- Non-null rows are workspace-scoped (chef_equipe+ of that workspace).
  workspace_id uuid REFERENCES public.workspaces(id)
);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx        ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx   ON public.audit_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_table_record_idx ON public.audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_log_workspace_id_idx ON public.audit_log (workspace_id, changed_at DESC);

-- 3.14 notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id      uuid,
  category      text NOT NULL CHECK (category IN ('editorial','campaign','user','security')),
  title         text NOT NULL,
  body          text NOT NULL,
  link_path     text,
  table_name    text,
  record_id     uuid,
  action        text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_created
  ON public.notifications (workspace_id, created_at DESC);

-- 3.15 notification_reads
CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  read_at         timestamptz DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

-- 3.16 presidency_recommendations
-- Presidence's per-day picks for a calendar. Editors apply them via the
-- apply_presidency_recommendations() RPC.
CREATE TABLE IF NOT EXISTS public.presidency_recommendations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id  uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  mmdd         character(5) NOT NULL CHECK (mmdd ~ '^\d{2}-\d{2}$'),
  position     smallint NOT NULL CHECK (position IN (1, 2)),
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied')),
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  applied_at   timestamptz,
  applied_by   uuid REFERENCES auth.users(id),
  CONSTRAINT uq_presidency_one_per_slot UNIQUE (calendar_id, mmdd, position)
);
CREATE INDEX IF NOT EXISTS idx_presidency_recommendations_calendar_pending
  ON public.presidency_recommendations (calendar_id, status) WHERE status = 'pending';


-- ─── 4. Helper functions (no deps on tables) ────────────────
CREATE OR REPLACE FUNCTION public.bump_row_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.update_timestamps()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.track_modifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_by := auth.uid();
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    NEW.deleted_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_calendar_published_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'published'
     AND NEW.status = 'published'
     AND NEW.published_at IS NULL
  THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 5. Role / auth helpers ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE r public.app_role; exp timestamptz;
BEGIN
  SELECT role, expires_at INTO r, exp FROM public.user_roles WHERE user_id = auth.uid();
  IF exp IS NOT NULL AND exp < NOW() THEN RETURN NULL; END IF;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role_at_least(required_role public.app_role)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE user_role public.app_role; role_expires timestamptz;
BEGIN
  SELECT role, expires_at INTO user_role, role_expires FROM public.user_roles WHERE user_id = auth.uid();
  -- system_admin is platform-level: trumps all role checks regardless of workspace.
  IF user_role = 'system_admin' THEN RETURN true; END IF;
  IF role_expires IS NOT NULL AND role_expires < NOW() THEN RETURN false; END IF;
  RETURN CASE
    WHEN user_role = 'owner'                    THEN true
    WHEN user_role = 'chef_equipe'              THEN required_role IN ('chef_equipe', 'editeur', 'charge_communication')
    WHEN user_role = 'chef_equipe_commerciale'  THEN required_role IN ('chef_equipe_commerciale', 'charge_communication')
    WHEN user_role = 'editeur'                  THEN required_role = 'editeur'
    WHEN user_role = 'charge_communication'     THEN required_role = 'charge_communication'
    -- presidence is a parallel tier: only itself and owner satisfy has_role_at_least('presidence').
    WHEN user_role = 'presidence'               THEN required_role = 'presidence'
    ELSE false
  END;
END;
$$;

-- Workspace-scoped overload. Reads the caller's role from workspace_members
-- for the given workspace_id. Applies the same inheritance rules. This is the
-- authoritative role check for any RLS policy that can name the row's
-- workspace_id. The 1-arg legacy overload above stays for backward compat
-- during the gradual RLS migration to per-workspace authority.
-- system_admin (read from the global user_roles) trumps everything.
CREATE OR REPLACE FUNCTION public.has_role_at_least(required_role public.app_role, p_workspace_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE global_role public.app_role; member_role public.app_role;
BEGIN
  SELECT role INTO global_role FROM public.user_roles WHERE user_id = auth.uid();
  IF global_role = 'system_admin' THEN RETURN true; END IF;
  IF p_workspace_id IS NULL THEN RETURN false; END IF;
  SELECT role INTO member_role FROM public.workspace_members
  WHERE user_id = auth.uid() AND workspace_id = p_workspace_id;
  IF member_role IS NULL THEN RETURN false; END IF;
  RETURN CASE
    WHEN member_role = 'owner'                    THEN true
    WHEN member_role = 'chef_equipe'              THEN required_role IN ('chef_equipe', 'editeur', 'charge_communication')
    WHEN member_role = 'chef_equipe_commerciale'  THEN required_role IN ('chef_equipe_commerciale', 'charge_communication')
    WHEN member_role = 'editeur'                  THEN required_role = 'editeur'
    WHEN member_role = 'charge_communication'     THEN required_role = 'charge_communication'
    WHEN member_role = 'presidence'               THEN required_role = 'presidence'
    ELSE false
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.has_role_at_least(public.app_role, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_temporary_owners()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  DELETE FROM public.user_roles WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$;

-- handle_new_user no longer touches profiles — profiles are per-(user, workspace)
-- and a new auth.users row doesn't yet have a workspace binding. The
-- workspace_members trigger below auto-creates the profile when membership
-- is granted, covering every onboarding path (invitation, finalize_workspace_creation,
-- admin_create_workspace).
--
-- There is NO first-user-wins (FUW) branch. The first system_admin is seeded
-- out-of-band via bootstrap.sql (run once by the operator in Supabase Studio);
-- no signup path automatically awards any privileged role. This trigger only
-- honours an explicit role passed through invitation metadata
-- (raw_user_meta_data.role) by the invite-user Edge Function. An anonymous /
-- self-service signup therefore receives no role at all.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE invited_role TEXT;
BEGIN
  invited_role := NEW.raw_user_meta_data ->> 'role';
  IF invited_role IS NOT NULL THEN
    BEGIN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, invited_role::public.app_role)
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- Auto-create an (empty) profile row whenever a user joins a workspace.
-- Triggered by every code path that touches workspace_members.
CREATE OR REPLACE FUNCTION public.ensure_profile_for_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  INSERT INTO public.profiles (user_id, workspace_id)
  VALUES (NEW.user_id, NEW.workspace_id)
  ON CONFLICT (user_id, workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_app_initialized()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM workspaces w
    JOIN user_roles ur ON true
    WHERE ur.role = 'owner' AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.user_id = auth.uid() AND w.deleted_at IS NULL;
$$;

-- One round-trip helper for the workspace switcher: each row has the accurate
-- per-workspace member count + the caller's own last_accessed_at on that
-- workspace, ordered most-recently-accessed first. Soft-deleted workspaces
-- are excluded.
CREATE OR REPLACE FUNCTION public.get_my_workspace_summaries()
RETURNS TABLE (id uuid, name text, logo_url text, member_count integer, last_accessed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  WITH my AS (
    SELECT wm.workspace_id, wm.last_accessed_at
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = auth.uid() AND w.deleted_at IS NULL
  ),
  counts AS (
    SELECT workspace_id, COUNT(*)::int AS member_count
    FROM public.workspace_members
    WHERE workspace_id IN (SELECT workspace_id FROM my)
    GROUP BY workspace_id
  )
  SELECT w.id, w.name, w.logo_url, COALESCE(c.member_count, 0), my.last_accessed_at
  FROM public.workspaces w
  JOIN my ON my.workspace_id = w.id
  LEFT JOIN counts c ON c.workspace_id = w.id
  ORDER BY my.last_accessed_at DESC NULLS LAST, w.name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_workspace_summaries() TO authenticated;

-- Updates the caller's last_accessed_at on the given workspace. Called by
-- the shell whenever active workspace is set. Drives the order of
-- get_my_workspace_summaries() (most recent first).
CREATE OR REPLACE FUNCTION public.touch_workspace_access(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF p_workspace_id IS NULL THEN RETURN; END IF;
  UPDATE public.workspace_members SET last_accessed_at = now()
  WHERE user_id = auth.uid() AND workspace_id = p_workspace_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.touch_workspace_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_first_workspace_for_auth_user()
RETURNS uuid LANGUAGE sql STABLE SET search_path = 'public' AS $$
  select wm.workspace_id from public.workspace_members wm where wm.user_id = auth.uid() limit 1;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_id_by_name(p_name text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  select w.id from public.workspaces w where btrim(w.name) = btrim(coalesce(p_name, '')) limit 1;
$$;

CREATE OR REPLACE FUNCTION public.finalize_workspace_creation(
  p_name text, p_user_id uuid, p_full_name text DEFAULT NULL, p_phone text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role public.app_role; v_expires timestamptz; v_workspace uuid;
BEGIN
  SELECT role, expires_at INTO v_role, v_expires FROM public.user_roles WHERE user_id = p_user_id;
  IF v_role IS NULL OR (v_role <> 'owner' AND v_role <> 'system_admin') THEN
    RAISE EXCEPTION 'Seul le propriétaire ou un administrateur peut créer un espace de travail';
  END IF;
  IF v_role = 'owner' AND v_expires IS NOT NULL AND v_expires < now() THEN
    RAISE EXCEPTION 'Session expirée — reconnectez-vous';
  END IF;

  INSERT INTO public.workspaces (name, created_by) VALUES (TRIM(p_name), p_user_id) RETURNING id INTO v_workspace;
  UPDATE public.user_roles SET expires_at = NULL WHERE user_id = p_user_id AND role = 'owner';

  -- Membership first so the workspace_members trigger creates the per-tenant
  -- profile row, then we update it with the values from the onboarding form.
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace, p_user_id, 'owner');

  UPDATE public.profiles
  SET full_name = NULLIF(TRIM(COALESCE(p_full_name, '')), ''),
      phone     = NULLIF(TRIM(COALESCE(p_phone, '')), ''),
      updated_at = now()
  WHERE user_id = p_user_id AND workspace_id = v_workspace;

  RETURN v_workspace;
END;
$$;

-- ─── 5.b system_admin RPCs ──────────────────────────────────
-- Platform-level (system_admin) helpers. Each asserts the caller is
-- system_admin before touching the workspaces table. SECURITY DEFINER lets
-- them bypass RLS on workspaces / workspace_members.
CREATE OR REPLACE FUNCTION public._assert_system_admin()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'system_admin') THEN
    RAISE EXCEPTION 'Rôle system_admin requis' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_workspaces()
RETURNS TABLE (
  id uuid, name text, logo_url text, member_count integer,
  created_at timestamptz, created_by uuid, created_by_email text, deleted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  PERFORM public._assert_system_admin();
  RETURN QUERY
    SELECT w.id, w.name, w.logo_url,
           COALESCE((SELECT COUNT(*)::int FROM public.workspace_members wm WHERE wm.workspace_id = w.id), 0),
           w.created_at, w.created_by,
           (SELECT u.email::text FROM auth.users u WHERE u.id = w.created_by),
           w.deleted_at
    FROM public.workspaces w
    ORDER BY w.deleted_at NULLS FIRST, w.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_workspaces() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_workspace(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  PERFORM public._assert_system_admin();
  UPDATE public.workspaces SET deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
  WHERE id = p_workspace_id AND deleted_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_restore_workspace(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  PERFORM public._assert_system_admin();
  UPDATE public.workspaces SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE id = p_workspace_id AND deleted_at IS NOT NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_restore_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_rename_workspace(p_workspace_id uuid, p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  PERFORM public._assert_system_admin();
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Le nom de l''espace est requis' USING ERRCODE = '22023';
  END IF;
  UPDATE public.workspaces SET name = trim(p_name), updated_at = now() WHERE id = p_workspace_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_rename_workspace(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_workspace(p_name text, p_owner_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_owner uuid; v_workspace uuid;
BEGIN
  PERFORM public._assert_system_admin();
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Le nom de l''espace est requis' USING ERRCODE = '22023';
  END IF;
  v_owner := COALESCE(p_owner_user_id, auth.uid());
  INSERT INTO public.workspaces (name, created_by) VALUES (trim(p_name), auth.uid()) RETURNING id INTO v_workspace;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace, v_owner, 'owner') ON CONFLICT (workspace_id, user_id) DO NOTHING;
  RETURN v_workspace;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_workspace(text, uuid) TO authenticated;

-- One-round-trip platform-level stats that power the /admin landing dashboard.
-- Returns a JSONB blob with workspaces (active/deleted counts), users (total,
-- confirmed, pending, system_admins), the 5 most recent workspaces and the 5
-- most recent pending invitations. system_admin-only via _assert_system_admin.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public._assert_system_admin();
  SELECT jsonb_build_object(
    'workspaces', jsonb_build_object(
      'active',  (SELECT COUNT(*) FROM public.workspaces WHERE deleted_at IS NULL),
      'deleted', (SELECT COUNT(*) FROM public.workspaces WHERE deleted_at IS NOT NULL)
    ),
    'users', jsonb_build_object(
      'total',         (SELECT COUNT(*) FROM auth.users),
      'confirmed',     (SELECT COUNT(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL),
      'pending',       (SELECT COUNT(*) FROM auth.users WHERE email_confirmed_at IS NULL),
      'system_admins', (SELECT COUNT(*) FROM public.user_roles WHERE role = 'system_admin')
    ),
    'recent_workspaces', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT w.id, w.name, w.created_at, w.deleted_at,
               (SELECT COUNT(*) FROM public.workspace_members wm WHERE wm.workspace_id = w.id) AS member_count
        FROM public.workspaces w
        ORDER BY w.created_at DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb),
    'pending_invitations', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT u.id, u.email, u.created_at,
               COALESCE((u.raw_user_meta_data ->> 'role'), '') AS invited_role,
               (u.raw_user_meta_data ->> 'workspace_id') AS workspace_id
        FROM auth.users u
        WHERE u.email_confirmed_at IS NULL
        ORDER BY u.created_at DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;

-- Returns every user that exists in the platform, with the workspaces they
-- belong to and their roles per workspace. Powers /admin/utilisateurs.
CREATE OR REPLACE FUNCTION public.admin_list_all_users()
RETURNS TABLE (
  user_id            uuid,
  email              text,
  display_name       text,
  global_role        public.app_role,
  email_confirmed_at timestamptz,
  banned             boolean,
  created_at         timestamptz,
  last_sign_in_at    timestamptz,
  memberships        jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  PERFORM public._assert_system_admin();
  RETURN QUERY
  WITH any_profile AS (
    -- Qualify with the alias — user_id / created_at are also OUT parameters
    -- of the enclosing RETURNS TABLE(...), so unqualified references are
    -- ambiguous and Postgres refuses to plan the query.
    SELECT DISTINCT ON (pf.user_id) pf.user_id, pf.full_name
    FROM public.profiles pf
    ORDER BY pf.user_id, pf.created_at ASC
  ),
  ws_list AS (
    SELECT wm.user_id,
      jsonb_agg(jsonb_build_object(
        'workspace_id', wm.workspace_id, 'workspace_name', w.name,
        'role', wm.role, 'joined_at', wm.joined_at,
        'deleted', (w.deleted_at IS NOT NULL)
      ) ORDER BY wm.joined_at DESC) AS memberships
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    GROUP BY wm.user_id
  )
  SELECT u.id, u.email::text, p.full_name, ur.role,
         u.email_confirmed_at,
         (u.banned_until IS NOT NULL AND u.banned_until > now()),
         u.created_at,
         u.last_sign_in_at,
         COALESCE(wl.memberships, '[]'::jsonb)
  FROM auth.users u
  LEFT JOIN any_profile p ON p.user_id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  LEFT JOIN ws_list wl ON wl.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users() TO authenticated;

-- Cursor-paginated feed of admin-scope audit events. Filters to
-- workspaces / user_roles / workspace_members so /admin/logs doesn't
-- drown in editorial noise. Joins actor identity + workspace name.
CREATE FUNCTION public.admin_list_audit_log(
  p_limit  int         DEFAULT 50,
  p_before timestamptz DEFAULT NULL,
  p_table  text        DEFAULT NULL
)
RETURNS TABLE (
  id             uuid,
  table_name     text,
  action         text,
  record_id      uuid,
  actor_id       uuid,
  actor_email    text,
  actor_name     text,
  workspace_id   uuid,
  workspace_name text,
  old_data       jsonb,
  new_data       jsonb,
  changed_at     timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  PERFORM public._assert_system_admin();
  RETURN QUERY
  WITH any_profile AS (
    SELECT DISTINCT ON (pf.user_id) pf.user_id, pf.full_name
    FROM public.profiles pf
    ORDER BY pf.user_id, pf.created_at ASC
  )
  SELECT
    al.id, al.table_name, al.action, al.record_id, al.actor_id,
    u.email::text, p.full_name,
    -- For workspaces-table rows the record IS the workspace; derive ws_id.
    COALESCE(al.workspace_id,
             CASE WHEN al.table_name = 'workspaces' THEN al.record_id END),
    w.name,
    al.old_data, al.new_data, al.changed_at
  FROM public.audit_log al
  LEFT JOIN auth.users u        ON u.id = al.actor_id
  LEFT JOIN any_profile p       ON p.user_id = al.actor_id
  LEFT JOIN public.workspaces w ON w.id = COALESCE(al.workspace_id,
                                          CASE WHEN al.table_name = 'workspaces' THEN al.record_id END)
  WHERE al.table_name IN ('workspaces', 'user_roles', 'workspace_members')
    AND (p_before IS NULL OR al.changed_at < p_before)
    AND (p_table  IS NULL OR al.table_name = p_table)
  ORDER BY al.changed_at DESC
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_log(int, timestamptz, text) TO authenticated;

-- ─── 6. Audit logging ───────────────────────────────────────
-- Captures workspace_id from the source row when present (every workspace-
-- scoped table has one). Tables without workspace_id leave it NULL and the
-- row becomes visible only to system_admin under RLS.
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _record_id    uuid; _old_data jsonb; _new_data jsonb; _workspace_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _record_id := OLD.id; _old_data := to_jsonb(OLD); _new_data := NULL;
    BEGIN _workspace_id := (_old_data ->> 'workspace_id')::uuid; EXCEPTION WHEN OTHERS THEN _workspace_id := NULL; END;
  ELSIF TG_OP = 'INSERT' THEN
    _record_id := NEW.id; _old_data := NULL; _new_data := to_jsonb(NEW);
    BEGIN _workspace_id := (_new_data ->> 'workspace_id')::uuid; EXCEPTION WHEN OTHERS THEN _workspace_id := NULL; END;
  ELSE
    _record_id := NEW.id; _old_data := to_jsonb(OLD); _new_data := to_jsonb(NEW);
    BEGIN _workspace_id := (_new_data ->> 'workspace_id')::uuid; EXCEPTION WHEN OTHERS THEN _workspace_id := NULL; END;
  END IF;
  INSERT INTO public.audit_log (table_name, record_id, action, actor_id, old_data, new_data, workspace_id)
  VALUES (TG_TABLE_NAME, _record_id, TG_OP, auth.uid(), _old_data, _new_data, _workspace_id);
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ─── 7. Content version + sync ──────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_content_version_for_year(p_year integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','extensions' AS $$
DECLARE sig text; h text;
BEGIN
  SELECT concat_ws('|',
    (SELECT coalesce(count(*)::text,'0') || ':' || coalesce(max(greatest(e.updated_at, e.created_at))::text,'')
       FROM public.events e
      WHERE e.deleted_at IS NULL
        AND (extract(year FROM e.event_date)::int = p_year
             OR EXISTS (SELECT 1 FROM public.calendar_entries ce
                         INNER JOIN public.calendars cal ON cal.id = ce.calendar_id
                          WHERE cal.year = p_year AND cal.deleted_at IS NULL AND ce.event_id = e.id))),
    (SELECT coalesce(count(*)::text,'0') || ':' || coalesce(max(greatest(ce.updated_at, ce.created_at))::text,'')
       FROM public.calendar_entries ce
       INNER JOIN public.calendars cal ON cal.id = ce.calendar_id
      WHERE cal.year = p_year AND cal.deleted_at IS NULL),
    (SELECT coalesce(count(*)::text,'0') || ':' || coalesce(max(greatest(c.updated_at, c.created_at))::text,'')
       FROM public.calendars c WHERE c.year = p_year AND c.deleted_at IS NULL),
    (SELECT coalesce(count(DISTINCT ac.id)::text,'0') || ':' || coalesce(max(greatest(ac.updated_at, ac.created_at))::text,'')
       FROM public.ad_campaigns ac
      WHERE ac.deleted_at IS NULL
        AND ac.start_date <= make_date(p_year, 12, 31)
        AND ac.end_date   >= make_date(p_year, 1, 1)
        AND EXISTS (SELECT 1 FROM public.calendars cal
                     WHERE cal.workspace_id = ac.workspace_id AND cal.year = p_year AND cal.deleted_at IS NULL))
  ) INTO sig;
  h := encode(extensions.digest(convert_to(coalesce(sig,''),'UTF8'),'sha256'::text),'hex');
  INSERT INTO public.content_versions (year, version_hash, published_at, updated_at)
  VALUES (p_year, h, now(), now())
  ON CONFLICT (year) DO UPDATE SET version_hash = EXCLUDED.version_hash, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_content_versions_for_editorial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE ys int[]; y int; flight_start date; flight_end date;
BEGIN
  IF TG_TABLE_NAME = 'calendar_entries' THEN
    SELECT coalesce(array_agg(DISTINCT c.year), array[]::int[]) INTO ys
    FROM public.calendars c
    WHERE c.id = coalesce(NEW.calendar_id, OLD.calendar_id) AND c.deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'calendars' THEN
    IF TG_OP = 'DELETE' THEN ys := array_remove(array[OLD.year], NULL);
    ELSE
      ys := array_remove(array[NEW.year], NULL);
      IF TG_OP = 'UPDATE' AND OLD.year IS DISTINCT FROM NEW.year THEN ys := ys || OLD.year; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'events' THEN
    SELECT coalesce(array_agg(DISTINCT u.y), array[]::int[]) INTO ys FROM (
      SELECT extract(year FROM coalesce(NEW.event_date, OLD.event_date))::int AS y
       WHERE coalesce(NEW.event_date, OLD.event_date) IS NOT NULL
      UNION
      SELECT c.year FROM public.calendar_entries ce
       INNER JOIN public.calendars c ON c.id = ce.calendar_id AND c.deleted_at IS NULL
       WHERE ce.event_id = coalesce(NEW.id, OLD.id)
    ) u;
  ELSIF TG_TABLE_NAME = 'ad_campaigns' THEN
    flight_start := coalesce(NEW.start_date, OLD.start_date);
    flight_end   := coalesce(NEW.end_date,   OLD.end_date);
    SELECT coalesce(array_agg(DISTINCT cal.year), array[]::int[]) INTO ys
    FROM public.calendars cal
    WHERE cal.deleted_at IS NULL
      AND cal.workspace_id = coalesce(NEW.workspace_id, OLD.workspace_id)
      AND flight_start IS NOT NULL AND flight_end IS NOT NULL
      AND cal.year >= extract(year FROM flight_start)::int
      AND cal.year <= extract(year FROM flight_end)::int;
  ELSE RETURN coalesce(NEW, OLD);
  END IF;
  IF ys IS NULL OR cardinality(ys) = 0 THEN RETURN coalesce(NEW, OLD); END IF;
  SELECT coalesce(array_agg(DISTINCT v ORDER BY v), array[]::int[]) INTO ys FROM unnest(ys) AS v;
  FOREACH y IN ARRAY ys LOOP
    IF y IS NOT NULL THEN PERFORM public.recompute_content_version_for_year(y); END IF;
  END LOOP;
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_content_version(p_year integer)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  select coalesce(
    (select jsonb_build_object(
       'year', cv.year, 'version_hash', cv.version_hash,
       'published_at', cv.published_at, 'updated_at', cv.updated_at
     ) from public.content_versions cv where cv.year = p_year),
    jsonb_build_object('year', p_year, 'version_hash', '', 'published_at', null, 'updated_at', null)
  );
$$;

-- ─── 8. Calendar / event / ad read RPCs ─────────────────────
CREATE OR REPLACE FUNCTION public.list_workspace_calendars(p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  select coalesce((
    select jsonb_agg(t.row order by t.y desc, t.u desc nulls last, t.id_text) from (
      select jsonb_build_object(
        'id', c.id, 'workspace_id', c.workspace_id, 'year', c.year,
        'name', c.name, 'status', c.status, 'updated_at', c.updated_at
      ) as row, c.year as y, c.updated_at as u, c.id::text as id_text
      from public.calendars c where c.workspace_id = p_workspace_id and c.deleted_at is null
    ) t),
    '[]'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public.get_active_ads(p_date date, p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
with picked as (
  select distinct on (ac.position)
    p_date as event_date, ac.position,
    jsonb_build_object('id', ac.id, 'name', ac.name, 'advertiser', co.name,
      'image_path', ac.image_path, 'link_url', ac.link_url,
      'start_date', to_char(ac.start_date,'YYYY-MM-DD'),
      'end_date', to_char(ac.end_date,'YYYY-MM-DD')
    ) as ad_obj
  from public.ad_campaigns ac
  join public.companies co on co.id = ac.company_id
  where ac.workspace_id = p_workspace_id
    and ac.deleted_at is null
    and ac.active = true
    and ac.validated_at is not null
    and ac.start_date <= ac.end_date
    and ac.start_date <= p_date and ac.end_date >= p_date
  order by ac.position, ac.updated_at desc, ac.id
)
select coalesce(jsonb_agg(jsonb_build_object(
  'event_date', to_char((p.event_date)::date,'YYYY-MM-DD'),
  'position', p.position, 'ad', p.ad_obj
) order by p.position), '[]'::jsonb) from picked p;
$$;

CREATE OR REPLACE FUNCTION public.get_calendar_days(p_year integer, p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
with cal as (
  select c.id, c.year, c.workspace_id from public.calendars c
  where c.year = p_year and c.workspace_id = p_workspace_id and c.deleted_at is null
  order by case when c.status = 'published' then 0 else 1 end, c.updated_at desc limit 1
),
event_days as (
  select grid.d as event_date, count(*)::int as events_count,
         array_agg(ce.position order by ce.position) as event_positions
  from public.events e
  join public.calendar_entries ce on ce.event_id = e.id
  join cal on cal.id = ce.calendar_id
  cross join lateral (
    select make_date(cal.year, split_part(ce.mmdd::text,'-',1)::int, split_part(ce.mmdd::text,'-',2)::int)::date as d
  ) grid
  where e.deleted_at is null and extract(year from grid.d)::int = p_year
  group by grid.d
),
year_days as (
  select gs.d::date as d from cal c
  cross join lateral generate_series(make_date(c.year,1,1)::timestamptz, make_date(c.year,12,31)::timestamptz, '1 day'::interval) as gs(d)
),
ad_days as (
  select yd.d as event_date, array_agg(distinct ac.position order by ac.position) as ad_positions
  from year_days yd
  join cal on true
  join public.ad_campaigns ac on ac.workspace_id = cal.workspace_id
  where ac.deleted_at is null and ac.active = true and ac.start_date <= ac.end_date
    and ac.start_date <= yd.d and ac.end_date >= yd.d
  group by yd.d
)
select coalesce(jsonb_agg(jsonb_build_object(
  'event_date', to_char((coalesce(e.event_date, a.event_date))::date,'YYYY-MM-DD'),
  'events_count', coalesce(e.events_count, 0),
  'event_positions', coalesce(to_jsonb(e.event_positions),'[]'::jsonb),
  'ad_positions', coalesce(to_jsonb(a.ad_positions),'[]'::jsonb)
) order by coalesce(e.event_date, a.event_date)), '[]'::jsonb)
from event_days e full outer join ad_days a on a.event_date = e.event_date;
$$;

CREATE OR REPLACE FUNCTION public.get_today_content(p_date date, p_workspace_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
with cal as (
  select c.id, c.year, c.name, c.status, c.workspace_id from public.calendars c
  where c.year = extract(year from p_date)::int and c.workspace_id = p_workspace_id and c.deleted_at is null
  order by case when c.status='published' then 0 else 1 end, c.updated_at desc limit 1
),
events_today as (
  select jsonb_agg(jsonb_build_object(
    'id', e.id, 'event_date', to_char(grid.d,'YYYY-MM-DD'),
    'position', ce.position, 'title', e.title, 'description', e.description, 'image_path', e.image_path
  ) order by ce.position) as events
  from public.events e
  join public.calendar_entries ce on ce.event_id = e.id
  join cal on cal.id = ce.calendar_id
  cross join lateral (
    select make_date(cal.year, split_part(ce.mmdd::text,'-',1)::int, split_part(ce.mmdd::text,'-',2)::int)::date as d
  ) grid
  where e.deleted_at is null and grid.d = p_date
),
ads_today_picked as (
  select distinct on (ac.position) ac.position,
    jsonb_build_object('id', ac.id, 'name', ac.name, 'advertiser', co.name,
      'image_path', ac.image_path, 'link_url', ac.link_url,
      'start_date', to_char(ac.start_date,'YYYY-MM-DD'), 'end_date', to_char(ac.end_date,'YYYY-MM-DD')) as ad_obj
  from public.ad_campaigns ac
  join public.companies co on co.id = ac.company_id
  where ac.workspace_id = p_workspace_id
    and ac.deleted_at is null
    and ac.active = true
    and ac.validated_at is not null
    and ac.start_date <= ac.end_date
    and ac.start_date <= p_date and ac.end_date >= p_date
  order by ac.position, ac.updated_at desc, ac.id
),
ads_today as (
  select (jsonb_agg(ad_obj) filter (where position::text='header'))->0 as header,
         (jsonb_agg(ad_obj) filter (where position::text='footer'))->0 as footer
  from ads_today_picked
)
select jsonb_build_object(
  'date', to_char(p_date,'YYYY-MM-DD'),
  'has_calendar', exists(select 1 from cal),
  'calendar', coalesce((select jsonb_build_object('id',cal.id,'workspace_id',cal.workspace_id,'year',cal.year,'name',cal.name,'status',cal.status) from cal), '{}'::jsonb),
  'events', coalesce((select events from events_today),'[]'::jsonb),
  'ads', jsonb_build_object('event_date', to_char(p_date,'YYYY-MM-DD'),
                            'header', (select header from ads_today),
                            'footer', (select footer from ads_today))
);
$$;

CREATE OR REPLACE FUNCTION public.peek_sync_calendar(p_year integer, p_workspace_id uuid, p_calendar_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
with cal as (
  select c.id, c.year, c.name, c.status, c.workspace_id from public.calendars c
  where c.year = p_year and c.workspace_id = p_workspace_id and c.deleted_at is null
    and (p_calendar_id is null or c.id = p_calendar_id)
  order by case when c.status='published' then 0 else 1 end, c.updated_at desc limit 1
)
select jsonb_build_object(
  'year', p_year,
  'version', coalesce((select cv.version_hash from public.content_versions cv where cv.year = p_year),''),
  'has_calendar', exists(select 1 from cal),
  'calendar', coalesce((select jsonb_build_object('id',cal.id,'workspace_id',cal.workspace_id,'year',cal.year,'name',cal.name,'status',cal.status) from cal), '{}'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.sync_calendar(p_year integer, p_workspace_id uuid, p_calendar_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
with cal as (
  select c.id, c.year, c.name, c.status, c.workspace_id from public.calendars c
  where c.year = p_year and c.workspace_id = p_workspace_id and c.deleted_at is null
    and (p_calendar_id is null or c.id = p_calendar_id)
  order by case when c.status='published' then 0 else 1 end, c.updated_at desc limit 1
),
events_grouped as (
  select grid.d as event_date,
    jsonb_agg(jsonb_build_object('id',e.id,'event_date',to_char(grid.d,'YYYY-MM-DD'),
      'position',ce.position,'title',e.title,'description',e.description,'image_path',e.image_path
    ) order by ce.position) as events
  from public.events e
  join public.calendar_entries ce on ce.event_id = e.id
  join cal on cal.id = ce.calendar_id
  cross join lateral (
    select make_date(cal.year, split_part(ce.mmdd::text,'-',1)::int, split_part(ce.mmdd::text,'-',2)::int)::date as d
  ) grid
  where e.deleted_at is null and extract(year from grid.d)::int = p_year
  group by grid.d
),
year_days as (
  select gs.d::date as d from cal c
  cross join lateral generate_series(make_date(c.year,1,1)::timestamptz, make_date(c.year,12,31)::timestamptz, '1 day'::interval) as gs(d)
),
ads_picked as (
  select distinct on (yd.d, ac.position) yd.d as event_date, ac.position,
    jsonb_build_object('id',ac.id,'name',ac.name,'advertiser',co.name,
      'image_path',ac.image_path,'link_url',ac.link_url,
      'start_date',to_char(ac.start_date,'YYYY-MM-DD'),'end_date',to_char(ac.end_date,'YYYY-MM-DD')) as ad_obj
  from year_days yd join cal on true
  join public.ad_campaigns ac on ac.workspace_id = cal.workspace_id
  join public.companies co on co.id = ac.company_id
  where ac.deleted_at is null and ac.active = true and ac.start_date <= ac.end_date
    and ac.start_date <= make_date(cal.year,12,31) and ac.end_date >= make_date(cal.year,1,1)
    and ac.start_date <= yd.d and ac.end_date >= yd.d
  order by yd.d, ac.position, ac.updated_at desc, ac.id
),
ads_grouped as (
  select ap.event_date,
    (jsonb_agg(ap.ad_obj) filter (where ap.position::text='header'))->0 as header,
    (jsonb_agg(ap.ad_obj) filter (where ap.position::text='footer'))->0 as footer
  from ads_picked ap group by ap.event_date
)
select jsonb_build_object(
  'year', p_year,
  'version', coalesce((select cv.version_hash from public.content_versions cv where cv.year = p_year),''),
  'has_calendar', exists(select 1 from cal),
  'calendar', coalesce((select jsonb_build_object('id',cal.id,'workspace_id',cal.workspace_id,'year',cal.year,'name',cal.name,'status',cal.status) from cal), '{}'::jsonb),
  'events', coalesce((select jsonb_agg(jsonb_build_object('event_date',to_char((eg.event_date)::date,'YYYY-MM-DD'),'events',eg.events) order by eg.event_date) from events_grouped eg),'[]'::jsonb),
  'ads',    coalesce((select jsonb_agg(jsonb_build_object('event_date',to_char((ag.event_date)::date,'YYYY-MM-DD'),'header',ag.header,'footer',ag.footer) order by ag.event_date) from ads_grouped ag),'[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.sync_calendar_delta(
  p_workspace_id uuid, p_calendar_id uuid, p_year integer, p_since timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_anchor timestamptz := clock_timestamp();
  v_version text;
  rec_cal RECORD;
  j_calendar jsonb; j_events jsonb; j_ads jsonb; j_deleted jsonb;
BEGIN
  SELECT COALESCE((SELECT cv.version_hash FROM public.content_versions cv WHERE cv.year = p_year),'') INTO v_version;
  SELECT c.id, c.workspace_id, c.year, c.name, c.status, c.updated_at, c.deleted_at INTO rec_cal
  FROM public.calendars c WHERE c.workspace_id = p_workspace_id AND c.id = p_calendar_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('year',p_year,'version',v_version,'has_calendar',false,
      'calendar','{}'::jsonb,'events','[]'::jsonb,'ads','[]'::jsonb,
      'deleted_event_ids','[]'::jsonb,'full_refresh_required',true,
      'calendar_deleted',false,'sync_anchor',v_anchor::text);
  END IF;
  IF rec_cal.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('year',p_year,'version',v_version,'has_calendar',false,
      'calendar','{}'::jsonb,'events','[]'::jsonb,'ads','[]'::jsonb,
      'deleted_event_ids','[]'::jsonb,'full_refresh_required',true,
      'calendar_deleted',true,'sync_anchor',v_anchor::text);
  END IF;
  IF rec_cal.year IS DISTINCT FROM p_year THEN
    RETURN jsonb_build_object('year',p_year,'version',v_version,'has_calendar',true,
      'calendar', jsonb_build_object('id',rec_cal.id,'workspace_id',rec_cal.workspace_id,'year',rec_cal.year,'name',rec_cal.name,'status',rec_cal.status),
      'events','[]'::jsonb,'ads','[]'::jsonb,'deleted_event_ids','[]'::jsonb,
      'full_refresh_required',true,'calendar_deleted',false,'sync_anchor',v_anchor::text);
  END IF;
  j_calendar := jsonb_build_object('id',rec_cal.id,'workspace_id',rec_cal.workspace_id,'year',rec_cal.year,'name',rec_cal.name,'status',rec_cal.status);
  IF p_since IS NULL THEN
    RETURN jsonb_build_object('year',p_year,'version',v_version,'has_calendar',true,'calendar',j_calendar,
      'events','[]'::jsonb,'ads','[]'::jsonb,'deleted_event_ids','[]'::jsonb,
      'full_refresh_required',true,'calendar_deleted',false,'sync_anchor',v_anchor::text);
  END IF;
  WITH deleted AS (
    SELECT e.id FROM public.events e
    WHERE e.deleted_at IS NOT NULL AND e.deleted_at > p_since
      AND EXISTS (SELECT 1 FROM public.calendar_entries ce WHERE ce.event_id = e.id AND ce.calendar_id = rec_cal.id)
  ) SELECT COALESCE(jsonb_agg(d.id),'[]'::jsonb) INTO j_deleted FROM deleted d;
  WITH touch_dates AS (
    SELECT DISTINCT grid.d AS d
    FROM public.calendar_entries ce
    CROSS JOIN LATERAL (SELECT make_date(rec_cal.year, split_part(ce.mmdd::text,'-',1)::int, split_part(ce.mmdd::text,'-',2)::int)::date AS d) grid
    LEFT JOIN public.events e ON e.id = ce.event_id
    WHERE ce.calendar_id = rec_cal.id AND extract(year FROM grid.d)::int = p_year
      AND (ce.updated_at > p_since OR (e IS NOT NULL AND e.updated_at > p_since)
           OR (e IS NOT NULL AND e.deleted_at IS NOT NULL AND e.deleted_at > p_since))
  ),
  events_grouped AS (
    SELECT grid.d AS event_date,
      jsonb_agg(jsonb_build_object('id',e.id,'event_date',to_char(grid.d,'YYYY-MM-DD'),
        'position',ce.position,'title',e.title,'description',e.description,'image_path',e.image_path) ORDER BY ce.position) AS events
    FROM public.events e
    INNER JOIN public.calendar_entries ce ON ce.event_id = e.id AND ce.calendar_id = rec_cal.id
    CROSS JOIN LATERAL (SELECT make_date(rec_cal.year, split_part(ce.mmdd::text,'-',1)::int, split_part(ce.mmdd::text,'-',2)::int)::date AS d) grid
    WHERE e.deleted_at IS NULL AND extract(year FROM grid.d)::int = p_year
      AND grid.d IN (SELECT td.d FROM touch_dates td)
    GROUP BY grid.d
  ),
  events_payload AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('event_date',to_char((td.d)::date,'YYYY-MM-DD'),'events',COALESCE(eg.events,'[]'::jsonb)) ORDER BY td.d),'[]'::jsonb) AS j
    FROM touch_dates td LEFT JOIN events_grouped eg ON eg.event_date = td.d
  ) SELECT j INTO j_events FROM events_payload;
  WITH year_span AS (
    SELECT gs.d::date AS d FROM generate_series(make_date(rec_cal.year,1,1)::timestamptz, make_date(rec_cal.year,12,31)::timestamptz,'1 day'::interval) AS gs(d)
  ),
  ad_touch_dates AS (
    SELECT DISTINCT ys.d FROM year_span ys
    JOIN public.ad_campaigns ac ON ac.workspace_id = rec_cal.workspace_id
    WHERE ac.deleted_at IS NULL AND ac.active = true AND ac.start_date <= ac.end_date
      AND ac.start_date <= ys.d AND ac.end_date >= ys.d
      AND ac.start_date <= make_date(rec_cal.year,12,31) AND ac.end_date >= make_date(rec_cal.year,1,1)
      AND (ac.updated_at > p_since OR (ac.deleted_at IS NOT NULL AND ac.deleted_at > p_since))
  ),
  ads_picked AS (
    SELECT DISTINCT ON (td.d, ac.position) td.d AS event_date, ac.position,
      jsonb_build_object('id',ac.id,'name',ac.name,'advertiser',co.name,'image_path',ac.image_path,
        'link_url',ac.link_url,'start_date',to_char(ac.start_date,'YYYY-MM-DD'),'end_date',to_char(ac.end_date,'YYYY-MM-DD')) AS ad_obj
    FROM ad_touch_dates td
    JOIN public.ad_campaigns ac ON ac.workspace_id = rec_cal.workspace_id
    JOIN public.companies co ON co.id = ac.company_id
    WHERE ac.deleted_at IS NULL AND ac.active = true AND ac.start_date <= ac.end_date
      AND ac.start_date <= td.d AND ac.end_date >= td.d
      AND ac.start_date <= make_date(rec_cal.year,12,31) AND ac.end_date >= make_date(rec_cal.year,1,1)
    ORDER BY td.d, ac.position, ac.updated_at DESC, ac.id
  ),
  ads_grouped AS (
    SELECT ap.event_date,
      (jsonb_agg(ap.ad_obj) FILTER (WHERE ap.position::text='header'))->0 AS header,
      (jsonb_agg(ap.ad_obj) FILTER (WHERE ap.position::text='footer'))->0 AS footer
    FROM ads_picked ap GROUP BY ap.event_date
  ),
  ads_payload AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('event_date',to_char((td.d)::date,'YYYY-MM-DD'),'header',ag.header,'footer',ag.footer) ORDER BY td.d),'[]'::jsonb) AS j
    FROM ad_touch_dates td LEFT JOIN ads_grouped ag ON ag.event_date = td.d
  ) SELECT j INTO j_ads FROM ads_payload;
  RETURN jsonb_build_object('year',p_year,'version',v_version,'has_calendar',true,'calendar',j_calendar,
    'events',j_events,'ads',j_ads,'deleted_event_ids',j_deleted,
    'full_refresh_required',false,'calendar_deleted',false,'sync_anchor',v_anchor::text);
END;
$$;

-- ─── 9. Devices / metrics RPCs ──────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_push_device(
  p_expo_push_token text, p_platform text, p_address_ip text DEFAULT NULL, p_hardware_device_id text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_token text := trim(p_expo_push_token); v_platform text := lower(trim(p_platform));
  v_ip text := nullif(trim(coalesce(p_address_ip,'')),''); v_hw text := nullif(trim(coalesce(p_hardware_device_id,'')),''); v_id uuid;
BEGIN
  IF length(v_token) < 1 THEN RAISE EXCEPTION 'empty_expo_push_token'; END IF;
  IF v_platform NOT IN ('ios','android') THEN RAISE EXCEPTION 'invalid_platform'; END IF;
  INSERT INTO public.devices (expo_push_token, platform, address_ip, device_id, updated_at)
  VALUES (v_token, v_platform, v_ip, v_hw, now())
  ON CONFLICT (expo_push_token) DO UPDATE SET
    platform = EXCLUDED.platform, address_ip = EXCLUDED.address_ip, updated_at = EXCLUDED.updated_at,
    device_id = COALESCE(EXCLUDED.device_id, devices.device_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_device_log(
  p_action text, p_outcome text, p_device_uuid uuid DEFAULT NULL,
  p_expo_push_token text DEFAULT NULL, p_platform text DEFAULT NULL,
  p_error_message text DEFAULT NULL, p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_id uuid; v_outcome text := lower(trim(p_outcome));
BEGIN
  IF length(trim(p_action)) < 1 THEN RAISE EXCEPTION 'empty_action'; END IF;
  IF v_outcome NOT IN ('success','error') THEN RAISE EXCEPTION 'invalid_outcome'; END IF;
  INSERT INTO public.devices_logs (action, outcome, device_uuid, expo_push_token, platform, error_message, details)
  VALUES (trim(p_action), v_outcome, p_device_uuid,
          nullif(trim(coalesce(p_expo_push_token,'')),''),
          nullif(trim(coalesce(p_platform,'')),''),
          nullif(trim(coalesce(p_error_message,'')),''),
          coalesce(p_details,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ad_campaign_view(p_device_uuid uuid, p_campaign_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_device_uuid IS NULL OR p_campaign_id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.devices d WHERE d.id = p_device_uuid) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ad_campaigns c WHERE c.id = p_campaign_id AND c.deleted_at IS NULL) THEN RETURN NULL; END IF;
  INSERT INTO public.ad_campaign_device_views (device_id, campaign_id) VALUES (p_device_uuid, p_campaign_id) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ad_campaign_click(p_device_uuid uuid, p_campaign_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_device_uuid IS NULL OR p_campaign_id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.devices d WHERE d.id = p_device_uuid) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ad_campaigns c WHERE c.id = p_campaign_id AND c.deleted_at IS NULL) THEN RETURN NULL; END IF;
  INSERT INTO public.ad_campaign_device_clicks (device_id, campaign_id) VALUES (p_device_uuid, p_campaign_id) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_ad_campaign_click(uuid, uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_storage_usage_mb()
RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT ROUND(COALESCE(SUM((metadata->>'size')::bigint), 0)::numeric / 1048576, 1) FROM storage.objects;
$$;

-- ─── 9b. Presidency apply RPC ───────────────────────────────
-- Editors (and chef_equipe/owner) call this to copy Presidence drafts into
-- calendar_entries. SECURITY DEFINER lets it bypass the chef_equipe-only RLS
-- on calendar_entries so plain editeurs can still apply.
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
  IF NOT public.has_role_at_least('editeur'::public.app_role) THEN
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

GRANT EXECUTE ON FUNCTION public.apply_presidency_recommendations(uuid, boolean) TO authenticated;

-- ─── 9b. Calendar soft-delete + restore + trash-list RPCs ────────────────
-- The calendars table already has deleted_at + deleted_by. Direct writes
-- would be authorized by the editor+ RLS policy on calendars, but we want
-- the delete flow restricted to chef_equipe+. These SECURITY DEFINER RPCs
-- enforce that role gate above the RLS layer.

CREATE FUNCTION public.soft_delete_calendar(p_calendar_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT public.has_role_at_least('chef_equipe'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  UPDATE public.calendars
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = p_calendar_id
     AND deleted_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.soft_delete_calendar(uuid) TO authenticated;

CREATE FUNCTION public.restore_calendar(p_calendar_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT public.has_role_at_least('chef_equipe'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  UPDATE public.calendars
     SET deleted_at = NULL,
         deleted_by = NULL,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = p_calendar_id
     AND deleted_at IS NOT NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.restore_calendar(uuid) TO authenticated;

CREATE FUNCTION public.list_deleted_calendars()
RETURNS TABLE (
  id            uuid,
  workspace_id  uuid,
  year          int,
  name          text,
  status        text,
  deleted_at    timestamptz,
  deleted_by    uuid,
  deleter_email text,
  deleter_name  text,
  entries_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT public.has_role_at_least('chef_equipe'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH any_profile AS (
    SELECT DISTINCT ON (pf.user_id) pf.user_id, pf.full_name
    FROM public.profiles pf
    ORDER BY pf.user_id, pf.created_at ASC
  )
  SELECT
    c.id, c.workspace_id, c.year, c.name, c.status,
    c.deleted_at, c.deleted_by,
    u.email::text, p.full_name,
    (SELECT count(*)::int FROM public.calendar_entries WHERE calendar_id = c.id)
  FROM public.calendars c
  LEFT JOIN auth.users u  ON u.id = c.deleted_by
  LEFT JOIN any_profile p ON p.user_id = c.deleted_by
  WHERE c.deleted_at IS NOT NULL
    AND c.workspace_id IN (SELECT public.get_my_workspace_ids())
  ORDER BY c.deleted_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_deleted_calendars() TO authenticated;

-- ─── 10. Notification trigger functions ─────────────────────
CREATE OR REPLACE FUNCTION public.create_notification_from_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _workspace_id uuid; _title text; _body text; _record_id uuid; _cal_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN _record_id := OLD.id; _workspace_id := OLD.workspace_id; _cal_name := COALESCE(OLD.name, OLD.year::text);
  ELSE _record_id := NEW.id; _workspace_id := NEW.workspace_id; _cal_name := COALESCE(NEW.name, NEW.year::text); END IF;
  IF TG_OP = 'INSERT' THEN
    _title := 'Nouveau calendrier créé'; _body := 'Le calendrier « ' || _cal_name || ' » a été créé.';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      _title := 'Calendrier archivé'; _body := 'Le calendrier « ' || COALESCE(OLD.name, OLD.year::text) || ' » a été archivé.';
    ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'published' THEN
      _title := 'Calendrier publié'; _body := 'Le calendrier « ' || _cal_name || ' » vient d''être publié sur mobile.';
    ELSE
      _title := 'Calendrier modifié'; _body := 'Le calendrier « ' || _cal_name || ' » a été mis à jour.';
    END IF;
  ELSE
    _title := 'Calendrier supprimé'; _body := 'Le calendrier « ' || COALESCE(OLD.name, OLD.year::text) || ' » a été supprimé.';
  END IF;
  IF _workspace_id IS NOT NULL AND _title IS NOT NULL THEN
    INSERT INTO public.notifications (workspace_id, actor_id, category, title, body, link_path, table_name, record_id, action)
    VALUES (_workspace_id, auth.uid(), 'editorial', _title, _body, '/calendrier', TG_TABLE_NAME, _record_id, TG_OP);
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification_from_campaign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _workspace_id uuid; _title text; _body text; _record_id uuid; _advertiser text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _record_id := OLD.id; _workspace_id := OLD.workspace_id;
    SELECT name INTO _advertiser FROM public.companies WHERE id = OLD.company_id;
  ELSE
    _record_id := NEW.id; _workspace_id := NEW.workspace_id;
    SELECT name INTO _advertiser FROM public.companies WHERE id = NEW.company_id;
  END IF;
  _advertiser := COALESCE(_advertiser, '—');
  IF TG_OP = 'INSERT' THEN
    _title := 'Nouvelle campagne créée — à valider';
    _body := 'La campagne « ' || COALESCE(NEW.name,'Sans nom') || ' » (' || _advertiser ||
             ') a été créée. Marquez-la payée et confirmée pour la publier.';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      _title := 'Campagne supprimée'; _body := 'La campagne « ' || COALESCE(OLD.name,'Sans nom') || ' » a été supprimée.';
    ELSIF OLD.validated_at IS NULL AND NEW.validated_at IS NOT NULL THEN
      _title := 'Campagne validée';
      _body := 'La campagne « ' || COALESCE(NEW.name,'Sans nom') || ' » (' || _advertiser ||
               ') est validée et sera diffusée selon ses dates.';
    ELSIF OLD.paid_at IS NULL AND NEW.paid_at IS NOT NULL THEN
      _title := 'Paiement enregistré';
      _body := 'La campagne « ' || COALESCE(NEW.name,'Sans nom') || ' » (' || _advertiser ||
               ') a été marquée payée. Confirmation managériale requise.';
    ELSIF OLD.manager_confirmed_at IS NULL AND NEW.manager_confirmed_at IS NOT NULL THEN
      _title := 'Campagne confirmée';
      _body := 'La campagne « ' || COALESCE(NEW.name,'Sans nom') || ' » (' || _advertiser ||
               ') a été confirmée. Paiement à enregistrer pour validation.';
    ELSIF OLD.active IS DISTINCT FROM NEW.active THEN
      IF NEW.active THEN
        _title := 'Campagne activée'; _body := 'La campagne « ' || COALESCE(NEW.name,'Sans nom') || ' » est maintenant active.';
      ELSE
        _title := 'Campagne désactivée'; _body := 'La campagne « ' || COALESCE(NEW.name,'Sans nom') || ' » a été désactivée.';
      END IF;
    ELSE
      _title := 'Campagne modifiée';
      _body := 'La campagne « ' || COALESCE(NEW.name,'Sans nom') || ' » (' || _advertiser || ') a été mise à jour.';
    END IF;
  ELSE
    _title := 'Campagne supprimée'; _body := 'Une campagne publicitaire a été définitivement retirée.';
  END IF;
  IF _workspace_id IS NOT NULL AND _title IS NOT NULL THEN
    INSERT INTO public.notifications (workspace_id, actor_id, category, title, body, link_path, table_name, record_id, action)
    VALUES (_workspace_id, auth.uid(), 'campaign', _title, _body, '/campagnes', TG_TABLE_NAME, _record_id, TG_OP);
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification_from_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _workspace_id uuid; _title text; _body text; _record_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN _record_id := OLD.id; _workspace_id := OLD.workspace_id;
  ELSE _record_id := NEW.id; _workspace_id := NEW.workspace_id; END IF;
  IF TG_OP = 'INSERT' THEN
    _title := 'Nouvel événement créé'; _body := 'L''événement « ' || COALESCE(NEW.title,'Sans titre') || ' » a été ajouté.';
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      _title := 'Événement supprimé'; _body := 'L''événement « ' || COALESCE(OLD.title,'Sans titre') || ' » a été supprimé.';
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      _title := 'Statut d''événement mis à jour';
      _body := '« ' || COALESCE(NEW.title,'Sans titre') || ' » → ' || COALESCE(NEW.status,'brouillon') || '.';
    ELSE
      _title := 'Événement modifié'; _body := 'L''événement « ' || COALESCE(NEW.title,'Sans titre') || ' » a été mis à jour.';
    END IF;
  ELSE
    _title := 'Événement supprimé'; _body := 'Un événement a été définitivement retiré de la bibliothèque.';
  END IF;
  IF _workspace_id IS NOT NULL AND _title IS NOT NULL THEN
    INSERT INTO public.notifications (workspace_id, actor_id, category, title, body, link_path, table_name, record_id, action)
    VALUES (_workspace_id, auth.uid(), 'editorial', _title, _body, '/evenements', TG_TABLE_NAME, _record_id, TG_OP);
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ─── 11. Triggers ───────────────────────────────────────────
-- ad_campaigns
CREATE TRIGGER ad_campaigns_audit               AFTER INSERT OR UPDATE OR DELETE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER ad_campaigns_track_modifications BEFORE UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.track_modifications();
CREATE TRIGGER tr_notify_campaigns              AFTER INSERT OR UPDATE OR DELETE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.create_notification_from_campaign();
CREATE TRIGGER tr_touch_content_version_ad_campaigns AFTER INSERT OR UPDATE OR DELETE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_content_versions_for_editorial();
CREATE TRIGGER trg_ad_campaigns_timestamps      BEFORE UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_timestamps();

-- calendar_entries
CREATE TRIGGER tr_calendar_entries_bump_updated_at        BEFORE UPDATE ON public.calendar_entries FOR EACH ROW EXECUTE FUNCTION public.bump_row_updated_at();
CREATE TRIGGER tr_touch_content_version_calendar_entries  AFTER INSERT OR UPDATE OR DELETE ON public.calendar_entries FOR EACH ROW EXECUTE FUNCTION public.touch_content_versions_for_editorial();

-- calendars
CREATE TRIGGER calendars_audit                AFTER INSERT OR UPDATE OR DELETE ON public.calendars FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER calendars_set_published_at     BEFORE UPDATE ON public.calendars FOR EACH ROW EXECUTE FUNCTION public.set_calendar_published_at();
CREATE TRIGGER calendars_track_modifications  BEFORE UPDATE ON public.calendars FOR EACH ROW EXECUTE FUNCTION public.track_modifications();
CREATE TRIGGER tr_notify_calendars            AFTER INSERT OR UPDATE OR DELETE ON public.calendars FOR EACH ROW EXECUTE FUNCTION public.create_notification_from_calendar();
CREATE TRIGGER tr_touch_content_version_calendars AFTER INSERT OR UPDATE OR DELETE ON public.calendars FOR EACH ROW EXECUTE FUNCTION public.touch_content_versions_for_editorial();
CREATE TRIGGER trg_calendars_timestamps       BEFORE UPDATE ON public.calendars FOR EACH ROW EXECUTE FUNCTION public.update_timestamps();

-- devices
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- events
CREATE TRIGGER events_audit               AFTER INSERT OR UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER events_track_modifications BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.track_modifications();
CREATE TRIGGER tr_notify_events           AFTER INSERT OR UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.create_notification_from_event();
CREATE TRIGGER tr_touch_content_version_events AFTER INSERT OR UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.touch_content_versions_for_editorial();
CREATE TRIGGER trg_events_timestamps      BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_timestamps();

-- profiles / workspaces
CREATE TRIGGER trg_profiles_timestamps   BEFORE UPDATE ON public.profiles   FOR EACH ROW EXECUTE FUNCTION public.update_timestamps();
CREATE TRIGGER trg_workspaces_timestamps BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_timestamps();

-- presidency_recommendations
CREATE TRIGGER presidency_recommendations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.presidency_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER presidency_recommendations_bump_updated_at
  BEFORE UPDATE ON public.presidency_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_updated_at();

-- companies
CREATE TRIGGER companies_audit               AFTER INSERT OR UPDATE OR DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER companies_track_modifications BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.track_modifications();
CREATE TRIGGER trg_companies_timestamps      BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_timestamps();

-- Admin-scope audit triggers (power /admin/logs). No workspace_id on the
-- rows themselves — log_audit_event falls back to NULL and the admin_list
-- RPC derives workspace context via record_id when table_name='workspaces'.
CREATE TRIGGER workspaces_audit        AFTER INSERT OR UPDATE OR DELETE ON public.workspaces        FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER user_roles_audit        AFTER INSERT OR UPDATE OR DELETE ON public.user_roles        FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER workspace_members_audit AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Hook auth.users → handle_new_user (must be created here as auth schema is created before this migration runs)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS workspace_members_ensure_profile ON public.workspace_members;
CREATE TRIGGER workspace_members_ensure_profile
  AFTER INSERT ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.ensure_profile_for_membership();

-- ─── 12. Enable RLS ─────────────────────────────────────────
ALTER TABLE public.workspaces              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendars               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaign_device_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaign_device_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presidency_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies               ENABLE ROW LEVEL SECURITY;

-- ─── 13. RLS policies ───────────────────────────────────────

-- workspaces
CREATE POLICY "Workspaces - Owner full access" ON public.workspaces TO authenticated
  USING (public.current_user_role() = 'owner'::public.app_role)
  WITH CHECK (public.current_user_role() = 'owner'::public.app_role);
CREATE POLICY "Workspaces - Read authenticated" ON public.workspaces FOR SELECT TO authenticated USING (true);

-- workspace_members
CREATE POLICY "workspace_members_select" ON public.workspace_members FOR SELECT
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

-- profiles
-- Per-tenant profile access:
-- - A user can always read/update their own rows in any workspace.
-- - Workspace members can read other members' profile in the same workspace.
-- - system_admin can read every profile across the platform.
CREATE POLICY "Profiles - Read own" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Profiles - Workspace members can read" ON public.profiles FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));
CREATE POLICY "Profiles - System admin reads all" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'system_admin'));
CREATE POLICY "Profiles - Insert own in own workspace" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND workspace_id IN (SELECT public.get_my_workspace_ids()));
CREATE POLICY "Profiles - Update own" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- user_roles
CREATE POLICY "User Roles - Read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "User Roles - Owner insert"  ON public.user_roles FOR INSERT WITH CHECK (public.current_user_role() = 'owner'::public.app_role);
CREATE POLICY "User Roles - Owner update"  ON public.user_roles FOR UPDATE USING (public.current_user_role() = 'owner'::public.app_role) WITH CHECK (public.current_user_role() = 'owner'::public.app_role);
CREATE POLICY "User Roles - Owner delete"  ON public.user_roles FOR DELETE USING (public.current_user_role() = 'owner'::public.app_role);

-- calendars
CREATE POLICY "Calendars - Read all"             ON public.calendars FOR SELECT TO authenticated, anon USING (deleted_at IS NULL);
CREATE POLICY "Calendars - Write editorial roles" ON public.calendars TO authenticated
  USING (public.has_role_at_least('editeur'::public.app_role))
  WITH CHECK (public.has_role_at_least('editeur'::public.app_role));

-- events
CREATE POLICY "Events - Read all"             ON public.events FOR SELECT TO authenticated, anon USING (deleted_at IS NULL);
CREATE POLICY "Events - Write editorial roles" ON public.events TO authenticated
  USING (public.has_role_at_least('editeur'::public.app_role))
  WITH CHECK (public.has_role_at_least('editeur'::public.app_role));

-- calendar_entries (note: policies live without explicit role list — applies to public)
CREATE POLICY "Calendar Entries - Read authenticated" ON public.calendar_entries FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Calendar Entries - Write editorial roles" ON public.calendar_entries
  USING (public.has_role_at_least('chef_equipe'::public.app_role))
  WITH CHECK (public.has_role_at_least('chef_equipe'::public.app_role));

-- ad_campaigns
CREATE POLICY "Ad Campaigns - Read public" ON public.ad_campaigns FOR SELECT TO authenticated, anon
  USING (deleted_at IS NULL AND active = true);
CREATE POLICY "Ad Campaigns - Read for managers" ON public.ad_campaigns FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.has_role_at_least('charge_communication'::public.app_role));
CREATE POLICY "Ad Campaigns - Write ad roles" ON public.ad_campaigns TO authenticated
  USING (public.has_role_at_least('charge_communication'::public.app_role))
  WITH CHECK (public.has_role_at_least('charge_communication'::public.app_role));

-- ad_campaign_device_views / clicks (Round 4 — clicks)
CREATE POLICY "Ad Views - Read workspace" ON public.ad_campaign_device_views FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ad_campaigns ac
    WHERE ac.id = ad_campaign_device_views.campaign_id
      AND ac.workspace_id IN (SELECT public.get_my_workspace_ids())
  ));
CREATE POLICY "Ad Clicks - Read workspace" ON public.ad_campaign_device_clicks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ad_campaigns ac
    WHERE ac.id = ad_campaign_device_clicks.campaign_id
      AND ac.workspace_id IN (SELECT public.get_my_workspace_ids())
  ));

-- Explicit table grants so RLS (above) is the actual gate, not the GRANT layer.
-- ad_campaign_device_views was missing these on the live project — caused CMS reads
-- to fail with 42501 "permission denied for table" before RLS could evaluate.
GRANT ALL ON TABLE public.ad_campaign_device_views  TO anon, authenticated;
GRANT ALL ON TABLE public.ad_campaign_device_clicks TO anon, authenticated;

-- content_versions
CREATE POLICY "Content Versions - Read all"      ON public.content_versions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Content Versions - No direct write" ON public.content_versions TO authenticated USING (false) WITH CHECK (false);

-- audit_log
-- Workspace-scoped audit visibility. A chef_equipe+ of a workspace sees that
-- workspace's audit events; system_admin sees everything (short-circuited in
-- has_role_at_least). Legacy rows without workspace_id are system_admin-only.
CREATE POLICY "Audit log - Read scoped to workspace senior roles" ON public.audit_log FOR SELECT
  USING (
    workspace_id IS NULL
      AND public.has_role_at_least('chef_equipe'::public.app_role)
    OR
      public.has_role_at_least('chef_equipe'::public.app_role, workspace_id)
  );

-- devices (mirroring the duplicated policies from prod)
CREATE POLICY "Allow anon insert devices"             ON public.devices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon select devices"             ON public.devices FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon update devices"             ON public.devices FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous insert/upsert on devices" ON public.devices FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous select on devices"     ON public.devices FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous update on devices"     ON public.devices FOR UPDATE USING (true);

-- devices_logs
CREATE POLICY "devices_logs_insert_anon"          ON public.devices_logs FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY "devices_logs_insert_authenticated" ON public.devices_logs FOR INSERT TO authenticated WITH CHECK (true);

-- notifications — scoped to the reader's join date so newly-invited members
-- don't inherit the workspace's entire notification history on first login.
-- The workspaces.created_by branch is a safety net for the creator.
CREATE POLICY "Members read workspace notifications" ON public.notifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.user_id      = auth.uid()
        AND wm.workspace_id = notifications.workspace_id
        AND notifications.created_at >= wm.joined_at
    )
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.created_by = auth.uid()
        AND w.id         = notifications.workspace_id
    )
  );
CREATE POLICY "System inserts notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- notification_reads
CREATE POLICY "Users read their own read records"  ON public.notification_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert their own read records" ON public.notification_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- presidency_recommendations
CREATE POLICY "Presidency Recommendations - Read workspace" ON public.presidency_recommendations
  FOR SELECT USING (auth.uid() IS NOT NULL AND workspace_id IN (SELECT public.get_my_workspace_ids()));
CREATE POLICY "Presidency Recommendations - Write presidence" ON public.presidency_recommendations
  USING (public.has_role_at_least('presidence'::public.app_role))
  WITH CHECK (public.has_role_at_least('presidence'::public.app_role));

-- companies
CREATE POLICY "Companies - Read workspace" ON public.companies
  FOR SELECT USING (auth.uid() IS NOT NULL AND workspace_id IN (SELECT public.get_my_workspace_ids()));
CREATE POLICY "Companies - Write commercial lead" ON public.companies
  USING (public.has_role_at_least('chef_equipe_commerciale'::public.app_role))
  WITH CHECK (public.has_role_at_least('chef_equipe_commerciale'::public.app_role));


-- ─── 14. Function grants ────────────────────────────────────
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon, service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_temporary_owners() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()          FROM anon;

-- ─── 15. Storage buckets ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('ads-banners',       'ads-banners',       true, 157286400, ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('avatars',           'avatars',           true, NULL,      NULL),
  ('historical-images', 'historical-images', true, NULL,      ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']),
  ('workspace-logos',   'workspace-logos',   true, NULL,      NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── 16. Storage policies ───────────────────────────────────
-- ads-banners
CREATE POLICY "Ads Banners - Public read for mobile" ON storage.objects FOR SELECT TO anon          USING (bucket_id = 'ads-banners');
CREATE POLICY "ads_banners_public_read"              ON storage.objects FOR SELECT                  USING (bucket_id = 'ads-banners');
CREATE POLICY "ads_banners_auth_insert"              ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ads-banners');
CREATE POLICY "ads_banners_auth_update"              ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'ads-banners') WITH CHECK (bucket_id = 'ads-banners');
CREATE POLICY "ads_banners_auth_delete"              ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ads-banners');

-- historical-images
CREATE POLICY "Historical Images - Public read for mobile" ON storage.objects FOR SELECT TO anon          USING (bucket_id = 'historical-images');
CREATE POLICY "historical_images_public_read"              ON storage.objects FOR SELECT                  USING (bucket_id = 'historical-images');
CREATE POLICY "historical_images_auth_insert"              ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'historical-images');
CREATE POLICY "historical_images_auth_update"              ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'historical-images') WITH CHECK (bucket_id = 'historical-images');
CREATE POLICY "historical_images_auth_delete"              ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'historical-images');

-- avatars
CREATE POLICY "Avatars are publicly readable" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

-- workspace-logos
CREATE POLICY "Workspace logos are publicly readable"        ON storage.objects FOR SELECT USING (bucket_id = 'workspace-logos');
CREATE POLICY "Authenticated users can upload workspace logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'workspace-logos');
CREATE POLICY "Authenticated users can update workspace logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'workspace-logos');

-- ──────────────────────────────────────────────────────────────────────────
-- Round 3 — ad campaign two-key validation workflow
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_campaign_paid(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role public.app_role;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role NOT IN ('owner', 'chef_equipe_commerciale') THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ad_campaigns
     SET paid_at    = COALESCE(paid_at, now()),
         paid_by    = COALESCE(paid_by, auth.uid()),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = p_campaign_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_campaign_paid(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_campaign(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role public.app_role;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = auth.uid();
  IF v_role NOT IN ('owner', 'chef_equipe_commerciale') THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ad_campaigns
     SET manager_confirmed_at = COALESCE(manager_confirmed_at, now()),
         manager_confirmed_by = COALESCE(manager_confirmed_by, auth.uid()),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = p_campaign_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_campaign(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unmark_campaign_paid(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.has_role_at_least('owner'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ad_campaigns
     SET paid_at = NULL, paid_by = NULL, updated_at = now(), updated_by = auth.uid()
   WHERE id = p_campaign_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unmark_campaign_paid(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unconfirm_campaign(p_campaign_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.has_role_at_least('owner'::public.app_role) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  UPDATE public.ad_campaigns
     SET manager_confirmed_at = NULL, manager_confirmed_by = NULL,
         updated_at = now(), updated_by = auth.uid()
   WHERE id = p_campaign_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unconfirm_campaign(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_pending_campaign_validations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_count int := 0;
  r record;
  _advertiser text;
BEGIN
  FOR r IN
    SELECT ac.id, ac.workspace_id, ac.name, ac.start_date, ac.company_id
      FROM public.ad_campaigns ac
     WHERE ac.deleted_at IS NULL
       AND ac.validated_at IS NULL
       AND ac.start_date - CURRENT_DATE BETWEEN 0 AND 10
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
          WHERE n.record_id = ac.id
            AND n.action   = 'STARTS_SOON_REMINDER'
            AND n.created_at > now() - interval '23 hours'
       )
  LOOP
    SELECT name INTO _advertiser FROM public.companies WHERE id = r.company_id;
    INSERT INTO public.notifications
      (workspace_id, actor_id, category, title, body, link_path, table_name, record_id, action)
    VALUES
      (r.workspace_id, NULL, 'campaign',
       'Validation urgente : ' || r.name,
       'La campagne « ' || r.name || ' » (' || COALESCE(_advertiser, '—') ||
         ') démarre le ' || to_char(r.start_date, 'DD/MM/YYYY') ||
         ' et n''est pas encore validée.',
       '/campagnes', 'ad_campaigns', r.id, 'STARTS_SOON_REMINDER');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.notify_pending_campaign_validations() TO authenticated;

-- Daily 08:00 UTC reminder
DO $do$
BEGIN
  PERFORM cron.unschedule('notify-pending-campaign-validations');
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

SELECT cron.schedule(
  'notify-pending-campaign-validations',
  '0 8 * * *',
  $cron$SELECT public.notify_pending_campaign_validations();$cron$
);
