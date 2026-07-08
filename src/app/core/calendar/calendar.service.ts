import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { CalendarStatus } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

export interface CalendarSummary {
  id: string;
  year: number;
  name: string;
  status: CalendarStatus;
  createdBy: string | null;
  publishedAt: string | null;
  eventCount: number;
}

/** A row from list_deleted_calendars() — used by the Corbeille view. */
export interface DeletedCalendarSummary {
  id:            string;
  workspaceId:   string;
  year:          number;
  name:          string;
  status:        CalendarStatus;
  deletedAt:     string;
  deletedBy:     string | null;
  deleterEmail:  string | null;
  deleterName:   string | null;
  entriesCount:  number;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  constructor(
    private supabaseService: SupabaseService,
    private workspaceContext: WorkspaceContextService,
  ) {}

  listCalendars(): Observable<CalendarSummary[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    let query = this.supabaseService.client
      .from('calendars')
      .select('id, year, name, status, created_by, published_at, calendar_entries(count)')
      .is('deleted_at', null)
      .order('year', { ascending: true });
    if (wsId) query = (query as any).eq('workspace_id', wsId);
    return from(query).pipe(
      map(({ data, error }: any) => {
        if (error || !data) return [];
        return (data as any[]).map((cal) => ({
          id: cal.id,
          year: cal.year,
          name: cal.name,
          status: cal.status as CalendarStatus,
          createdBy: cal.created_by ?? null,
          publishedAt: cal.published_at ?? null,
          eventCount: cal.calendar_entries?.[0]?.count ?? 0,
        }));
      }),
    );
  }

  createCalendar(
    year: number,
    name: string,
    status: CalendarStatus = 'draft',
  ): Observable<{ success: boolean; id?: string; error?: string }> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      this.supabaseService.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabaseService.client
          .from('calendars')
          .insert({ year, name, status, created_by: user?.id ?? null, workspace_id: wsId })
          .select('id')
          .single(),
      ) as Promise<{ data: { id: string } | null; error: any }>,
    ).pipe(
      map(({ data, error }) =>
        error
          ? { success: false, error: error.message }
          : { success: true, id: data?.id },
      ),
    );
  }

  updateCalendar(
    id: string,
    patch: Partial<{ status: CalendarStatus; name: string }>,
  ): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabaseService.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabaseService.client
          .from('calendars')
          .update({ ...patch, updated_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  /**
   * Soft-delete a calendar. Routes through soft_delete_calendar() so the
   * chef_equipe+ role check is enforced server-side — the RLS on calendars
   * still allows editors to update, but the RPC blocks them explicitly.
   */
  deleteCalendar(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabaseService.client.rpc('soft_delete_calendar', { p_calendar_id: id }),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  /** Reverse a soft-delete. Same authorization as deleteCalendar. */
  restoreCalendar(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabaseService.client.rpc('restore_calendar', { p_calendar_id: id }),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  /** Hard-delete a single soft-deleted calendar. Also removes its
   *  calendar_entries + presidency_recommendations. Only rows already in
   *  the trash are eligible; the RPC returns 22023 on an active calendar. */
  purgeCalendar(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabaseService.client.rpc('purge_calendar', { p_calendar_id: id }),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  /** Bulk purge: hard-delete every soft-deleted calendar in the caller's
   *  workspaces. Returns the count on success. */
  emptyCalendarTrash(): Observable<{ success: boolean; purged?: number; error?: string }> {
    return from(
      this.supabaseService.client.rpc('empty_calendar_trash'),
    ).pipe(
      map(({ data, error }: any) =>
        error
          ? { success: false, error: error.message }
          : { success: true, purged: data ?? 0 },
      ),
    );
  }

  /** Deleted-calendar list, workspace-scoped, sorted by deleted_at DESC.
   *  Powers the Corbeille view. Empty array on any error — the caller
   *  surfaces the error via a banner if it wants to. */
  listDeletedCalendars(): Observable<DeletedCalendarSummary[]> {
    return from(this.supabaseService.client.rpc('list_deleted_calendars')).pipe(
      map(({ data, error }: any) => {
        if (error || !data) return [];
        return (data as any[]).map(row => ({
          id:           row.id,
          workspaceId:  row.workspace_id,
          year:         row.year,
          name:         row.name,
          status:       row.status as CalendarStatus,
          deletedAt:    row.deleted_at,
          deletedBy:    row.deleted_by,
          deleterEmail: row.deleter_email,
          deleterName:  row.deleter_name,
          entriesCount: row.entries_count ?? 0,
        }));
      }),
    );
  }
}
