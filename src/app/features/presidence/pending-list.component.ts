import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { CalendarEntryWithEvent } from '../../core/calendar/calendar-entry.service';
import { EventService } from '../../core/events/event.service';
import { RecommendationService, PresidencyRecommendationWithEvent } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';
import { formatDayMonthLong } from '../../core/utils/date.utils';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pending-list',
  standalone: true,
  imports: [CommonModule, TuiIcon],
  templateUrl: './pending-list.component.html',
})
export class PendingListComponent {
  private readonly recommendationService = inject(RecommendationService);
  private readonly eventService          = inject(EventService);
  private readonly toast                 = inject(ToastService);

  readonly recommendations  = input.required<PresidencyRecommendationWithEvent[]>();
  readonly existingEntries  = input.required<CalendarEntryWithEvent[]>();
  readonly canApply         = input.required<boolean>();
  readonly calendarId       = input.required<string>();
  readonly calendarYear     = input<number>(new Date().getFullYear());
  readonly loading          = input<boolean>(false);

  readonly refreshNeeded = output<void>();

  readonly showApplied  = signal(false);
  readonly applyingId   = signal<string | null>(null);
  readonly applyingAll  = signal(false);

  readonly pendingRecs = computed(() =>
    this.recommendations().filter(r => r.status === 'pending'),
  );
  readonly appliedRecs = computed(() =>
    this.recommendations().filter(r => r.status === 'applied'),
  );

  readonly conflictsByKey = computed<Map<string, CalendarEntryWithEvent>>(() => {
    const m = new Map<string, CalendarEntryWithEvent>();
    for (const e of this.existingEntries()) m.set(`${e.mmdd}-${e.position}`, e);
    return m;
  });

  readonly imageUrlMap = computed<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const r of this.recommendations()) {
      const ev = (r as any).event;
      if (ev?.image_path && !m.has(r.event_id)) {
        m.set(r.event_id, this.eventService.getImageUrl(ev.image_path));
      }
    }
    return m;
  });

  recDayLabel(rec: PresidencyRecommendationWithEvent): string {
    return formatDayMonthLong(`${this.calendarYear()}-${rec.mmdd}`) || rec.mmdd;
  }

  positionLabel(position: 1 | 2): string {
    return position === 1 ? 'Événement National' : 'Date Internationale';
  }

  conflictTitle(rec: PresidencyRecommendationWithEvent): string | null {
    const existing = this.conflictsByKey().get(`${rec.mmdd}-${rec.position}`);
    if (!existing || existing.event_id === rec.event_id) return null;
    return existing.event?.title ?? '—';
  }

  imageUrl(event: any): string | null {
    if (!event?.image_path) return null;
    return this.imageUrlMap().get(event.id) ?? null;
  }

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
    this.refreshNeeded.emit();
  }

  async applyAllPending(): Promise<void> {
    if (!this.canApply() || this.applyingAll() || this.pendingRecs().length === 0) return;
    this.applyingAll.set(true);
    const result = await firstValueFrom(
      this.recommendationService.applyAll(this.calendarId(), true),
    );
    this.applyingAll.set(false);
    if (!result.success) {
      this.toast.error(result.error ?? "Échec de l'application des recommandations.");
      return;
    }
    this.toast.success(`${result.applied ?? 0} recommandation(s) appliquée(s).`);
    this.refreshNeeded.emit();
  }
}
