-- pgTAP tests for the handle_new_user trigger
-- Run with: supabase test db
--
-- There is no first-user-wins (FUW) behaviour: the first system_admin is seeded
-- out-of-band via bootstrap.sql. The trigger only honours a role explicitly
-- passed through invitation metadata (raw_user_meta_data.role). Any signup
-- without that metadata receives no role at all.

BEGIN;
SELECT plan(4);

-- Clean up
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.dad%'
);
DELETE FROM auth.users WHERE email LIKE '%@test.dad%';

-- ─── Test 1 : Anonymous signup (no role metadata) → no role assigned ──────────
-- Replaces the old "first user gets owner" assertions. Even on a pristine
-- user_roles table, a metadata-less signup must NOT be granted any role.
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('20000000-0000-0000-0000-000000000001', 'anon@test.dad', now(), now(), now());

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '20000000-0000-0000-0000-000000000001'),
  'Anonymous signup (no metadata) gets NO role, even as the first user'
);

-- ─── Test 2 : Invited user with role metadata → correct role assigned ─────────
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
  'Invited user with role metadata gets that role assigned'
);

-- ─── Test 3 : Another metadata-less signup → still no role ────────────────────
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('20000000-0000-0000-0000-000000000003', 'norole@test.dad', now(), now(), now());

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '20000000-0000-0000-0000-000000000003'),
  'Signup without role metadata gets no role'
);

-- ─── Test 4 : Invalid role metadata → handled gracefully, no role ─────────────
INSERT INTO auth.users (
  id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data
) VALUES (
  '20000000-0000-0000-0000-000000000004',
  'bogus@test.dad',
  now(), now(), now(),
  '{"role": "not_a_real_role"}'::jsonb
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = '20000000-0000-0000-0000-000000000004'),
  'Invalid role metadata is ignored — no role assigned, no error raised'
);

SELECT * FROM finish();
ROLLBACK;
