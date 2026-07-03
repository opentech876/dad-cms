import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CalendarService, CalendarSummary } from '../../core/calendar/calendar.service';
import { CalendarEntryService, CalendarEntryWithEvent } from '../../core/calendar/calendar-entry.service';
import { EventService } from '../../core/events/event.service';
import { RecommendationService, PresidencyRecommendationWithEvent } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';
import { Event as HistoricalEvent } from '../../models';
import { MONTHS_FR_LONG_CAP, formatDayMonthLong, normalizeSearchable } from '../../core/utils/date.utils';
import { compressImage } from '../../core/utils/image.utils';

interface DayCell {
  day: number;        // 1..31
  mmdd: string;       // 'MM-DD'
}

interface MonthSection {
  index: number;      // 0..11
  name: string;
  days: DayCell[];
}

type CuratorTab = 'proposer' | 'bibliotheque';
type LibraryFilter = 'tous' | 'curateur' | 'non-assignes';

const pad2 = (n: number) => String(n).padStart(2, '0');

@Component({
  selector: 'app-recommandations',
  standalone: true,
  imports: [CommonModule, TuiIcon],
  templateUrl: './recommandations.component.html',
  styleUrl: './recommandations.component.scss',
})
export class RecommandationsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly calendarService = inject(CalendarService);
  private readonly calendarEntryService = inject(CalendarEntryService);
  private readonly eventService = inject(EventService);
  private readonly recommendationService = inject(RecommendationService);
  private readonly toast = inject(ToastService);

  /** Curateur + owner: full management (tabs, create events, edit slots).
   *  Mirrors the RLS WITH CHECK on presidency_recommendations. */
  readonly canManageRecommendations = toSignal(
    this.authService.hasRoleAtLeast('presidence'),
    { initialValue: false },
  );

  /** Chef d'équipe + owner: can apply recommendations (per-item or all).
   *  Mirrors the SECURITY DEFINER gate on both apply RPCs. */
  readonly canApply = toSignal(
    this.authService.hasRoleAtLeast('chef_equipe'),
    { initialValue: false },
  );

  readonly calendars = signal<CalendarSummary[]>([]);
  readonly selectedCalendarId = signal<string>('');
  readonly loading = signal(true);

  readonly recommendations = signal<PresidencyRecommendationWithEvent[]>([]);
  readonly existingEntries = signal<CalendarEntryWithEvent[]>([]);

  // ── Curator tabs ─────────────────────────────────────────────────────
  readonly activeTab = signal<CuratorTab>('proposer');

  // ── Per-day editor (Proposer tab modal) ──────────────────────────────
  readonly editorOpen = signal(false);
  readonly editorMmdd = signal('');
  readonly editorLibrary = signal<HistoricalEvent[]>([]);
  readonly editorPos1 = signal<string | null>(null);
  readonly editorPos2 = signal<string | null>(null);
  readonly editorSaving = signal(false);
  readonly editorLoading = signal(false);

  // Expanded months in the accordion. Default: current month + Jan.
  readonly expandedMonths = signal<Set<number>>(new Set([0, new Date().getMonth()]));

  // ── Bibliothèque tab ─────────────────────────────────────────────────
  readonly libraryEvents  = signal<HistoricalEvent[]>([]);
  readonly libraryLoading = signal(false);
  readonly librarySearch  = signal('');
  readonly libraryFilter  = signal<LibraryFilter>('tous');

  /** Event ids currently assigned in the selected calendar. */
  readonly assignedEventIds = computed<Set<string>>(() =>
    new Set(this.existingEntries().map(e => e.event_id)),
  );

  /** Event ids referenced by a recommendation (pending or applied). */
  readonly recommendedEventIds = computed<Set<string>>(() =>
    new Set(this.recommendations().map(r => r.event_id)),
  );

  readonly filteredLibrary = computed<HistoricalEvent[]>(() => {
    const search = normalizeSearchable(this.librarySearch());
    const filter = this.libraryFilter();
    const assigned = this.assignedEventIds();
    return this.libraryEvents().filter(e => {
      if (filter === 'curateur' && e.origin !== 'curateur') return false;
      if (filter === 'non-assignes' && assigned.has(e.id)) return false;
      if (!search) return true;
      return normalizeSearchable(`${e.title} ${e.event_date}`).includes(search);
    });
  });

  // ── Create-event modal (Bibliothèque tab) ────────────────────────────
  readonly createOpen         = signal(false);
  readonly createTitle        = signal('');
  readonly createDate         = signal('');
  readonly createDescription  = signal('');
  readonly createImageFile    = signal<File | null>(null);
  readonly createImagePreview = signal<string | null>(null);
  readonly createSaving       = signal(false);
  readonly createError        = signal<string | null>(null);

  // ── Pending list (main view for non-curators) ────────────────────────
  readonly pendingRecs = computed(() =>
    this.recommendations().filter(r => r.status === 'pending'),
  );
  readonly appliedRecs = computed(() =>
    this.recommendations().filter(r => r.status === 'applied'),
  );
  readonly showApplied = signal(false);
  /** id of the recommendation whose apply is in flight (locks its button). */
  readonly applyingId  = signal<string | null>(null);
  readonly applyingAll = signal(false);

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

  // ── Tabs ──────────────────────────────────────────────────────────────

  async setTab(tab: CuratorTab): Promise<void> {
    this.activeTab.set(tab);
    // Lazy-load the full library the first time the Bibliothèque opens.
    if (tab === 'bibliotheque' && this.libraryEvents().length === 0) {
      await this.reloadLibrary();
    }
  }

  async reloadLibrary(): Promise<void> {
    this.libraryLoading.set(true);
    try {
      const events = await firstValueFrom(this.eventService.listEvents());
      this.libraryEvents.set(events);
    } finally {
      this.libraryLoading.set(false);
    }
  }

  // ── Proposer tab (month grid + day editor) ────────────────────────────

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
    if (!this.canManageRecommendations()) return;
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

  /** "15 août" style label for a recommendation row in the pending list. */
  recDayLabel(rec: PresidencyRecommendationWithEvent): string {
    const year = this.selectedCalendar()?.year ?? new Date().getFullYear();
    return formatDayMonthLong(`${year}-${rec.mmdd}`) || rec.mmdd;
  }

  positionLabel(position: 1 | 2): string {
    return position === 1 ? 'Événement National' : 'Date Internationale';
  }

  /** Title of the event currently occupying the recommendation's slot, when
   *  it differs — the apply will REPLACE it, so the row warns about it. */
  conflictTitle(rec: PresidencyRecommendationWithEvent): string | null {
    const existing = this.existingEntries().find(
      e => e.mmdd === rec.mmdd && e.position === rec.position,
    );
    if (!existing || existing.event_id === rec.event_id) return null;
    return existing.event?.title ?? '—';
  }

  imageUrl(event: HistoricalEvent | null): string | null {
    if (!event?.image_path) return null;
    return this.eventService.getImageUrl(event.image_path);
  }

  // ── Apply (chef_equipe + owner) ───────────────────────────────────────

  async applySingle(rec: PresidencyRecommendationWithEvent): Promise<void> {
    if (!this.canApply() || this.applyingId() || this.applyingAll()) return;
    this.applyingId.set(rec.id);
    const result = await firstValueFrom(this.recommendationService.applySingle(rec.id));
    this.applyingId.set(null);
    if (!result.success) {
      this.toast.error(result.error ?? "Échec de l'application de la recommandation.");
      return;
    }
    this.toast.success(`Recommandation du ${this.recDayLabel(rec)} appliquée.`);
    await this.selectCalendar(this.selectedCalendarId());
  }

  async applyAllPending(): Promise<void> {
    if (!this.canApply() || this.applyingAll() || this.pendingRecs().length === 0) return;
    this.applyingAll.set(true);
    const result = await firstValueFrom(
      this.recommendationService.applyAll(this.selectedCalendarId(), true),
    );
    this.applyingAll.set(false);
    if (!result.success) {
      this.toast.error(result.error ?? "Échec de l'application des recommandations.");
      return;
    }
    this.toast.success(`${result.applied ?? 0} recommandation(s) appliquée(s).`);
    await this.selectCalendar(this.selectedCalendarId());
  }

  // ── Create event (Curateur, Bibliothèque tab) ─────────────────────────

  openCreateModal(): void {
    if (!this.canManageRecommendations()) return;
    this.createTitle.set('');
    this.createDate.set('');
    this.createDescription.set('');
    this.createImageFile.set(null);
    const prev = this.createImagePreview();
    if (prev) URL.revokeObjectURL(prev);
    this.createImagePreview.set(null);
    this.createError.set(null);
    this.createOpen.set(true);
  }

  closeCreateModal(): void {
    if (this.createSaving()) return;
    this.createOpen.set(false);
  }

  onCreateImageChange(ev: globalThis.Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.createImageFile.set(file);
    const prev = this.createImagePreview();
    if (prev) URL.revokeObjectURL(prev);
    this.createImagePreview.set(URL.createObjectURL(file));
  }

  async submitCreate(): Promise<void> {
    if (this.createSaving()) return;
    const title = this.createTitle().trim();
    const date  = this.createDate();
    if (!title || !date) {
      this.createError.set('Le titre et la date historique sont obligatoires.');
      return;
    }

    this.createSaving.set(true);
    this.createError.set(null);
    try {
      const created = await firstValueFrom(this.eventService.createEvent({
        event_date: date,
        title,
        description: this.createDescription().trim() || undefined,
        origin: 'curateur',
      }));
      if (!created.success || !created.id) {
        this.createError.set(created.error ?? "Impossible de créer l'événement.");
        return;
      }

      // Image is optional; a failed upload doesn't undo the event —
      // the row is the source of truth, the image can be retried from
      // the library list later.
      const file = this.createImageFile();
      if (file) {
        const compressed = await compressImage(file);
        const upload = await firstValueFrom(this.eventService.uploadImage(created.id, compressed));
        if (upload.path) {
          await firstValueFrom(this.eventService.updateEvent(created.id, { image_path: upload.path }));
        } else {
          this.toast.warning('Événement créé, mais le téléversement de l\'image a échoué. Réessayez depuis la bibliothèque.');
        }
      }

      this.toast.success(`« ${title} » ajouté à la bibliothèque (Réserve).`);
      this.createOpen.set(false);
      await this.reloadLibrary();
    } finally {
      this.createSaving.set(false);
    }
  }
}
