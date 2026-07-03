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
      getDeviceStats:      jest.fn().mockReturnValue(of({ total: 0, android: 0, ios: 0 })),
      getDeviceLogs:       jest.fn().mockReturnValue(of([])),
      getCampaignTaps:     jest.fn().mockReturnValue(of([])),
      getCmsActivity:      jest.fn().mockReturnValue(of([])),
      getCalendarCoverage: jest.fn().mockReturnValue(of([])),
    };
    mockInsights = {
      getMetricsExtras: jest.fn().mockReturnValue(of(null)),
    };

    await TestBed.configureTestingModule({
      imports: [MetriquesComponent],
      providers: [
        { provide: MetriquesService, useValue: mockService },
        { provide: InsightsService,  useValue: mockInsights },
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

  describe('fillRateBarData', () => {
    it('convertit les jours vendus en pourcentages par position', () => {
      component.extras.set(makeExtras({
        fill_rate: [
          { month: 1, days: 31, header_days: 0,  footer_days: 23 },
          { month: 2, days: 28, header_days: 14, footer_days: 0  },
        ],
      }));
      const bars = component.fillRateBarData();
      expect(bars[0]).toMatchObject({ label: 'Jan', headerPct: 0,  footerPct: 74 });
      expect(bars[1]).toMatchObject({ label: 'Fév', headerPct: 50, footerPct: 0  });
      // Months absent from the RPC payload default to 0/0.
      expect(bars[2]).toMatchObject({ label: 'Mar', headerPct: 0, footerPct: 0 });
    });
  });

  describe('applyLatency', () => {
    it('renvoie null quand aucune recommandation appliquée', () => {
      component.extras.set(makeExtras());
      expect(component.applyLatency()).toBeNull();
    });

    it('renvoie les latences quand il y a des applications', () => {
      component.extras.set(makeExtras({
        apply_latency: { applied_count: 5, avg_hours: 12.4, median_hours: 8.1 },
      }));
      expect(component.applyLatency()).toEqual({ applied_count: 5, avg_hours: 12.4, median_hours: 8.1 });
    });
  });

  describe('exposition annonceurs + export CSV', () => {
    const EXPO = [
      { company_id: 'c1', company_name: 'Entreprise "Alpha"; Congo', campaigns: 2,
        days_aired: 10, days_booked: 4, impressions: 200, clicks: 5 },
      { company_id: 'c2', company_name: 'Beta', campaigns: 1,
        days_aired: 0, days_booked: 8, impressions: 0, clicks: 0 },
    ];

    it('exposureCtr calcule clics/impressions et null sans impression', () => {
      expect(component.exposureCtr(EXPO[0])).toBeCloseTo(0.025);
      expect(component.exposureCtr(EXPO[1])).toBeNull();
    });

    it('buildExposureCsv produit un CSV français (BOM, ; , CRLF, virgule décimale)', () => {
      const csv = component.buildExposureCsv(EXPO);
      expect(csv.charCodeAt(0)).toBe(0xFEFF);                      // BOM pour Excel
      const lines = csv.slice(1).split('\r\n');
      expect(lines[0]).toBe('Annonceur;Campagnes;Jours diffusés;Jours réservés;Impressions;Clics;CTR');
      // Nom contenant ; et " → encadré de guillemets, guillemets doublés.
      expect(lines[1]).toBe('"Entreprise ""Alpha""; Congo";2;10;4;200;5;2,50 %');
      // Zéro impression → CTR affiché en tiret.
      expect(lines[2]).toBe('Beta;1;0;8;0;0;—');
    });
  });

  describe('vélocité hebdomadaire', () => {
    it('calcule le total par semaine et le max', () => {
      component.extras.set(makeExtras({
        team_velocity: [
          { week_start: '2026-06-22', events: 2, entries: 3, campaigns: 1 },
          { week_start: '2026-06-29', events: 10, entries: 20, campaigns: 0 },
        ],
      }));
      expect(component.teamVelocity()[0].total).toBe(6);
      expect(component.teamVelocity()[1].total).toBe(30);
      expect(component.velocityMax()).toBe(30);
    });

    it('velocityTrend: hausse avec pourcentage', () => {
      component.extras.set(makeExtras({
        team_velocity: [
          { week_start: '2026-06-22', events: 10, entries: 0, campaigns: 0 },
          { week_start: '2026-06-29', events: 15, entries: 0, campaigns: 0 },
        ],
      }));
      expect(component.velocityTrend()).toEqual({ current: 15, previous: 10, deltaPct: 50, direction: 'up' });
    });

    it('velocityTrend: deltaPct null quand la semaine précédente est à zéro', () => {
      component.extras.set(makeExtras({
        team_velocity: [
          { week_start: '2026-06-22', events: 0, entries: 0, campaigns: 0 },
          { week_start: '2026-06-29', events: 5, entries: 0, campaigns: 0 },
        ],
      }));
      expect(component.velocityTrend()).toEqual({ current: 5, previous: 0, deltaPct: null, direction: 'up' });
    });

    it('velocityTrend: null quand les deux semaines sont à zéro ou données insuffisantes', () => {
      component.extras.set(makeExtras({
        team_velocity: [
          { week_start: '2026-06-22', events: 0, entries: 0, campaigns: 0 },
          { week_start: '2026-06-29', events: 0, entries: 0, campaigns: 0 },
        ],
      }));
      expect(component.velocityTrend()).toBeNull();

      component.extras.set(makeExtras({
        team_velocity: [{ week_start: '2026-06-29', events: 5, entries: 0, campaigns: 0 }],
      }));
      expect(component.velocityTrend()).toBeNull();
    });

    it('weekLabel formate en jj/mm', () => {
      expect(component.weekLabel('2026-06-29')).toBe('29/06');
    });
  });

  describe('clickTrackingPending', () => {
    it('est false quand il n\'y a pas de campagnes', () => {
      component.campaignTaps.set([]);
      expect(component.clickTrackingPending()).toBe(false);
    });

    it('est false quand il n\'y a aucune impression', () => {
      component.campaignTaps.set([
        { campaign_id: 'c1', campaign_name: 'Test', advertiser: 'X', tap_count: 0, click_count: 0, ctr: null },
      ]);
      expect(component.clickTrackingPending()).toBe(false);
    });

    it('est true quand des impressions existent mais aucun clic n\'est enregistré', () => {
      component.campaignTaps.set([
        { campaign_id: 'c1', campaign_name: 'MTN',  advertiser: 'MTN',  tap_count: 1200, click_count: 0, ctr: null },
        { campaign_id: 'c2', campaign_name: 'Bcom', advertiser: 'Bcom', tap_count: 800,  click_count: 0, ctr: null },
      ]);
      expect(component.clickTrackingPending()).toBe(true);
    });

    it('est false dès qu\'au moins un clic est enregistré (mobile a livré le tracking)', () => {
      component.campaignTaps.set([
        { campaign_id: 'c1', campaign_name: 'MTN',  advertiser: 'MTN',  tap_count: 1200, click_count: 3, ctr: 0.0025 },
        { campaign_id: 'c2', campaign_name: 'Bcom', advertiser: 'Bcom', tap_count: 800,  click_count: 0, ctr: null },
      ]);
      expect(component.clickTrackingPending()).toBe(false);
    });
  });
});
