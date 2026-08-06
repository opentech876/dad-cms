import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CalendarService, CalendarSummary } from '../../core/calendar/calendar.service';
import {
  CalendarEntryService,
  CalendarEntryWithEvent,
} from '../../core/calendar/calendar-entry.service';
import {
  PresidencyRecommendationWithEvent,
  RecommendationService,
} from '../../core/presidency/recommendation.service';
import { EventService } from '../../core/events/event.service';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { Event as HistoricalEvent } from '../../models';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** How long a loaded snapshot stays fresh. Navigating between the five
 *  curation pages within this window reuses the snapshot instead of
 *  re-fetching calendars + recommendations + entries each time. */
const CURATION_TTL_MS = 60_000;

/** Hub day states, by priority: my pending rec > my published rec >
 *  calendar already filled > empty date. */
export type HubDayState = 'pending' | 'published' | 'filled' | 'empty';

/**
 * Shared state for the Espace Curation pages. One load feeds the whole
 * area: calendars (picker), the curator's own recommendations, and the
 * selected calendar's entries (day states + replacement previews).
 */
@Injectable({ providedIn: 'root' })
export class CurationStore {
  private calendarService = inject(CalendarService);
  private entryService = inject(CalendarEntryService);
  private recommendationService = inject(RecommendationService);
  private eventService = inject(EventService);
  private supabase = inject(SupabaseService);
  private workspaceContext = inject(WorkspaceContextService);

  readonly loading = signal(false);
  readonly calendars = signal<CalendarSummary[]>([]);
  readonly selectedCalendarId = signal<string | null>(null);
  readonly myRecs = signal<PresidencyRecommendationWithEvent[]>([]);
  readonly entries = signal<CalendarEntryWithEvent[]>([]);

  readonly selectedCalendar = computed<CalendarSummary | null>(
    () => this.calendars().find((c) => c.id === this.selectedCalendarId()) ?? null,
  );
  readonly calendarYear = computed(() => this.selectedCalendar()?.year ?? new Date().getFullYear());

  /** My recommendations scoped to the selected calendar. */
  readonly myCalendarRecs = computed(() => {
    const id = this.selectedCalendarId();
    return this.myRecs().filter((r) => r.calendar_id === id);
  });

  readonly pendingCount = computed(
    () => this.myRecs().filter((r) => r.status === 'pending').length,
  );
  readonly publishedCount = computed(
    () => this.myRecs().filter((r) => r.status === 'applied').length,
  );

  readonly entriesByMmdd = computed<Map<string, CalendarEntryWithEvent[]>>(() => {
    const m = new Map<string, CalendarEntryWithEvent[]>();
    for (const e of this.entries()) {
      const arr = m.get(e.mmdd) ?? [];
      arr.push(e);
      arr.sort((a, b) => a.position - b.position);
      m.set(e.mmdd, arr);
    }
    return m;
  });

  readonly myRecsByMmdd = computed<Map<string, PresidencyRecommendationWithEvent[]>>(() => {
    const m = new Map<string, PresidencyRecommendationWithEvent[]>();
    for (const r of this.myCalendarRecs()) {
      const arr = m.get(r.mmdd) ?? [];
      arr.push(r);
      m.set(r.mmdd, arr);
    }
    return m;
  });

  /** True when I already recommend this event on the OTHER position of the
   *  same day — one event holds at most one position per day, so the UI
   *  blocks the duplicate with a readable message before the round-trip.
   *  (An event merely OCCUPYING the other calendar slot is fine: applying
   *  the recommendation moves it, it doesn't duplicate it.) */
  hasSameEventRecommendedElsewhere(mmdd: string, position: 1 | 2, eventId: string): boolean {
    return (this.myRecsByMmdd().get(mmdd) ?? []).some(
      (r) => r.position !== position && r.event_id === eventId,
    );
  }

  hubDayState(mmdd: string): HubDayState {
    const recs = this.myRecsByMmdd().get(mmdd) ?? [];
    if (recs.some((r) => r.status === 'pending')) return 'pending';
    if (recs.some((r) => r.status === 'applied')) return 'published';
    return this.entriesByMmdd().has(mmdd) ? 'filled' : 'empty';
  }

  /** Every date of the selected year without a single event, as 'MM-DD'. */
  readonly emptyDates = computed<string[]>(() => {
    const year = this.calendarYear();
    const filled = this.entriesByMmdd();
    const out: string[] = [];
    if (!this.selectedCalendarId()) return out;
    const d = new Date(year, 0, 1);
    while (d.getFullYear() === year) {
      const mmdd = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      if (!filled.has(mmdd)) out.push(mmdd);
      d.setDate(d.getDate() + 1);
    }
    return out;
  });

  /** Upcoming empty dates (today onward within the year), for the dashboard list. */
  readonly upcomingEmptyDates = computed<string[]>(() => {
    const now = new Date();
    const todayMmdd = `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const all = this.emptyDates();
    const upcoming = all.filter((m) => m >= todayMmdd);
    return upcoming.length > 0 ? upcoming : all;
  });

  /** Freshness bookkeeping: `loadedAt`/`loadedForWs` gate the TTL (the
   *  snapshot is stale the moment the active workspace changes, since this
   *  store is a root singleton shared across tenants), and `inFlight`
   *  collapses concurrent callers onto one round-trip. */
  private loadedAt = 0;
  private loadedForWs: string | null = null;
  private inFlight: Promise<void> | null = null;

  /**
   * Load (or reuse) the curation snapshot. A no-op when data is still fresh
   * for the ACTIVE workspace unless `force` is passed — so moving between
   * curation pages doesn't re-fetch, but switching workspace always does.
   * Concurrent calls share one in-flight load.
   */
  async load(force = false): Promise<void> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    const fresh =
      this.loadedAt > 0 &&
      this.loadedForWs === wsId &&
      Date.now() - this.loadedAt < CURATION_TTL_MS;
    if (!force && fresh) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this._doLoad();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async _doLoad(): Promise<void> {
    this.loading.set(true);
    try {
      const [calendars, myRecs] = await Promise.all([
        firstValueFrom(this.calendarService.listCalendars()).catch(() => [] as CalendarSummary[]),
        firstValueFrom(this.recommendationService.listMine()).catch(
          () => [] as PresidencyRecommendationWithEvent[],
        ),
      ]);
      this.calendars.set(calendars);
      this.myRecs.set(myRecs);

      const kept = calendars.find((c) => c.id === this.selectedCalendarId());
      const currentYear = new Date().getFullYear();
      const preferred =
        kept ?? calendars.find((c) => c.year === currentYear) ?? calendars[0] ?? null;
      this.selectedCalendarId.set(preferred?.id ?? null);
      await this.reloadEntries();
      this.loadedAt = Date.now();
      this.loadedForWs = this.workspaceContext.activeWorkspaceId();
    } finally {
      this.loading.set(false);
    }
  }

  async selectCalendar(id: string): Promise<void> {
    this.selectedCalendarId.set(id);
    await this.reloadEntries();
  }

  /** Re-fetch only my recommendations (after a submit / withdraw). */
  async refreshRecs(): Promise<void> {
    const recs = await firstValueFrom(this.recommendationService.listMine()).catch(() => null);
    if (recs) this.myRecs.set(recs);
  }

  // ── Mes événements — the curator's own additions to the shared library ──

  readonly myEvents = signal<HistoricalEvent[]>([]);
  readonly myEventsLoading = signal(false);

  async loadMyEvents(): Promise<void> {
    this.myEventsLoading.set(true);
    try {
      const [{ data }, events] = await Promise.all([
        this.supabase.client.auth.getUser(),
        firstValueFrom(this.eventService.listEvents()).catch(() => [] as HistoricalEvent[]),
      ]);
      const uid = data?.user?.id ?? null;
      this.myEvents.set(
        events.filter(
          (e) => e.origin === 'curateur' && (e.created_by === uid || e.created_by == null),
        ),
      );
    } finally {
      this.myEventsLoading.set(false);
    }
  }

  private async reloadEntries(): Promise<void> {
    const id = this.selectedCalendarId();
    this.entries.set(
      id
        ? await firstValueFrom(this.entryService.getEntriesForCalendar(id)).catch(
            () => [] as CalendarEntryWithEvent[],
          )
        : [],
    );
  }
}
