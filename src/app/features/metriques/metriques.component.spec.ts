import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MetriquesComponent } from './metriques.component';
import { MetriquesService } from '../../core/metriques/metriques.service';
import { InsightsService, MetricsExtraStats } from '../../core/insights/insights.service';

/** Complete-but-empty extras payload; tests override the slice under test. */
function makeExtras(overrides: Partial<MetricsExtraStats> = {}): MetricsExtraStats {
  return {
    fill_rate: [],
    apply_latency: { applied_count: 0, avg_hours: 0, median_hours: 0 },
    advertiser_exposure: [],
    team_velocity: [],
    ...overrides,
  };
}

describe('MetriquesComponent', () => {
  let component: MetriquesComponent;
  let fixture: ComponentFixture<MetriquesComponent>;
  let mockService: any;
  let mockInsights: any;

  beforeEach(async () => {
    mockService = {
      getDeviceStats: jest.fn().mockReturnValue(of({ total: 0, android: 0, ios: 0 })),
      getDeviceLogs: jest.fn().mockReturnValue(of([])),
      getCampaignTaps: jest.fn().mockReturnValue(of([])),
      getCmsActivity: jest.fn().mockReturnValue(of([])),
    };
    mockInsights = {
      getMetricsExtras: jest.fn().mockReturnValue(of(null)),
    };

    await TestBed.configureTestingModule({
      imports: [MetriquesComponent],
      providers: [
        { provide: MetriquesService, useValue: mockService },
        { provide: InsightsService, useValue: mockInsights },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(MetriquesComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(MetriquesComponent);
    component = fixture.componentInstance;
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  describe('soldDaysBarData', () => {
    it('convertit les jours vendus du mois en barres (une bannière par jour, footer only)', () => {
      component.extras.set(
        makeExtras({
          fill_rate: [
            { month: 1, days: 31, header_days: 0, footer_days: 23 },
            { month: 2, days: 28, header_days: 0, footer_days: 14 },
          ],
        }),
      );
      const bars = component.soldDaysBarData();
      expect(bars[0]).toMatchObject({ label: 'Jan', soldDays: 23, pct: 74 });
      expect(bars[1]).toMatchObject({ label: 'Fév', soldDays: 14, pct: 50 });
      // Months absent from the RPC payload default to zero.
      expect(bars[2]).toMatchObject({ label: 'Mar', soldDays: 0, pct: 0 });
    });
  });

  describe('exposition annonceurs + export CSV', () => {
    const EXPO = [
      {
        company_id: 'c1',
        company_name: 'Entreprise "Alpha"; Congo',
        campaigns: 2,
        days_aired: 10,
        days_booked: 4,
        impressions: 200,
        clicks: 5,
      },
      {
        company_id: 'c2',
        company_name: 'Beta',
        campaigns: 1,
        days_aired: 0,
        days_booked: 8,
        impressions: 0,
        clicks: 0,
      },
    ];

    it('exposureCtr calcule clics/impressions et null sans impression', () => {
      expect(component.exposureCtr(EXPO[0])).toBeCloseTo(0.025);
      expect(component.exposureCtr(EXPO[1])).toBeNull();
    });

    it('buildExposureCsv produit un CSV français (BOM, ; , CRLF, virgule décimale)', () => {
      const csv = component.buildExposureCsv(EXPO);
      expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM pour Excel
      const lines = csv.slice(1).split('\r\n');
      expect(lines[0]).toBe(
        'Annonceur;Campagnes;Jours diffusés;Jours réservés;Impressions;Clics;CTR',
      );
      // Nom contenant ; et " → encadré de guillemets, guillemets doublés.
      expect(lines[1]).toBe('"Entreprise ""Alpha""; Congo";2;10;4;200;5;2,50 %');
      // Zéro impression → CTR affiché en tiret.
      expect(lines[2]).toBe('Beta;1;0;8;0;0;—');
    });
  });

  describe('vélocité hebdomadaire', () => {
    it('calcule le total par semaine et le max', () => {
      component.extras.set(
        makeExtras({
          team_velocity: [
            { week_start: '2026-06-22', events: 2, entries: 3, campaigns: 1 },
            { week_start: '2026-06-29', events: 10, entries: 20, campaigns: 0 },
          ],
        }),
      );
      expect(component.teamVelocity()[0].total).toBe(6);
      expect(component.teamVelocity()[1].total).toBe(30);
      expect(component.velocityMax()).toBe(30);
    });

    it('velocityTrend: hausse avec pourcentage', () => {
      component.extras.set(
        makeExtras({
          team_velocity: [
            { week_start: '2026-06-22', events: 10, entries: 0, campaigns: 0 },
            { week_start: '2026-06-29', events: 15, entries: 0, campaigns: 0 },
          ],
        }),
      );
      expect(component.velocityTrend()).toEqual({
        current: 15,
        previous: 10,
        deltaPct: 50,
        direction: 'up',
      });
    });

    it('velocityTrend: deltaPct null quand la semaine précédente est à zéro', () => {
      component.extras.set(
        makeExtras({
          team_velocity: [
            { week_start: '2026-06-22', events: 0, entries: 0, campaigns: 0 },
            { week_start: '2026-06-29', events: 5, entries: 0, campaigns: 0 },
          ],
        }),
      );
      expect(component.velocityTrend()).toEqual({
        current: 5,
        previous: 0,
        deltaPct: null,
        direction: 'up',
      });
    });

    it('velocityTrend: null quand les deux semaines sont à zéro ou données insuffisantes', () => {
      component.extras.set(
        makeExtras({
          team_velocity: [
            { week_start: '2026-06-22', events: 0, entries: 0, campaigns: 0 },
            { week_start: '2026-06-29', events: 0, entries: 0, campaigns: 0 },
          ],
        }),
      );
      expect(component.velocityTrend()).toBeNull();

      component.extras.set(
        makeExtras({
          team_velocity: [{ week_start: '2026-06-29', events: 5, entries: 0, campaigns: 0 }],
        }),
      );
      expect(component.velocityTrend()).toBeNull();
    });

    it('weekLabel formate en jj/mm', () => {
      expect(component.weekLabel('2026-06-29')).toBe('29/06');
    });
  });

  describe('totaux impressions / clics', () => {
    it('agrège impressions, clics et CTR global depuis les taps', () => {
      component.campaignTaps.set([
        {
          campaign_id: 'c1',
          campaign_name: 'MTN',
          advertiser: 'MTN',
          tap_count: 1200,
          click_count: 3,
          ctr: 0.0025,
        },
        {
          campaign_id: 'c2',
          campaign_name: 'Bcom',
          advertiser: 'Bcom',
          tap_count: 800,
          click_count: 1,
          ctr: null,
        },
      ]);
      expect(component.totalImpressions()).toBe(2000);
      expect(component.totalClicks()).toBe(4);
      expect(component.globalCtr()).toBeCloseTo(0.002);
    });

    it('CTR global null sans impression', () => {
      component.campaignTaps.set([]);
      expect(component.globalCtr()).toBeNull();
    });
  });

  describe('ngOnInit / helpers / export', () => {
    it('ngOnInit remplit les signaux depuis les services', async () => {
      mockService.getDeviceStats.mockReturnValueOnce(of({ total: 5, android: 3, ios: 2 }));
      mockInsights.getMetricsExtras.mockReturnValueOnce(of(makeExtras({ team_velocity: [] })));
      await component.ngOnInit();
      expect(component.deviceStats().total).toBe(5);
      expect(component.loading()).toBe(false);
    });

    it('formatAction met en forme les actions snake_case', () => {
      expect(component.formatAction('mark_paid')).toBe('Mark Paid');
    });

    it('monthLabel renvoie le libellé du mois ou le numéro', () => {
      expect(component.monthLabel(1)).toBeTruthy();
      expect(component.monthLabel(99)).toBe('99');
    });

    it('exportExposureCsv ne fait rien sans ligne', () => {
      const createSpy = jest.spyOn(document, 'createElement');
      (component as any).advertiserExposure = () => [];
      component.exportExposureCsv();
      expect(createSpy).not.toHaveBeenCalledWith('a');
      createSpy.mockRestore();
    });

    it('exportExposureCsv déclenche un téléchargement quand il y a des lignes', () => {
      const click = jest.fn();
      const anchor = { href: '', download: '', click } as any;
      jest.spyOn(document, 'createElement').mockReturnValueOnce(anchor);
      (global as any).URL.createObjectURL = jest.fn(() => 'blob:x');
      (global as any).URL.revokeObjectURL = jest.fn();
      (component as any).advertiserExposure = (() => [
        { company_name: 'ACME', impressions: 10, clicks: 1, days_active: 2, positions: ['footer'] },
      ]) as any;
      component.exportExposureCsv();
      expect(click).toHaveBeenCalled();
      expect(anchor.download).toContain('exposition-annonceurs-');
    });
  });
});
