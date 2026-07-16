import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { CalendarEntryWithEvent } from '../../core/calendar/calendar-entry.service';
import { EventService } from '../../core/events/event.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';
import { Event as HistoricalEvent } from '../../models';
import { formatDayMonthLong, formatWeekdayLong } from '../../core/utils/date.utils';
import { compressImage } from '../../core/utils/image.utils';
import { CurationStore } from './curation-store.service';
import { artFor, positionLabel } from './curation.utils';

type SourceTab = 'create' | 'reuse';

/**
 * "Proposer un événement" modal from the Espace Curation design:
 * left panel shows what the date already holds (current slots + library
 * suggestions), right panel builds the proposal (new event or reuse) and
 * pins it to a position. Submitting writes one pending recommendation.
 */
@Component({
  selector: 'app-propose-modal',
  standalone: true,
  imports: [TuiIcon],
  templateUrl: './propose-modal.component.html',
})
export class ProposeModalComponent {
  private readonly eventService = inject(EventService);
  private readonly recommendationService = inject(RecommendationService);
  private readonly toast = inject(ToastService);
  readonly store = inject(CurationStore);

  readonly mmdd = input.required<string>();

  readonly closed = output<void>();
  readonly saved = output<void>();

  readonly tab = signal<SourceTab>('create');
  readonly position = signal<1 | 2 | null>(null);
  readonly pickedLibId = signal<string | null>(null);

  readonly title = signal('');
  readonly yearStr = signal('');
  readonly description = signal('');
  readonly imageFile = signal<File | null>(null);
  readonly imagePreview = signal<string | null>(null);

  readonly library = signal<HistoricalEvent[]>([]);
  readonly libraryLoading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    // Reload the day's library whenever the target date changes.
    effect(() => {
      const mmdd = this.mmdd();
      if (mmdd) void this.loadLibrary(mmdd);
    });
  }

  private async loadLibrary(mmdd: string): Promise<void> {
    this.libraryLoading.set(true);
    try {
      this.library.set(await firstValueFrom(this.eventService.listEventsByMmdd(mmdd)));
    } catch {
      this.library.set([]);
    } finally {
      this.libraryLoading.set(false);
    }
  }

  // ── Day context ──────────────────────────────────────────────────────────

  readonly dayEntries = computed<CalendarEntryWithEvent[]>(
    () => this.store.entriesByMmdd().get(this.mmdd()) ?? [],
  );
  readonly currentMain = computed(() => this.dayEntries().find((e) => e.position === 1) ?? null);
  readonly currentAlso = computed(() => this.dayEntries().find((e) => e.position === 2) ?? null);

  /** Library events for this date not already on the calendar day and not
   *  already in one of my recommendations for it — the DB forbids the same
   *  event twice on one day. */
  readonly suggestions = computed<HistoricalEvent[]>(() => {
    const used = new Set(this.dayEntries().map((e) => e.event_id));
    for (const rec of this.store.myRecsByMmdd().get(this.mmdd()) ?? []) used.add(rec.event_id);
    return this.library().filter((e) => !used.has(e.id));
  });

  readonly dayLabel = computed(
    () => formatDayMonthLong(`${this.store.calendarYear()}-${this.mmdd()}`) || this.mmdd(),
  );
  readonly weekdayLabel = computed(() =>
    formatWeekdayLong(new Date(`${this.store.calendarYear()}-${this.mmdd()}T00:00:00`)),
  );

  readonly pickedLibEvent = computed<HistoricalEvent | null>(
    () => this.library().find((e) => e.id === this.pickedLibId()) ?? null,
  );

  readonly canSubmit = computed(() => {
    if (!this.position() || this.saving()) return false;
    if (this.tab() === 'reuse') return this.pickedLibId() !== null;
    return (
      this.title().trim().length > 0 &&
      /^\d{3,4}$/.test(this.yearStr().trim()) &&
      this.imageFile() !== null
    );
  });

  replaceTitleFor(position: 1 | 2): string | null {
    const occupant = position === 1 ? this.currentMain() : this.currentAlso();
    return occupant?.event?.title ?? null;
  }

  positionLabel(position: 1 | 2): string {
    return positionLabel(position);
  }

  artFor(seed: string): string {
    return artFor(seed);
  }

  imageUrl(event: HistoricalEvent | null | undefined): string | null {
    if (!event?.image_path) return null;
    return this.eventService.getImageUrl(event.image_path);
  }

  eventYear(event: HistoricalEvent | null | undefined): string {
    return event?.event_date?.slice(0, 4) ?? '';
  }

  // ── Interactions ─────────────────────────────────────────────────────────

  setTab(tab: SourceTab): void {
    this.tab.set(tab);
    this.error.set(null);
  }

  pickLibrary(id: string): void {
    this.tab.set('reuse');
    this.pickedLibId.set(id);
  }

  clearPicked(): void {
    this.pickedLibId.set(null);
  }

  setPosition(position: 1 | 2): void {
    this.position.set(position);
  }

  onImageChange(ev: globalThis.Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.imageFile.set(file);
    const prev = this.imagePreview();
    if (prev) URL.revokeObjectURL(prev);
    this.imagePreview.set(URL.createObjectURL(file));
  }

  close(): void {
    if (this.saving()) return;
    const prev = this.imagePreview();
    if (prev) URL.revokeObjectURL(prev);
    this.closed.emit();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const calId = this.store.selectedCalendarId();
    const position = this.position();
    if (!calId || !position) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      let eventId = this.pickedLibId();

      if (this.tab() === 'create') {
        const created = await firstValueFrom(
          this.eventService.createEvent({
            event_date: `${this.yearStr().trim().padStart(4, '0')}-${this.mmdd()}`,
            title: this.title().trim(),
            description: this.description().trim() || undefined,
            origin: 'curateur',
          }),
        );
        if (!created.success || !created.id) {
          this.error.set(created.error ?? "Impossible de créer l'événement.");
          return;
        }
        eventId = created.id;

        const file = this.imageFile();
        if (file) {
          const compressed = await compressImage(file);
          const upload = await firstValueFrom(
            this.eventService.uploadImage(created.id, compressed),
          );
          if (upload.path) {
            await firstValueFrom(
              this.eventService.updateEvent(created.id, { image_path: upload.path }),
            );
          } else {
            this.toast.warning(
              "Événement créé, mais le téléversement de l'image a échoué. Réessayez depuis « Mes événements ».",
            );
          }
        }
      }

      if (!eventId) return;
      // The DB forbids one event on both positions of the same day — catch
      // it here with a readable message instead of a failed round-trip.
      if (this.store.hasSameEventElsewhereOnDay(this.mmdd(), position, eventId)) {
        this.error.set(
          "Cet événement occupe déjà l'autre position de cette date — choisissez un autre événement ou une autre position.",
        );
        return;
      }
      const res = await firstValueFrom(
        this.recommendationService.upsertSlot(calId, this.mmdd(), position, eventId),
      );
      if (!res.success) {
        this.error.set(res.error ?? "Erreur lors de l'envoi de la recommandation.");
        return;
      }
      this.toast.success('Recommandation soumise — en attente de publication.');
      this.saved.emit();
    } finally {
      this.saving.set(false);
    }
  }
}
