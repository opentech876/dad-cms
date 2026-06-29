import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { CalendarService, CalendarSummary } from '../../core/calendar/calendar.service';
import { CalendarEntryService, CalendarEntryWithEvent } from '../../core/calendar/calendar-entry.service';
import { EventService } from '../../core/events/event.service';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { ToastService } from '../../core/services/toast.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { AuthService } from '../../core/auth/auth.service';
import { AdCampaign, Event as HistoricalEvent, EventPosition } from '../../models';
import { MONTHS_FR_LONG as MONTHS_FR, MONTHS_FR_LONG_CAP as MONTHS_FR_CAP } from '../../core/utils/date.utils';

type CalendarView = 'year' | 'month' | 'list';
export type CalendarFilter = 'all' | 'full' | 'partial' | 'empty' | 'has_campaign';

export interface Calendar extends CalendarSummary {
  fillPct: number;
}

interface DayCell {
  d: number | null;
  isToday: boolean;
  totalEvents: number;
  pinnedCount: 0 | 1 | 2;
  title: string | null;
  ad: boolean;
}

interface HeatmapCell { d: number | null; intensity: 0 | 1 | 2 | 3; }
interface HeatmapMonth { label: string; mi: number; cells: HeatmapCell[]; pct: number; dow: string[]; }

interface DateRow {
  day: number;
  month: number;
  date: string;
  dow: string;
  totalEvents: number;
  pinnedCount: 0 | 1 | 2;
  title: string | null;
  sub: string | null;
  ad: string;
  status: 'published' | 'draft' | 'empty';
}

export interface DayEvent {
  id: string;
  historicalYear: number;
  title: string;
  description: string;
  hasImage: boolean;
  imageSizeKb: number;
  charCount: number;
  status: 'published' | 'draft';
  displayPosition: 1 | 2 | null;
}

export interface DayCampaign {
  id: string;
  name: string;
  advertiser: string;
  color: string;
  textColor: string;
  status: 'active' | 'scheduled';
}

export interface DayDetailData {
  day: number;
  month: number;
  year: number;
  dayOfWeek: string;
  events: DayEvent[];
  campaigns: DayCampaign[];
}

// MONTHS_FR_SHORT here is the 3-letter heatmap variant ('Jan', 'Fév', …),
// distinct from the formal abbreviations in date.utils.ts ('janv.', 'févr.', …).
// MONTHS_FR / MONTHS_FR_CAP come from the shared utility.
const MONTHS_FR_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Juil','Aoû','Sep','Oct','Nov','Déc'];
const DOW_SHORT       = ['L','M','M','J','V','S','D'];
const DOW_LONG        = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const DAYS_FR         = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function dowMondayFirst(year: number, month: number, day: number): number {
  return (new Date(year, month, day).getDay() + 6) % 7;
}
function pad2(n: number): string { return String(n).padStart(2, '0'); }
function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [TuiIcon],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class CalendarComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly calendarService = inject(CalendarService);
  private readonly calendarEntryService = inject(CalendarEntryService);
  private readonly eventService = inject(EventService);
  private readonly campaignService = inject(CampaignService);
  private readonly recommendationService = inject(RecommendationService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  /**
   * Editorial-tier visibility for the "Appliquer la recommandation" button.
   * Mirrors the RPC's `has_role_at_least('editeur')` check so we don't show
   * a button that would return `42501 insufficient_privilege` for
   * `charge_communication` or `presidence` users who also reach /calendrier.
   */
  readonly canApplyRecommendations = toSignal(
    this.authService.hasRoleAtLeast('editeur'),
    { initialValue: false },
  );

  // Pending Presidence recommendations for the selected calendar (count only).
  readonly pendingRecommendationsCount = signal(0);
  readonly recommendationsApplying = signal(false);

  // Confirm dialog state for the apply flow.
  readonly applyDialogVisible = signal(false);
  readonly applyConflicts = signal<import('../../core/presidency/recommendation.service').RecommendationConflict[]>([]);

  readonly monthsFr      = MONTHS_FR;
  readonly monthsFrCap   = MONTHS_FR_CAP;
  readonly monthsFrShort = MONTHS_FR_SHORT;
  readonly dowShort      = DOW_SHORT;
  readonly dowLong       = DOW_LONG;
  readonly slotPositions: EventPosition[] = [1, 2];
  readonly viewOptions: { id: CalendarView; label: string }[] = [
    { id: 'year', label: 'Année' },
    { id: 'month', label: 'Mois' },
    { id: 'list', label: 'Liste' },
  ];
  readonly filterChips: { id: CalendarFilter; label: string }[] = [
    { id: 'all',          label: 'Toutes les dates' },
    { id: 'full',         label: '2 affichés' },
    { id: 'partial',      label: '1 affiché' },
    { id: 'empty',        label: 'Vide' },
    { id: 'has_campaign', label: 'Avec campagne' },
  ];

  private readonly _today = new Date();
  readonly currentYear  = this._today.getFullYear();
  readonly currentMonth = this._today.getMonth();
  readonly todayDate    = this._today.getDate();

  // ── Calendars ─────────────────────────────────────
  readonly calendars = signal<Calendar[]>([]);
  readonly loading = signal(false);
  readonly calendarError = signal<string | null>(null);
  readonly selectedCalendarId = signal('');

  readonly sortedCalendars = computed(() =>
    [...this.calendars()].sort((a, b) => a.year - b.year)
  );
  readonly selectedCalendar = computed(() =>
    this.calendars().find(c => c.id === this.selectedCalendarId()) ?? this.calendars()[0]
  );
  readonly canPrevCalendar = computed(() =>
    this.sortedCalendars().findIndex(c => c.id === this.selectedCalendarId()) > 0
  );
  readonly canNextCalendar = computed(() => {
    const sorted = this.sortedCalendars();
    const idx = sorted.findIndex(c => c.id === this.selectedCalendarId());
    return idx < sorted.length - 1;
  });
  readonly availableYears = computed(() => {
    const taken = new Set(this.calendars().map(c => c.year));
    return Array.from({ length: 10 }, (_, i) => this.currentYear - 2 + i).filter(y => !taken.has(y));
  });

  async ngOnInit(): Promise<void> {
    await this._reloadCalendars();
  }

  private async _reloadCalendars(): Promise<void> {
    this.loading.set(true);
    this.calendarError.set(null);
    const summaries = await firstValueFrom(this.calendarService.listCalendars());
    this.calendars.set(
      summaries.map((s) => ({
        ...s,
        fillPct: Math.min(100, Math.round((s.eventCount / 730) * 100)),
      })),
    );
    if (this.selectedCalendarId() === '' && summaries.length > 0) {
      this.selectCalendar(summaries[summaries.length - 1].id);
    }
    this.loading.set(false);
  }

  // ── Campaigns ─────────────────────────────────────
  readonly activeCampaigns = signal<AdCampaign[]>([]);

  /** Maps each MM-DD (for the selected year) to the first active campaign name covering it. */
  readonly campaignByMmdd = computed<Map<string, string>>(() => {
    const year = this.selectedYear();
    const map = new Map<string, string>();
    for (const c of this.activeCampaigns()) {
      if (!c.active) continue;
      for (let month = 0; month < 12; month++) {
        const dim = daysInMonth(year, month);
        for (let d = 1; d <= dim; d++) {
          const mmdd = `${pad2(month + 1)}-${pad2(d)}`;
          if (!map.has(mmdd)) {
            const fullDate = `${year}-${mmdd}`;
            if (c.start_date <= fullDate && c.end_date >= fullDate) {
              map.set(mmdd, c.name);
            }
          }
        }
      }
    }
    return map;
  });

  // ── Calendar entries (assignments) ───────────────
  readonly entries = signal<CalendarEntryWithEvent[]>([]);
  readonly loadingEntries = signal(false);

  private readonly _entriesCache = new Map<string, CalendarEntryWithEvent[]>();

  /** Groups entries by mmdd ('MM-DD') for O(1) day lookup. */
  readonly entriesByMmdd = computed(() => {
    const map = new Map<string, CalendarEntryWithEvent[]>();
    for (const entry of this.entries()) {
      const existing = map.get(entry.mmdd) ?? [];
      map.set(entry.mmdd, [...existing, entry]);
    }
    return map;
  });

  // ── View state ────────────────────────────────────
  readonly view          = signal<CalendarView>('month');
  readonly selectedYear  = signal(this.currentYear);
  readonly selectedMonth = signal(this.currentMonth);
  readonly activeFilter  = signal<CalendarFilter>('all');
  readonly currentPage   = signal(0);
  readonly pageSize      = 30;

  // ── Calendar navigation ───────────────────────────
  selectCalendar(id: string): void {
    this.selectedCalendarId.set(id);
    const cal = this.calendars().find(c => c.id === id);
    if (cal) this.selectedYear.set(cal.year);
    this.selectedDay.set(null);
    this.currentPage.set(0);
    // Refresh the Presidence apply-button badge for the new selection.
    this.refreshPendingCount();

    const cached = this._entriesCache.get(id);
    if (cached) {
      this.entries.set(cached);
    } else {
      this.loadingEntries.set(true);
      this.calendarEntryService.getEntriesForCalendar(id).subscribe(entries => {
        this._entriesCache.set(id, entries);
        this.entries.set(entries);
        this.loadingEntries.set(false);
      });
    }
    this.campaignService.listCampaigns().subscribe(campaigns => this.activeCampaigns.set(campaigns));
  }

  prevCalendar(): void {
    const sorted = this.sortedCalendars();
    const idx = sorted.findIndex(c => c.id === this.selectedCalendarId());
    if (idx > 0) this.selectCalendar(sorted[idx - 1].id);
  }

  nextCalendar(): void {
    const sorted = this.sortedCalendars();
    const idx = sorted.findIndex(c => c.id === this.selectedCalendarId());
    if (idx < sorted.length - 1) this.selectCalendar(sorted[idx + 1].id);
  }

  prevMonth(): void { this.selectedMonth.update(m => Math.max(0, m - 1)); }
  nextMonth(): void { this.selectedMonth.update(m => Math.min(11, m + 1)); }
  pickMonth(mi: number): void { this.selectedMonth.set(mi); this.view.set('month'); }

  setFilter(filter: CalendarFilter): void {
    this.activeFilter.set(filter);
    this.currentPage.set(0);
  }

  nextPage(): void {
    const maxPage = Math.max(0, Math.ceil(this.filteredRows().length / this.pageSize) - 1);
    this.currentPage.update(p => Math.min(p + 1, maxPage));
  }

  prevPage(): void {
    this.currentPage.update(p => Math.max(0, p - 1));
  }

  // ── Day detail ────────────────────────────────────
  readonly selectedDay = signal<{ day: number; month: number } | null>(null);

  readonly selectedDayDetail = computed((): DayDetailData | null => {
    const sel = this.selectedDay();
    if (!sel) return null;
    const cal = this.selectedCalendar();
    if (!cal) return null;
    const { year } = cal;
    const mmdd = `${pad2(sel.month + 1)}-${pad2(sel.day)}`;
    const dayEntries = this.entriesByMmdd().get(mmdd) ?? [];
    const dayOfWeek = DAYS_FR[new Date(year, sel.month, sel.day).getDay()];
    const events: DayEvent[] = dayEntries.map(entry => ({
      id: entry.event.id,
      historicalYear: entry.event.event_date ? +entry.event.event_date.slice(0, 4) : 0,
      title: entry.event.title,
      description: entry.event.description ?? '',
      hasImage: !!entry.event.image_path,
      imageSizeKb: 0,
      charCount: (entry.event.description ?? '').length,
      status: entry.event.status,
      displayPosition: entry.position,
    }));
    return { day: sel.day, month: sel.month, year, dayOfWeek, events, campaigns: [] };
  });

  // ── Day modal — library events ────────────────────
  readonly dayModalEvents   = signal<HistoricalEvent[]>([]);
  readonly dayModalLoading  = signal(false);
  readonly dayModalSearch   = signal('');
  readonly dayModalSaving   = signal(false);

  readonly filteredDayEvents = computed(() => {
    const q = this.dayModalSearch().toLowerCase().trim();
    return q
      ? this.dayModalEvents().filter(e =>
          e.title.toLowerCase().includes(q) ||
          e.event_date.slice(0, 4).includes(q),
        )
      : this.dayModalEvents();
  });

  async openDayDetail(day: number | null, month: number): Promise<void> {
    if (day === null) return;
    this.selectedDay.set({ day, month });
    this.dayModalSearch.set('');
    await this._loadDayModalEvents(`${pad2(month + 1)}-${pad2(day)}`);
  }

  closeDayDetail(): void {
    this.selectedDay.set(null);
    this.dayModalEvents.set([]);
    this.dayModalSearch.set('');
  }

  navigateToPrevDay(): void {
    const sel = this.selectedDay();
    if (!sel) return;
    const { day, month } = sel;
    let newDay = day, newMonth = month;
    if (day > 1) {
      newDay = day - 1;
    } else if (month > 0) {
      newMonth = month - 1;
      newDay = daysInMonth(this.selectedYear(), newMonth);
    } else {
      return;
    }
    this.selectedDay.set({ day: newDay, month: newMonth });
    this.dayModalSearch.set('');
    this._loadDayModalEvents(`${pad2(newMonth + 1)}-${pad2(newDay)}`);
  }

  navigateToNextDay(): void {
    const sel = this.selectedDay();
    if (!sel) return;
    const { day, month } = sel;
    const maxDay = daysInMonth(this.selectedYear(), month);
    let newDay = day, newMonth = month;
    if (day < maxDay) {
      newDay = day + 1;
    } else if (month < 11) {
      newMonth = month + 1;
      newDay = 1;
    } else {
      return;
    }
    this.selectedDay.set({ day: newDay, month: newMonth });
    this.dayModalSearch.set('');
    this._loadDayModalEvents(`${pad2(newMonth + 1)}-${pad2(newDay)}`);
  }

  private async _loadDayModalEvents(mmdd: string): Promise<void> {
    this.dayModalLoading.set(true);
    const events = await firstValueFrom(this.eventService.listEventsByMmdd(mmdd));
    const sel = this.selectedDay();
    if (sel && `${pad2(sel.month + 1)}-${pad2(sel.day)}` === mmdd) {
      this.dayModalEvents.set(events);
    }
    this.dayModalLoading.set(false);
  }

  // ── Slot helpers ──────────────────────────────────
  getSlotEvent(position: EventPosition): DayEvent | null {
    return this.selectedDayDetail()?.events.find(e => e.displayPosition === position) ?? null;
  }

  isEventAtPosition(eventId: string, position: EventPosition): boolean {
    return this.selectedDayDetail()?.events.some(e => e.id === eventId && e.displayPosition === position) ?? false;
  }

  isSlotFilled(position: EventPosition): boolean {
    return this.getSlotEvent(position) !== null;
  }

  // ── Assign / unassign ─────────────────────────────
  async toggleSlot(eventId: string, position: EventPosition): Promise<void> {
    if (this.isEventAtPosition(eventId, position)) {
      await this.unassignFromSlot(position);
    } else {
      await this.assignToSlot(eventId, position);
    }
  }

  async assignToSlot(eventId: string, position: EventPosition): Promise<void> {
    const calId = this.selectedCalendarId();
    const sel   = this.selectedDay();
    if (!calId || !sel || this.dayModalSaving()) return;
    const mmdd = `${pad2(sel.month + 1)}-${pad2(sel.day)}`;
    this.dayModalSaving.set(true);
    const res = await firstValueFrom(
      this.calendarEntryService.assignEvent(calId, mmdd, eventId, position),
    );
    if (res.success) {
      const entries = await firstValueFrom(
        this.calendarEntryService.getEntriesForCalendar(calId),
      );
      this._entriesCache.set(calId, entries);
      this.entries.set(entries);
    } else {
      this.toast.error(
        res.error === 'insufficient_privilege'
          ? 'Votre rôle ne permet pas de modifier les affectations du calendrier.'
          : (res.error ?? 'Erreur lors de l\'assignation.'),
      );
    }
    this.dayModalSaving.set(false);
  }

  async unassignFromSlot(position: EventPosition): Promise<void> {
    const calId = this.selectedCalendarId();
    const sel   = this.selectedDay();
    if (!calId || !sel || this.dayModalSaving()) return;
    const mmdd = `${pad2(sel.month + 1)}-${pad2(sel.day)}`;
    this.dayModalSaving.set(true);
    const res = await firstValueFrom(
      this.calendarEntryService.unassignSlot(calId, mmdd, position),
    );
    if (res.success) {
      const entries = await firstValueFrom(
        this.calendarEntryService.getEntriesForCalendar(calId),
      );
      this._entriesCache.set(calId, entries);
      this.entries.set(entries);
    } else {
      this.toast.error(
        res.error === 'insufficient_privilege'
          ? 'Votre rôle ne permet pas de modifier les affectations du calendrier.'
          : (res.error ?? 'Erreur lors du retrait.'),
      );
    }
    this.dayModalSaving.set(false);
  }

  goToEvents(): void { this.router.navigate(['/evenements']); }
  goToCampaigns(): void { this.router.navigate(['/campagnes']); }

  // ── Helpers ───────────────────────────────────────
  statusBadgeClass(status: Calendar['status']): string {
    return { published: 'badge-success', draft: 'badge-warning', archived: '' }[status];
  }

  statusLabel(status: Calendar['status']): string {
    return { published: 'Publié', draft: 'Brouillon', archived: 'Archivé' }[status];
  }

  calLabel(cal: Calendar): string {
    return `${cal.year} — ${cal.name}`;
  }

  intensityBg(intensity: 0 | 1 | 2 | 3): string {
    return ['var(--bg-sunken)', 'var(--accent-2-soft)', 'var(--accent-2)', 'var(--accent)'][intensity];
  }

  pinnedCount(events: DayEvent[]): number {
    return events.filter(e => e.displayPosition !== null).length;
  }

  dayDetailHeadline(events: DayEvent[]): string {
    const pinned = events.filter(e => e.displayPosition !== null);
    if (pinned.length === 0 && events.length === 0) return 'Aucun événement pour cette date';
    if (pinned.length === 0) return `${events.length} événement(s) — aucun sélectionné pour l'affichage`;
    if (pinned.length === 1) return `« ${pinned[0].title} »`;
    return 'Une date, deux histoires';
  }

  // ── Publish workflow ──────────────────────────────
  readonly publishing = signal(false);

  readonly canPublish = computed(() => this.selectedCalendar()?.status === 'draft');

  // ── Presidency apply flow ──────────────────────────────────────────────
  /** Refresh the pending-count badge for the currently selected calendar. */
  async refreshPendingCount(): Promise<void> {
    const id = this.selectedCalendarId();
    if (!id) { this.pendingRecommendationsCount.set(0); return; }
    const count = await firstValueFrom(this.recommendationService.countPending(id));
    this.pendingRecommendationsCount.set(count);
  }

  /** Compute conflict list and open the confirm dialog. */
  async openApplyDialog(): Promise<void> {
    const id = this.selectedCalendarId();
    if (!id) return;
    if (!this.canApplyRecommendations()) return;
    const [recs, entries] = await Promise.all([
      firstValueFrom(this.recommendationService.listByCalendar(id)),
      firstValueFrom(this.calendarEntryService.getEntriesForCalendar(id)),
    ]);
    const conflicts = this.recommendationService.getConflicts(recs, entries);
    this.applyConflicts.set(conflicts);
    this.applyDialogVisible.set(true);
  }

  cancelApply(): void {
    this.applyDialogVisible.set(false);
    this.applyConflicts.set([]);
  }

  async confirmApply(): Promise<void> {
    const id = this.selectedCalendarId();
    if (!id || this.recommendationsApplying()) return;
    if (!this.canApplyRecommendations()) return;
    this.recommendationsApplying.set(true);
    const result = await firstValueFrom(this.recommendationService.applyAll(id, true));
    this.recommendationsApplying.set(false);
    this.applyDialogVisible.set(false);
    this.applyConflicts.set([]);
    if (!result.success) {
      this.toast.error(result.error ?? 'Échec de l\'application des recommandations.');
      return;
    }
    this.toast.success(`${result.applied ?? 0} recommandation(s) appliquée(s).`);
    await this.refreshPendingCount();
  }

  async publishCalendar(): Promise<void> {
    if (this.publishing()) return;
    const calId = this.selectedCalendarId();
    if (!calId) return;
    this.publishing.set(true);
    const result = await firstValueFrom(
      this.calendarService.updateCalendar(calId, { status: 'published' }),
    );
    this.publishing.set(false);
    if (result.success) {
      await this._reloadCalendars();
    }
  }

  // ── Computed views ────────────────────────────────
  readonly monthLabel = computed(() =>
    MONTHS_FR[this.selectedMonth()] + ' ' + this.selectedYear()
  );

  readonly monthDayCount = computed(() =>
    daysInMonth(this.selectedYear(), this.selectedMonth())
  );

  readonly monthCells = computed<DayCell[]>(() => {
    const year = this.selectedYear(), month = this.selectedMonth();
    const byMmdd = this.entriesByMmdd();
    const campByMmdd = this.campaignByMmdd();
    const dim = daysInMonth(year, month), offset = dowMondayFirst(year, month, 1);
    return Array.from({ length: 42 }, (_, i) => {
      const d = i - offset + 1;
      if (d < 1 || d > dim) return { d: null, isToday: false, totalEvents: 0, pinnedCount: 0, title: null, ad: false };
      const isToday = d === this.todayDate && month === this.currentMonth && year === this.currentYear;
      const mmdd = `${pad2(month + 1)}-${pad2(d)}`;
      const dayEntries = byMmdd.get(mmdd) ?? [];
      const pos1 = dayEntries.find(e => e.position === 1);
      const pos2 = dayEntries.find(e => e.position === 2);
      const pinnedCount = ((pos1 ? 1 : 0) + (pos2 ? 1 : 0)) as 0 | 1 | 2;
      return { d, isToday, totalEvents: dayEntries.length, pinnedCount, title: pos1?.event.title ?? dayEntries[0]?.event.title ?? null, ad: campByMmdd.has(mmdd) };
    });
  });

  readonly yearHeatmap = computed<HeatmapMonth[]>(() => {
    const year = this.selectedYear();
    const byMmdd = this.entriesByMmdd();
    return MONTHS_FR.map((label, mi) => {
      const dim = daysInMonth(year, mi), offset = dowMondayFirst(year, mi, 1);
      const blanks: HeatmapCell[] = Array.from({ length: offset }, () => ({ d: null, intensity: 0 as 0 }));
      const days: HeatmapCell[] = Array.from({ length: dim }, (_, i) => {
        const d = i + 1;
        const cnt = (byMmdd.get(`${pad2(mi + 1)}-${pad2(d)}`) ?? []).length;
        const intensity = cnt === 0 ? 0 : cnt === 1 ? 1 : cnt === 2 ? 2 : 3;
        return { d, intensity: intensity as 0 | 1 | 2 | 3 };
      });
      const filled = days.filter(c => c.intensity > 0).length;
      return { label, mi, cells: [...blanks, ...days], pct: Math.round((filled / dim) * 100), dow: DOW_SHORT };
    });
  });

  readonly listRows = computed<DateRow[]>(() => {
    const year = this.selectedYear();
    const byMmdd = this.entriesByMmdd();
    const campByMmdd = this.campaignByMmdd();
    const rows: DateRow[] = [];
    for (let month = 0; month < 12; month++) {
      const dim = daysInMonth(year, month);
      for (let d = 1; d <= dim; d++) {
        const mmdd = `${pad2(month + 1)}-${pad2(d)}`;
        const dayEntries = byMmdd.get(mmdd) ?? [];
        const pos1 = dayEntries.find(e => e.position === 1);
        const pos2 = dayEntries.find(e => e.position === 2);
        const pinnedCount = ((pos1 ? 1 : 0) + (pos2 ? 1 : 0)) as 0 | 1 | 2;
        rows.push({
          day: d,
          month,
          date: `${pad2(d)} ${MONTHS_FR_SHORT[month]}`,
          dow: DOW_LONG[dowMondayFirst(year, month, d)],
          totalEvents: dayEntries.length,
          pinnedCount,
          title: pos1?.event.title ?? dayEntries[0]?.event.title ?? null,
          sub: dayEntries.length > 1 ? `+ ${dayEntries[dayEntries.length - 1].event.title}` : null,
          ad: campByMmdd.get(mmdd) ?? '—',
          status: dayEntries.length === 0 ? 'empty' : pinnedCount > 0 ? 'published' : 'draft',
        });
      }
    }
    return rows;
  });

  readonly filteredRows = computed<DateRow[]>(() => {
    const filter = this.activeFilter();
    const rows = this.listRows();
    switch (filter) {
      case 'full':         return rows.filter(r => r.pinnedCount === 2);
      case 'partial':      return rows.filter(r => r.pinnedCount === 1);
      case 'empty':        return rows.filter(r => r.totalEvents === 0);
      case 'has_campaign': return rows.filter(r => r.ad !== '—');
      default:             return rows;
    }
  });

  readonly paginatedRows = computed<DateRow[]>(() => {
    const page = this.currentPage();
    return this.filteredRows().slice(page * this.pageSize, (page + 1) * this.pageSize);
  });

  // ── Nouveau calendrier modal ──────────────────────
  readonly showNewCalModal = signal(false);
  readonly newCalYear      = signal(0);
  readonly newCalName      = signal('');
  readonly newCalStatus    = signal<'draft' | 'published'>('draft');
  readonly newCalSaving    = signal(false);
  readonly newCalError     = signal<string | null>(null);

  openNewCalModal(): void {
    const avail = this.availableYears();
    this.newCalYear.set(avail[0] ?? this.currentYear + 1);
    this.newCalName.set('');
    this.newCalStatus.set('draft');
    this.newCalError.set(null);
    this.showNewCalModal.set(true);
  }

  closeNewCalModal(): void { this.showNewCalModal.set(false); }

  async createCalendar(): Promise<void> {
    if (this.newCalSaving()) return;
    const year = this.newCalYear();
    const name = this.newCalName().trim() || `Calendrier ${year}`;
    this.newCalSaving.set(true);
    this.newCalError.set(null);
    const result = await firstValueFrom(
      this.calendarService.createCalendar(year, name, this.newCalStatus()),
    );
    this.newCalSaving.set(false);
    if (result.success && result.id) {
      this.closeNewCalModal();
      await this._reloadCalendars();
      this.selectCalendar(result.id);
    } else {
      this.newCalError.set(result.error ?? 'Erreur lors de la création');
    }
  }

  // ── Dupliquer modal ───────────────────────────────
  readonly showDupModal        = signal(false);
  readonly dupSourceId         = signal('');
  readonly dupIncludeEvents    = signal(true);
  readonly dupTargetType       = signal<'existing' | 'new'>('existing');
  readonly dupTargetId         = signal('');
  readonly dupNewYear          = signal(0);
  readonly dupNewName          = signal('');
  readonly dupResultCalId      = signal('');
  readonly dupStatus           = signal<'idle' | 'done'>('idle');

  readonly dupSourceCalendar = computed(() =>
    this.calendars().find(c => c.id === this.dupSourceId())
  );

  readonly dupTargetCalendars = computed(() =>
    this.sortedCalendars().filter(c => c.id !== this.dupSourceId() && c.status !== 'archived')
  );

  openDupModal(): void {
    const selId = this.selectedCalendarId();
    this.dupSourceId.set(selId);
    this.dupIncludeEvents.set(true);
    this.dupTargetType.set('existing');
    const targets = this.sortedCalendars().filter(c => c.id !== selId && c.status !== 'archived');
    this.dupTargetId.set(targets[0]?.id ?? '');
    const avail = this.availableYears();
    this.dupNewYear.set(avail[0] ?? this.currentYear + 1);
    this.dupNewName.set('');
    this.dupResultCalId.set('');
    this.dupStatus.set('idle');
    this.showDupModal.set(true);
  }

  closeDupModal(): void { this.showDupModal.set(false); }

  goToDupResult(): void {
    const id = this.dupResultCalId();
    this.closeDupModal();
    if (id) this.selectCalendar(id);
  }

  confirmDuplicate(): void {
    const src = this.dupSourceCalendar();
    if (!src) return;
    const evCount = this.dupIncludeEvents() ? src.eventCount : 0;
    if (this.dupTargetType() === 'new') {
      const year = this.dupNewYear(), name = this.dupNewName().trim() || `Calendrier ${year}`;
      const newId = `cal-${Date.now()}`;
      this.calendars.update(cals => [...cals, {
        id: newId, year, name, status: 'draft' as const,
        createdBy: null, publishedAt: null,
        eventCount: evCount,
        fillPct: this.dupIncludeEvents() ? src.fillPct : 0,
      }]);
      this.dupResultCalId.set(newId);
    } else {
      const targetId = this.dupTargetId();
      this.calendars.update(cals => cals.map(c =>
        c.id !== targetId ? c : {
          ...c, eventCount: c.eventCount + evCount,
          fillPct: this.dupIncludeEvents()
            ? Math.min(100, Math.round((c.fillPct + src.fillPct) / 2)) : c.fillPct,
        }
      ));
      this.dupResultCalId.set(targetId);
    }
    this.dupStatus.set('done');
  }
}
