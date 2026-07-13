-- ============================================================================
-- Security hardening — S-4 (ready) + S-2 / S-3 (review before applying)
-- ============================================================================

-- ── S-4  function_search_path_mutable (READY) ───────────────────────────────
-- Pin search_path on the 4 flagged SECURITY INVOKER functions. The DO block
-- resolves each function's real signature, so no arg lists to hand-maintain.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'bump_row_updated_at',
        'calendar_mmdd_to_date',
        'get_content_version',
        'update_updated_at_column'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;


-- ── S-2  anon-executable SECURITY DEFINER functions (⚠ REVIEW) ───────────────
-- The baseline granted EXECUTE on ALL public functions to anon, so every RPC
-- (admin_*, apply_*, confirm_campaign, finalize_workspace_creation, …) is
-- callable by unauthenticated clients. Most self-gate on role, but least-
-- privilege says: revoke anon, then re-grant ONLY the mobile-facing RPCs.
--
-- ⚠ CONFIRM THIS ALLOWLIST AGAINST THE MOBILE APP BEFORE APPLYING. A missing
--   name here = broken mobile call. Derived from CLAUDE.md's mobile RPC list.
DO $$
DECLARE
  r record;
  mobile_allowlist text[] := ARRAY[
    'get_active_ads',
    'get_today_content',
    'sync_calendar',
    'sync_calendar_delta',
    'peek_sync_calendar',
    'get_calendar_days',
    'record_ad_campaign_view',
    'record_ad_campaign_click',
    'upsert_push_device',
    'append_device_log',
    'is_app_initialized'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname <> ALL (mobile_allowlist)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Sanity check after applying — should return ONLY the allowlist above:
--   SELECT p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   LEFT JOIN aclexplode(p.proacl) a ON a.grantee = 'anon'::regrole
--   WHERE n.nspname='public' AND a.privilege_type = 'EXECUTE';


-- ── S-3  rls_policy_always_true (NOTES — no change applied) ──────────────────
-- devices / devices_logs: anon USING/WITH CHECK (true). Inherent to mobile
--   self-registration (anon has no identity to scope by). Accepted risk; if
--   abuse appears, move device writes behind an Edge Function + device secret.
--
-- notifications "System inserts notifications" (authenticated, WITH CHECK true):
--   lets any authenticated user insert a notification into ANY workspace.
--   Notifications are created by SECURITY DEFINER triggers/pg_cron (which
--   bypass RLS). Verified 2026-07-13: the CMS only SELECTs notifications
--   (notification.service.ts) — no client INSERT path — so this broad grant is
--   unnecessary and can be tightened safely:
--
--     ALTER POLICY "System inserts notifications" ON public.notifications
--       WITH CHECK (workspace_id IN (SELECT public.get_my_workspace_ids()));
