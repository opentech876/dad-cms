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
import { Event as HistoricalEvent } from '../../models';

const pad2 = (n: number) => String(n).padStart(2, '0');

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

  async load(): Promise<void> {
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
