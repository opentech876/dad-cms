-- ============================================================
-- Migration: RPC functions for Métriques page
-- ============================================================

-- ─── CMS activity last 30 days (from audit_log) ───────────
CREATE OR REPLACE FUNCTION public.get_cms_activity_last30days()
RETURNS TABLE(date text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char(changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
    COUNT(*)                                              AS count
  FROM public.audit_log
  WHERE changed_at >= now() - INTERVAL '30 days'
  GROUP BY 1
  ORDER BY 1;
$$;

-- ─── Calendar coverage by month for a given year ──────────
CREATE OR REPLACE FUNCTION public.get_calendar_coverage_by_month(p_year integer)
RETURNS TABLE(month integer, filled_days bigint, total_days bigint, percent numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH months AS (
    SELECT generate_series(1, 12) AS m
  ),
  days_per_month AS (
    SELECT
      m,
      DATE_PART('day',
        (DATE_TRUNC('month', make_date(p_year, m::int, 1)) + INTERVAL '1 month - 1 day')
      )::bigint AS total
    FROM months
  ),
  filled AS (
    SELECT
      EXTRACT(MONTH FROM TO_DATE(mmdd, 'MM-DD'))::integer AS m,
      COUNT(DISTINCT mmdd)                                AS cnt
    FROM public.calendar_entries ce
    JOIN public.calendars c ON c.id = ce.calendar_id
    WHERE c.year = p_year
      AND c.deleted_at IS NULL
    GROUP BY 1
  )
  SELECT
    dpm.m                                      AS month,
    COALESCE(f.cnt, 0)                         AS filled_days,
    dpm.total                                  AS total_days,
    ROUND(COALESCE(f.cnt, 0)::numeric / dpm.total * 100, 0) AS percent
  FROM days_per_month dpm
  LEFT JOIN filled f ON f.m = dpm.m
  ORDER BY dpm.m;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_cms_activity_last30days() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_coverage_by_month(integer) TO authenticated;
