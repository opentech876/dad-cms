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

  deleteCalendar(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabaseService.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabaseService.client
          .from('calendars')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }
}
