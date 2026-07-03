import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { RecommandationsComponent } from './recommandations.component';
import { AuthService } from '../../core/auth/auth.service';
import { CalendarService } from '../../core/calendar/calendar.service';
import { CalendarEntryService } from '../../core/calendar/calendar-entry.service';
import { EventService } from '../../core/events/event.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';
import { AppRole } from '../../models';

const FAKE_CALENDARS = [
  { id: 'cal-1', year: 2026, name: 'Calendrier 2026', status: 'draft' as const, createdBy: null, publishedAt: null, eventCount: 0 },
];

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
  event_id: 'ev-other', workspace_id: 'ws-1',
  event: { ...FAKE_EVENT, id: 'ev-other', title: 'Autre événement' },
};

describe('RecommandationsComponent', () => {
  let component: RecommandationsComponent;
  let fixture: ComponentFixture<RecommandationsComponent>;
  let mockAuth: { hasRoleAtLeast: jest.Mock };
  let mockCalendar: { listCalendars: jest.Mock };
  let mockCalendarEntry: { getEntriesForCalendar: jest.Mock };
  let mockEvent: {
    listEventsByMmdd: jest.Mock;
    listEvents: jest.Mock;
    createEvent: jest.Mock;
    uploadImage: jest.Mock;
    updateEvent: jest.Mock;
    getImageUrl: jest.Mock;
  };
  let mockRec: {
    listByCalendar: jest.Mock;
    upsertSlot: jest.Mock;
    removeSlot: jest.Mock;
    applySingle: jest.Mock;
    applyAll: jest.Mock;
  };
  let mockToast: { success: jest.Mock; error: jest.Mock; warning: jest.Mock };

  /** Rebuild the TestBed with the given role tiers granted.
   *  hasRoleAtLeast(role) resolves true iff role is in `granted`. */
  async function createComponent(granted: AppRole[]): Promise<void> {
    const grantedSet = new Set<AppRole>(granted);
    mockAuth = { hasRoleAtLeast: jest.fn((role: AppRole) => of(grantedSet.has(role))) };
    mockCalendar = { listCalendars: jest.fn().mockReturnValue(of(FAKE_CALENDARS)) };
    mockCalendarEntry = { getEntriesForCalendar: jest.fn().mockReturnValue(of([])) };
    mockEvent = {
      listEventsByMmdd: jest.fn().mockReturnValue(of([FAKE_EVENT])),
      listEvents:       jest.fn().mockReturnValue(of([FAKE_EVENT, FAKE_CURATED_EVENT])),
      createEvent:      jest.fn().mockReturnValue(of({ success: true, id: 'ev-new' })),
      uploadImage:      jest.fn().mockReturnValue(of({ path: 'ev-new/cover.jpg' })),
      updateEvent:      jest.fn().mockReturnValue(of({ success: true })),
      getImageUrl:      jest.fn((p: string) => `https://cdn/${p}`),
    };
    mockRec = {
      listByCalendar: jest.fn().mockReturnValue(of([FAKE_REC])),
      upsertSlot:     jest.fn().mockReturnValue(of({ success: true })),
      removeSlot:     jest.fn().mockReturnValue(of({ success: true })),
      applySingle:    jest.fn().mockReturnValue(of({ success: true })),
      applyAll:       jest.fn().mockReturnValue(of({ success: true, applied: 1, skipped: 0 })),
    };
    mockToast = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [RecommandationsComponent],
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: CalendarService, useValue: mockCalendar },
        { provide: CalendarEntryService, useValue: mockCalendarEntry },
        { provide: EventService, useValue: mockEvent },
        { provide: RecommendationService, useValue: mockRec },
        { provide: ToastService, useValue: mockToast },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(RecommandationsComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(RecommandationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // resolve the toSignal() role signals
  }

  // ── Curator mode (presidence granted — owner also matches this path) ──

  describe('mode Curateur', () => {
    beforeEach(async () => {
      await createComponent(['presidence', 'chef_equipe']);
    });

    it('devrait être créé', () => {
      expect(component).toBeTruthy();
    });

    it('charge les calendriers au démarrage', async () => {
      await component.ngOnInit();
      expect(mockCalendar.listCalendars).toHaveBeenCalled();
      expect(component.calendars().length).toBe(1);
    });

    it("sélectionne par défaut un calendrier de l'année courante si disponible", async () => {
      const currentYear = new Date().getFullYear();
      mockCalendar.listCalendars.mockReturnValueOnce(of([
        { ...FAKE_CALENDARS[0], year: currentYear - 1 },
        { ...FAKE_CALENDARS[0], id: 'cal-now', year: currentYear },
      ]));
      await component.ngOnInit();
      expect(component.selectedCalendarId()).toBe('cal-now');
    });

    it('groupe les recommandations par mmdd', async () => {
      await component.ngOnInit();
      expect(component.recsByMmdd().get('08-15')?.length).toBe(1);
    });

    it('hasRecommendation renvoie true pour une position recommandée', async () => {
      await component.ngOnInit();
      expect(component.hasRecommendation('08-15', 1)).toBe(true);
      expect(component.hasRecommendation('08-15', 2)).toBe(false);
    });

    it("dayState='partial' quand 1 sur 2 positions est recommandée", async () => {
      await component.ngOnInit();
      expect(component.dayState('08-15')).toBe('partial');
    });

    it("dayState='full' quand les 2 positions sont recommandées", async () => {
      mockRec.listByCalendar.mockReturnValueOnce(of([
        { ...FAKE_REC, position: 1 as const },
        { ...FAKE_REC, id: 'r2', position: 2 as const },
      ]));
      await component.ngOnInit();
      expect(component.dayState('08-15')).toBe('full');
    });

    it("dayState='empty' quand rien n'est recommandé", async () => {
      mockRec.listByCalendar.mockReturnValueOnce(of([]));
      await component.ngOnInit();
      expect(component.dayState('08-15')).toBe('empty');
    });

    describe('openDayEditor()', () => {
      beforeEach(async () => { await component.ngOnInit(); });

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
        await component.ngOnInit();
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
    });

    describe('onglet Bibliothèque', () => {
      beforeEach(async () => { await component.ngOnInit(); });

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

      it('filtre "Non assignés" exclut les événements présents dans calendar_entries', async () => {
        mockCalendarEntry.getEntriesForCalendar.mockReturnValue(of([
          { ...FAKE_ENTRY, event_id: 'ev-1' },
        ]));
        await component.selectCalendar('cal-1');
        await component.setTab('bibliotheque');
        component.libraryFilter.set('non-assignes');
        expect(component.filteredLibrary().map(e => e.id)).toEqual(['ev-cur']);
      });

      it('recherche insensible aux accents sur le titre', async () => {
        await component.setTab('bibliotheque');
        component.librarySearch.set('independance');
        expect(component.filteredLibrary().map(e => e.id)).toEqual(['ev-1']);
      });
    });

    describe('création d\'événement (Curateur)', () => {
      beforeEach(async () => {
        await component.ngOnInit();
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

  // ── Non-curator modes ─────────────────────────────────────────────────

  describe('mode chef d\'équipe (peut appliquer, ne gère pas)', () => {
    beforeEach(async () => {
      await createComponent(['chef_equipe']);
      await component.ngOnInit();
    });

    it('canManageRecommendations=false, canApply=true', () => {
      expect(component.canManageRecommendations()).toBe(false);
      expect(component.canApply()).toBe(true);
    });

    it("openDayEditor est bloqué (l'éditeur ne s'ouvre pas)", async () => {
      await component.openDayEditor('08-15');
      expect(component.editorOpen()).toBe(false);
      expect(mockEvent.listEventsByMmdd).not.toHaveBeenCalled();
    });

    it('pendingRecs / appliedRecs séparent selon le statut', async () => {
      mockRec.listByCalendar.mockReturnValue(of([
        FAKE_REC,
        { ...FAKE_REC, id: 'r2', mmdd: '09-01', status: 'applied' as const, applied_at: '2026-07-01' },
      ]));
      await component.selectCalendar('cal-1');
      expect(component.pendingRecs().map(r => r.id)).toEqual(['r1']);
      expect(component.appliedRecs().map(r => r.id)).toEqual(['r2']);
    });

    it('applySingle appelle la RPC puis rafraîchit', async () => {
      await component.applySingle(component.pendingRecs()[0]);
      expect(mockRec.applySingle).toHaveBeenCalledWith('r1');
      expect(mockToast.success).toHaveBeenCalled();
    });

    it("applySingle surface l'erreur RPC", async () => {
      mockRec.applySingle.mockReturnValueOnce(of({ success: false, error: '42501' }));
      await component.applySingle(component.pendingRecs()[0]);
      expect(mockToast.error).toHaveBeenCalledWith('42501');
    });

    it('applyAllPending applique tout pour le calendrier sélectionné', async () => {
      await component.applyAllPending();
      expect(mockRec.applyAll).toHaveBeenCalledWith('cal-1', true);
      expect(mockToast.success).toHaveBeenCalled();
    });

    it('conflictTitle renvoie le titre existant quand le slot est occupé par un autre événement', async () => {
      mockCalendarEntry.getEntriesForCalendar.mockReturnValue(of([FAKE_ENTRY]));
      await component.selectCalendar('cal-1');
      expect(component.conflictTitle(component.pendingRecs()[0])).toBe('Autre événement');
    });

    it('conflictTitle renvoie null quand le slot contient déjà le même événement', async () => {
      mockCalendarEntry.getEntriesForCalendar.mockReturnValue(of([
        { ...FAKE_ENTRY, event_id: 'ev-1' },
      ]));
      await component.selectCalendar('cal-1');
      expect(component.conflictTitle(component.pendingRecs()[0])).toBeNull();
    });
  });

  describe('mode lecture seule (éditeur / commercial)', () => {
    beforeEach(async () => {
      await createComponent(['editeur']);
      await component.ngOnInit();
    });

    it('ni gestion ni application', () => {
      expect(component.canManageRecommendations()).toBe(false);
      expect(component.canApply()).toBe(false);
    });

    it('applySingle est un no-op sans le rôle chef_equipe', async () => {
      await component.applySingle(component.pendingRecs()[0]);
      expect(mockRec.applySingle).not.toHaveBeenCalled();
    });

    it('applyAllPending est un no-op sans le rôle chef_equipe', async () => {
      await component.applyAllPending();
      expect(mockRec.applyAll).not.toHaveBeenCalled();
    });

    it('positionLabel mappe les positions', () => {
      expect(component.positionLabel(1)).toBe('Événement National');
      expect(component.positionLabel(2)).toBe('Date Internationale');
    });
  });
});
