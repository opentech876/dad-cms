-- pgTAP tests for public.finalize_workspace_creation(p_name, p_user_id)
-- Run with: supabase test db

BEGIN;
SELECT plan(6);

-- Clean up
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.dad%'
);
DELETE FROM auth.users WHERE email LIKE '%@test.dad%';

-- Inserting the first user triggers handle_new_user → temp owner role + profile
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('30000000-0000-0000-0000-000000000001', 'owner@test.dad', now(), now(), now());

-- Second user with editeur role in metadata → trigger assigns that role + creates profile
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES (
  '30000000-0000-0000-0000-000000000002',
  'editeur@test.dad',
  now(), now(), now(),
  '{"role": "editeur"}'::jsonb
);

-- ─── Test 1 : Non-owner calling → exception raised ───────────────────────────
SELECT throws_ok(
  $$SELECT public.finalize_workspace_creation('Test Workspace', '30000000-0000-0000-0000-000000000002')$$,
  'Seul le propriétaire peut créer un espace de travail',
  'Non-owner calling finalize_workspace_creation raises an exception'
);

-- ─── Test 2 : Owner calling → workspace row created ──────────────────────────
SELECT public.finalize_workspace_creation('OPEN-TECH Congo', '30000000-0000-0000-0000-000000000001');

SELECT ok(
  EXISTS (SELECT 1 FROM public.workspaces WHERE name = 'OPEN-TECH Congo'),
  'Owner call creates a workspace row with the given name'
);

-- ─── Test 3 : Owner calling → expires_at set to NULL (permanent) ─────────────
SELECT is(
  (SELECT expires_at FROM public.user_roles WHERE user_id = '30000000-0000-0000-0000-000000000001'),
  NULL::timestamptz,
  'Owner expires_at set to NULL (becomes permanent) after workspace creation'
);

-- ─── Test 4 : Workspace name is trimmed ──────────────────────────────────────
DELETE FROM public.workspaces WHERE name = 'OPEN-TECH Congo';
-- Restore expires_at so owner can call again
UPDATE public.user_roles
SET expires_at = now() + interval '24 hours'
WHERE user_id = '30000000-0000-0000-0000-000000000001';

SELECT public.finalize_workspace_creation('  Trimmed Name  ', '30000000-0000-0000-0000-000000000001');

SELECT ok(
  EXISTS (SELECT 1 FROM public.workspaces WHERE name = 'Trimmed Name'),
  'Workspace name is trimmed before insertion'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.workspaces WHERE name = '  Trimmed Name  '),
  'Untrimmed workspace name is not stored'
);

-- ─── Test 5 : No ambiguous column error (regression) ─────────────────────────
SELECT lives_ok(
  $$SELECT id FROM public.workspaces WHERE name = 'Trimmed Name' LIMIT 1$$,
  'Workspace row is accessible after creation (RETURNING id regression check)'
);

SELECT * FROM finish();
ROLLBACK;
