-- pgTAP tests for the handle_new_user trigger
-- Run with: supabase test db

BEGIN;
SELECT plan(7);

-- Clean up
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.dad%'
);
DELETE FROM auth.users WHERE email LIKE '%@test.dad%';

-- ─── Test 1 : First user → profile created ───────────────────────────────────
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('20000000-0000-0000-0000-000000000001', 'owner@test.dad', now(), now(), now());

SELECT ok(
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '20000000-0000-0000-0000-000000000001'),
  'Profile created for first user by trigger'
);

-- ─── Test 2 : First user → owner role assigned ───────────────────────────────
SELECT is(
  (SELECT role FROM public.user_roles WHERE user_id = '20000000-0000-0000-0000-000000000001'),
  'owner'::app_role,
  'First user gets owner role'
);

-- ─── Test 3 : First user → temp owner (expires_at set, ~24h) ─────────────────
SELECT ok(
  (SELECT expires_at FROM public.user_roles WHERE user_id = '20000000-0000-0000-0000-000000000001') > now(),
  'Owner role has a future expires_at (temporary)'
);

-- ─── Test 4 : Second user with role in metadata → correct role, no owner ──────
INSERT INTO auth.users (
  id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data
) VALUES (
  '20000000-0000-0000-0000-000000000002',
  'editeur@test.dad',
  now(), now(), now(),
  '{"role": "editeur"}'::jsonb
);

SELECT is(
  (SELECT role FROM public.user_roles WHERE user_id = '20000000-0000-0000-0000-000000000002'),
  'editeur'::app_role,
  'Second user with role metadata gets correct role assigned'
);

SELECT isnt(
  (SELECT role FROM public.user_roles WHERE user_id = '20000000-0000-0000-0000-000000000002'),
  'owner'::app_role,
  'Second user is NOT assigned owner role'
);

-- ─── Test 5 : Second user without metadata → profile created, no role ─────────
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('20000000-0000-0000-0000-000000000003', 'norole@test.dad', now(), now(), now());

SELECT ok(
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  'Profile created for user without role metadata'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  'No role assigned to user without role metadata'
);

SELECT * FROM finish();
ROLLBACK;
