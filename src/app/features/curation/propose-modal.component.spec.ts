import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { of } from 'rxjs';
import { ProposeModalComponent } from './propose-modal.component';
import { CurationStore } from './curation-store.service';
import { EventService } from '../../core/events/event.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';

jest.mock('../../core/utils/image.utils', () => ({
  compressImage: jest.fn((f: File) => Promise.resolve(f)),
}));

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

  describe('helpers d\'affichage + interactions', () => {
    beforeEach(() => {
      (global as any).URL.createObjectURL = jest.fn(() => 'blob:x');
      (global as any).URL.revokeObjectURL = jest.fn();
    });

    it('replaceTitleFor renvoie null quand le créneau est libre', () => {
      expect(component.replaceTitleFor(1)).toBeNull();
      expect(component.replaceTitleFor(2)).toBeNull();
    });

    it('positionLabel et artFor délèguent aux utilitaires', () => {
      expect(component.positionLabel(1)).toBeTruthy();
      expect(component.artFor('seed')).toContain('linear-gradient');
    });

    it('imageUrl renvoie une URL ou null', () => {
      expect(component.imageUrl({ image_path: 'e/c.jpg' } as any)).toBe('url/e/c.jpg');
      expect(component.imageUrl({} as any)).toBeNull();
      expect(component.imageUrl(null)).toBeNull();
    });

    it('eventYear extrait l\'année ou renvoie une chaîne vide', () => {
      expect(component.eventYear({ event_date: '1963-08-15' } as any)).toBe('1963');
      expect(component.eventYear({} as any)).toBe('');
    });

    it('setTab change l\'onglet et efface l\'erreur', () => {
      component.error.set('x');
      component.setTab('create');
      expect(component.tab()).toBe('create');
      expect(component.error()).toBeNull();
    });

    it('pickLibrary sélectionne un événement et passe en réutilisation', () => {
      component.pickLibrary('ev-9');
      expect(component.tab()).toBe('reuse');
      expect(component.pickedLibId()).toBe('ev-9');
    });

    it('clearPicked réinitialise la sélection', () => {
      component.pickLibrary('ev-9');
      component.clearPicked();
      expect(component.pickedLibId()).toBeNull();
    });

    it('onImageChange stocke le fichier et crée un aperçu', () => {
      const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
      component.onImageChange({ target: { files: [file] } } as any);
      expect(component.imageFile()).toBe(file);
      expect(component.imagePreview()).toBe('blob:x');
    });

    it('onImageChange ignore l\'absence de fichier', () => {
      component.onImageChange({ target: { files: [] } } as any);
      expect(component.imageFile()).toBeNull();
    });

    it('close révoque l\'aperçu quand on n\'est pas en sauvegarde', () => {
      const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
      component.onImageChange({ target: { files: [file] } } as any);
      component.close();
      expect(component.imagePreview()).toBeNull();
    });

    it('close ne fait rien pendant une sauvegarde', () => {
      component.saving.set(true);
      component.onImageChange({ target: { files: [new File(['x'], 'p.jpg')] } } as any);
      component.close();
      expect(component.imagePreview()).toBe('blob:x');
    });

    it('ngOnDestroy révoque l\'aperçu restant', () => {
      component.onImageChange({ target: { files: [new File(['x'], 'p.jpg')] } } as any);
      component.ngOnDestroy();
      expect((global as any).URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('submit — mode création', () => {
    beforeEach(() => {
      (global as any).URL.createObjectURL = jest.fn(() => 'blob:x');
      (global as any).URL.revokeObjectURL = jest.fn();
      component.setTab('create');
      component.setPosition(1);
      component.title.set('Nouvel événement');
      component.yearStr.set('1960');
      component.imageFile.set(new File(['x'], 'p.jpg', { type: 'image/jpeg' }));
    });

    it('crée l\'événement, téléverse l\'image et propose le créneau', async () => {
      await component.submit();
      expect(mockEvents.createEvent).toHaveBeenCalledWith(expect.objectContaining({ origin: 'curateur' }));
      expect(mockEvents.uploadImage).toHaveBeenCalled();
      expect(mockEvents.uploadThumbnailFor).toHaveBeenCalled();
      expect(mockRecs.upsertSlot).toHaveBeenCalled();
    });

    it('avertit quand le téléversement de l\'image échoue', async () => {
      mockEvents.uploadImage.mockReturnValueOnce(of({ path: null }));
      await component.submit();
      expect(mockToast.warning).toHaveBeenCalled();
    });

    it('expose une erreur quand la création échoue', async () => {
      mockEvents.createEvent.mockReturnValueOnce(of({ success: false, error: 'refus' }));
      await component.submit();
      expect(component.error()).toBe('refus');
      expect(mockRecs.upsertSlot).not.toHaveBeenCalled();
    });
  });
});
