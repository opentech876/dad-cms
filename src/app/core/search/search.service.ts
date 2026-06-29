import { Injectable, inject } from '@angular/core';
import { Observable, from, of, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';
import { formatDateLong, formatDateShort } from '../utils/date.utils';

export type SearchResultType = 'event' | 'campaign' | 'company' | 'calendar';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  subtitle?: string;
}

export interface SearchResults {
  events:    SearchResult[];
  campaigns: SearchResult[];
  companies: SearchResult[];
  calendars: SearchResult[];
}

const EMPTY: SearchResults = { events: [], campaigns: [], companies: [], calendars: [] };

@Injectable({ providedIn: 'root' })
export class SearchService {
  private supabase = inject(SupabaseService);
  private workspaceContext = inject(WorkspaceContextService);

  /**
   * Searches across events / ad_campaigns / companies / calendars in the active
   * workspace. Workspace-scoped and respects RLS (callers without role-access
   * to a table simply get empty results from that group).
   */
  search(term: string, limitPerType = 5): Observable<SearchResults> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    const trimmed = term?.trim() ?? '';
    if (!wsId || !trimmed) return of(EMPTY);

    const pattern = `%${trimmed}%`;
    const c = this.supabase.client;

    const eventsP = c.from('events')
      .select('id, title, event_date')
      .eq('workspace_id', wsId).is('deleted_at', null)
      .ilike('title', pattern)
      .order('event_date', { ascending: true })
      .limit(limitPerType);

    const campaignsP = c.from('ad_campaigns')
      .select('id, name, start_date, end_date')
      .eq('workspace_id', wsId).is('deleted_at', null)
      .ilike('name', pattern)
      .order('start_date', { ascending: false })
      .limit(limitPerType);

    const companiesP = c.from('companies')
      .select('id, name, type')
      .eq('workspace_id', wsId).is('deleted_at', null)
      .ilike('name', pattern)
      .order('name', { ascending: true })
      .limit(limitPerType);

    const calendarsP = c.from('calendars')
      .select('id, name, year')
      .eq('workspace_id', wsId).is('deleted_at', null)
      .ilike('name', pattern)
      .order('year', { ascending: false })
      .limit(limitPerType);

    return combineLatest([
      from(Promise.resolve(eventsP)),
      from(Promise.resolve(campaignsP)),
      from(Promise.resolve(companiesP)),
      from(Promise.resolve(calendarsP)),
    ]).pipe(
      map(([ev, ca, co, cl]: any[]) => ({
        events:    (ev.data ?? []).map((r: any) => ({
          type: 'event' as const,
          id: r.id,
          label: r.title,
          subtitle: r.event_date ? formatDateLong(r.event_date) : undefined,
        })),
        campaigns: (ca.data ?? []).map((r: any) => ({
          type: 'campaign' as const,
          id: r.id,
          label: r.name,
          subtitle: r.start_date && r.end_date
            ? `${formatDateShort(r.start_date)} → ${formatDateShort(r.end_date)}`
            : undefined,
        })),
        companies: (co.data ?? []).map((r: any) => ({
          type: 'company' as const,
          id: r.id,
          label: r.name,
          subtitle: r.type ?? undefined,
        })),
        calendars: (cl.data ?? []).map((r: any) => ({
          type: 'calendar' as const,
          id: r.id,
          label: r.name,
          subtitle: r.year ? `Année ${r.year}` : undefined,
        })),
      })),
    );
  }
}
