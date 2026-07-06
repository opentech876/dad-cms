import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { PendingListComponent } from './pending-list.component';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { EventService } from '../../core/events/event.service';
import { ToastService } from '../../core/services/toast.service';

const FAKE_EVENT = {
  id: 'ev-1', event_date: '1960-08-15', title: 'Indépendance', description: null,
  image_path: 'ev-1/cover.jpg', source: null, historian: null, status: 'published' as const,
  origin: 'editorial' as const, workspace_id: 'ws-1',
  created_by: 'u1', created_at: '', updated_at: '', updated_by: null, deleted_at: null, deleted_by: null,
};

const FAKE_REC = {
  id: 'r1', calendar_id: 'cal-1', mmdd: '08-15', position: 1 as const,
  event_id: 'ev-1', workspace_id: 'ws-1', status: 'pending' as const,
  created_by: 'u1', created_at: '', updated_at: '', applied_at: null, applied_by: null,
  event: FAKE_EVENT,
};

const APPLIED_REC = {
  ...FAKE_REC, id: 'r2', mmdd: '09-01', status: 'applied' as const,
  applied_at: '2026-07-01', event: { ...FAKE_EVENT, id: 'ev-2', title: 'Autre fête' },
};

const FAKE_ENTRY = {
  id: 'ce-1', calendar_id: 'cal-1', mmdd: '08-15', position: 1 as const,
  event_id: 'ev-other', workspace_id: 'ws-1',
  event: { ...FAKE_EVENT, id: 'ev-other', title: 'Autre événement' },
};

describe('PendingListComponent', () => {
  let component: PendingListComponent;
  let fixture: ComponentFixture<PendingListComponent>;
  let mockRec: { applySingle: jest.Mock; applyAll: jest.Mock };
  let mockEvent: { getImageUrl: jest.Mock };
  let mockToast: { success: jest.Mock; error: jest.Mock };

  const setup = async (canApply = false) => {
    mockRec   = {
      applySingle: jest.fn().mockReturnValue(of({ success: true })),
      applyAll:    jest.fn().mockReturnValue(of({ success: true, applied: 2, skipped: 0 })),
    };
    mockEvent = { getImageUrl: jest.fn((p: string) => `https://cdn/${p}`) };
    mockToast = { success: jest.fn(), error: jest.fn() };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PendingListComponent],
      providers: [
        { provide: RecommendationService, useValue: mockRec },
        { provide: EventService, useValue: mockEvent },
        { provide: ToastService, useValue: mockToast },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    TestBed.overrideComponent(PendingListComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(PendingListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('recommendations', [FAKE_REC, APPLIED_REC]);
    fixture.componentRef.setInput('existingEntries', [FAKE_ENTRY]);
    fixture.componentRef.setInput('canApply', canApply);
    fixture.componentRef.setInput('calendarId', 'cal-1');
    fixture.detectChanges();
  };

  it('devrait être créé', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  describe('computed: pendingRecs / appliedRecs', () => {
    beforeEach(async () => setup());

    it('pendingRecs filtre les recs en attente', () => {
      expect(component.pendingRecs().map(r => r.id)).toEqual(['r1']);
    });

    it('appliedRecs filtre les recs appliquées', () => {
      expect(component.appliedRecs().map(r => r.id)).toEqual(['r2']);
    });
  });

  describe('conflictTitle()', () => {
    beforeEach(async () => setup());

    it('renvoie le titre existant quand le slot est occupé par un autre événement', () => {
      expect(component.conflictTitle(FAKE_REC)).toBe('Autre événement');
    });

    it('renvoie null quand le slot contient déjà le même événement', () => {
      fixture.componentRef.setInput('existingEntries', [{ ...FAKE_ENTRY, event_id: 'ev-1' }]);
      fixture.detectChanges();
      expect(component.conflictTitle(FAKE_REC)).toBeNull();
    });

    it('renvoie null quand le slot est vide', () => {
      fixture.componentRef.setInput('existingEntries', []);
      fixture.detectChanges();
      expect(component.conflictTitle(FAKE_REC)).toBeNull();
    });
  });

  describe('positionLabel()', () => {
    beforeEach(async () => setup());

    it('mappe position 1 → Événement National', () => {
      expect(component.positionLabel(1)).toBe('Événement National');
    });

    it('mappe position 2 → Date Internationale', () => {
      expect(component.positionLabel(2)).toBe('Date Internationale');
    });
  });

  describe('imageUrlMap', () => {
    beforeEach(async () => setup());

    it('construit une URL pour les événements ayant un image_path', () => {
      expect(component.imageUrlMap().get('ev-1')).toBe('https://cdn/ev-1/cover.jpg');
    });

    it('imageUrl() renvoie null pour un événement sans image', () => {
      expect(component.imageUrl({ ...FAKE_EVENT, image_path: null })).toBeNull();
    });
  });

  describe('applySingle() — canApply=false', () => {
    beforeEach(async () => setup(false));

    it('est un no-op sans le rôle', async () => {
      await component.applySingle(FAKE_REC);
      expect(mockRec.applySingle).not.toHaveBeenCalled();
    });
  });

  describe('applySingle() — canApply=true', () => {
    beforeEach(async () => setup(true));

    it('appelle la RPC et montre un toast succès', async () => {
      await component.applySingle(FAKE_REC);
      expect(mockRec.applySingle).toHaveBeenCalledWith('r1');
      expect(mockToast.success).toHaveBeenCalled();
    });

    it("affiche une erreur toast si la RPC échoue", async () => {
      mockRec.applySingle.mockReturnValueOnce(of({ success: false, error: '42501' }));
      await component.applySingle(FAKE_REC);
      expect(mockToast.error).toHaveBeenCalledWith('42501');
    });
  });

  describe('applyAllPending() — canApply=false', () => {
    beforeEach(async () => setup(false));

    it('est un no-op sans le rôle', async () => {
      await component.applyAllPending();
      expect(mockRec.applyAll).not.toHaveBeenCalled();
    });
  });

  describe('applyAllPending() — canApply=true', () => {
    beforeEach(async () => setup(true));

    it('appelle applyAll et montre un toast succès', async () => {
      await component.applyAllPending();
      expect(mockRec.applyAll).toHaveBeenCalledWith('cal-1', true);
      expect(mockToast.success).toHaveBeenCalled();
    });

    it("affiche une erreur toast si l'application échoue", async () => {
      mockRec.applyAll.mockReturnValueOnce(of({ success: false, error: 'Permission refusée' }));
      await component.applyAllPending();
      expect(mockToast.error).toHaveBeenCalledWith('Permission refusée');
    });
  });
});
