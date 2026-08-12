import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { EventService } from '../../core/events/event.service';
import { PresidencyRecommendationWithEvent } from '../../core/presidency/recommendation.service';
import { MONTHS_FR_LONG, formatDateShort } from '../../core/utils/date.utils';
import { CurationStore } from './curation-store.service';
import { REC_STATUS_META, artFor, positionLabel } from './curation.utils';

type RecFilter = 'all' | 'pending' | 'applied';
type RecSort = 'recent' | 'event-date' | 'status';

/** "Mes recommandations" — every proposal the curator has made, across
 *  calendars, with status filters and a sortable table. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-curator-recs',
  standalone: true,
  imports: [RouterLink, TuiIcon],
  templateUrl: './curator-recs.component.html',
})
export class CuratorRecsComponent implements OnInit {
  readonly store = inject(CurationStore);
  private readonly eventService = inject(EventService);

  readonly STATUS_META = REC_STATUS_META;
  readonly filter = signal<RecFilter>('all');
  readonly sort = signal<RecSort>('recent');

  readonly counts = computed(() => {
    const recs = this.store.myRecs();
    return {
      all: recs.length,
      pending: recs.filter((r) => r.status === 'pending').length,
      applied: recs.filter((r) => r.status === 'applied').length,
    };
  });

  readonly rows = computed<PresidencyRecommendationWithEvent[]>(() => {
    const f = this.filter();
    const recs = this.store.myRecs().filter((r) => (f === 'all' ? true : r.status === f));
    switch (this.sort()) {
      case 'event-date':
        return [...recs].sort((a, b) => a.mmdd.localeCompare(b.mmdd));
      case 'status':
        return [...recs].sort((a, b) => a.status.localeCompare(b.status));
      default:
        return [...recs].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  });

  async ngOnInit(): Promise<void> {
    await this.store.load();
  }

  setFilter(f: RecFilter): void {
    this.filter.set(f);
  }

  onSortChange(value: string): void {
    this.sort.set(value as RecSort);
  }

  mmddLabel(mmdd: string): string {
    const [mm, dd] = mmdd.split('-').map(Number);
    return `${dd} ${MONTHS_FR_LONG[mm - 1] ?? ''}`;
  }

  submittedLabel(rec: PresidencyRecommendationWithEvent): string {
    return formatDateShort(rec.created_at);
  }

  positionShort(position: 1 | 2): string {
    return position === 1 ? 'Principal' : "C'est aussi";
  }

  positionLabel(position: 1 | 2): string {
    return positionLabel(position);
  }

  artFor(seed: string): string {
    return artFor(seed);
  }

  imageUrl(rec: PresidencyRecommendationWithEvent): string | null {
    const path = rec.event?.image_path;
    return path ? this.eventService.getImageUrl(path) : null;
  }
}
