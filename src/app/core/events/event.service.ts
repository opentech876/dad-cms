import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateEventDto, Event } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

@Injectable({ providedIn: 'root' })
export class EventService {
  constructor(
    private supabase: SupabaseService,
    private workspaceContext: WorkspaceContextService,
  ) {}

  /** Returns all non-deleted events for the active workspace. */
  listEvents(): Observable<Event[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    let query = this.supabase.client
      .from('events')
      .select('*')
      .is('deleted_at', null)
      .order('event_date', { ascending: true });
    if (wsId) query = (query as any).eq('workspace_id', wsId);
    return from(query).pipe(
      map(({ data, error }: any) => (error || !data ? [] : data as Event[])),
    );
  }

  /** Returns all non-deleted events whose MM-DD matches the given string (e.g. '08-15'). */
  listEventsByMmdd(mmdd: string): Observable<Event[]> {
    return this.listEvents().pipe(
      map(events => events.filter(e => e.event_date.slice(5) === mmdd)),
    );
  }

  /** Creates a new event in the library with status 'draft'. */
  createEvent(dto: CreateEventDto): Observable<{ success: boolean; id?: string; error?: string }> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('events')
          .insert({
            event_date: dto.event_date,
            title: dto.title,
            description: dto.description ?? null,
            image_path: dto.image_path ?? null,
            status: 'draft',
            workspace_id: wsId,
            created_by: user?.id ?? null,
          })
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

  updateEvent(id: string, patch: Partial<Pick<Event, 'title' | 'description' | 'image_path' | 'status' | 'event_date'>>): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('events')
          .update({ ...patch, updated_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  /** Uploads an image file to the historical-images bucket and returns its storage path. */
  uploadImage(eventId: string, file: File): Observable<{ path: string | null; error?: string }> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const storagePath = `${eventId}/cover.${ext}`;
    return from(
      this.supabase.client.storage
        .from('historical-images')
        .upload(storagePath, file, { upsert: true }),
    ).pipe(
      map(({ data, error }: any) =>
        error ? { path: null, error: error.message } : { path: (data?.path as string) ?? storagePath },
      ),
    );
  }

  /** Returns the public URL for an image stored in the historical-images bucket. */
  getImageUrl(storagePath: string): string {
    return this.supabase.client.storage
      .from('historical-images')
      .getPublicUrl(storagePath).data.publicUrl;
  }

  /**
   * Inserts a batch of events in a single PostgREST call.
   * Caller should chunk large arrays (≤200 per call) to stay within limits.
   */
  batchCreateEvents(dtos: CreateEventDto[]): Observable<{ inserted: number; error?: string }> {
    if (!dtos.length) return of({ inserted: 0 });
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('events')
          .insert(dtos.map(dto => ({
            event_date:  dto.event_date,
            title:       dto.title,
            description: dto.description ?? null,
            image_path:  null,
            status:      'draft' as const,
            workspace_id: wsId,
            created_by:  user?.id ?? null,
          }))),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { inserted: 0, error: error.message } : { inserted: dtos.length },
      ),
    );
  }

  deleteEvent(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('events')
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
