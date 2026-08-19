import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../../core/auth/auth.service';
import {
  AdOutlook,
  DashboardService,
  YearContentStats,
} from '../../core/dashboard/dashboard.service';
import { DashboardOperationalStats, InsightsService } from '../../core/insights/insights.service';

/** Minimal valid operational snapshot; tests override slices as needed. */
function makeOpStats(
  overrides: Partial<DashboardOperationalStats> = {},
): DashboardOperationalStats {
  return {
    activity: [],
    empty_days: { count: 0, next: [] },
    events_no_image: 0,
    validations_soon: [],
    pending_recommendations: 0,
    inventory: [],
    risky_days: [],
    ...overrides,
  };
}

function makeContentStats(overrides: Partial<YearContentStats> = {}): YearContentStats {
  return { mobileEvents: 0, filledDays: 0, emptyNext30: [], ...overrides };
}

function makeOutlook(overrides: Partial<AdOutlook> = {}): AdOutlook {
  const year = new Date().getFullYear();
  return {
    currentAd: null,
    soldDaysYear: 0,
    salesByMonth: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      soldDays: 0,
      totalDays: new Date(year, i + 1, 0).getDate(),
    })),
    next30: Array.from({ length: 30 }, (_, i) => ({
      date: `x-${i}`,
      sold: false,
      daysUntil: i,
    })),
    ...overrides,
  };
}

describe('DashboardComponent', () => {
  let component: DashboardComponent;

  let mockDashboard: {
    getYearContentStats: jest.Mock;
    getAdOutlook: jest.Mock;
    getFeaturedEvent: jest.Mock;
  };
  let mockInsights: { getDashboardStats: jest.Mock };
  let mockAuth: { currentRole$: unknown };
  let mockRouter: { navigateByUrl: jest.Mock };

  beforeEach(() => {
    mockDashboard = {
      getYearContentStats: jest.fn().mockReturnValue(of(makeContentStats())),
      getAdOutlook: jest.fn().mockReturnValue(of(makeOutlook())),
      getFeaturedEvent: jest.fn().mockReturnValue(of(null)),
    };
    mockInsights = { getDashboardStats: jest.fn().mockReturnValue(of(makeOpStats())) };
    mockAuth = { currentRole$: of('owner') };
    mockRouter = { navigateByUrl: jest.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: DashboardService, useValue: mockDashboard },
        { provide: InsightsService, useValue: mockInsights },
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    TestBed.overrideComponent(DashboardComponent, { set: { template: '', imports: [] } });

    const fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  // ── Blocage Curatrice (défense derrière curatorHomeGuard) ──────────────────

  describe('blocage Curatrice', () => {
    it('presidence est renvoyée vers /curation sans charger le tableau de bord', async () => {
      mockAuth.currentRole$ = of('presidence');

      await component.ngOnInit();

      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/curation');
      expect(mockDashboard.getYearContentStats).not.toHaveBeenCalled();
      expect(mockDashboard.getAdOutlook).not.toHaveBeenCalled();
    });

    it('les autres rôles chargent le tableau de bord normalement', async () => {
      await component.ngOnInit();

      expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
      expect(mockDashboard.getYearContentStats).toHaveBeenCalled();
    });
  });

  // ── Loading + wiring ───────────────────────────────────────────────────────

  describe('chargement', () => {
    it("charge les stats de contenu de l'année courante", async () => {
      mockDashboard.getYearContentStats.mockReturnValue(
        of(
          makeContentStats({
            mobileEvents: 210,
            filledDays: 180,
          }),
        ),
      );

      await component.ngOnInit();

      expect(mockDashboard.getYearContentStats).toHaveBeenCalledWith(new Date().getFullYear());
      expect(component.contentStats().mobileEvents).toBe(210);
      expect(component.contentStats().filledDays).toBe(180);
    });

    it("charge le carnet publicitaire de l'année courante", async () => {
      mockDashboard.getAdOutlook.mockReturnValue(of(makeOutlook({ soldDaysYear: 42 })));

      await component.ngOnInit();

      expect(mockDashboard.getAdOutlook).toHaveBeenCalledWith(new Date().getFullYear());
      expect(component.soldDaysYear()).toBe(42);
    });

    it('passe loading à false après le chargement', async () => {
      await component.ngOnInit();

      expect(component.loading()).toBe(false);
    });

    it('survit à un échec de chargement sans blanchir la page', async () => {
      mockDashboard.getYearContentStats.mockReturnValue(of(makeContentStats()));
      mockDashboard.getAdOutlook.mockImplementation(() => {
        throw new Error('down');
      });

      await component.ngOnInit();

      expect(component.loading()).toBe(false);
      expect(component.adOutlook()).toBeNull();
    });
  });

  // ── featured event ─────────────────────────────────────────────────────────

  describe('featured event', () => {
    it("expose l'événement du jour renvoyé par le service", async () => {
      mockDashboard.getFeaturedEvent.mockReturnValue(
        of({
          title: 'Indépendance du Congo',
          dropLetter: 'L',
          excerpt: 'e Congo…',
          day: '15',
          month: 'Juillet',
          year: '2026',
          also: '',
        }),
      );

      await component.ngOnInit();

      expect(component.featuredEvent().title).toBe('Indépendance du Congo');
      expect(component.hasFeaturedEvent()).toBe(true);
    });

    it("hasFeaturedEvent reste faux quand il n'y a rien à publier", async () => {
      mockDashboard.getFeaturedEvent.mockReturnValue(of(null));

      await component.ngOnInit();

      expect(component.hasFeaturedEvent()).toBe(false);
    });

    it('passe featuredEventLoading à false après le chargement', async () => {
      await component.ngOnInit();

      expect(component.featuredEventLoading()).toBe(false);
    });
  });

  // ── KPI computeds ──────────────────────────────────────────────────────────

  describe('yearCoveragePct', () => {
    it("calcule le % de jours de l'année ayant une éphéméride", () => {
      const year = new Date().getFullYear();
      const daysInYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
      component.contentStats.set(makeContentStats({ filledDays: daysInYear }));

      expect(component.yearCoveragePct()).toBe(100);
    });

    it("vaut 0 quand aucun jour n'est couvert", () => {
      component.contentStats.set(makeContentStats({ filledDays: 0 }));

      expect(component.yearCoveragePct()).toBe(0);
    });
  });

  describe('currentAd', () => {
    it('expose la campagne en diffusion', async () => {
      mockDashboard.getAdOutlook.mockReturnValue(
        of(
          makeOutlook({
            currentAd: {
              campaignName: 'Offre étudiant',
              companyName: 'MTN Congo',
              endDate: '2026-07-22',
            },
          }),
        ),
      );

      await component.ngOnInit();

      expect(component.currentAd()?.companyName).toBe('MTN Congo');
    });

    it("vaut null quand aucune campagne ne diffuse aujourd'hui", async () => {
      await component.ngOnInit();

      expect(component.currentAd()).toBeNull();
    });
  });

  // ── Monthly sales bars ─────────────────────────────────────────────────────

  describe('salesBars', () => {
    it('dérive les barres mensuelles des jours vendus', async () => {
      const outlook = makeOutlook();
      outlook.salesByMonth[0] = { month: 1, soldDays: 15, totalDays: 31 };
      outlook.salesByMonth[1] = { month: 2, soldDays: 28, totalDays: 28 };
      mockDashboard.getAdOutlook.mockReturnValue(of(outlook));

      await component.ngOnInit();

      expect(component.salesBars().length).toBe(12);
      expect(component.salesBars()[0]).toMatchObject({ pct: 48, label: 'J', soldDays: 15 });
      expect(component.salesBars()[1]).toMatchObject({ pct: 100, label: 'F', soldDays: 28 });
    });

    it('marque le mois courant', async () => {
      await component.ngOnInit();

      const currentMonth = new Date().getMonth();
      expect(component.salesBars()[currentMonth].current).toBe(true);
      expect(component.salesBars().filter((b) => b.current).length).toBe(1);
    });
  });

  // ── 30-day gaps ────────────────────────────────────────────────────────────

  describe('jours vides sur mobile', () => {
    it('expose les jours sans éphéméride depuis contentStats', async () => {
      mockDashboard.getYearContentStats.mockReturnValue(
        of(
          makeContentStats({
            emptyNext30: [{ date: '2026-08-07', daysUntil: 23 }],
          }),
        ),
      );

      await component.ngOnInit();

      expect(component.emptyEventDays()).toEqual([{ date: '2026-08-07', daysUntil: 23 }]);
    });

    it('filtre les jours sans publicité depuis next30', async () => {
      const outlook = makeOutlook();
      outlook.next30 = outlook.next30.map((d, i) => ({ ...d, sold: i < 28 }));
      mockDashboard.getAdOutlook.mockReturnValue(of(outlook));

      await component.ngOnInit();

      expect(component.emptyAdDays().length).toBe(2);
      expect(component.unsoldAdDays()).toBe(2);
    });

    it('gapSeverity: sans éphéméride ≤ 7 jours → critical, sinon warning', () => {
      expect(component.gapSeverity({ date: '', daysUntil: 3 })).toBe('critical');
      expect(component.gapSeverity({ date: '', daysUntil: 12 })).toBe('warning');
    });

    it("countdownLabel: aujourd'hui / demain / dans N j", () => {
      expect(component.countdownLabel(0)).toBe("aujourd'hui");
      expect(component.countdownLabel(1)).toBe('demain');
      expect(component.countdownLabel(12)).toBe('dans 12 j');
    });

    it('gapLabel: ISO → jour + mois en français', () => {
      expect(component.gapLabel('2026-08-07')).toBe('7 août');
    });
  });

  // ── Activity feed (unchanged behavior) ─────────────────────────────────────

  describe('activityFeed', () => {
    it('mappe les entrées audit_log en lignes lisibles', async () => {
      mockInsights.getDashboardStats.mockReturnValue(
        of(
          makeOpStats({
            activity: [
              {
                actor_name: 'Alice Martin',
                action: 'INSERT',
                table_name: 'events',
                record_label: 'Indépendance du Congo',
                changed_at: new Date().toISOString(),
              },
            ],
          }),
        ),
      );

      await component.ngOnInit();

      const row = component.activityFeed()[0];
      expect(row.who).toBe('Alice Martin');
      expect(row.initials).toBe('AM');
      expect(row.action).toBe('a créé');
      expect(row.target).toBe('Indépendance du Congo');
      expect(row.meta).toBe('Événement');
    });

    it('utilise le libellé de table quand record_label est null', async () => {
      mockInsights.getDashboardStats.mockReturnValue(
        of(
          makeOpStats({
            activity: [
              {
                actor_name: 'Bob',
                action: 'DELETE',
                table_name: 'calendars',
                record_label: null,
                changed_at: new Date().toISOString(),
              },
            ],
          }),
        ),
      );

      await component.ngOnInit();

      expect(component.activityFeed()[0].target).toBe('Calendrier');
      expect(component.activityFeed()[0].action).toBe('a supprimé');
    });

    it('renvoie [] quand opStats est null (pas de workspace)', async () => {
      mockInsights.getDashboardStats.mockReturnValue(of(null));

      await component.ngOnInit();

      expect(component.activityFeed()).toEqual([]);
    });

    it('utilise des valeurs de repli pour acteur/action/table inconnus', async () => {
      mockInsights.getDashboardStats.mockReturnValue(
        of(
          makeOpStats({
            activity: [
              {
                actor_name: null,
                action: 'ACTION_INCONNUE',
                table_name: 'table_inconnue',
                record_label: null,
                changed_at: new Date().toISOString(),
              } as any,
            ],
          }),
        ),
      );

      await component.ngOnInit();

      const row = component.activityFeed()[0];
      expect(row.who).toBe('Système');
      expect(row.initials).toBe('S');
      expect(row.action).toBe('action_inconnue');
      expect(row.target).toBe('table_inconnue');
    });
  });
});
