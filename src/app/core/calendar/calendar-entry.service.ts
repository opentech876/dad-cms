import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { CalendarEntry, Event, EventPosition } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

export interface CalendarEntryWithEvent extends CalendarEntry {
  event: Event;
}

/** Lightweight variant returned by getEntriesByMmdd — includes event id+title only. */
export type CalendarEntrySlim = CalendarEntry & {
  event: { id: string; title: string } | null;
};

@Injectable({ providedIn: 'root' })
export class CalendarEntryService {
  constructor(
    private supabase: SupabaseService,
    private workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * All entries for a given MM-DD slot across every calendar in the active workspace.
   * Includes a slim event join (id + title) for displaying slot occupancy.
   */
  getEntriesByMmdd(mmdd: string): Observable<CalendarEntrySlim[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    let query = this.supabase.client
      .from('calendar_entries')
      .select('*, event:events(id, title)')
      .eq('mmdd', mmdd);
    if (wsId) query = (query as any).eq('workspace_id', wsId);
    return from(query).pipe(
      map(({ data, error }: any) => (error || !data ? [] : data as CalendarEntrySlim[])),
    );
  }

  /** All entries for a calendar, with the joined event's displayed columns.
   *  Narrowed from events(*) — consumers only render id/title/description/
   *  image/date/status, and a full year can join ~730 rows, so the audit +
   *  source/historian/origin columns are dead weight over the wire. */
  getEntriesForCalendar(calendarId: string): Observable<CalendarEntryWithEvent[]> {
    return from(
      this.supabase.client
        .from('calendar_entries')
        .select('*, event:events(id, title, description, image_path, event_date, status)')
        .eq('calendar_id', calendarId)
        .order('mmdd', { ascending: true }),
    ).pipe(
      map(({ data, error }: any) => (error || !data ? [] : data as CalendarEntryWithEvent[])),
    );
  }

  /** Assign an event to a position on a calendar day (upsert). */
  assignEvent(
    calendarId: string,
    mmdd: string,
    eventId: string,
    position: EventPosition,
  ): Observable<{ success: boolean; error?: string }> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('calendar_entries')
          .upsert(
            {
              calendar_id: calendarId,
              mmdd,
              position,
              event_id: eventId,
              workspace_id: wsId,
              created_by: user?.id ?? null,
            },
            { onConflict: 'calendar_id,mmdd,position' },
          ),
      ),
    ).pipe(
      map(({ error }: any) => {
        if (!error) return { success: true };
        if (error.code === '42501')
          return { success: false, error: 'insufficient_privilege' };
        if (error.code === '23505' && error.message?.includes('uq_calendar_entry_one_position_per_event'))
          return { success: false, error: 'event_already_assigned_this_day' };
        return { success: false, error: error.message };
      }),
    );
  }

  /** Remove a specific calendar entry by id. */
  unassignEntry(entryId: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client
        .from('calendar_entries')
        .delete()
        .eq('id', entryId),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  /** Remove the entry for a specific (calendar, mmdd, position) slot. */
  unassignSlot(
    calendarId: string,
    mmdd: string,
    position: EventPosition,
  ): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client
        .from('calendar_entries')
        .delete({ count: 'exact' })
        .eq('calendar_id', calendarId)
        .eq('mmdd', mmdd)
        .eq('position', position),
    ).pipe(
      map(({ error, count }: any) => {
        if (error) return { success: false, error: error.message };
        if (count === 0) return { success: false, error: 'insufficient_privilege' };
        return { success: true };
      }),
    );
  }
}
