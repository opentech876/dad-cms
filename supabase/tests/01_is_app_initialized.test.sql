-- pgTAP tests for public.is_app_initialized()
-- Run with: supabase test db

BEGIN;
SELECT plan(4);

-- Clean up any leftover test data
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.dad%'
);
DELETE FROM auth.users WHERE email LIKE '%@test.dad%';

-- ─── Test 1 : No users → false ───────────────────────────────────────────────
SELECT is(
  public.is_app_initialized(),
  false,
  'Returns false when no user_roles exist'
);

-- ─── Test 2 : Active temp owner (expires_at > now) → true ────────────────────
-- Inserting the first user triggers handle_new_user → creates temp owner role
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('10000000-0000-0000-0000-000000000001', 'owner@test.dad', now(), now(), now());

SELECT is(
  public.is_app_initialized(),
  true,
  'Returns true when an active temp owner exists'
);

-- ─── Test 3 : Expired temp owner → false ─────────────────────────────────────
UPDATE public.user_roles
SET expires_at = now() - interval '1 hour'
WHERE user_id = '10000000-0000-0000-0000-000000000001';

SELECT is(
  public.is_app_initialized(),
  false,
  'Returns false when the only owner role is expired'
);

-- ─── Test 4 : Permanent owner (expires_at IS NULL) → true ────────────────────
UPDATE public.user_roles
SET expires_at = NULL
WHERE user_id = '10000000-0000-0000-0000-000000000001';

SELECT is(
  public.is_app_initialized(),
  true,
  'Returns true when a permanent owner exists (expires_at IS NULL)'
);

SELECT * FROM finish();
ROLLBACK;
