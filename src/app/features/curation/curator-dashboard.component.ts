import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { EventService } from '../../core/events/event.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { PresidencyRecommendationWithEvent } from '../../core/presidency/recommendation.service';
import { MONTHS_FR_LONG, formatWeekdayLong } from '../../core/utils/date.utils';
import { CurationStore } from './curation-store.service';
import { REC_STATUS_META, artFor, positionLabel } from './curation.utils';
import { ProposeModalComponent } from './propose-modal.component';

/** Landing page of the Espace Curation: greeting, personal stats, recent
 *  recommendations and the empty dates worth filling. */
@Component({
  selector: 'app-curator-dashboard',
  standalone: true,
  imports: [RouterLink, TuiIcon, ProposeModalComponent],
  templateUrl: './curator-dashboard.component.html',
})
export class CuratorDashboardComponent implements OnInit {
  readonly store = inject(CurationStore);
  private readonly auth = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly eventService = inject(EventService);

  readonly STATUS_META = REC_STATUS_META;

  readonly firstName = signal('');
  readonly todayLabel = formatWeekdayLong(new Date());
  readonly proposeMmdd = signal<string | null>(null);

  readonly recentRecs = computed<PresidencyRecommendationWithEvent[]>(() =>
    this.store.myRecs().slice(0, 4),
  );

  /** First upcoming empty dates shown as "Dates à combler". */
  readonly emptyDatesPreview = computed(() => this.store.upcomingEmptyDates().slice(0, 3));
  readonly emptyDatesCount = computed(() => this.store.emptyDates().length);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.load(), this.store.loadMyEvents(), this.loadName()]);
  }

  private async loadName(): Promise<void> {
    try {
      const user = await firstValueFrom(this.auth.getCurrentUser().pipe(filter(Boolean)));
      const profile = await firstValueFrom(this.workspaceService.getMyProfile(user.id ?? ''));
      const full = profile?.full_name?.trim() ?? '';
      this.firstName.set(full.split(/\s+/)[0] ?? '');
    } catch {
      this.firstName.set('');
    }
  }

  mmddLabel(mmdd: string): string {
    const [mm, dd] = mmdd.split('-').map(Number);
    return `${dd} ${MONTHS_FR_LONG[mm - 1] ?? ''}`;
  }

  recDateLabel(rec: PresidencyRecommendationWithEvent): string {
    return `${this.mmddLabel(rec.mmdd)} ${this.store.calendarYear()}`;
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

  openPropose(mmdd?: string): void {
    const target = mmdd ?? this.store.upcomingEmptyDates()[0] ?? null;
    if (!target) return;
    this.proposeMmdd.set(target);
  }

  closePropose(): void {
    this.proposeMmdd.set(null);
  }

  async onProposeSaved(): Promise<void> {
    this.proposeMmdd.set(null);
    await this.store.refreshRecs();
  }
}
