-- Fix calendar_entries RLS policies.
-- The old policies used get_my_workspace_ids() (workspace_members table) which only had
-- one row (the owner), causing a 42501 error for all other authenticated users on INSERT.
-- /calendrier is accessible to all four roles, so any authenticated user may read and
-- write calendar entries.

DROP POLICY IF EXISTS calendar_entries_read  ON public.calendar_entries;
DROP POLICY IF EXISTS calendar_entries_write ON public.calendar_entries;

-- Read: any authenticated user
CREATE POLICY "Calendar Entries - Read authenticated"
  ON public.calendar_entries
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Write: editeur and above (chef_equipe, owner) only
CREATE POLICY "Calendar Entries - Write editorial roles"
  ON public.calendar_entries
  FOR ALL
  USING      (has_role_at_least('editeur'::app_role))
  WITH CHECK (has_role_at_least('editeur'::app_role));
