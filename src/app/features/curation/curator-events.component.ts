import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { EventService } from '../../core/events/event.service';
import { Event as HistoricalEvent } from '../../models';
import { normalizeSearchable } from '../../core/utils/date.utils';
import { CurationStore } from './curation-store.service';
import { artFor } from './curation.utils';

/** "Mes événements" — the shared-library events the curator authored,
 *  as the design specifies: the existing library surface filtered to her
 *  own additions, with a path into recommending them. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-curator-events',
  standalone: true,
  imports: [RouterLink, TuiIcon],
  templateUrl: './curator-events.component.html',
})
export class CuratorEventsComponent implements OnInit {
  readonly store = inject(CurationStore);
  private readonly eventService = inject(EventService);

  readonly search = signal('');

  readonly assignedEventIds = computed<Set<string>>(
    () => new Set(this.store.entries().map((e) => e.event_id)),
  );
  readonly recommendedEventIds = computed<Set<string>>(
    () => new Set(this.store.myRecs().map((r) => r.event_id)),
  );

  readonly filtered = computed<HistoricalEvent[]>(() => {
    const q = normalizeSearchable(this.search());
    return this.store
      .myEvents()
      .filter((e) => !q || normalizeSearchable(`${e.title} ${e.event_date}`).includes(q));
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.load(), this.store.loadMyEvents()]);
  }

  artFor(seed: string): string {
    return artFor(seed);
  }

  imageUrl(event: HistoricalEvent): string | null {
    return event.image_path ? this.eventService.getImageUrl(event.image_path) : null;
  }

  eventYear(event: HistoricalEvent): string {
    return event.event_date?.slice(0, 4) ?? '';
  }

  isAssigned(event: HistoricalEvent): boolean {
    return this.assignedEventIds().has(event.id);
  }

  isRecommended(event: HistoricalEvent): boolean {
    return this.recommendedEventIds().has(event.id);
  }
}
