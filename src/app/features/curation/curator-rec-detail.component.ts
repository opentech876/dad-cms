import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { EventService } from '../../core/events/event.service';
import {
  PresidencyRecommendationWithEvent,
  RecommendationService,
} from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';
import { DATE_FMT, MONTHS_FR_LONG } from '../../core/utils/date.utils';
import { DatePipe } from '@angular/common';
import { CurationStore } from './curation-store.service';
import { REC_STATUS_META, artFor, positionLabel } from './curation.utils';

interface TimelineStep {
  icon: string;
  title: string;
  by: string;
  when: string | null;
  done: boolean;
  active?: boolean;
  tone?: 'success';
  note: string;
}

/** Detail of one of the curator's recommendations: event card, calendar
 *  impact preview, publication timeline and the curator's own controls. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-curator-rec-detail',
  standalone: true,
  imports: [RouterLink, TuiIcon, DatePipe],
  templateUrl: './curator-rec-detail.component.html',
})
export class CuratorRecDetailComponent implements OnInit {
  readonly store = inject(CurationStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly recommendationService = inject(RecommendationService);
  private readonly eventService = inject(EventService);
  private readonly toast = inject(ToastService);

  protected readonly DATE_FMT = DATE_FMT;
  readonly STATUS_META = REC_STATUS_META;

  readonly recId = signal('');
  readonly withdrawArmed = signal(false);
  readonly withdrawing = signal(false);

  readonly rec = computed<PresidencyRecommendationWithEvent | null>(
    () => this.store.myRecs().find((r) => r.id === this.recId()) ?? null,
  );

  /** Current occupant of the targeted slot, when it differs from the
   *  recommended event (the "Remplacera" preview). Pending only — after
   *  publication the slot already holds the recommended event. */
  readonly replacedTitle = computed<string | null>(() => {
    const rec = this.rec();
    if (!rec || rec.status !== 'pending') return null;
    const occupant = (this.store.entriesByMmdd().get(rec.mmdd) ?? []).find(
      (e) => e.position === rec.position,
    );
    if (!occupant || occupant.event_id === rec.event_id) return null;
    return occupant.event?.title ?? null;
  });

  readonly timeline = computed<TimelineStep[]>(() => {
    const rec = this.rec();
    if (!rec) return [];
    const calName =
      this.store.selectedCalendar()?.name ?? `Calendrier ${this.store.calendarYear()}`;
    const steps: TimelineStep[] = [
      {
        icon: '@tui.pencil',
        title: 'Recommandation créée',
        by: 'Vous',
        when: rec.created_at,
        done: true,
        note: "Proposition rédigée depuis l'Espace Curation.",
      },
      {
        icon: '@tui.arrow-right',
        title: 'Soumise pour publication',
        by: 'Vous',
        when: rec.created_at,
        done: true,
        note: `Position : ${positionLabel(rec.position)}.`,
      },
    ];
    if (rec.status === 'pending') {
      steps.push({
        icon: '@tui.clock',
        title: 'En attente de publication',
        by: calName,
        when: null,
        done: false,
        active: true,
        note: "Sera publiée sur le calendrier une fois validée par l'équipe éditoriale.",
      });
    } else {
      steps.push({
        icon: '@tui.check',
        title: 'Publiée',
        by: calName,
        when: rec.applied_at ?? rec.updated_at,
        done: true,
        tone: 'success',
        note: 'Parue sur le calendrier.',
      });
    }
    return steps;
  });

  async ngOnInit(): Promise<void> {
    this.recId.set(this.route.snapshot.paramMap.get('id') ?? '');
    if (this.store.myRecs().length === 0) await this.store.load();
  }

  mmddLabel(mmdd: string): string {
    const [mm, dd] = mmdd.split('-').map(Number);
    return `${dd} ${MONTHS_FR_LONG[mm - 1] ?? ''} ${this.store.calendarYear()}`;
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

  armWithdraw(): void {
    this.withdrawArmed.set(true);
  }

  cancelWithdraw(): void {
    this.withdrawArmed.set(false);
  }

  /** Withdraw a pending recommendation — the curator keeps full control
   *  of her own proposals before publication. */
  async withdraw(): Promise<void> {
    const rec = this.rec();
    if (!rec || rec.status !== 'pending' || this.withdrawing()) return;
    this.withdrawing.set(true);
    try {
      const res = await firstValueFrom(
        this.recommendationService.removeSlot(rec.calendar_id, rec.mmdd, rec.position),
      );
      if (!res.success) {
        this.toast.error(res.error ?? 'Impossible de retirer la recommandation.');
        return;
      }
      this.toast.success('Recommandation retirée.');
      await this.store.refreshRecs();
      await this.router.navigateByUrl('/curation/mes-recommandations');
    } finally {
      this.withdrawing.set(false);
    }
  }
}
