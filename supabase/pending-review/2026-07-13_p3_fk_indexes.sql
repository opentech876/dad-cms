-- ============================================================================
-- P-3  unindexed_foreign_keys
-- ----------------------------------------------------------------------------
-- Adds covering indexes for foreign keys that sit on join / filter / RLS hot
-- paths. Tables are currently small so a plain CREATE INDEX (brief lock) is
-- fine; if these tables grow large before applying, switch to
-- CREATE INDEX CONCURRENTLY (must run outside a transaction).
-- ============================================================================

-- Hot paths ------------------------------------------------------------------

-- Used by get_my_workspace_ids() → hit on EVERY workspace-scoped RLS check.
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
  ON public.workspace_members (user_id);

-- Workspace-scoped list queries + RLS.
CREATE INDEX IF NOT EXISTS idx_calendar_entries_workspace_id
  ON public.calendar_entries (workspace_id);
CREATE INDEX IF NOT EXISTS idx_profiles_workspace_id
  ON public.profiles (workspace_id);
CREATE INDEX IF NOT EXISTS idx_presidency_recommendations_workspace_id
  ON public.presidency_recommendations (workspace_id);

-- Joins.
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_company_id
  ON public.ad_campaigns (company_id);
CREATE INDEX IF NOT EXISTS idx_presidency_recommendations_event_id
  ON public.presidency_recommendations (event_id);
CREATE INDEX IF NOT EXISTS idx_devices_logs_device_uuid
  ON public.devices_logs (device_uuid);

-- ============================================================================
-- Optional — audit-column FKs (created_by / updated_by / deleted_by / …).
-- These are rarely queried by that column; their only real benefit is speeding
-- up cascade checks when an auth.users row is deleted (rare). Uncomment if you
-- start hard-deleting users or want to silence every advisor row.
-- ----------------------------------------------------------------------------
-- CREATE INDEX IF NOT EXISTS idx_ad_campaigns_created_by            ON public.ad_campaigns (created_by);
-- CREATE INDEX IF NOT EXISTS idx_ad_campaigns_updated_by            ON public.ad_campaigns (updated_by);
-- CREATE INDEX IF NOT EXISTS idx_ad_campaigns_deleted_by            ON public.ad_campaigns (deleted_by);
-- CREATE INDEX IF NOT EXISTS idx_ad_campaigns_paid_by               ON public.ad_campaigns (paid_by);
-- CREATE INDEX IF NOT EXISTS idx_ad_campaigns_manager_confirmed_by  ON public.ad_campaigns (manager_confirmed_by);
-- CREATE INDEX IF NOT EXISTS idx_calendar_entries_created_by        ON public.calendar_entries (created_by);
-- CREATE INDEX IF NOT EXISTS idx_calendars_created_by               ON public.calendars (created_by);
-- CREATE INDEX IF NOT EXISTS idx_calendars_updated_by               ON public.calendars (updated_by);
-- CREATE INDEX IF NOT EXISTS idx_calendars_deleted_by               ON public.calendars (deleted_by);
-- CREATE INDEX IF NOT EXISTS idx_companies_created_by               ON public.companies (created_by);
-- CREATE INDEX IF NOT EXISTS idx_companies_updated_by               ON public.companies (updated_by);
-- CREATE INDEX IF NOT EXISTS idx_companies_deleted_by               ON public.companies (deleted_by);
-- CREATE INDEX IF NOT EXISTS idx_events_created_by                  ON public.events (created_by);
-- CREATE INDEX IF NOT EXISTS idx_events_updated_by                  ON public.events (updated_by);
-- CREATE INDEX IF NOT EXISTS idx_events_deleted_by                  ON public.events (deleted_by);
-- CREATE INDEX IF NOT EXISTS idx_presidency_recommendations_created_by ON public.presidency_recommendations (created_by);
-- CREATE INDEX IF NOT EXISTS idx_presidency_recommendations_applied_by ON public.presidency_recommendations (applied_by);
-- CREATE INDEX IF NOT EXISTS idx_user_roles_created_by              ON public.user_roles (created_by);
-- CREATE INDEX IF NOT EXISTS idx_workspaces_created_by              ON public.workspaces (created_by);
-- CREATE INDEX IF NOT EXISTS idx_workspaces_deleted_by              ON public.workspaces (deleted_by);
