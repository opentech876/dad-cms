import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { MetriquesComponent } from './metriques.component';
import { MetriquesService } from '../../core/metriques/metriques.service';

describe('MetriquesComponent', () => {
  let component: MetriquesComponent;
  let fixture: ComponentFixture<MetriquesComponent>;
  let mockService: any;

  beforeEach(async () => {
    mockService = {
      getDeviceStats:      jest.fn().mockReturnValue(of({ total: 0, android: 0, ios: 0 })),
      getDeviceLogs:       jest.fn().mockReturnValue(of([])),
      getCampaignTaps:     jest.fn().mockReturnValue(of([])),
      getCmsActivity:      jest.fn().mockReturnValue(of([])),
      getCalendarCoverage: jest.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [MetriquesComponent],
      providers: [{ provide: MetriquesService, useValue: mockService }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(MetriquesComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(MetriquesComponent);
    component = fixture.componentInstance;
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
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
