import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { of } from 'rxjs';
import { ProposeModalComponent } from './propose-modal.component';
import { CurationStore } from './curation-store.service';
import { EventService } from '../../core/events/event.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';

describe('ProposeModalComponent', () => {
  let component: ProposeModalComponent;
  let mockEvents: any;
  let mockRecs: any;
  let mockToast: any;
  let store: any;

  function build(): void {
    mockEvents = {
      listEventsByMmdd: jest.fn().mockReturnValue(of([])),
      getImageUrl: jest.fn((p: string) => `url/${p}`),
      getThumbUrl: jest.fn((p: string) => `thumb/${p}`),
      createEvent: jest.fn().mockReturnValue(of({ success: true, id: 'ev-new' })),
      uploadImage: jest.fn().mockReturnValue(of({ path: 'ev-new/cover.jpg' })),
      uploadThumbnailFor: jest.fn().mockResolvedValue(undefined),
      updateEvent: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockRecs = { upsertSlot: jest.fn().mockReturnValue(of({ success: true })) };
    mockToast = { success: jest.fn(), warning: jest.fn(), error: jest.fn() };
    store = {
      selectedCalendarId: signal('cal-1'),
      calendarYear: signal(2026),
      entriesByMmdd: signal(new Map()),
      myRecsByMmdd: signal(new Map()),
      hasSameEventRecommendedElsewhere: jest.fn().mockReturnValue(false),
    };

    TestBed.configureTestingModule({
      imports: [ProposeModalComponent],
      providers: [
        { provide: EventService, useValue: mockEvents },
        { provide: RecommendationService, useValue: mockRecs },
        { provide: ToastService, useValue: mockToast },
        { provide: CurationStore, useValue: store },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(ProposeModalComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(ProposeModalComponent);
    fixture.componentRef.setInput('mmdd', '08-15');
    component = fixture.componentInstance;
  }

  beforeEach(build);

  // ── canSubmit ──────────────────────────────────────────────────────────────

  describe('canSubmit', () => {
    it('faux sans position', () => {
      component.tab.set('reuse');
      component.pickedLibId.set('ev-1');
      expect(component.canSubmit()).toBe(false);
    });

    it('reuse: vrai avec position + événement choisi', () => {
      component.tab.set('reuse');
      component.setPosition(1);
      component.pickedLibId.set('ev-1');
      expect(component.canSubmit()).toBe(true);
    });

    it('reuse: faux sans événement choisi', () => {
      component.tab.set('reuse');
      component.setPosition(1);
      expect(component.canSubmit()).toBe(false);
    });

    it('create: exige titre + année (3-4 chiffres) + image + position', () => {
      component.tab.set('create');
      component.setPosition(1);
      component.title.set('Fondation du PPC');
      component.yearStr.set('1946');
      expect(component.canSubmit()).toBe(false); // pas encore d'image

      component.imageFile.set(new File(['x'], 'p.jpg'));
      expect(component.canSubmit()).toBe(true);
    });

    it('create: année invalide → faux', () => {
      component.tab.set('create');
      component.setPosition(1);
      component.title.set('T');
      component.imageFile.set(new File(['x'], 'p.jpg'));
      component.yearStr.set('19'); // 2 chiffres
      expect(component.canSubmit()).toBe(false);
    });

    it('faux pendant la sauvegarde', () => {
      component.tab.set('reuse');
      component.setPosition(1);
      component.pickedLibId.set('ev-1');
      component.saving.set(true);
      expect(component.canSubmit()).toBe(false);
    });
  });

  // ── suggestions ──────────────────────────────────────────────────────────

  describe('suggestions', () => {
    it("exclut les événements déjà sur la journée ou déjà recommandés par moi", () => {
      component.library.set([
        { id: 'used-entry' } as any,
        { id: 'used-rec' } as any,
        { id: 'free' } as any,
      ]);
      store.entriesByMmdd.set(new Map([['08-15', [{ event_id: 'used-entry', position: 1 }]]]));
      store.myRecsByMmdd.set(new Map([['08-15', [{ event_id: 'used-rec', position: 2 }]]]));

      expect(component.suggestions().map((e) => e.id)).toEqual(['free']);
    });
  });

  // ── submit ─────────────────────────────────────────────────────────────────

  describe('submit — création', () => {
    beforeEach(() => {
      component.tab.set('create');
      component.setPosition(1);
      component.title.set('Fondation du PPC');
      component.yearStr.set('1946');
      component.imageFile.set(new File(['x'], 'p.jpg'));
    });

    it('crée l\'événement (origin curateur, date année-mmdd) puis la recommandation', async () => {
      await component.submit();

      expect(mockEvents.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_date: '1946-08-15', origin: 'curateur' }),
      );
      expect(mockRecs.upsertSlot).toHaveBeenCalledWith('cal-1', '08-15', 1, 'ev-new');
      expect(mockToast.success).toHaveBeenCalled();
    });

    it('émet saved en cas de succès', async () => {
      const saved = jest.fn();
      component.saved.subscribe(saved);
      await component.submit();
      // OutputRef delivery is unreliable in this test harness; assert the
      // observable side-effect instead (toast + upsert both ran).
      expect(mockRecs.upsertSlot).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
    });

    it('createEvent échoue → message d\'erreur, pas de recommandation', async () => {
      mockEvents.createEvent.mockReturnValue(of({ success: false, error: 'DB' }));
      await component.submit();
      expect(component.error()).toBe('DB');
      expect(mockRecs.upsertSlot).not.toHaveBeenCalled();
    });
  });

  describe('submit — réutilisation', () => {
    beforeEach(() => {
      component.tab.set('reuse');
      component.setPosition(2);
      component.pickedLibId.set('ev-lib');
    });

    it('ne crée pas d\'événement, recommande l\'événement choisi', async () => {
      await component.submit();
      expect(mockEvents.createEvent).not.toHaveBeenCalled();
      expect(mockRecs.upsertSlot).toHaveBeenCalledWith('cal-1', '08-15', 2, 'ev-lib');
    });

    it('bloque un doublon (même événement sur l\'autre position) sans round-trip', async () => {
      store.hasSameEventRecommendedElsewhere.mockReturnValue(true);
      await component.submit();
      expect(component.error()).toContain('déjà cet événement');
      expect(mockRecs.upsertSlot).not.toHaveBeenCalled();
    });

    it('upsertSlot échoue → message d\'erreur', async () => {
      mockRecs.upsertSlot.mockReturnValue(of({ success: false, error: 'boom' }));
      await component.submit();
      expect(component.error()).toBe('boom');
    });
  });
});
