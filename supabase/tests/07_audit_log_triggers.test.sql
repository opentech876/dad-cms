-- pgTAP tests: verify audit_log table structure and trigger behaviour
-- Run with: supabase test db

BEGIN;
SELECT plan(10);

-- ─── Table and columns exist ──────────────────────────────────
SELECT has_table('public', 'audit_log', 'audit_log table exists');

SELECT has_column('public', 'audit_log', 'table_name', 'audit_log.table_name exists');
SELECT has_column('public', 'audit_log', 'record_id',  'audit_log.record_id exists');
SELECT has_column('public', 'audit_log', 'action',     'audit_log.action exists');
SELECT has_column('public', 'audit_log', 'actor_id',   'audit_log.actor_id exists');
SELECT has_column('public', 'audit_log', 'old_data',   'audit_log.old_data exists');
SELECT has_column('public', 'audit_log', 'new_data',   'audit_log.new_data exists');

-- ─── Trigger fires on calendars INSERT ────────────────────────
DELETE FROM public.user_roles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@trigtest.dad%'
);
DELETE FROM auth.users WHERE email LIKE '%@trigtest.dad%';

INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES ('70000000-0000-0000-0000-000000000001', 'owner@trigtest.dad', now(), now(), now());

-- The trigger assigns temporary owner role via handle_new_user
-- Finalize to get a real workspace so we can insert a calendar
SELECT public.finalize_workspace_creation(
  'Trigger Test WS', '70000000-0000-0000-0000-000000000001'
);

-- Insert a calendar — trigger should write to audit_log
INSERT INTO public.calendars (id, year, name, status, created_by)
VALUES (
  '70000000-cafe-0000-0000-000000000001',
  2099,
  'Trigger Test Calendar',
  'draft',
  '70000000-0000-0000-0000-000000000001'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE table_name = 'calendars'
      AND record_id  = '70000000-cafe-0000-0000-000000000001'
      AND action     = 'INSERT'
  ),
  'audit_log receives INSERT row when a calendar is created'
);

-- Update the calendar — trigger should write UPDATE
UPDATE public.calendars
SET name = 'Trigger Test Calendar Updated'
WHERE id = '70000000-cafe-0000-0000-000000000001';

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE table_name = 'calendars'
      AND record_id  = '70000000-cafe-0000-0000-000000000001'
      AND action     = 'UPDATE'
      AND old_data->>'name' = 'Trigger Test Calendar'
      AND new_data->>'name' = 'Trigger Test Calendar Updated'
  ),
  'audit_log receives UPDATE row with old/new data when a calendar is updated'
);

-- Soft-delete (UPDATE deleted_at) also fires UPDATE trigger
UPDATE public.calendars
SET deleted_at = now()
WHERE id = '70000000-cafe-0000-0000-000000000001';

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE table_name = 'calendars'
      AND record_id  = '70000000-cafe-0000-0000-000000000001'
      AND action     = 'UPDATE'
      AND new_data->>'deleted_at' IS NOT NULL
  ),
  'audit_log records the soft-delete UPDATE on calendars'
);

SELECT * FROM finish();
ROLLBACK;
