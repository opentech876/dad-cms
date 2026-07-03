import { inject, Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

/** One row of the dashboard's real activity feed (from audit_log). */
export interface ActivityEntry {
  actor_name:   string;
  action:       'INSERT' | 'UPDATE' | 'DELETE';
  table_name:   string;
  record_label: string | null;
  changed_at:   string;
}

/** Empty-day summary for the current-year calendar. Null when the
 *  workspace has no active calendar for the year. */
export interface EmptyDaysSummary {
  count: number;
  /** Next up-to-6 empty dates from today onward, as 'MM-DD'. */
  next:  string[];
}

export interface ValidationSoon {
  name:       string;
  start_date: string;
}

/** One day of the 30-day ad-inventory outlook. */
export interface InventoryDay {
  d: string;       // 'YYYY-MM-DD'
  h: boolean;      // header position sold (validated + active campaign covers it)
  f: boolean;      // footer position sold
}

export interface DashboardOperationalStats {
  activity:                ActivityEntry[];
  empty_days:              EmptyDaysSummary | null;
  events_no_image:         number;
  validations_soon:        ValidationSoon[];
  pending_recommendations: number;
  inventory:               InventoryDay[];
}

export interface MonthFillRate {
  month:       number;   // 1..12
  days:        number;
  header_days: number;
  footer_days: number;
}

export interface ApplyLatency {
  applied_count: number;
  avg_hours:     number;
  median_hours:  number;
}

export interface MetricsExtraStats {
  fill_rate:     MonthFillRate[];
  apply_latency: ApplyLatency;
}

/**
 * Wrapper over the two analytics RPCs powering the dashboard rework and
 * the metrics additions. Each RPC returns one jsonb blob — a single
 * atomic snapshot per page-load (multi-read consistency lives server-side
 * per the ACID rules in CLAUDE.md).
 */
@Injectable({ providedIn: 'root' })
export class InsightsService {
  private supabase         = inject(SupabaseService);
  private workspaceContext = inject(WorkspaceContextService);

  getDashboardStats(): Observable<DashboardOperationalStats | null> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    if (!wsId) return from(Promise.resolve(null));
    return from(
      this.supabase.client.rpc('dashboard_operational_stats', { p_workspace_id: wsId }),
    ).pipe(
      map(({ data, error }: any) => {
        if (error || !data) return null;
        return data as DashboardOperationalStats;
      }),
    );
  }

  getMetricsExtras(year: number): Observable<MetricsExtraStats | null> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    if (!wsId) return from(Promise.resolve(null));
    return from(
      this.supabase.client.rpc('metrics_extra_stats', { p_workspace_id: wsId, p_year: year }),
    ).pipe(
      map(({ data, error }: any) => {
        if (error || !data) return null;
        return data as MetricsExtraStats;
      }),
    );
  }
}
