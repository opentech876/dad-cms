-- pgTAP tests for Row Level Security policies
-- Run with: supabase test db

BEGIN;
SELECT plan(11);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.dad%'
);
DELETE FROM auth.users WHERE email LIKE '%@test.dad%';

-- First user → trigger assigns temp owner role + creates profile
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('40000000-0000-0000-0000-000000000001', 'owner@test.dad', now(), now(), now());

-- Subsequent users with roles in metadata → trigger assigns role + creates profile
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES ('40000000-0000-0000-0000-000000000002', 'chef@test.dad', now(), now(), now(), '{"role": "chef_equipe"}'::jsonb);

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES ('40000000-0000-0000-0000-000000000003', 'editeur@test.dad', now(), now(), now(), '{"role": "editeur"}'::jsonb);

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES ('40000000-0000-0000-0000-000000000004', 'comms@test.dad', now(), now(), now(), '{"role": "charge_communication"}'::jsonb);

-- Workspace fixture
INSERT INTO public.workspaces (id, name)
VALUES ('40000000-0000-0000-0000-000000000099', 'Test Workspace')
ON CONFLICT (id) DO NOTHING;

-- Helper: set current user for RLS
CREATE OR REPLACE FUNCTION set_test_user(user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('role', 'authenticated', true);
END;
$$ LANGUAGE plpgsql;

-- ─── workspaces: SELECT allowed for authenticated ─────────────────────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000003'); -- editeur

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = '40000000-0000-0000-0000-000000000099'
  ),
  'Authenticated user can SELECT workspaces'
);

-- ─── workspaces: INSERT blocked for non-owner ──────────────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.workspaces (name) VALUES ('Unauthorized')$$,
  42501,
  'new row violates row-level security policy for table "workspaces"',
  'Non-owner cannot INSERT into workspaces (RLS)'
);

-- ─── user_roles: SELECT own role ──────────────────────────────────────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000003'); -- editeur

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = '40000000-0000-0000-0000-000000000003'
  ),
  'User can SELECT their own role'
);

-- ─── user_roles: editeur cannot see other users' roles ────────────────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000003'); -- editeur

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = '40000000-0000-0000-0000-000000000004'
  ),
  'Non-owner cannot SELECT other users roles (RLS SELECT own)'
);

-- ─── profiles: user can SELECT their own profile ──────────────────────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000003'); -- editeur

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = '40000000-0000-0000-0000-000000000003'
  ),
  'User can SELECT their own profile'
);

-- ─── profiles: user cannot SELECT others profiles ─────────────────────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000003'); -- editeur

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = '40000000-0000-0000-0000-000000000004'
  ),
  'Non-owner cannot SELECT other profiles'
);

-- ─── profiles: owner can SELECT all profiles ──────────────────────────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000001'); -- owner

SELECT ok(
  (SELECT COUNT(*) FROM public.profiles WHERE user_id IN (
    '40000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000004'
  )) = 2,
  'Owner can SELECT all profiles'
);

-- ─── profiles: user can UPDATE their own profile ──────────────────────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000003'); -- editeur

SELECT lives_ok(
  $$UPDATE public.profiles SET full_name = 'Test Name' WHERE user_id = '40000000-0000-0000-0000-000000000003'$$,
  'User can UPDATE their own profile'
);

-- ─── profiles: RLS silently blocks UPDATE on another user's profile ───────────
-- PostgreSQL RLS UPDATE USING filters rows to 0 (no exception, 0 rows affected).
-- We verify the row was not modified.
UPDATE public.profiles SET full_name = 'Hack' WHERE user_id = '40000000-0000-0000-0000-000000000004';

-- Reset to superuser to inspect the row
RESET role;
RESET "request.jwt.claims";

SELECT is(
  (SELECT full_name FROM public.profiles WHERE user_id = '40000000-0000-0000-0000-000000000004'),
  NULL::text,
  'RLS blocks cross-user profile UPDATE (row unchanged)'
);

-- ─── content_versions: only trigger can INSERT (no direct INSERT) ──────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000001'); -- owner

SELECT throws_ok(
  $$INSERT INTO public.content_versions (year, version_hash) VALUES (2024, 'abc123')$$,
  42501,
  NULL,
  'Authenticated users cannot INSERT into content_versions directly (trigger-only)'
);

RESET role;
RESET "request.jwt.claims";

-- ─── user_roles: owner can see all roles ──────────────────────────────────────
SELECT set_test_user('40000000-0000-0000-0000-000000000001'); -- owner

SELECT ok(
  (SELECT COUNT(*) FROM public.user_roles WHERE user_id IN (
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000004'
  )) = 3,
  'Owner can SELECT all user_roles'
);

RESET role;
RESET "request.jwt.claims";

-- Cleanup helper
DROP FUNCTION IF EXISTS set_test_user(uuid);

SELECT * FROM finish();
ROLLBACK;
