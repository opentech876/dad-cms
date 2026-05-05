-- pgTAP tests: verify all new audit columns exist on their tables
-- Run with: supabase test db

BEGIN;
SELECT plan(14);

-- ─── workspaces ──────────────────────────────────────────────
SELECT has_column('public', 'workspaces', 'created_by',
  'workspaces.created_by column exists');

-- ─── calendars ───────────────────────────────────────────────
SELECT has_column('public', 'calendars', 'updated_by',
  'calendars.updated_by column exists');

SELECT has_column('public', 'calendars', 'deleted_by',
  'calendars.deleted_by column exists');

SELECT has_column('public', 'calendars', 'published_at',
  'calendars.published_at column exists');

-- ─── events ──────────────────────────────────────────────────
SELECT has_column('public', 'events', 'updated_by',
  'events.updated_by column exists');

SELECT has_column('public', 'events', 'deleted_by',
  'events.deleted_by column exists');

SELECT has_column('public', 'events', 'historical_year',
  'events.historical_year column exists');

-- ─── ad_campaigns ────────────────────────────────────────────
SELECT has_column('public', 'ad_campaigns', 'updated_by',
  'ad_campaigns.updated_by column exists');

SELECT has_column('public', 'ad_campaigns', 'deleted_by',
  'ad_campaigns.deleted_by column exists');

-- ─── finalize_workspace_creation: sets created_by on workspace ───────────────
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@audit.test%'
);
DELETE FROM auth.users WHERE email LIKE '%@audit.test%';

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('60000000-0000-0000-0000-000000000001', 'owner@audit.test', now(), now(), now());

SELECT public.finalize_workspace_creation(
  'Audit Test Workspace',
  '60000000-0000-0000-0000-000000000001',
  'Elvis Audit',
  '+242 06 000 0000'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE name = 'Audit Test Workspace'
      AND created_by = '60000000-0000-0000-0000-000000000001'
  ),
  'finalize_workspace_creation sets created_by on workspace row'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = '60000000-0000-0000-0000-000000000001'
      AND full_name = 'Elvis Audit'
  ),
  'finalize_workspace_creation updates profile full_name'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = '60000000-0000-0000-0000-000000000001'
      AND phone = '+242 06 000 0000'
  ),
  'finalize_workspace_creation updates profile phone'
);

-- NULL p_full_name should not overwrite existing name
UPDATE public.profiles SET full_name = 'Keep This Name'
WHERE user_id = '60000000-0000-0000-0000-000000000001';

-- re-enable temp role so we can call again
UPDATE public.user_roles
SET expires_at = now() + interval '1 hour'
WHERE user_id = '60000000-0000-0000-0000-000000000001';

DELETE FROM public.workspaces WHERE name = 'Audit Test Workspace';

SELECT public.finalize_workspace_creation(
  'Second Workspace',
  '60000000-0000-0000-0000-000000000001',
  NULL,
  NULL
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = '60000000-0000-0000-0000-000000000001'
      AND full_name = 'Keep This Name'
  ),
  'finalize_workspace_creation with NULL p_full_name preserves existing full_name'
);

SELECT * FROM finish();
ROLLBACK;
