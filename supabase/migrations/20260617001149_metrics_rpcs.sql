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

-- ─── Operational snapshot for /dashboard ──────────────────
-- One atomic jsonb per page-load: recent audit activity with actor
-- identity, empty calendar days, events without illustration,
-- campaigns awaiting validation that start within 10 days, pending
-- Curateur recommendations, and a 30-day ad-inventory outlook
-- (header/footer sold flags). Workspace-scoped via membership check.
CREATE FUNCTION public.dashboard_operational_stats(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_year      int := extract(year FROM now())::int;
  v_cal_id    uuid;
  v_activity  jsonb;
  v_empty     jsonb;
  v_no_image  int;
  v_val_soon  jsonb;
  v_pending   int;
  v_inventory jsonb;
BEGIN
  IF p_workspace_id IS NULL
     OR p_workspace_id NOT IN (SELECT public.get_my_workspace_ids()) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_activity FROM (
    SELECT
      coalesce(p.full_name, u.email::text, 'Système') AS actor_name,
      al.action,
      al.table_name,
      coalesce(al.new_data->>'title', al.new_data->>'name',
               al.old_data->>'title', al.old_data->>'name') AS record_label,
      al.changed_at
    FROM public.audit_log al
    LEFT JOIN auth.users u ON u.id = al.actor_id
    LEFT JOIN LATERAL (
      SELECT pf.full_name FROM public.profiles pf
      WHERE pf.user_id = al.actor_id AND pf.workspace_id = p_workspace_id
      LIMIT 1
    ) p ON true
    WHERE al.workspace_id = p_workspace_id
    ORDER BY al.changed_at DESC
    LIMIT 8
  ) x;

  SELECT c.id INTO v_cal_id
  FROM public.calendars c
  WHERE c.workspace_id = p_workspace_id AND c.year = v_year AND c.deleted_at IS NULL;

  IF v_cal_id IS NULL THEN
    v_empty := NULL;
  ELSE
    WITH days AS (
      SELECT to_char(d, 'MM-DD') AS mmdd
      FROM generate_series(make_date(v_year,1,1), make_date(v_year,12,31), interval '1 day') d
    ),
    empty AS (
      SELECT days.mmdd FROM days
      LEFT JOIN public.calendar_entries ce
        ON ce.calendar_id = v_cal_id AND ce.mmdd = days.mmdd
      GROUP BY days.mmdd
      HAVING count(ce.id) = 0
      ORDER BY days.mmdd
    )
    SELECT jsonb_build_object(
      'count', (SELECT count(*) FROM empty),
      'next',  coalesce((SELECT jsonb_agg(mmdd) FROM (SELECT mmdd FROM empty
                          WHERE mmdd >= to_char(now(), 'MM-DD') LIMIT 6) n), '[]'::jsonb)
    ) INTO v_empty;
  END IF;

  SELECT count(*)::int INTO v_no_image
  FROM public.events e
  WHERE e.workspace_id = p_workspace_id AND e.deleted_at IS NULL
    AND (e.image_path IS NULL OR e.image_path = '');

  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_val_soon FROM (
    SELECT ac.name, ac.start_date
    FROM public.ad_campaigns ac
    WHERE ac.workspace_id = p_workspace_id AND ac.deleted_at IS NULL
      AND ac.validated_at IS NULL
      AND ac.start_date BETWEEN current_date AND current_date + 10
    ORDER BY ac.start_date
  ) x;

  SELECT count(*)::int INTO v_pending
  FROM public.presidency_recommendations pr
  WHERE pr.workspace_id = p_workspace_id AND pr.status = 'pending';

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'d'), '[]'::jsonb) INTO v_inventory FROM (
    SELECT jsonb_build_object(
      'd', to_char(d, 'YYYY-MM-DD'),
      'h', EXISTS (SELECT 1 FROM public.ad_campaigns ac
                   WHERE ac.workspace_id = p_workspace_id AND ac.deleted_at IS NULL
                     AND ac.validated_at IS NOT NULL AND ac.active = true
                     AND ac.position = 'header' AND d::date BETWEEN ac.start_date AND ac.end_date),
      'f', EXISTS (SELECT 1 FROM public.ad_campaigns ac
                   WHERE ac.workspace_id = p_workspace_id AND ac.deleted_at IS NULL
                     AND ac.validated_at IS NOT NULL AND ac.active = true
                     AND ac.position = 'footer' AND d::date BETWEEN ac.start_date AND ac.end_date)
    ) AS x
    FROM generate_series(current_date, current_date + 29, interval '1 day') d
  ) sub;

  RETURN jsonb_build_object(
    'activity',                v_activity,
    'empty_days',              v_empty,
    'events_no_image',         v_no_image,
    'validations_soon',        v_val_soon,
    'pending_recommendations', v_pending,
    'inventory',               v_inventory
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.dashboard_operational_stats(uuid) TO authenticated;

-- ─── Analytical extras for /metriques ─────────────────────
-- fill_rate: days per month covered by a validated+active campaign per
-- position (ad-inventory sold KPI). apply_latency: Curateur → editorial
-- application speed.
CREATE FUNCTION public.metrics_extra_stats(p_workspace_id uuid, p_year int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_fill    jsonb;
  v_latency jsonb;
BEGIN
  IF p_workspace_id IS NULL
     OR p_workspace_id NOT IN (SELECT public.get_my_workspace_ids()) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'month')::int), '[]'::jsonb) INTO v_fill FROM (
    SELECT jsonb_build_object(
      'month', m,
      'days',  (SELECT count(*) FROM generate_series(
                  make_date(p_year, m, 1),
                  (make_date(p_year, m, 1) + interval '1 month' - interval '1 day')::date,
                  interval '1 day'))::int,
      'header_days', (SELECT count(DISTINCT d)::int
                      FROM generate_series(
                        make_date(p_year, m, 1),
                        (make_date(p_year, m, 1) + interval '1 month' - interval '1 day')::date,
                        interval '1 day') d
                      JOIN public.ad_campaigns ac
                        ON ac.workspace_id = p_workspace_id AND ac.deleted_at IS NULL
                       AND ac.validated_at IS NOT NULL AND ac.active = true
                       AND ac.position = 'header'
                       AND d::date BETWEEN ac.start_date AND ac.end_date),
      'footer_days', (SELECT count(DISTINCT d)::int
                      FROM generate_series(
                        make_date(p_year, m, 1),
                        (make_date(p_year, m, 1) + interval '1 month' - interval '1 day')::date,
                        interval '1 day') d
                      JOIN public.ad_campaigns ac
                        ON ac.workspace_id = p_workspace_id AND ac.deleted_at IS NULL
                       AND ac.validated_at IS NOT NULL AND ac.active = true
                       AND ac.position = 'footer'
                       AND d::date BETWEEN ac.start_date AND ac.end_date)
    ) AS x
    FROM generate_series(1, 12) m
  ) sub;

  SELECT jsonb_build_object(
    'applied_count', count(*)::int,
    'avg_hours',     round(coalesce(avg(extract(epoch FROM (pr.applied_at - pr.created_at)) / 3600.0), 0)::numeric, 1),
    'median_hours',  round(coalesce(percentile_cont(0.5) WITHIN GROUP (
                       ORDER BY extract(epoch FROM (pr.applied_at - pr.created_at)) / 3600.0), 0)::numeric, 1)
  ) INTO v_latency
  FROM public.presidency_recommendations pr
  WHERE pr.workspace_id = p_workspace_id
    AND pr.status = 'applied' AND pr.applied_at IS NOT NULL;

  RETURN jsonb_build_object(
    'fill_rate',     v_fill,
    'apply_latency', v_latency
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.metrics_extra_stats(uuid, int) TO authenticated;
