import { Injectable } from '@angular/core';
import { Observable, firstValueFrom, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateEventDto, Event } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';
import { compressThumbnail } from '../utils/image.utils';

/** How long a cached full-library snapshot stays valid. Mutations through
 *  this service invalidate immediately; the TTL only bounds staleness from
 *  OTHER users' edits (acceptable for pickers / grids that reload on save). */
const LIBRARY_CACHE_TTL_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class EventService {
  constructor(
    private supabase: SupabaseService,
    private workspaceContext: WorkspaceContextService,
  ) {}

  // In-flight-aware cache of the full library, keyed by workspace. The day
  // editor calls listEventsByMmdd() on EVERY day click — without the cache
  // each click re-fetched the entire library (1000+ rows, paginated).
  private libraryCache: { wsId: string | null; at: number; promise: Promise<Event[]> } | null =
    null;

  /** Drop the cached library. Called by every mutation in this service so
   *  the next read reflects the write; also callable by features that
   *  mutate events through other paths. */
  invalidateCache(): void {
    this.libraryCache = null;
  }

  /**
   * Returns all non-deleted events for the active workspace.
   * Paginates with `.range()` to work around Supabase's default
   * `max-rows=1000` PostgREST limit — keeps fetching until a page
   * comes back with fewer than PAGE_SIZE rows.
   *
   * Served from a short-lived cache (see LIBRARY_CACHE_TTL_MS); pass
   * `forceRefresh` to bypass it (explicit refresh buttons).
   */
  listEvents(forceRefresh = false): Observable<Event[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    const cache = this.libraryCache;
    const fresh = cache && cache.wsId === wsId && Date.now() - cache.at < LIBRARY_CACHE_TTL_MS;
    if (!forceRefresh && fresh) {
      return from(cache.promise);
    }

    const PAGE_SIZE = 1000;

    const fetchPage = (offset: number): Promise<Event[]> => {
      let query = this.supabase.client
        .from('events')
        .select('*')
        .is('deleted_at', null)
        .order('event_date', { ascending: true });
      if (wsId) query = (query as any).eq('workspace_id', wsId);
      return (query as any)
        .range(offset, offset + PAGE_SIZE - 1)
        .then(({ data, error }: any) => (error || !data ? [] : (data as Event[])));
    };

    const fetchAll = async (): Promise<Event[]> => {
      const all: Event[] = [];
      let offset = 0;
      // Cap the loop at 50 pages (50k events) as a defensive guard.
      for (let i = 0; i < 50; i++) {
        const page = await fetchPage(offset);
        all.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      return all;
    };

    const promise = fetchAll();
    // Cache the promise itself so concurrent callers share one round-trip;
    // evict on failure so an error doesn't poison the next minute.
    this.libraryCache = { wsId, at: Date.now(), promise };
    promise.catch(() => {
      this.libraryCache = null;
    });
    return from(promise);
  }

  /** Returns all non-deleted events whose MM-DD matches the given string (e.g. '08-15').
   *  Rides the listEvents() cache — repeated day-editor opens cost one fetch. */
  listEventsByMmdd(mmdd: string): Observable<Event[]> {
    return this.listEvents().pipe(
      map((events) => events.filter((e) => e.event_date.slice(5) === mmdd)),
    );
  }

  /** Creates a new event in the library with status 'draft'. */
  createEvent(dto: CreateEventDto): Observable<{ success: boolean; id?: string; error?: string }> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      (async () => {
        const {
          data: { user },
        } = await this.supabase.client.auth.getUser();

        // The library credits a human ("Historien") on every entry. When the
        // caller doesn't provide one, default to the creator's profile name —
        // never a generic role label (several people can hold the same role).
        let historian = dto.historian ?? null;
        if (!historian && user?.id && wsId) {
          try {
            const { data: profile } = await this.supabase.client
              .from('profiles')
              .select('full_name')
              .eq('user_id', user.id)
              .eq('workspace_id', wsId)
              .maybeSingle();
            historian = profile?.full_name ?? null;
          } catch {
            // Best-effort: the event must still save without a profile.
          }
        }

        return this.supabase.client
          .from('events')
          .insert({
            event_date: dto.event_date,
            title: dto.title,
            description: dto.description ?? null,
            image_path: dto.image_path ?? null,
            source: dto.source ?? null,
            historian,
            status: 'draft',
            origin: dto.origin ?? 'editorial',
            workspace_id: wsId,
            created_by: user?.id ?? null,
          })
          .select('id')
          .single();
      })() as Promise<{ data: { id: string } | null; error: any }>,
    ).pipe(
      map(({ data, error }) => {
        this.invalidateCache();
        return error ? { success: false, error: error.message } : { success: true, id: data?.id };
      }),
    );
  }

  updateEvent(
    id: string,
    patch: Partial<
      Pick<
        Event,
        'title' | 'description' | 'image_path' | 'status' | 'event_date' | 'source' | 'historian'
      >
    >,
  ): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('events')
          .update({ ...patch, updated_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) => {
        this.invalidateCache();
        return error ? { success: false, error: error.message } : { success: true };
      }),
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
        error
          ? { path: null, error: error.message }
          : { path: (data?.path as string) ?? storagePath },
      ),
    );
  }

  /** Returns the public URL for an image stored in the historical-images bucket. */
  getImageUrl(storagePath: string): string {
    return this.supabase.client.storage.from('historical-images').getPublicUrl(storagePath).data
      .publicUrl;
  }

  /** Derive the thumbnail's storage path from the cover path: the sibling
   *  `thumb.*` next to `cover.*` (same extension). Pure so it's testable
   *  and callers can build a thumb URL without an extra round-trip. */
  thumbPathFromCover(coverPath: string): string {
    return /cover\.[^./]+$/.test(coverPath)
      ? coverPath.replace(/cover(\.[^./]+)$/, 'thumb$1')
      : coverPath;
  }

  /** Public URL of the small thumbnail beside a cover. Grids use this; on a
   *  404 (events uploaded before thumbnails existed) the caller falls back
   *  to getImageUrl(cover). */
  getThumbUrl(coverPath: string): string {
    return this.getImageUrl(this.thumbPathFromCover(coverPath));
  }

  /**
   * Best-effort: compress `originalFile` into a thumbnail and upload it
   * beside the cover. Never throws — the cover is already saved, so a
   * failed thumb just means grids fall back to the cover on a 404.
   * Awaitable at the call site without a try/catch of its own.
   */
  async uploadThumbnailFor(coverPath: string, originalFile: File): Promise<void> {
    try {
      const thumb = await compressThumbnail(originalFile);
      await firstValueFrom(this.uploadThumbnail(coverPath, thumb));
    } catch {
      // Cover remains the source of truth; grids degrade gracefully.
    }
  }

  /** Uploads a thumbnail beside its cover (best-effort — the cover is the
   *  source of truth; a failed thumb just means grids serve the cover). */
  uploadThumbnail(coverPath: string, file: File): Observable<{ path: string | null; error?: string }> {
    const storagePath = this.thumbPathFromCover(coverPath);
    return from(
      this.supabase.client.storage
        .from('historical-images')
        .upload(storagePath, file, { upsert: true }),
    ).pipe(
      map(({ data, error }: any) =>
        error
          ? { path: null, error: error.message }
          : { path: (data?.path as string) ?? storagePath },
      ),
    );
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
        this.supabase.client.from('events').insert(
          dtos.map((dto) => ({
            event_date: dto.event_date,
            title: dto.title,
            description: dto.description ?? null,
            image_path: null,
            source: dto.source ?? null,
            historian: dto.historian ?? null,
            status: 'draft' as const,
            workspace_id: wsId,
            created_by: user?.id ?? null,
          })),
        ),
      ),
    ).pipe(
      map(({ error }: any) => {
        this.invalidateCache();
        return error ? { inserted: 0, error: error.message } : { inserted: dtos.length };
      }),
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
      map(({ error }: any) => {
        this.invalidateCache();
        return error ? { success: false, error: error.message } : { success: true };
      }),
    );
  }
}
