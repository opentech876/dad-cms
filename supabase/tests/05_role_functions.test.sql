-- pgTAP tests for public.current_user_role() and public.has_role_at_least()
-- Run with: supabase test db

BEGIN;
SELECT plan(13);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.dad%'
);
DELETE FROM auth.users WHERE email LIKE '%@test.dad%';

-- First user inserted → trigger makes them temp owner (expires_at +24h)
-- We then immediately expire that role to simulate an expired owner.
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('50000000-0000-0000-0000-000000000005', 'expired@test.dad', now(), now(), now());

UPDATE public.user_roles
SET expires_at = now() - interval '1 hour'
WHERE user_id = '50000000-0000-0000-0000-000000000005';

-- Subsequent users with roles in metadata → trigger assigns roles + creates profiles
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES ('50000000-0000-0000-0000-000000000001', 'owner@test.dad', now(), now(), now(), '{"role": "owner"}'::jsonb);

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES ('50000000-0000-0000-0000-000000000002', 'chef@test.dad', now(), now(), now(), '{"role": "chef_equipe"}'::jsonb);

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES ('50000000-0000-0000-0000-000000000003', 'editeur@test.dad', now(), now(), now(), '{"role": "editeur"}'::jsonb);

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES ('50000000-0000-0000-0000-000000000004', 'comms@test.dad', now(), now(), now(), '{"role": "charge_communication"}'::jsonb);

-- Helper to set current user
CREATE OR REPLACE FUNCTION set_test_user(user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$ LANGUAGE plpgsql;

-- ─── current_user_role() ──────────────────────────────────────────────────────
SELECT set_test_user('50000000-0000-0000-0000-000000000001');
SELECT is(public.current_user_role(), 'owner'::app_role, 'current_user_role() returns owner');

SELECT set_test_user('50000000-0000-0000-0000-000000000002');
SELECT is(public.current_user_role(), 'chef_equipe'::app_role, 'current_user_role() returns chef_equipe');

SELECT set_test_user('50000000-0000-0000-0000-000000000003');
SELECT is(public.current_user_role(), 'editeur'::app_role, 'current_user_role() returns editeur');

SELECT set_test_user('50000000-0000-0000-0000-000000000004');
SELECT is(public.current_user_role(), 'charge_communication'::app_role, 'current_user_role() returns charge_communication');

SELECT set_test_user('50000000-0000-0000-0000-000000000005');
SELECT is(public.current_user_role(), NULL::app_role, 'current_user_role() returns NULL for expired role');

-- ─── has_role_at_least() — owner ─────────────────────────────────────────────
SELECT set_test_user('50000000-0000-0000-0000-000000000001');
SELECT ok(public.has_role_at_least('owner'::app_role), 'owner passes owner check');
SELECT ok(public.has_role_at_least('editeur'::app_role), 'owner passes editeur check');
SELECT ok(public.has_role_at_least('charge_communication'::app_role), 'owner passes charge_communication check');

-- ─── has_role_at_least() — chef_equipe ───────────────────────────────────────
SELECT set_test_user('50000000-0000-0000-0000-000000000002');
SELECT ok(public.has_role_at_least('editeur'::app_role), 'chef_equipe passes editeur check');
SELECT ok(public.has_role_at_least('charge_communication'::app_role), 'chef_equipe passes charge_communication check');
SELECT ok(NOT public.has_role_at_least('owner'::app_role), 'chef_equipe fails owner check');

-- ─── has_role_at_least() — expired role ──────────────────────────────────────
SELECT set_test_user('50000000-0000-0000-0000-000000000005');
SELECT ok(NOT public.has_role_at_least('charge_communication'::app_role), 'Expired role fails all has_role_at_least checks');

-- ─── has_role_at_least() — editeur hierarchy ─────────────────────────────────
SELECT set_test_user('50000000-0000-0000-0000-000000000003');
SELECT ok(NOT public.has_role_at_least('charge_communication'::app_role), 'editeur fails charge_communication check');

-- Cleanup
DROP FUNCTION IF EXISTS set_test_user(uuid);

SELECT * FROM finish();
ROLLBACK;
