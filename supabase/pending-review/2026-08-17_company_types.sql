-- ============================================================================
-- Companies: managed advertiser "types" + drop free-text business_domain
-- ----------------------------------------------------------------------------
-- Plan C from app-feedback: replace the hardcoded `companies.type` CHECK list
-- with a workspace-scoped `company_types` lookup the commercial lead can CRUD,
-- and remove the redundant free-text `business_domain`.
--
-- MOBILE SAFETY: the mobile app never reads companies.type or business_domain
-- (verified against Mondésir's RPC inventory — the ad RPCs only read co.name).
-- So dropping business_domain and loosening the type CHECK is CMS-only.
--
-- Idempotent — safe to re-run. Review, then run in Studio → SQL Editor, then
-- move this file into supabase/migrations/ with a timestamp prefix.
-- ============================================================================

-- ── 1. Lookup table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  label        text NOT NULL,
  sort_order   int  NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES auth.users(id),
  deleted_at   timestamptz,
  deleted_by   uuid REFERENCES auth.users(id)
);

-- One live label per workspace (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_types_ws_label
  ON public.company_types (workspace_id, lower(label)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_company_types_workspace_live
  ON public.company_types (workspace_id) WHERE deleted_at IS NULL;

-- ── 2. Triggers (match companies) ───────────────────────────────────────────
DROP TRIGGER IF EXISTS company_types_audit               ON public.company_types;
DROP TRIGGER IF EXISTS company_types_track_modifications ON public.company_types;
DROP TRIGGER IF EXISTS trg_company_types_timestamps      ON public.company_types;
CREATE TRIGGER company_types_audit               AFTER INSERT OR UPDATE OR DELETE ON public.company_types FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TRIGGER company_types_track_modifications BEFORE UPDATE ON public.company_types FOR EACH ROW EXECUTE FUNCTION public.track_modifications();
CREATE TRIGGER trg_company_types_timestamps      BEFORE UPDATE ON public.company_types FOR EACH ROW EXECUTE FUNCTION public.update_timestamps();

-- ── 3. RLS (same shape as companies) ────────────────────────────────────────
ALTER TABLE public.company_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Company types - Read workspace"        ON public.company_types;
DROP POLICY IF EXISTS "Company types - Write commercial lead" ON public.company_types;
CREATE POLICY "Company types - Read workspace" ON public.company_types
  FOR SELECT USING (auth.uid() IS NOT NULL AND workspace_id IN (SELECT public.get_my_workspace_ids()));
CREATE POLICY "Company types - Write commercial lead" ON public.company_types
  USING (public.has_role_at_least('chef_equipe_commerciale'::public.app_role))
  WITH CHECK (public.has_role_at_least('chef_equipe_commerciale'::public.app_role));

-- ── 4. Seed the current 10 categories for every existing workspace ──────────
INSERT INTO public.company_types (workspace_id, label, sort_order)
SELECT w.id, t.label, t.ord
FROM public.workspaces w
CROSS JOIN (VALUES
  ('Télécommunications', 1), ('Banque & Finance', 2), ('Énergie', 3),
  ('Distribution', 4), ('Services', 5), ('Gouvernement', 6),
  ('ONG', 7), ('Médias', 8), ('Santé', 9), ('Autre', 10)
) AS t(label, ord)
ON CONFLICT DO NOTHING;

-- ── 5. companies.type: drop the hardcoded CHECK, migrate slugs → labels ─────
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_type_check;
UPDATE public.companies SET type = CASE type
  WHEN 'telecom'      THEN 'Télécommunications'
  WHEN 'banque'       THEN 'Banque & Finance'
  WHEN 'energie'      THEN 'Énergie'
  WHEN 'distribution' THEN 'Distribution'
  WHEN 'services'     THEN 'Services'
  WHEN 'gouvernement' THEN 'Gouvernement'
  WHEN 'ong'          THEN 'ONG'
  WHEN 'medias'       THEN 'Médias'
  WHEN 'sante'        THEN 'Santé'
  ELSE 'Autre'
END
WHERE type IN ('telecom','banque','energie','distribution','services',
               'gouvernement','ong','medias','sante','autre');

-- ── 6. Drop the redundant free-text domain (mobile never reads it) ──────────
ALTER TABLE public.companies DROP COLUMN IF EXISTS business_domain;
