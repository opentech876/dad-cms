import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { CuratorWorkspaceComponent } from './curator-workspace.component';
import { EventService } from '../../core/events/event.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';

const FAKE_EVENT = {
  id: 'ev-1', event_date: '1960-08-15', title: 'Indépendance', description: null,
  image_path: null, source: null, historian: null, status: 'published' as const,
  origin: 'editorial' as const, workspace_id: 'ws-1',
  created_by: 'u1', created_at: '', updated_at: '', updated_by: null, deleted_at: null, deleted_by: null,
};

const FAKE_CURATED_EVENT = {
  ...FAKE_EVENT, id: 'ev-cur', title: 'Traité de Brazzaville', event_date: '1880-09-10',
  origin: 'curateur' as const, status: 'draft' as const,
};

const FAKE_REC = {
  id: 'r1', calendar_id: 'cal-1', mmdd: '08-15', position: 1 as const,
  event_id: 'ev-1', workspace_id: 'ws-1', status: 'pending' as const,
  created_by: 'u1', created_at: '', updated_at: '', applied_at: null, applied_by: null,
  event: FAKE_EVENT,
};

const FAKE_ENTRY = {
  id: 'ce-1', calendar_id: 'cal-1', mmdd: '08-15', position: 1 as const,
  event_id: 'ev-1', workspace_id: 'ws-1', event: FAKE_EVENT,
};

describe('CuratorWorkspaceComponent', () => {
  let component: CuratorWorkspaceComponent;
  let fixture: ComponentFixture<CuratorWorkspaceComponent>;
  let mockEvent: {
    listEventsByMmdd: jest.Mock;
    listEvents: jest.Mock;
    createEvent: jest.Mock;
    uploadImage: jest.Mock;
    updateEvent: jest.Mock;
    getImageUrl: jest.Mock;
  };
  let mockRec: {
    upsertSlot: jest.Mock;
    removeSlot: jest.Mock;
  };
  let mockToast: { success: jest.Mock; error: jest.Mock; warning: jest.Mock };

  beforeEach(async () => {
    mockEvent = {
      listEventsByMmdd: jest.fn().mockReturnValue(of([FAKE_EVENT])),
      listEvents:       jest.fn().mockReturnValue(of([FAKE_EVENT, FAKE_CURATED_EVENT])),
      createEvent:      jest.fn().mockReturnValue(of({ success: true, id: 'ev-new' })),
      uploadImage:      jest.fn().mockReturnValue(of({ path: 'ev-new/cover.jpg' })),
      uploadThumbnailFor: jest.fn().mockResolvedValue(undefined),
      updateEvent:      jest.fn().mockReturnValue(of({ success: true })),
      getImageUrl:      jest.fn((p: string) => `https://cdn/${p}`),
    };
    mockRec = {
      upsertSlot: jest.fn().mockReturnValue(of({ success: true })),
      removeSlot: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CuratorWorkspaceComponent],
      providers: [
        { provide: EventService, useValue: mockEvent },
        { provide: RecommendationService, useValue: mockRec },
        { provide: ToastService, useValue: mockToast },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    TestBed.overrideComponent(CuratorWorkspaceComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(CuratorWorkspaceComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('recommendations', [FAKE_REC]);
    fixture.componentRef.setInput('existingEntries', [FAKE_ENTRY]);
    fixture.componentRef.setInput('calendarId', 'cal-1');
    fixture.componentRef.setInput('calendarYear', 2026);
    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  describe('recsByMmdd', () => {
    it('groupe les recommandations par mmdd', () => {
      expect(component.recsByMmdd().get('08-15')?.length).toBe(1);
    });

    it('hasRecommendation renvoie true pour une position recommandée', () => {
      expect(component.hasRecommendation('08-15', 1)).toBe(true);
      expect(component.hasRecommendation('08-15', 2)).toBe(false);
    });
  });

  describe('dayState()', () => {
    it("retourne 'partial' quand 1 sur 2 positions est recommandée", () => {
      expect(component.dayState('08-15')).toBe('partial');
    });

    it("retourne 'full' quand les 2 positions sont recommandées", () => {
      fixture.componentRef.setInput('recommendations', [
        { ...FAKE_REC, position: 1 as const },
        { ...FAKE_REC, id: 'r2', position: 2 as const },
      ]);
      fixture.detectChanges();
      expect(component.dayState('08-15')).toBe('full');
    });

    it("retourne 'empty' pour un mmdd sans recommandation", () => {
      expect(component.dayState('01-01')).toBe('empty');
    });
  });

  describe('openDayEditor()', () => {
    it('charge la bibliothèque pour le mmdd cliqué', async () => {
      await component.openDayEditor('08-15');
      expect(mockEvent.listEventsByMmdd).toHaveBeenCalledWith('08-15');
      expect(component.editorOpen()).toBe(true);
    });

    it('pré-remplit les positions depuis les recommandations existantes', async () => {
      await component.openDayEditor('08-15');
      expect(component.editorPos1()).toBe('ev-1');
      expect(component.editorPos2()).toBeNull();
    });
  });

  describe('saveDayEditor()', () => {
    beforeEach(async () => {
      await component.openDayEditor('08-15');
    });

    it("appelle upsertSlot pour position 1 quand l'événement est choisi", async () => {
      component.pick(1, 'ev-1');
      await component.saveDayEditor();
      expect(mockRec.upsertSlot).toHaveBeenCalledWith('cal-1', '08-15', 1, 'ev-1');
    });

    it('appelle removeSlot pour position 2 quand aucun événement choisi', async () => {
      component.pick(2, null);
      await component.saveDayEditor();
      expect(mockRec.removeSlot).toHaveBeenCalledWith('cal-1', '08-15', 2);
    });

    it("ferme l'éditeur après une sauvegarde réussie", async () => {
      await component.saveDayEditor();
      expect(component.editorOpen()).toBe(false);
    });

    it("affiche un toast d'erreur si upsert échoue", async () => {
      mockRec.upsertSlot.mockReturnValueOnce(of({ success: false, error: 'oops' }));
      component.pick(1, 'ev-1');
      await component.saveDayEditor();
      expect(mockToast.error).toHaveBeenCalledWith('oops');
    });

    it('montre un toast succès après sauvegarde réussie', async () => {
      await component.saveDayEditor();
      expect(mockToast.success).toHaveBeenCalledWith('Recommandation enregistrée.');
    });
  });

  describe('onglet Bibliothèque', () => {
    it('setTab("bibliotheque") charge la bibliothèque complète (lazy)', async () => {
      await component.setTab('bibliotheque');
      expect(mockEvent.listEvents).toHaveBeenCalled();
      expect(component.libraryEvents().length).toBe(2);
    });

    it('filtre "Mes ajouts" ne garde que origin=curateur', async () => {
      await component.setTab('bibliotheque');
      component.libraryFilter.set('curateur');
      expect(component.filteredLibrary().map(e => e.id)).toEqual(['ev-cur']);
    });

    it('recherche insensible aux accents sur le titre', async () => {
      await component.setTab('bibliotheque');
      component.librarySearch.set('independance');
      expect(component.filteredLibrary().map(e => e.id)).toEqual(['ev-1']);
    });
  });

  describe("création d'événement (Curateur)", () => {
    beforeEach(() => {
      component.openCreateModal();
    });

    it('refuse une soumission sans titre ou sans date', async () => {
      component.createTitle.set('');
      component.createDate.set('');
      await component.submitCreate();
      expect(component.createError()).toBeTruthy();
      expect(mockEvent.createEvent).not.toHaveBeenCalled();
    });

    it("crée l'événement avec origin='curateur'", async () => {
      component.createTitle.set('Nouveau traité');
      component.createDate.set('1885-02-26');
      await component.submitCreate();
      expect(mockEvent.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Nouveau traité', event_date: '1885-02-26', origin: 'curateur' }),
      );
      expect(component.createOpen()).toBe(false);
    });

    it("téléverse l'image puis écrit image_path quand un fichier est choisi", async () => {
      component.createTitle.set('Avec image');
      component.createDate.set('1900-01-01');
      component.createImageFile.set(new File(['x'], 'photo.png', { type: 'image/png' }));
      await component.submitCreate();
      expect(mockEvent.uploadImage).toHaveBeenCalled();
      expect(mockEvent.updateEvent).toHaveBeenCalledWith('ev-new',
        expect.objectContaining({ image_path: 'ev-new/cover.jpg' }));
    });

    it("affiche l'erreur du service quand la création échoue", async () => {
      mockEvent.createEvent.mockReturnValueOnce(of({ success: false, error: 'RLS refusée' }));
      component.createTitle.set('X');
      component.createDate.set('1900-01-01');
      await component.submitCreate();
      expect(component.createError()).toBe('RLS refusée');
    });
  });
});
