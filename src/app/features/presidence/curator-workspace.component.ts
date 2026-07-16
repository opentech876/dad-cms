import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { CalendarEntryWithEvent } from '../../core/calendar/calendar-entry.service';
import { EventService } from '../../core/events/event.service';
import {
  RecommendationService,
  PresidencyRecommendationWithEvent,
} from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';
import { Event as HistoricalEvent } from '../../models';
import {
  MONTHS_FR_LONG_CAP,
  formatDayMonthLong,
  normalizeSearchable,
} from '../../core/utils/date.utils';
import { compressImage } from '../../core/utils/image.utils';

interface DayCell {
  day: number;
  mmdd: string;
}
interface MonthSection {
  index: number;
  name: string;
  days: DayCell[];
}
type CuratorTab = 'proposer' | 'bibliotheque';
type LibraryFilter = 'tous' | 'curateur' | 'non-assignes';

const pad2 = (n: number) => String(n).padStart(2, '0');

const MONTH_SECTIONS: MonthSection[] = MONTHS_FR_LONG_CAP.map((name, idx) => {
  const lastDay = new Date(2024, idx + 1, 0).getDate();
  const days: DayCell[] = [];
  for (let d = 1; d <= lastDay; d++) days.push({ day: d, mmdd: `${pad2(idx + 1)}-${pad2(d)}` });
  return { index: idx, name, days };
});

@Component({
  selector: 'app-curator-workspace',
  standalone: true,
  imports: [CommonModule, TuiIcon],
  templateUrl: './curator-workspace.component.html',
})
export class CuratorWorkspaceComponent {
  private readonly recommendationService = inject(RecommendationService);
  private readonly eventService = inject(EventService);
  private readonly toast = inject(ToastService);

  readonly recommendations = input.required<PresidencyRecommendationWithEvent[]>();
  readonly existingEntries = input.required<CalendarEntryWithEvent[]>();
  readonly calendarId = input.required<string>();
  readonly calendarYear = input<number>(new Date().getFullYear());

  readonly refreshNeeded = output<void>();

  readonly months = MONTH_SECTIONS;

  // ── Tabs ──────────────────────────────────────────────────────────────
  readonly activeTab = signal<CuratorTab>('proposer');

  // ── Proposer tab — accordion + day editor ─────────────────────────────
  readonly expandedMonths = signal<Set<number>>(new Set([0, new Date().getMonth()]));
  readonly editorOpen = signal(false);
  readonly editorMmdd = signal('');
  readonly editorLibrary = signal<HistoricalEvent[]>([]);
  readonly editorPos1 = signal<string | null>(null);
  readonly editorPos2 = signal<string | null>(null);
  readonly editorSaving = signal(false);
  readonly editorLoading = signal(false);

  // ── Bibliothèque tab ──────────────────────────────────────────────────
  readonly libraryEvents = signal<HistoricalEvent[]>([]);
  readonly libraryLoading = signal(false);
  readonly librarySearch = signal('');
  readonly libraryFilter = signal<LibraryFilter>('tous');

  readonly assignedEventIds = computed<Set<string>>(
    () => new Set(this.existingEntries().map((e) => e.event_id)),
  );
  readonly recommendedEventIds = computed<Set<string>>(
    () => new Set(this.recommendations().map((r) => r.event_id)),
  );

  readonly filteredLibrary = computed<HistoricalEvent[]>(() => {
    const search = normalizeSearchable(this.librarySearch());
    const filter = this.libraryFilter();
    const assigned = this.assignedEventIds();
    return this.libraryEvents().filter((e) => {
      if (filter === 'curateur' && e.origin !== 'curateur') return false;
      if (filter === 'non-assignes' && assigned.has(e.id)) return false;
      if (!search) return true;
      return normalizeSearchable(`${e.title} ${e.event_date}`).includes(search);
    });
  });

  // ── Create-event modal ───────────────────────────────────────────────
  readonly createOpen = signal(false);
  readonly createTitle = signal('');
  readonly createDate = signal('');
  readonly createDescription = signal('');
  readonly createImageFile = signal<File | null>(null);
  readonly createImagePreview = signal<string | null>(null);
  readonly createSaving = signal(false);
  readonly createError = signal<string | null>(null);

  // ── Computed lookup maps ─────────────────────────────────────────────
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

  readonly imageUrlMap = computed<Map<string, string>>(() => {
    const m = new Map<string, string>();
    const add = (e: HistoricalEvent | null | undefined) => {
      if (e?.image_path && !m.has(e.id)) m.set(e.id, this.eventService.getImageUrl(e.image_path));
    };
    this.libraryEvents().forEach(add);
    this.editorLibrary().forEach(add);
    this.recommendations().forEach((r) => add((r as any).event ?? null));
    return m;
  });

  // ── Tabs ──────────────────────────────────────────────────────────────

  async setTab(tab: CuratorTab): Promise<void> {
    this.activeTab.set(tab);
    if (tab === 'bibliotheque' && this.libraryEvents().length === 0) await this.reloadLibrary();
  }

  async reloadLibrary(): Promise<void> {
    this.libraryLoading.set(true);
    try {
      this.libraryEvents.set(await firstValueFrom(this.eventService.listEvents()));
    } finally {
      this.libraryLoading.set(false);
    }
  }

  // ── Month accordion ───────────────────────────────────────────────────

  toggleMonth(idx: number): void {
    this.expandedMonths.update((s) => {
      const next = new Set(s);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  isExpanded(idx: number): boolean {
    return this.expandedMonths().has(idx);
  }

  hasRecommendation(mmdd: string, position: 1 | 2): boolean {
    return (this.recsByMmdd().get(mmdd) ?? []).some((r) => r.position === position);
  }

  dayState(mmdd: string): 'full' | 'partial' | 'empty' {
    const recs = this.recsByMmdd().get(mmdd) ?? [];
    if (recs.length >= 2) return 'full';
    if (recs.length === 1) return 'partial';
    return 'empty';
  }

  // ── Day editor ────────────────────────────────────────────────────────

  async openDayEditor(mmdd: string): Promise<void> {
    this.editorMmdd.set(mmdd);
    this.editorOpen.set(true);
    this.editorLoading.set(true);
    const recs = this.recsByMmdd().get(mmdd) ?? [];
    this.editorPos1.set(recs.find((r) => r.position === 1)?.event_id ?? null);
    this.editorPos2.set(recs.find((r) => r.position === 2)?.event_id ?? null);
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
    const calId = this.calendarId();
    if (!calId) return;
    const mmdd = this.editorMmdd();
    this.editorSaving.set(true);

    const pos1 = this.editorPos1();
    const pos2 = this.editorPos2();
    // The DB forbids the same event on both positions of one day
    // (uq_calendar_entry_one_position_per_event at apply time).
    if (pos1 && pos1 === pos2) {
      this.editorSaving.set(false);
      this.toast.error('Le même événement ne peut pas occuper les deux positions du même jour.');
      return;
    }
    const ops: Promise<{ success: boolean; error?: string }>[] = [
      firstValueFrom(
        pos1
          ? this.recommendationService.upsertSlot(calId, mmdd, 1, pos1)
          : this.recommendationService.removeSlot(calId, mmdd, 1),
      ),
      firstValueFrom(
        pos2
          ? this.recommendationService.upsertSlot(calId, mmdd, 2, pos2)
          : this.recommendationService.removeSlot(calId, mmdd, 2),
      ),
    ];

    const results = await Promise.all(ops);
    this.editorSaving.set(false);
    const failed = results.find((r) => !r.success);
    if (failed) {
      this.toast.error(failed.error ?? "Erreur lors de l'enregistrement de la recommandation.");
      return;
    }
    this.toast.success('Recommandation enregistrée.');
    this.closeDayEditor();
    this.refreshNeeded.emit();
  }

  editorDayLabel(): string {
    return formatDayMonthLong(`${this.calendarYear()}-${this.editorMmdd()}`) || this.editorMmdd();
  }

  imageUrl(event: HistoricalEvent | null): string | null {
    if (!event?.image_path) return null;
    return this.imageUrlMap().get(event.id) ?? null;
  }

  // ── Create event ──────────────────────────────────────────────────────

  openCreateModal(): void {
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
    const date = this.createDate();
    if (!title || !date) {
      this.createError.set('Le titre et la date historique sont obligatoires.');
      return;
    }
    this.createSaving.set(true);
    this.createError.set(null);
    try {
      const created = await firstValueFrom(
        this.eventService.createEvent({
          event_date: date,
          title,
          description: this.createDescription().trim() || undefined,
          origin: 'curateur',
        }),
      );
      if (!created.success || !created.id) {
        this.createError.set(created.error ?? "Impossible de créer l'événement.");
        return;
      }
      const file = this.createImageFile();
      if (file) {
        const compressed = await compressImage(file);
        const upload = await firstValueFrom(this.eventService.uploadImage(created.id, compressed));
        if (upload.path) {
          await firstValueFrom(
            this.eventService.updateEvent(created.id, { image_path: upload.path }),
          );
        } else {
          this.toast.warning(
            "Événement créé, mais le téléversement de l'image a échoué. Réessayez depuis la bibliothèque.",
          );
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
