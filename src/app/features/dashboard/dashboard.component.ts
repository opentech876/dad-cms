import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardOperationalStats, InsightsService } from '../../core/insights/insights.service';
import {
  AdOutlook,
  DashboardService,
  FeaturedEvent,
  GapDay,
  YearContentStats,
} from '../../core/dashboard/dashboard.service';
import { getInitials } from '../../core/utils/labels.utils';
import {
  DATE_FMT,
  MONTHS_FR_LONG,
  MONTHS_FR_LONG_CAP,
  formatRelativeFr,
} from '../../core/utils/date.utils';

/** One row of the real activity feed, ready for display. */
interface FeedRow {
  initials: string;
  who: string;
  action: string;
  target: string;
  meta: string;
  time: string;
}

const TABLE_LABELS: Record<string, string> = {
  events: 'Événement',
  calendars: 'Calendrier',
  calendar_entries: 'Affectation de calendrier',
  ad_campaigns: 'Campagne publicitaire',
  companies: 'Entreprise',
  presidency_recommendations: 'Recommandation du Curateur',
};

const ACTION_VERBS: Record<string, string> = {
  INSERT: 'a créé',
  UPDATE: 'a modifié',
  DELETE: 'a supprimé',
};

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DecimalPipe, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private insightsService = inject(InsightsService);
  private dashboardService = inject(DashboardService);
  private auth = inject(AuthService);
  private router = inject(Router);

  protected readonly DATE_FMT = DATE_FMT;

  readonly loading = signal(true);

  /** Everything the mobile app shows this year (published calendar only). */
  readonly contentStats = signal<YearContentStats>({
    mobileEvents: 0,
    libraryEvents: 0,
    filledDays: 0,
    emptyNext30: [],
  });

  /** Commercial outlook — one ad per day, current-year scope. */
  readonly adOutlook = signal<AdOutlook | null>(null);

  /** One-round-trip operational snapshot; only the activity slice is
   *  rendered here. Null until loaded or when no workspace. */
  readonly opStats = signal<DashboardOperationalStats | null>(null);

  readonly currentYear = new Date().getFullYear();
  // Fallbacks for the hero's right-side date when nothing is published today.
  readonly todayDayNum = String(new Date().getDate()).padStart(2, '0');
  readonly todayMonthCap = MONTHS_FR_LONG_CAP[new Date().getMonth()];

  readonly featuredEvent = signal<FeaturedEvent>({
    title: '',
    dropLetter: '',
    excerpt: '',
    day: '--',
    month: '---',
    year: '----',
    also: '',
  });
  readonly featuredEventLoading = signal(true);

  /** True once we know there's an event published for today on mobile. */
  readonly hasFeaturedEvent = computed(() => this.featuredEvent().title.length > 0);

  /** Days in the current year — leap-aware, drives every year-scoped ratio. */
  readonly daysInYear = computed(() => {
    const y = this.currentYear;
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  });

  /** % of the year's days that have at least one event on mobile. */
  readonly yearCoveragePct = computed(() =>
    Math.round((this.contentStats().filledDays / this.daysInYear()) * 100),
  );

  /** Ad space is sold in 7-day blocks (the campaign editor recommends 7 j,
   *  caps at 14), so weeks — not days — are the commercial unit here. */
  readonly soldWeeksYear = computed(() => Math.round(this.soldDaysYear() / 7));
  readonly totalWeeksYear = computed(() => Math.floor(this.daysInYear() / 7));

  readonly currentAd = computed(() => this.adOutlook()?.currentAd ?? null);
  readonly soldDaysYear = computed(() => this.adOutlook()?.soldDaysYear ?? 0);

  /** Monthly bars of ad days sold to advertisers. */
  readonly salesBars = computed(() =>
    (this.adOutlook()?.salesByMonth ?? []).map((m) => ({
      pct: m.totalDays > 0 ? Math.round((m.soldDays / m.totalDays) * 100) : 0,
      soldDays: m.soldDays,
      totalDays: m.totalDays,
      label: MONTH_LETTERS[m.month - 1],
      current: m.month - 1 === new Date().getMonth(),
    })),
  );

  /** Next-30-day gaps: dates mobile will show with no event at all. */
  readonly emptyEventDays = computed<GapDay[]>(() => this.contentStats().emptyNext30);

  /** Next-30-day sales outlook and its unsold subset. */
  readonly next30 = computed(() => this.adOutlook()?.next30 ?? []);
  readonly emptyAdDays = computed(() => this.next30().filter((d) => !d.sold));
  readonly unsoldAdDays = computed(() => this.emptyAdDays().length);

  /** Real activity feed derived from the audit_log slice in opStats. */
  readonly activityFeed = computed<FeedRow[]>(() => {
    const entries = this.opStats()?.activity ?? [];
    return entries.map((e) => {
      const name = e.actor_name || 'Système';
      return {
        initials: getInitials(name, 'S'),
        who: name,
        action: ACTION_VERBS[e.action] ?? e.action.toLowerCase(),
        target: e.record_label ?? TABLE_LABELS[e.table_name] ?? e.table_name,
        meta: TABLE_LABELS[e.table_name] ?? e.table_name,
        time: formatRelativeFr(e.changed_at),
      };
    });
  });

  /** A blank editorial day within a week is an emergency; further out, a warning. */
  gapSeverity(day: GapDay): 'critical' | 'warning' {
    return day.daysUntil <= 7 ? 'critical' : 'warning';
  }

  countdownLabel(daysUntil: number): string {
    if (daysUntil === 0) return "aujourd'hui";
    if (daysUntil === 1) return 'demain';
    return `dans ${daysUntil} j`;
  }

  /** '2026-08-07' → '7 août' */
  gapLabel(dateISO: string): string {
    const dd = Number(dateISO.slice(8, 10));
    const mm = Number(dateISO.slice(5, 7));
    return `${dd} ${MONTHS_FR_LONG[mm - 1] ?? ''}`;
  }

  /** Awaits a source and falls back silently, so a single broken source
   *  never blanks the whole page (catches synchronous throws too). */
  private async safe<T>(load: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await load();
    } catch {
      return fallback;
    }
  }

  async ngOnInit(): Promise<void> {
    // Defense in depth behind curatorHomeGuard: this page is not for the
    // Curateur, whatever route exposes it — bail before any query fires.
    const role = await this.safe(() => firstValueFrom(this.auth.currentRole$.pipe(take(1))), null);
    if (role === 'presidence') {
      void this.router.navigateByUrl('/curation');
      return;
    }

    const year = this.currentYear;

    const [contentStats, adOutlook, opStats] = await Promise.all([
      this.safe(() => firstValueFrom(this.dashboardService.getYearContentStats(year)), {
        mobileEvents: 0,
        libraryEvents: 0,
        filledDays: 0,
        emptyNext30: [],
      } as YearContentStats),
      this.safe(() => firstValueFrom(this.dashboardService.getAdOutlook(year)), null),
      this.safe(() => firstValueFrom(this.insightsService.getDashboardStats()), null),
    ]);

    this.contentStats.set(contentStats);
    this.adOutlook.set(adOutlook);
    this.opStats.set(opStats);
    this.loading.set(false);

    const featured = await this.safe(
      () => firstValueFrom(this.dashboardService.getFeaturedEvent(year)),
      null,
    );
    if (featured) this.featuredEvent.set(featured);
    this.featuredEventLoading.set(false);
  }
}
