import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { CompanyService } from '../../core/companies/company.service';
import { MetriquesService } from '../../core/metriques/metriques.service';
import { DashboardOperationalStats, InsightsService } from '../../core/insights/insights.service';

/** Minimal valid operational snapshot; tests override slices as needed. */
function makeOpStats(overrides: Partial<DashboardOperationalStats> = {}): DashboardOperationalStats {
  return {
    activity: [],
    empty_days: { count: 0, next: [] },
    events_no_image: 0,
    validations_soon: [],
    pending_recommendations: 0,
    inventory: [],
    ...overrides,
  };
}

const TODAY = new Date().toISOString().split('T')[0];
const [, todayMonthStr, todayDayStr] = TODAY.split('-');
const TODAY_MONTH = parseInt(todayMonthStr, 10) - 1; // 0-indexed
const TODAY_DAY = todayDayStr;

function buildClient(options: {
  eventCount?: number;
  calendarCount?: number;
  campaignCount?: number;
  yearEventCount?: number;
  pendingValidationCount?: number;
  publishedCalendarId?: string | null;
  todayEvents?: any[];
} = {}) {
  const {
    eventCount = 500,
    calendarCount = 2,
    campaignCount = 3,
    yearEventCount = 120,
    pendingValidationCount = 0,
    publishedCalendarId = 'cal-pub-1',
    todayEvents = [
      {
        title: "Indépendance de la République du Congo",
        description: "Le Congo accède à l'indépendance.",
        event_date: TODAY,
        position: 1,
      },
    ],
  } = options;

  function makeChain(data: any, count: number | null = null): any {
    const q: any = {
      then: (onFulfilled: any, onRejected?: any) =>
        Promise.resolve({ data, count, error: null }).then(onFulfilled, onRejected),
      select: (..._a: any[]) => makeChain(data, count),
      eq: (..._a: any[]) => makeChain(data, count),
      gte: (..._a: any[]) => makeChain(data, count),
      lte: (..._a: any[]) => makeChain(data, count),
      is: (..._a: any[]) => makeChain(data, count),
      order: (..._a: any[]) => makeChain(data, count),
      limit: (..._a: any[]) => makeChain(data, count),
      maybeSingle: () =>
        Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }),
    };
    return q;
  }

  const calendarForYear = publishedCalendarId ? { id: publishedCalendarId } : null;
  const todayEntries = todayEvents.map((e: any) => ({
    position: e.position,
    event: {
      title: e.title,
      description: e.description,
      event_date: e.event_date,
      deleted_at: e.deleted_at ?? null,
    },
  }));

  return {
    from: (table: string) => {
      if (table === 'events') {
        return {
          select: (_cols: string, opts?: any) => {
            if (opts?.head) return makeChain(null, eventCount);
            return makeChain([], 0);
          },
        };
      }
      if (table === 'calendar_entries') {
        return {
          select: (_cols: string, _opts?: any) => makeChain(todayEntries, todayEntries.length),
        };
      }
      if (table === 'calendars') {
        return {
          select: (_cols: string, opts?: any) => {
            if (opts?.head) return makeChain(null, calendarCount);
            return makeChain(calendarForYear ? [calendarForYear] : [], 1);
          },
        };
      }
      if (table === 'ad_campaigns') {
        // Two different ad_campaigns queries: head-count for active OR pending validation,
        // and an `id IN (...)` lookup for top performers. Distinguish by checking opts.head.
        return {
          select: (_cols: string, opts?: any) => {
            if (opts?.head) {
              // Heuristic: the validation-pending query is the only one chaining .is('validated_at', null).
              // We expose both counts via the same makeChain — last is() call wins. Tests pass
              // pendingValidationCount via the option; we route head-count requests through a
              // shared chain whose .is('validated_at', null) flips the count.
              const c: any = { _count: campaignCount };
              const q: any = {
                then: (r: any, rj?: any) => Promise.resolve({ data: null, count: c._count, error: null }).then(r, rj),
                eq:    (_col: string) => q,
                is:    (col: string, _v: any) => {
                  if (col === 'validated_at') c._count = pendingValidationCount;
                  return q;
                },
              };
              return q;
            }
            // Non-head: id-in() lookup for top performers.
            return {
              in: (_col: string, _vals: any[]) =>
                Promise.resolve({ data: [], error: null }),
              eq: (_col: string, _v: any) => makeChain([], 0),
            };
          },
        };
      }
      return makeChain([], 0);
    },
  };
}

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let mockSupabase: { client: any };

  let mockCompanies: { listCompanies: jest.Mock };
  let mockMetriques: { getCalendarCoverage: jest.Mock };
  let mockInsights: { getDashboardStats: jest.Mock };

  beforeEach(() => {
    mockSupabase = { client: buildClient() };
    mockCompanies = { listCompanies: jest.fn().mockReturnValue(of([])) };
    mockMetriques = { getCalendarCoverage: jest.fn().mockReturnValue(of([])) };
    mockInsights  = { getDashboardStats: jest.fn().mockReturnValue(of(makeOpStats())) };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: SupabaseService,   useValue: mockSupabase },
        { provide: CompanyService,    useValue: mockCompanies },
        { provide: MetriquesService,  useValue: mockMetriques },
        { provide: InsightsService,   useValue: mockInsights },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    TestBed.overrideComponent(DashboardComponent, { set: { template: '', imports: [] } });

    const fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  // ── KPI stats ──────────────────────────────────────────────────────────────

  describe('KPI stats', () => {
    it('charge les 4 compteurs depuis la DB', async () => {
      mockSupabase.client = buildClient({
        eventCount: 500, calendarCount: 2, campaignCount: 3, yearEventCount: 120,
      });

      await component.ngOnInit();

      expect(component.stats().totalEvents).toBe(500);
      expect(component.stats().publishedCalendars).toBe(2);
      expect(component.stats().activeCampaigns).toBe(3);
    });

    it('passe loading à false après le chargement', async () => {
      await component.ngOnInit();

      expect(component.loading()).toBe(false);
    });
  });

  // ── featured event ─────────────────────────────────────────────────────────

  describe('featured event', () => {
    it("charge le titre de l'événement du jour depuis la DB", async () => {
      mockSupabase.client = buildClient({
        todayEvents: [{
          title: "Indépendance de la République du Congo",
          description: "Le Congo accède à l'indépendance.",
          event_date: TODAY,
          position: 1,
        }],
      });

      await component.ngOnInit();

      expect(component.featuredEvent().title).toBe("Indépendance de la République du Congo");
    });

    it('extrait la première lettre de la description comme dropLetter', async () => {
      mockSupabase.client = buildClient({
        todayEvents: [{
          title: 'Test',
          description: 'Le Congo accède.',
          event_date: TODAY,
          position: 1,
        }],
      });

      await component.ngOnInit();

      expect(component.featuredEvent().dropLetter).toBe('L');
      expect(component.featuredEvent().excerpt).toBe('e Congo accède.');
    });

    it("affiche le jour d'aujourd'hui (pas la date historique de l'événement)", async () => {
      // Event historically happened on 1960-08-15 but is assigned to today's mmdd slot.
      // The right-side preview must show today (matching what mobile renders),
      // not the historical event_date — otherwise the date on the right contradicts the left.
      mockSupabase.client = buildClient({
        todayEvents: [{
          title: 'Indépendance du Congo',
          description: 'Desc.',
          event_date: '1960-08-15',
          position: 1,
        }],
      });

      await component.ngOnInit();

      // Compute TODAY_DAY at the time of the assertion, not at module load —
      // protects the spec against the (rare) day rollover happening between
      // suite startup and the test running.
      const todayNow = String(new Date().getDate()).padStart(2, '0');
      expect(component.featuredEvent().day).toBe(todayNow);
      expect(component.featuredEvent().day).not.toBe('15');
    });

    it("ignore les événements doux-supprimés (mirroring get_today_content)", async () => {
      // Mirror mobile's RPC behavior: events with deleted_at != null must not surface.
      mockSupabase.client = buildClient({
        todayEvents: [{
          title: 'Événement supprimé',
          description: 'Ne devrait pas apparaître.',
          event_date: TODAY,
          position: 1,
          deleted_at: '2026-06-20T10:00:00Z',
        }],
      });

      await component.ngOnInit();

      expect(component.featuredEvent().title).toBe('');
    });

    it("affiche le titre de l'événement de position 2 dans 'also'", async () => {
      mockSupabase.client = buildClient({
        todayEvents: [
          { title: 'Événement principal', description: 'Desc.', event_date: TODAY, position: 1 },
          { title: 'Deuxième événement',  description: 'Desc.', event_date: TODAY, position: 2 },
        ],
      });

      await component.ngOnInit();

      expect(component.featuredEvent().also).toBe('Deuxième événement');
    });

    it("laisse le titre vide si aucun calendrier publié n'existe pour l'année", async () => {
      mockSupabase.client = buildClient({ publishedCalendarId: null });

      await component.ngOnInit();

      expect(component.featuredEvent().title).toBe('');
    });

    it("laisse le titre vide si aucun événement n'existe pour aujourd'hui", async () => {
      mockSupabase.client = buildClient({ todayEvents: [] });

      await component.ngOnInit();

      expect(component.featuredEvent().title).toBe('');
    });

    it('passe featuredEventLoading à false après le chargement', async () => {
      await component.ngOnInit();

      expect(component.featuredEventLoading()).toBe(false);
    });
  });

  // ── fillRate computed ──────────────────────────────────────────────────────

  describe('fillRate', () => {
    it('calcule fillRate à 50% pour 365 yearEvents sur 730 slots', () => {
      component.stats.set({
        totalEvents: 0, publishedCalendars: 0, activeCampaigns: 0, yearEvents: 365,
        pendingValidations: 0, activeCompanies: 0,
      });

      expect(component.fillRate()).toBe(50);
    });
  });

  // ── Validation + Companies KPIs (Round 4) ────────────────────────────────

  describe('Round 4 KPIs', () => {
    it('charge pendingValidations depuis ad_campaigns.is("validated_at", null)', async () => {
      mockSupabase.client = buildClient({ pendingValidationCount: 7 });
      await component.ngOnInit();
      expect(component.stats().pendingValidations).toBe(7);
    });

    it('charge activeCompanies depuis CompanyService.listCompanies()', async () => {
      mockCompanies.listCompanies.mockReturnValue(of([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]));
      await component.ngOnInit();
      expect(mockCompanies.listCompanies).toHaveBeenCalled();
      expect(component.stats().activeCompanies).toBe(3);
    });
  });

  // ── Operational snapshot (dashboard_operational_stats) ───────────────────

  describe('activityFeed', () => {
    it('mappe les entrées audit_log en lignes lisibles', async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(makeOpStats({
        activity: [{
          actor_name: 'Alice Martin', action: 'INSERT', table_name: 'events',
          record_label: 'Indépendance du Congo', changed_at: new Date().toISOString(),
        }],
      })));
      await component.ngOnInit();
      const row = component.activityFeed()[0];
      expect(row.who).toBe('Alice Martin');
      expect(row.initials).toBe('AM');
      expect(row.action).toBe('a créé');
      expect(row.target).toBe('Indépendance du Congo');
      expect(row.meta).toBe('Événement');
    });

    it('utilise le libellé de table quand record_label est null', async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(makeOpStats({
        activity: [{
          actor_name: 'Bob', action: 'DELETE', table_name: 'calendars',
          record_label: null, changed_at: new Date().toISOString(),
        }],
      })));
      await component.ngOnInit();
      expect(component.activityFeed()[0].target).toBe('Calendrier');
      expect(component.activityFeed()[0].action).toBe('a supprimé');
    });

    it('renvoie [] quand opStats est null (pas de workspace)', async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(null));
      await component.ngOnInit();
      expect(component.activityFeed()).toEqual([]);
    });
  });

  describe('publicationTodos', () => {
    it('affiche les dates vides avec les prochaines occurrences', async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(makeOpStats({
        empty_days: { count: 4, next: ['08-07', '09-22'] },
      })));
      await component.ngOnInit();
      const todo = component.publicationTodos().find(t => t.text.includes('sans événement'))!;
      expect(todo.text).toBe('4 dates sans événement');
      expect(todo.meta).toBe('7 août · 22 septembre');
      expect(todo.link).toBe('/calendrier');
    });

    it("signale l'absence de calendrier pour l'année (empty_days null)", async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(makeOpStats({ empty_days: null })));
      await component.ngOnInit();
      expect(component.publicationTodos().some(t => t.text.startsWith('Aucun calendrier'))).toBe(true);
    });

    it('inclut images manquantes / validations / recommandations quand > 0', async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(makeOpStats({
        events_no_image: 12,
        validations_soon: [{ name: 'Campagne X', start_date: '2026-07-08' }],
        pending_recommendations: 3,
      })));
      await component.ngOnInit();
      const texts = component.publicationTodos().map(t => t.text);
      expect(texts).toContain('12 événements sans illustration');
      expect(texts).toContain('1 campagne à valider avant diffusion');
      expect(texts).toContain('3 recommandations du Curateur à appliquer');
    });

    it('renvoie [] (all-clear) quand tout est vert', async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(makeOpStats()));
      await component.ngOnInit();
      expect(component.publicationTodos()).toEqual([]);
    });
  });

  describe('inventaire publicitaire', () => {
    it('compte les jours invendus par position', async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(makeOpStats({
        inventory: [
          { d: '2026-07-03', h: true,  f: false },
          { d: '2026-07-04', h: false, f: false },
          { d: '2026-07-05', h: true,  f: true  },
        ],
      })));
      await component.ngOnInit();
      expect(component.unsoldHeaderDays()).toBe(1);
      expect(component.unsoldFooterDays()).toBe(2);
    });
  });

  describe('coverageBars', () => {
    it('dérive les barres depuis getCalendarCoverage()', async () => {
      mockMetriques.getCalendarCoverage.mockReturnValue(of([
        { month: 1, filled_days: 15, total_days: 31, percent: 48 },
        { month: 2, filled_days: 28, total_days: 28, percent: 100 },
      ]));
      await component.ngOnInit();
      expect(component.coverageBars().length).toBe(2);
      expect(component.coverageBars()[0]).toMatchObject({ pct: 48, label: 'J' });
      expect(component.coverageBars()[1]).toMatchObject({ pct: 100, label: 'F' });
    });
  });
});
