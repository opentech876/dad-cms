import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { CuratorRecDetailComponent } from './curator-rec-detail.component';
import { CurationStore } from './curation-store.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { EventService } from '../../core/events/event.service';
import { ToastService } from '../../core/services/toast.service';
import { PresidencyRecommendationWithEvent } from '../../core/presidency/recommendation.service';

function rec(over: Partial<PresidencyRecommendationWithEvent> = {}): PresidencyRecommendationWithEvent {
  return {
    id: 'r1',
    calendar_id: 'cal-1',
    mmdd: '08-15',
    position: 1,
    event_id: 'e1',
    workspace_id: 'ws-1',
    status: 'pending',
    created_by: 'u-1',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    applied_at: null,
    applied_by: null,
    event: { id: 'e1', title: 'Proposé' } as any,
    ...over,
  };
}

describe('CuratorRecDetailComponent', () => {
  let component: CuratorRecDetailComponent;
  let store: any;
  let mockRecs: any;
  let mockRouter: { navigateByUrl: jest.Mock };

  function build(recId: string, recs: PresidencyRecommendationWithEvent[], selectedCal = 'cal-1'): void {
    store = {
      myRecs: signal(recs),
      selectedCalendarId: signal(selectedCal),
      calendarYear: signal(2026),
      selectedCalendar: signal({ id: selectedCal, name: 'Calendrier 2026', year: 2026 }),
      entriesByMmdd: signal(new Map()),
      load: jest.fn().mockResolvedValue(undefined),
      selectCalendar: jest.fn().mockResolvedValue(undefined),
      refreshRecs: jest.fn().mockResolvedValue(undefined),
    };
    mockRecs = { removeSlot: jest.fn().mockReturnValue(of({ success: true })) };
    mockRouter = { navigateByUrl: jest.fn().mockResolvedValue(true) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CuratorRecDetailComponent],
      providers: [
        { provide: CurationStore, useValue: store },
        { provide: RecommendationService, useValue: mockRecs },
        { provide: EventService, useValue: { getImageUrl: jest.fn((p: string) => `url/${p}`) } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => recId } } } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(CuratorRecDetailComponent, { set: { template: '' } });
    component = TestBed.createComponent(CuratorRecDetailComponent).componentInstance;
  }

  describe('rec()', () => {
    it('résout la recommandation par id de route', async () => {
      build('r1', [rec()]);
      await component.ngOnInit();
      expect(component.rec()?.id).toBe('r1');
    });

    it('null quand introuvable', async () => {
      build('inconnu', [rec()]);
      await component.ngOnInit();
      expect(component.rec()).toBeNull();
    });
  });

  describe('alignement inter-calendrier (fix)', () => {
    it("aligne le store sur le calendrier de la rec quand il diffère du sélectionné", async () => {
      build('r1', [rec({ calendar_id: 'cal-2027' })], 'cal-1');
      await component.ngOnInit();
      expect(store.selectCalendar).toHaveBeenCalledWith('cal-2027');
    });

    it("ne réaligne pas quand la rec est déjà sur le calendrier sélectionné", async () => {
      build('r1', [rec({ calendar_id: 'cal-1' })], 'cal-1');
      await component.ngOnInit();
      expect(store.selectCalendar).not.toHaveBeenCalled();
    });
  });

  describe('timeline', () => {
    it('pending → dernière étape active « En attente de publication »', async () => {
      build('r1', [rec({ status: 'pending' })]);
      await component.ngOnInit();
      const steps = component.timeline();
      expect(steps[steps.length - 1].title).toBe('En attente de publication');
      expect(steps[steps.length - 1].active).toBe(true);
    });

    it('applied → dernière étape « Publiée »', async () => {
      build('r1', [rec({ status: 'applied', applied_at: '2026-07-10T00:00:00Z' })]);
      await component.ngOnInit();
      const steps = component.timeline();
      expect(steps[steps.length - 1].title).toBe('Publiée');
    });
  });

  describe('replacedTitle', () => {
    it('titre de l\'occupant quand un AUTRE événement occupe le créneau (pending)', async () => {
      build('r1', [rec({ status: 'pending', event_id: 'e1', mmdd: '08-15', position: 1 })]);
      store.entriesByMmdd.set(
        new Map([['08-15', [{ position: 1, event_id: 'e9', event: { title: 'Actuel' } }]]]),
      );
      await component.ngOnInit();
      expect(component.replacedTitle()).toBe('Actuel');
    });

    it('null quand le créneau tient déjà le même événement', async () => {
      build('r1', [rec({ status: 'pending', event_id: 'e1', mmdd: '08-15', position: 1 })]);
      store.entriesByMmdd.set(
        new Map([['08-15', [{ position: 1, event_id: 'e1', event: { title: 'Proposé' } }]]]),
      );
      await component.ngOnInit();
      expect(component.replacedTitle()).toBeNull();
    });

    it('null pour une rec déjà publiée', async () => {
      build('r1', [rec({ status: 'applied' })]);
      store.entriesByMmdd.set(
        new Map([['08-15', [{ position: 1, event_id: 'e9', event: { title: 'Actuel' } }]]]),
      );
      await component.ngOnInit();
      expect(component.replacedTitle()).toBeNull();
    });
  });

  describe('withdraw', () => {
    it('pending → removeSlot puis navigation vers la liste', async () => {
      build('r1', [rec({ status: 'pending', calendar_id: 'cal-1', mmdd: '08-15', position: 1 })]);
      await component.ngOnInit();

      await component.withdraw();

      expect(mockRecs.removeSlot).toHaveBeenCalledWith('cal-1', '08-15', 1);
      expect(store.refreshRecs).toHaveBeenCalled();
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/curation/mes-recommandations');
    });

    it('publiée → withdraw est un no-op (garde-fou)', async () => {
      build('r1', [rec({ status: 'applied' })]);
      await component.ngOnInit();

      await component.withdraw();

      expect(mockRecs.removeSlot).not.toHaveBeenCalled();
    });
  });
});
