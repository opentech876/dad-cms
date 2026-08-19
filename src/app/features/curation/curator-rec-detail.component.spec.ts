import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { CuratorRecDetailComponent } from './curator-rec-detail.component';
import { CurationStore } from './curation-store.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { EventService } from '../../core/events/event.service';
import { ToastService } from '../../core/services/toast.service';

function rec(over: any = {}) {
  return {
    id: 'r1',
    calendar_id: 'cal-1',
    mmdd: '08-15',
    position: 1,
    event_id: 'ev-1',
    status: 'pending',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
    applied_at: null,
    event: { image_path: 'e/c.jpg', title: 'Indépendance' },
    ...over,
  };
}

describe('CuratorRecDetailComponent', () => {
  let store: any, recs: any, events: any, toast: any, router: any;
  let component: CuratorRecDetailComponent;

  function build(paramId = 'r1') {
    store = {
      myRecs: signal([rec()]),
      entriesByMmdd: signal(new Map()),
      selectedCalendar: signal({ name: 'Calendrier 2026' }),
      selectedCalendarId: signal('cal-1'),
      calendarYear: signal(2026),
      load: jest.fn().mockResolvedValue(undefined),
      selectCalendar: jest.fn().mockResolvedValue(undefined),
      refreshRecs: jest.fn().mockResolvedValue(undefined),
    };
    recs = { removeSlot: jest.fn().mockReturnValue(of({ success: true })) };
    events = { getImageUrl: jest.fn((p: string) => `cover/${p}`) };
    toast = { success: jest.fn(), error: jest.fn() };
    router = { navigateByUrl: jest.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      imports: [CuratorRecDetailComponent],
      providers: [
        { provide: CurationStore, useValue: store },
        { provide: RecommendationService, useValue: recs },
        { provide: EventService, useValue: events },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => paramId } } } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(CuratorRecDetailComponent, { set: { template: '' } });
    component = TestBed.createComponent(CuratorRecDetailComponent).componentInstance;
  }

  beforeEach(() => build());

  it('ngOnInit lit l\'id de la route et n\'aligne pas un calendrier déjà courant', async () => {
    await component.ngOnInit();
    expect(component.recId()).toBe('r1');
    expect(store.selectCalendar).not.toHaveBeenCalled();
  });

  it('ngOnInit aligne le store sur le calendrier de la reco', async () => {
    store.myRecs.set([rec({ calendar_id: 'cal-2' })]);
    await component.ngOnInit();
    expect(store.selectCalendar).toHaveBeenCalledWith('cal-2');
  });

  it('ngOnInit charge le store quand aucune reco n\'est en mémoire', async () => {
    store.myRecs.set([]);
    await component.ngOnInit();
    expect(store.load).toHaveBeenCalled();
  });

  it('rec trouve la recommandation par id', () => {
    component.recId.set('r1');
    expect(component.rec()?.id).toBe('r1');
  });

  it('replacedTitle: titre de l\'occupant remplacé quand le créneau diffère', () => {
    component.recId.set('r1');
    store.entriesByMmdd.set(
      new Map([['08-15', [{ position: 1, event_id: 'ev-9', event: { title: 'Ancien' } }]]]),
    );
    expect(component.replacedTitle()).toBe('Ancien');
  });

  it('replacedTitle: null quand le créneau est vide ou identique', () => {
    component.recId.set('r1');
    expect(component.replacedTitle()).toBeNull();
    store.entriesByMmdd.set(new Map([['08-15', [{ position: 1, event_id: 'ev-1' }]]]));
    expect(component.replacedTitle()).toBeNull();
  });

  it('timeline: 3 étapes avec une étape active en attente', () => {
    component.recId.set('r1');
    const t = component.timeline();
    expect(t).toHaveLength(3);
    expect(t[2].active).toBe(true);
  });

  it('timeline: étape publiée quand la reco est appliquée', () => {
    store.myRecs.set([rec({ status: 'applied', applied_at: '2026-07-01T00:00:00Z' })]);
    component.recId.set('r1');
    const t = component.timeline();
    expect(t[2].title).toBe('Publiée');
  });

  it('helpers mmddLabel / positionLabel / artFor / imageUrl', () => {
    expect(component.mmddLabel('08-15')).toContain('août');
    expect(component.positionLabel(1)).toBeTruthy();
    expect(component.artFor('x')).toContain('linear-gradient');
    expect(component.imageUrl(rec() as any)).toBe('cover/e/c.jpg');
    expect(component.imageUrl(rec({ event: { image_path: null } }) as any)).toBeNull();
  });

  it('armWithdraw / cancelWithdraw basculent l\'état', () => {
    component.armWithdraw();
    expect(component.withdrawArmed()).toBe(true);
    component.cancelWithdraw();
    expect(component.withdrawArmed()).toBe(false);
  });

  it('withdraw retire la reco et redirige en cas de succès', async () => {
    component.recId.set('r1');
    await component.withdraw();
    expect(recs.removeSlot).toHaveBeenCalledWith('cal-1', '08-15', 1);
    expect(toast.success).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/curation/mes-recommandations');
  });

  it('withdraw affiche une erreur quand le retrait échoue', async () => {
    recs.removeSlot.mockReturnValue(of({ success: false, error: 'nope' }));
    component.recId.set('r1');
    await component.withdraw();
    expect(toast.error).toHaveBeenCalledWith('nope');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('withdraw ne fait rien pour une reco déjà publiée', async () => {
    store.myRecs.set([rec({ status: 'applied' })]);
    component.recId.set('r1');
    await component.withdraw();
    expect(recs.removeSlot).not.toHaveBeenCalled();
  });
});
