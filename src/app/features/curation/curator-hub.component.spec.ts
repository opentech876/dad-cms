import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { CuratorHubComponent } from './curator-hub.component';
import { CurationStore } from './curation-store.service';

describe('CuratorHubComponent', () => {
  let store: any;
  let component: CuratorHubComponent;

  beforeEach(async () => {
    store = {
      calendarYear: signal(2026),
      myCalendarRecs: signal([{ mmdd: '03-01' }, { mmdd: '03-15' }, { mmdd: '06-01' }]),
      load: jest.fn().mockResolvedValue(undefined),
      hubDayState: jest.fn().mockReturnValue('empty'),
      selectCalendar: jest.fn().mockResolvedValue(undefined),
      refreshRecs: jest.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [CuratorHubComponent],
      providers: [{ provide: CurationStore, useValue: store }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    TestBed.overrideComponent(CuratorHubComponent, { set: { template: '' } });
    component = TestBed.createComponent(CuratorHubComponent).componentInstance;
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('ngOnInit charge le store', async () => {
    await component.ngOnInit();
    expect(store.load).toHaveBeenCalled();
  });

  it('months() génère 12 sections avec les bons jours', () => {
    const m = component.months();
    expect(m).toHaveLength(12);
    expect(m[0].days).toHaveLength(31);
    expect(m[1].days.length).toBeGreaterThanOrEqual(28);
  });

  it('toggleMonth / isExpanded basculent l\'état', () => {
    const open = component.isExpanded(0);
    component.toggleMonth(0);
    expect(component.isExpanded(0)).toBe(!open);
    component.toggleMonth(0);
    expect(component.isExpanded(0)).toBe(open);
  });

  it('dayState délègue au store', () => {
    expect(component.dayState('03-01')).toBe('empty');
    expect(store.hubDayState).toHaveBeenCalledWith('03-01');
  });

  it('monthRecCount compte les recos du mois', () => {
    expect(component.monthRecCount(2)).toBe(2);
    expect(component.monthRecCount(5)).toBe(1);
  });

  it('onCalendarChange sélectionne un calendrier (ignore un id vide)', () => {
    component.onCalendarChange('cal-1');
    expect(store.selectCalendar).toHaveBeenCalledWith('cal-1');
    component.onCalendarChange('');
    expect(store.selectCalendar).toHaveBeenCalledTimes(1);
  });

  it('openDay / closePropose gèrent proposeMmdd', () => {
    component.openDay('03-01');
    expect(component.proposeMmdd()).toBe('03-01');
    component.closePropose();
    expect(component.proposeMmdd()).toBeNull();
  });

  it('onProposeSaved ferme le modal et rafraîchit', async () => {
    component.openDay('03-01');
    await component.onProposeSaved();
    expect(component.proposeMmdd()).toBeNull();
    expect(store.refreshRecs).toHaveBeenCalled();
  });
});
