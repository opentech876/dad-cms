import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { CalendarService, CalendarSummary } from '../../core/calendar/calendar.service';
import { CalendarEntryService, CalendarEntryWithEvent } from '../../core/calendar/calendar-entry.service';
import { EventService } from '../../core/events/event.service';
import { RecommendationService, PresidencyRecommendationWithEvent } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';
import { Event as HistoricalEvent } from '../../models';
import { MONTHS_FR_LONG_CAP, formatDayMonthLong } from '../../core/utils/date.utils';

interface DayCell {
  day: number;        // 1..31
  mmdd: string;       // 'MM-DD'
}

interface MonthSection {
  index: number;      // 0..11
  name: string;
  days: DayCell[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'app-recommandations',
  standalone: true,
  imports: [CommonModule, TuiIcon],
  templateUrl: './recommandations.component.html',
  styleUrl: './recommandations.component.scss',
})
export class RecommandationsComponent implements OnInit {
  private readonly calendarService = inject(CalendarService);
  private readonly calendarEntryService = inject(CalendarEntryService);
  private readonly eventService = inject(EventService);
  private readonly recommendationService = inject(RecommendationService);
  private readonly toast = inject(ToastService);

  readonly calendars = signal<CalendarSummary[]>([]);
  readonly selectedCalendarId = signal<string>('');
  readonly loading = signal(true);

  readonly recommendations = signal<PresidencyRecommendationWithEvent[]>([]);
  readonly existingEntries = signal<CalendarEntryWithEvent[]>([]);

  // Per-day editor (inline modal).
  readonly editorOpen = signal(false);
  readonly editorMmdd = signal('');
  readonly editorLibrary = signal<HistoricalEvent[]>([]);
  readonly editorPos1 = signal<string | null>(null);
  readonly editorPos2 = signal<string | null>(null);
  readonly editorSaving = signal(false);
  readonly editorLoading = signal(false);

  // Expanded months in the accordion. Default: current month + Jan.
  readonly expandedMonths = signal<Set<number>>(new Set([0, new Date().getMonth()]));

  readonly selectedCalendar = computed(() =>
    this.calendars().find(c => c.id === this.selectedCalendarId()),
  );

  /** Map mmdd → pending+applied recommendations for that day, sorted by position. */
  readonly recsByMmdd = computed<Map<string, PresidencyRecommendationWithEvent[]>>(() => {
    const m = new Map<string, PresidencyRecommendationWithEvent[]>();
    for (const r of this.recommendations()) {
      const arr = m.get(r.mmdd) ?? [];
      arr.push(r);
      arr.sort((a, b) => a.position - b.position);
      m.set(r.mmdd, arr);
    }
    return m;
  });

  /** Map mmdd → existing calendar_entries for that day (informational read-only). */
  readonly entriesByMmdd = computed<Map<string, CalendarEntryWithEvent[]>>(() => {
    const m = new Map<string, CalendarEntryWithEvent[]>();
    for (const e of this.existingEntries()) {
      const arr = m.get(e.mmdd) ?? [];
      arr.push(e);
      arr.sort((a, b) => a.position - b.position);
      m.set(e.mmdd, arr);
    }
    return m;
  });

  readonly months: MonthSection[] = MONTHS_FR_LONG_CAP.map((name, idx) => {
    const lastDay = new Date(2024, idx + 1, 0).getDate(); // 2024 = leap year so Feb gets 29 — caller filters by calendar year
    const days: DayCell[] = [];
    for (let d = 1; d <= lastDay; d++) {
      days.push({ day: d, mmdd: `${pad2(idx + 1)}-${pad2(d)}` });
    }
    return { index: idx, name, days };
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    const calendars = await firstValueFrom(this.calendarService.listCalendars());
    this.calendars.set(calendars);
    if (calendars.length > 0) {
      // Default selection: prefer the current year, otherwise the first calendar.
      const currentYear = new Date().getFullYear();
      const match = calendars.find(c => c.year === currentYear) ?? calendars[0];
      await this.selectCalendar(match.id);
    } else {
      this.loading.set(false);
    }
  }

  async selectCalendar(calendarId: string): Promise<void> {
    if (!calendarId) return;
    this.selectedCalendarId.set(calendarId);
    this.loading.set(true);
    const [recs, entries] = await Promise.all([
      firstValueFrom(this.recommendationService.listByCalendar(calendarId)),
      firstValueFrom(this.calendarEntryService.getEntriesForCalendar(calendarId)),
    ]);
    this.recommendations.set(recs);
    this.existingEntries.set(entries);
    this.loading.set(false);
  }

  toggleMonth(idx: number): void {
    this.expandedMonths.update(s => {
      const next = new Set(s);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  isExpanded(idx: number): boolean {
    return this.expandedMonths().has(idx);
  }

  hasRecommendation(mmdd: string, position: 1 | 2): boolean {
    return (this.recsByMmdd().get(mmdd) ?? []).some(r => r.position === position);
  }

  hasEntry(mmdd: string, position: 1 | 2): boolean {
    return (this.entriesByMmdd().get(mmdd) ?? []).some(e => e.position === position);
  }

  /**
   * A day's overall state shown on the grid cell:
   * - 'full' : recommendation exists for both positions
   * - 'partial' : 1 of 2 positions recommended
   * - 'empty' : no recommendation yet (regardless of whether calendar_entries already exist)
   */
  dayState(mmdd: string): 'full' | 'partial' | 'empty' {
    const recs = this.recsByMmdd().get(mmdd) ?? [];
    if (recs.length >= 2) return 'full';
    if (recs.length === 1) return 'partial';
    return 'empty';
  }

  async openDayEditor(mmdd: string): Promise<void> {
    this.editorMmdd.set(mmdd);
    this.editorOpen.set(true);
    this.editorLoading.set(true);

    const recs = this.recsByMmdd().get(mmdd) ?? [];
    this.editorPos1.set(recs.find(r => r.position === 1)?.event_id ?? null);
    this.editorPos2.set(recs.find(r => r.position === 2)?.event_id ?? null);

    const library = await firstValueFrom(this.eventService.listEventsByMmdd(mmdd));
    this.editorLibrary.set(library);
    this.editorLoading.set(false);
  }

  closeDayEditor(): void {
    this.editorOpen.set(false);
    this.editorMmdd.set('');
    this.editorLibrary.set([]);
  }

  pick(position: 1 | 2, eventId: string | null): void {
    if (position === 1) this.editorPos1.set(eventId);
    else this.editorPos2.set(eventId);
  }

  async saveDayEditor(): Promise<void> {
    if (this.editorSaving()) return;
    const calId = this.selectedCalendarId();
    if (!calId) return;
    const mmdd = this.editorMmdd();

    this.editorSaving.set(true);
    const ops: Promise<{ success: boolean; error?: string }>[] = [];
    const pos1 = this.editorPos1();
    const pos2 = this.editorPos2();

    if (pos1) {
      ops.push(firstValueFrom(this.recommendationService.upsertSlot(calId, mmdd, 1, pos1)));
    } else {
      ops.push(firstValueFrom(this.recommendationService.removeSlot(calId, mmdd, 1)));
    }
    if (pos2) {
      ops.push(firstValueFrom(this.recommendationService.upsertSlot(calId, mmdd, 2, pos2)));
    } else {
      ops.push(firstValueFrom(this.recommendationService.removeSlot(calId, mmdd, 2)));
    }

    const results = await Promise.all(ops);
    this.editorSaving.set(false);

    const failed = results.find(r => !r.success);
    if (failed) {
      this.toast.error(failed.error ?? 'Erreur lors de l\'enregistrement de la recommandation.');
      return;
    }

    this.toast.success('Recommandation enregistrée.');
    this.closeDayEditor();
    await this.selectCalendar(calId); // refresh
  }

  /** "15 août" style header for the day editor. */
  editorDayLabel(): string {
    const year = this.selectedCalendar()?.year ?? new Date().getFullYear();
    return formatDayMonthLong(`${year}-${this.editorMmdd()}`) || this.editorMmdd();
  }
}
