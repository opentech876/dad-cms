import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { CompanyService } from '../../core/companies/company.service';
import { MetriquesService } from '../../core/metriques/metriques.service';
import { DashboardOperationalStats, InsightsService, RiskyDay } from '../../core/insights/insights.service';
import { MONTHS_FR_LONG, MONTHS_FR_LONG_CAP, formatRelativeFr } from '../../core/utils/date.utils';
import { MonthCoverage } from '../../models';

interface KpiStats {
  totalEvents: number;
  publishedCalendars: number;
  activeCampaigns: number;
  yearEvents: number;
  pendingValidations: number;
  activeCompanies: number;
}

interface FeaturedEvent {
  title: string;
  dropLetter: string;
  excerpt: string;
  day: string;
  month: string;
  year: string;
  also: string;
}

/** One row of the real activity feed, ready for display. */
interface FeedRow {
  initials: string;
  who: string;
  action: string;
  target: string;
  meta: string;
  time: string;
}

/** One actionable item of the "Avant publication" checklist. */
interface TodoRow {
  icon: string;
  text: string;
  meta: string;
  bg: string;
  fg: string;
  link: string;
}

const TABLE_LABELS: Record<string, string> = {
  events:                     'Événement',
  calendars:                  'Calendrier',
  calendar_entries:           'Affectation de calendrier',
  ad_campaigns:               'Campagne publicitaire',
  companies:                  'Entreprise',
  presidency_recommendations: 'Recommandation du Curateur',
};

const ACTION_VERBS: Record<string, string> = {
  INSERT: 'a créé',
  UPDATE: 'a modifié',
  DELETE: 'a supprimé',
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private supabase         = inject(SupabaseService);
  private companyService   = inject(CompanyService);
  private metriquesService = inject(MetriquesService);
  private insightsService  = inject(InsightsService);

  readonly loading = signal(true);
  readonly stats = signal<KpiStats>({
    totalEvents: 0,
    publishedCalendars: 0,
    activeCampaigns: 0,
    yearEvents: 0,
    pendingValidations: 0,
    activeCompanies: 0,
  });

  /** One-round-trip operational snapshot (activity, checklist inputs,
   *  30-day ad inventory). Null until loaded or when no workspace. */
  readonly opStats = signal<DashboardOperationalStats | null>(null);

  readonly currentYear = new Date().getFullYear();
  readonly todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  // Used by the hero's empty-state right-side preview.
  readonly todayDayNum   = String(new Date().getDate()).padStart(2, '0');
  readonly todayMonthCap = MONTHS_FR_LONG_CAP[new Date().getMonth()];

  readonly featuredEvent = signal<FeaturedEvent>({
    title: '', dropLetter: '', excerpt: '', day: '--', month: '---', year: '----', also: '',
  });
  readonly featuredEventLoading = signal(true);

  /** True once we know there's an event published for today on mobile. */
  readonly hasFeaturedEvent = computed(() => this.featuredEvent().title.length > 0);

  readonly fillRate = computed(() => {
    const maxSlots = 365 * 2;
    return Math.round((this.stats().yearEvents / maxSlots) * 100);
  });

  /** Real activity feed derived from the audit_log slice in opStats. */
  readonly activityFeed = computed<FeedRow[]>(() => {
    const entries = this.opStats()?.activity ?? [];
    return entries.map(e => {
      const name = e.actor_name || 'Système';
      const np = name.trim().split(/\s+/);
      return {
        initials: ((np[0]?.[0] ?? '') + (np[1]?.[0] ?? '')).toUpperCase() || 'S',
        who:      name,
        action:   ACTION_VERBS[e.action] ?? e.action.toLowerCase(),
        target:   e.record_label ?? (TABLE_LABELS[e.table_name] ?? e.table_name),
        meta:     TABLE_LABELS[e.table_name] ?? e.table_name,
        time:     formatRelativeFr(e.changed_at),
      };
    });
  });

  /** Real per-month fill bars (same RPC the metrics page uses). */
  readonly coverage = signal<MonthCoverage[]>([]);
  readonly coverageBars = computed(() =>
    this.coverage().map(c => ({
      pct:     Number(c.percent),
      label:   ['J','F','M','A','M','J','J','A','S','O','N','D'][c.month - 1],
      current: c.month - 1 === new Date().getMonth(),
    })),
  );

  /** "Avant publication" checklist — computed live from opStats. Only
   *  items with something to do appear; a fully green workspace shows
   *  the all-clear row instead. */
  readonly publicationTodos = computed<TodoRow[]>(() => {
    const s = this.opStats();
    if (!s) return [];
    const todos: TodoRow[] = [];

    if (s.empty_days === null) {
      todos.push({
        icon: '📅', text: `Aucun calendrier ${this.currentYear}`,
        meta: 'Créez le calendrier de l\'année pour commencer',
        bg: 'var(--danger-soft)', fg: 'var(--danger)', link: '/calendrier',
      });
    } else if (s.empty_days.count > 0) {
      todos.push({
        icon: '⚠️', text: `${s.empty_days.count} date${s.empty_days.count > 1 ? 's' : ''} sans événement`,
        meta: s.empty_days.next.map(m => this.mmddLabel(m)).join(' · ') || 'toutes déjà passées',
        bg: 'var(--warning-soft)', fg: 'var(--warning)', link: '/calendrier',
      });
    }

    if (s.events_no_image > 0) {
      todos.push({
        icon: '🖼️', text: `${s.events_no_image} événement${s.events_no_image > 1 ? 's' : ''} sans illustration`,
        meta: 'Compresser à 800×600 / ≤150 Ko avant téléversement',
        bg: 'var(--info-soft)', fg: 'var(--info)', link: '/evenements',
      });
    }

    if (s.validations_soon.length > 0) {
      todos.push({
        icon: '📢', text: `${s.validations_soon.length} campagne${s.validations_soon.length > 1 ? 's' : ''} à valider avant diffusion`,
        meta: s.validations_soon.map(v => v.name).slice(0, 3).join(' · '),
        bg: 'var(--accent-soft)', fg: 'var(--accent)', link: '/campagnes',
      });
    }

    if (s.pending_recommendations > 0) {
      todos.push({
        icon: '✅', text: `${s.pending_recommendations} recommandation${s.pending_recommendations > 1 ? 's' : ''} du Curateur à appliquer`,
        meta: 'Ouvrir le calendrier puis « Appliquer la recommandation »',
        bg: 'var(--success-soft)', fg: 'var(--success)', link: '/calendrier',
      });
    }

    return todos;
  });

  /** 30-day sold/unsold outlook per ad position + unsold-day counters. */
  readonly inventory = computed(() => this.opStats()?.inventory ?? []);
  readonly unsoldHeaderDays = computed(() => this.inventory().filter(d => !d.h).length);
  readonly unsoldFooterDays = computed(() => this.inventory().filter(d => !d.f).length);

  /** Days in the next 30 that mobile would show incomplete (0 or 1 of
   *  2 positions filled). Sorted by date, max 10 (RPC-limited). */
  readonly riskyDays = computed<RiskyDay[]>(() => this.opStats()?.risky_days ?? []);

  /** Severity drives the card's row color:
   *  - blank day within a week → critical (mobile shows NOTHING, imminent)
   *  - blank day further out   → warning
   *  - partial day (1 of 2)    → info */
  riskySeverity(day: RiskyDay): 'critical' | 'warning' | 'info' {
    if (day.entries === 0) return day.days_until <= 7 ? 'critical' : 'warning';
    return 'info';
  }

  riskyDateLabel(day: RiskyDay): string {
    return this.mmddLabel(day.mmdd);
  }

  riskyCountdown(day: RiskyDay): string {
    if (day.days_until === 0) return "aujourd'hui";
    if (day.days_until === 1) return 'demain';
    return `dans ${day.days_until} j`;
  }

  /** '08-07' → '7 août' */
  private mmddLabel(mmdd: string): string {
    const [mm, dd] = mmdd.split('-').map(Number);
    return `${dd} ${MONTHS_FR_LONG[mm - 1] ?? ''}`;
  }

  /** Tooltip for one inventory cell. */
  inventoryTitle(day: { d: string; h: boolean; f: boolean }, position: 'h' | 'f'): string {
    const sold = position === 'h' ? day.h : day.f;
    const label = position === 'h' ? 'Header' : 'Footer';
    return `${day.d} — ${label} : ${sold ? 'vendu' : 'disponible'}`;
  }

  async ngOnInit(): Promise<void> {
    const db = this.supabase.client;
    const year = this.currentYear;

    const [eventsRes, calendarsRes, campaignsRes, yearEventsRes, pendingValRes] = await Promise.all([
      db.from('events').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      db
        .from('calendars')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .is('deleted_at', null),
      db
        .from('ad_campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
        .is('deleted_at', null),
      db
        .from('events')
        .select('*', { count: 'exact', head: true })
        .gte('event_date', `${year}-01-01`)
        .lte('event_date', `${year}-12-31`)
        .is('deleted_at', null),
      db
        .from('ad_campaigns')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .is('validated_at', null),
    ]);

    // Companies + operational snapshot + real coverage in parallel.
    // Each falls back to an empty/neutral value on failure so a single
    // slow or broken source never blanks the whole dashboard.
    const [companies, opStats, coverage] = await Promise.all([
      firstValueFrom(this.companyService.listCompanies()).catch(() => []),
      firstValueFrom(this.insightsService.getDashboardStats()).catch(() => null),
      firstValueFrom(this.metriquesService.getCalendarCoverage()).catch(() => []),
    ]);

    this.stats.set({
      totalEvents: eventsRes.count ?? 0,
      publishedCalendars: calendarsRes.count ?? 0,
      activeCampaigns: campaignsRes.count ?? 0,
      yearEvents: yearEventsRes.count ?? 0,
      pendingValidations: pendingValRes.count ?? 0,
      activeCompanies: companies.length,
    });
    this.opStats.set(opStats);
    this.coverage.set(coverage);

    this.loading.set(false);
    await this._loadFeaturedEvent(db, year);
  }

  private async _loadFeaturedEvent(db: any, year: number): Promise<void> {
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { data: cal } = await db
      .from('calendars')
      .select('id')
      .eq('year', year)
      .eq('status', 'published')
      .is('deleted_at', null)
      .maybeSingle();

    if (!cal) { this.featuredEventLoading.set(false); return; }

    // Same source as mobile's get_today_content RPC — calendar_entries joined to events.
    // Soft-deleted events are filtered client-side to mirror the RPC's `e.deleted_at IS NULL`.
    const { data: entries } = await db
      .from('calendar_entries')
      .select('position, event:events(title, description, event_date, deleted_at)')
      .eq('calendar_id', cal.id)
      .eq('mmdd', mmdd)
      .order('position', { ascending: true });

    const rows = ((entries as any[] | null) ?? []).filter(r => r.event && r.event.deleted_at === null);
    const primary = rows.find(r => r.position === 1);
    if (!primary?.event) { this.featuredEventLoading.set(false); return; }

    const secondary = rows.find(r => r.position === 2);
    const ev = primary.event;
    const desc: string = ev.description ?? '';

    // Right-side preview shows TODAY's date (the day this event is published on mobile),
    // not the event's historical event_date — those are intentionally different fields.
    this.featuredEvent.set({
      title: ev.title,
      dropLetter: desc.charAt(0),
      excerpt: desc.slice(1),
      day: this.todayDayNum,
      month: this.todayMonthCap,
      year: String(year),
      also: secondary?.event?.title ?? '',
    });
    this.featuredEventLoading.set(false);
  }
}
