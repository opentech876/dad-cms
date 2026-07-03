import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';
import { CalendarEntryWithEvent } from '../calendar/calendar-entry.service';
import { Event as HistoricalEvent } from '../../models';

export interface PresidencyRecommendation {
  id: string;
  calendar_id: string;
  mmdd: string;            // 'MM-DD'
  position: 1 | 2;
  event_id: string;
  workspace_id: string;
  status: 'pending' | 'applied';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  applied_by: string | null;
}

export interface PresidencyRecommendationWithEvent extends PresidencyRecommendation {
  event: HistoricalEvent | null;
}

/** A conflict: a pending recommendation whose slot already holds a different event in calendar_entries. */
export interface RecommendationConflict {
  mmdd: string;
  position: 1 | 2;
  current_event_title: string;
  recommended_event_title: string;
}

export interface ApplyResult {
  success: boolean;
  applied?: number;
  skipped?: number;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private supabase = inject(SupabaseService);
  private workspaceContext = inject(WorkspaceContextService);

  /** All pending+applied recommendations for a calendar, with the joined event. */
  listByCalendar(calendarId: string): Observable<PresidencyRecommendationWithEvent[]> {
    return from(
      this.supabase.client
        .from('presidency_recommendations')
        .select('*, event:events(*)')
        .eq('calendar_id', calendarId)
        .order('mmdd', { ascending: true })
        .order('position', { ascending: true }),
    ).pipe(
      map(({ data, error }: any) =>
        error || !data ? [] : (data as PresidencyRecommendationWithEvent[]),
      ),
    );
  }

  /** Count of pending recommendations for a calendar (used by the apply-button badge). */
  countPending(calendarId: string): Observable<number> {
    return from(
      this.supabase.client
        .from('presidency_recommendations')
        .select('id', { count: 'exact', head: true })
        .eq('calendar_id', calendarId)
        .eq('status', 'pending'),
    ).pipe(map(({ count, error }: any) => (error ? 0 : (count ?? 0))));
  }

  /** Upsert a recommendation for one (calendar, mmdd, position) slot. */
  upsertSlot(
    calendarId: string,
    mmdd: string,
    position: 1 | 2,
    eventId: string,
  ): Observable<{ success: boolean; error?: string }> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('presidency_recommendations')
          .upsert(
            {
              calendar_id: calendarId,
              mmdd,
              position,
              event_id: eventId,
              workspace_id: wsId,
              status: 'pending',
              created_by: user?.id ?? null,
            },
            { onConflict: 'calendar_id,mmdd,position' },
          ),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  /** Delete the recommendation for one slot. */
  removeSlot(
    calendarId: string,
    mmdd: string,
    position: 1 | 2,
  ): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client
        .from('presidency_recommendations')
        .delete()
        .eq('calendar_id', calendarId)
        .eq('mmdd', mmdd)
        .eq('position', position),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  /**
   * Returns the list of conflicts the editor must confirm before applying:
   * pending recommendations whose target slot is currently filled by a
   * *different* event. Same-event slots are no-op.
   */
  getConflicts(
    recommendations: PresidencyRecommendationWithEvent[],
    existingEntries: CalendarEntryWithEvent[],
  ): RecommendationConflict[] {
    const conflicts: RecommendationConflict[] = [];
    for (const rec of recommendations) {
      if (rec.status !== 'pending') continue;
      const existing = existingEntries.find(
        e => e.mmdd === rec.mmdd && e.position === rec.position,
      );
      if (existing && existing.event_id !== rec.event_id) {
        conflicts.push({
          mmdd: rec.mmdd,
          position: rec.position,
          current_event_title: existing.event?.title ?? '—',
          recommended_event_title: rec.event?.title ?? '—',
        });
      }
    }
    return conflicts;
  }

  /** Apply all pending recommendations for the given calendar via SECURITY DEFINER RPC. */
  applyAll(calendarId: string, overwrite = true): Observable<ApplyResult> {
    return from(
      this.supabase.client.rpc('apply_presidency_recommendations', {
        p_calendar_id: calendarId,
        p_overwrite: overwrite,
      }),
    ).pipe(
      map(({ data, error }: any) => {
        if (error) return { success: false, error: error.message };
        const payload = (data ?? {}) as { applied?: number; skipped?: number };
        return { success: true, applied: payload.applied ?? 0, skipped: payload.skipped ?? 0 };
      }),
    );
  }

  /** Apply exactly one pending recommendation (per-item « Appliquer » in the
   *  recommendations list). Same chef_equipe gate + overwrite semantics as
   *  applyAll, enforced server-side. */
  applySingle(recommendationId: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.rpc('apply_single_recommendation', {
        p_recommendation_id: recommendationId,
      }),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }
}
