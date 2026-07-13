-- ============================================================================
-- P-1  auth_rls_initplan  +  P-2 (devices dedup)
-- ----------------------------------------------------------------------------
-- Wrap every direct auth.uid() in RLS policy expressions as (select auth.uid()).
-- Postgres then evaluates it ONCE per query (InitPlan) instead of once per row.
-- This is a semantics-preserving rewrite: (select auth.uid()) === auth.uid().
--
-- Uses ALTER POLICY so there is never a window with the policy dropped.
-- Source policies: supabase/migrations/20260424120000_baseline.sql
-- ============================================================================

-- ── profiles ───────────────────────────────────────────────────────────────
ALTER POLICY "Profiles - Read own" ON public.profiles
  USING (user_id = (select auth.uid()));

ALTER POLICY "Profiles - System admin reads all" ON public.profiles
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (select auth.uid()) AND role = 'system_admin'
  ));

ALTER POLICY "Profiles - Insert own in own workspace" ON public.profiles
  WITH CHECK (
    user_id = (select auth.uid())
    AND workspace_id IN (SELECT public.get_my_workspace_ids())
  );

ALTER POLICY "Profiles - Update own" ON public.profiles
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ── user_roles ──────────────────────────────────────────────────────────────
ALTER POLICY "User Roles - Read own role" ON public.user_roles
  USING (user_id = (select auth.uid()));

-- ── calendar_entries ────────────────────────────────────────────────────────
ALTER POLICY "Calendar Entries - Read authenticated" ON public.calendar_entries
  USING ((select auth.uid()) IS NOT NULL);

-- ── notifications ───────────────────────────────────────────────────────────
ALTER POLICY "Members read workspace notifications" ON public.notifications
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.user_id      = (select auth.uid())
        AND wm.workspace_id = notifications.workspace_id
        AND notifications.created_at >= wm.joined_at
    )
    OR EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.created_by = (select auth.uid())
        AND w.id         = notifications.workspace_id
    )
  );

-- ── notification_reads ──────────────────────────────────────────────────────
ALTER POLICY "Users read their own read records" ON public.notification_reads
  USING (user_id = (select auth.uid()));

ALTER POLICY "Users insert their own read records" ON public.notification_reads
  WITH CHECK (user_id = (select auth.uid()));

-- ── presidency_recommendations ──────────────────────────────────────────────
ALTER POLICY "Presidency Recommendations - Read workspace" ON public.presidency_recommendations
  USING (
    (select auth.uid()) IS NOT NULL
    AND workspace_id IN (SELECT public.get_my_workspace_ids())
  );

-- ── companies ───────────────────────────────────────────────────────────────
ALTER POLICY "Companies - Read workspace" ON public.companies
  USING (
    (select auth.uid()) IS NOT NULL
    AND workspace_id IN (SELECT public.get_my_workspace_ids())
  );

-- ============================================================================
-- P-2 (safe subset) — drop the exact-duplicate `devices` policies.
-- The baseline created two identical sets (WITH CHECK/USING = true). Keeping
-- the explicit "TO anon" set, dropping the unscoped (public) duplicates.
-- Anon coverage is unchanged; authenticated never inserts/updates devices.
-- ============================================================================
DROP POLICY IF EXISTS "Allow anonymous insert/upsert on devices" ON public.devices;
DROP POLICY IF EXISTS "Allow anonymous select on devices"        ON public.devices;
DROP POLICY IF EXISTS "Allow anonymous update on devices"        ON public.devices;

-- Remaining deferred P-2 consolidations (SELECT-vs-ALL overlaps on profiles,
-- events, calendars, ad_campaigns, content_versions, presidency_recommendations,
-- companies, workspaces) are intentionally NOT included — see README.
