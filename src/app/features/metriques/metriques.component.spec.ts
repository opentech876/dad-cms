import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MetriquesComponent } from './metriques.component';
import { MetriquesService } from '../../core/metriques/metriques.service';
import { InsightsService } from '../../core/insights/insights.service';

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
      component.extras.set({
        fill_rate: [
          { month: 1, days: 31, header_days: 0,  footer_days: 23 },
          { month: 2, days: 28, header_days: 14, footer_days: 0  },
        ],
        apply_latency: { applied_count: 0, avg_hours: 0, median_hours: 0 },
      });
      const bars = component.fillRateBarData();
      expect(bars[0]).toMatchObject({ label: 'Jan', headerPct: 0,  footerPct: 74 });
      expect(bars[1]).toMatchObject({ label: 'Fév', headerPct: 50, footerPct: 0  });
      // Months absent from the RPC payload default to 0/0.
      expect(bars[2]).toMatchObject({ label: 'Mar', headerPct: 0, footerPct: 0 });
    });
  });

  describe('applyLatency', () => {
    it('renvoie null quand aucune recommandation appliquée', () => {
      component.extras.set({
        fill_rate: [],
        apply_latency: { applied_count: 0, avg_hours: 0, median_hours: 0 },
      });
      expect(component.applyLatency()).toBeNull();
    });

    it('renvoie les latences quand il y a des applications', () => {
      component.extras.set({
        fill_rate: [],
        apply_latency: { applied_count: 5, avg_hours: 12.4, median_hours: 8.1 },
      });
      expect(component.applyLatency()).toEqual({ applied_count: 5, avg_hours: 12.4, median_hours: 8.1 });
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
