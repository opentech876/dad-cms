import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { TuiDay } from '@taiga-ui/cdk/date-time';
import { EventsComponent } from './events.component';
import { EventService } from '../../core/events/event.service';
import { CalendarService } from '../../core/calendar/calendar.service';
import { CalendarEntryService } from '../../core/calendar/calendar-entry.service';
import { Event } from '../../models';

const fakeEvents: Event[] = [
  {
    id: 'evt-1', event_date: '2025-08-15',
    title: 'Indépendance', status: 'published', workspace_id: 'ws-1',
    description: null, image_path: null,
    created_by: 'u1', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
    updated_by: null, deleted_at: null, deleted_by: null,
  },
  {
    id: 'evt-2', event_date: '2025-11-28',
    title: 'Naissance de Marien Ngouabi', status: 'draft', workspace_id: 'ws-1',
    description: null, image_path: null,
    created_by: 'u1', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
    updated_by: null, deleted_at: null, deleted_by: null,
  },
];

const fakeCalendars = [
  { id: 'cal-1', year: 2025, name: 'Calendrier 2025', status: 'published', eventCount: 0, campaignCount: 0 },
  { id: 'cal-2', year: 2024, name: 'Calendrier 2024', status: 'archived',  eventCount: 0, campaignCount: 0 },
];

describe('EventsComponent', () => {
  let component: EventsComponent;
  let fixture: ComponentFixture<EventsComponent>;
  let mockEventService: {
    listEvents: jest.Mock;
    createEvent: jest.Mock;
    updateEvent: jest.Mock;
    deleteEvent: jest.Mock;
    uploadImage: jest.Mock;
    getImageUrl: jest.Mock;
  };
  let mockCalendarService: { listCalendars: jest.Mock };
  let mockCalendarEntryService: {
    getEntriesByMmdd: jest.Mock;
    assignEvent: jest.Mock;
    unassignSlot: jest.Mock;
  };

  beforeAll(() => {
    // jsdom does not implement these Storage/Blob APIs
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-preview-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  beforeEach(async () => {
    mockEventService = {
      listEvents: jest.fn().mockReturnValue(of(fakeEvents)),
      createEvent: jest.fn().mockReturnValue(of({ success: true, id: 'evt-new' })),
      updateEvent: jest.fn().mockReturnValue(of({ success: true })),
      deleteEvent: jest.fn().mockReturnValue(of({ success: true })),
      uploadImage: jest.fn().mockReturnValue(of({ path: 'evt-new/cover.jpg' })),
      getImageUrl: jest.fn().mockReturnValue('https://supabase.example/historical-images/evt-1/cover.jpg'),
    };
    mockCalendarService = {
      listCalendars: jest.fn().mockReturnValue(of(fakeCalendars)),
    };
    mockCalendarEntryService = {
      getEntriesByMmdd: jest.fn().mockReturnValue(of([])),
      assignEvent:      jest.fn().mockReturnValue(of({ success: true })),
      unassignSlot:     jest.fn().mockReturnValue(of({ success: true })),
    };

    await TestBed.configureTestingModule({
      imports: [EventsComponent],
      providers: [
        { provide: EventService,        useValue: mockEventService },
        { provide: CalendarService,     useValue: mockCalendarService },
        { provide: CalendarEntryService, useValue: mockCalendarEntryService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(EventsComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(EventsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.ngOnInit();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  // ── chargement ─────────────────────────────────────────────────────────────

  describe('chargement', () => {
    it('charge les événements au démarrage', () => {
      expect(mockEventService.listEvents).toHaveBeenCalled();
    });

    it('peuple le signal events avec les données du service', () => {
      expect(component.events().length).toBe(2);
    });
  });

  // ── listRows ───────────────────────────────────────────────────────────────

  describe('listRows', () => {
    it('génère autant de lignes que d\'événements', () => {
      expect(component.listRows().length).toBe(2);
    });

    it('mappe le titre de l\'événement dans la ligne', () => {
      expect(component.listRows()[0].title).toBe('Indépendance');
    });

    it('retourne un tableau vide quand events est vide', () => {
      component.events.set([]);
      expect(component.listRows().length).toBe(0);
    });
  });

  // ── openEditor ─────────────────────────────────────────────────────────────

  describe('openEditor()', () => {
    it('ouvre la vue éditeur', () => {
      component.openEditor();
      expect(component.editorView()).toBe(true);
    });

    it('pré-remplit le titre avec l\'événement sélectionné', () => {
      component.openEditor('evt-1');
      expect(component.editorTitle()).toBe('Indépendance');
    });

    it('pré-remplit la date avec l\'événement sélectionné', () => {
      component.openEditor('evt-1');
      expect(component.editorDate()).toBe('2025-08-15');
    });

    it('réinitialise les champs pour un nouvel événement', () => {
      component.openEditor();
      expect(component.editorTitle()).toBe('');
    });
  });

  // ── saveDraft ──────────────────────────────────────────────────────────────

  describe('saveDraft()', () => {
    beforeEach(() => {
      component.openEditor();
      component.editorTitle.set('Nouveau titre');
      component.editorDate.set('2025-06-28');
    });

    it('appelle createEvent pour un nouvel événement', async () => {
      await component.saveDraft();
      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Nouveau titre', event_date: '2025-06-28' }),
      );
    });

    it('appelle updateEvent pour un événement existant', async () => {
      component.openEditor('evt-1');
      component.editorTitle.set('Titre modifié');
      await component.saveDraft();
      expect(mockEventService.updateEvent).toHaveBeenCalledWith(
        'evt-1',
        expect.objectContaining({ title: 'Titre modifié' }),
      );
    });

    it('ferme l\'éditeur après sauvegarde réussie', async () => {
      await component.saveDraft();
      expect(component.editorView()).toBe(false);
    });
  });

  // ── onImageChange ─────────────────────────────────────────────────────────

  describe('onImageChange()', () => {
    it('ne fait rien si aucun fichier n\'est sélectionné', () => {
      const event = { target: { files: [] } } as any;
      component.onImageChange(event);
      expect(component.editorImageName()).toBeNull();
      expect(component.editorImageSizeKb()).toBe(0);
    });

    it('met à jour editorImageName et editorImageSizeKb quand un fichier est sélectionné', () => {
      const fakeFile = { name: 'photo.jpg', size: 102400 } as File;
      const event = { target: { files: [fakeFile] } } as any;
      component.onImageChange(event);
      expect(component.editorImageName()).toBe('photo.jpg');
      expect(component.editorImageSizeKb()).toBe(100);
    });
  });

  // ── onEditorDateChange ─────────────────────────────────────────────────────

  describe('onEditorDateChange()', () => {
    it("convertit TuiDay en chaîne ISO pour editorDate", () => {
      const day = new TuiDay(2025, 7, 15); // mois 0-indexé : 7 = août
      component.onEditorDateChange(day);
      expect(component.editorDate()).toBe('2025-08-15');
    });

    it("réinitialise editorDate à '' quand null est passé", () => {
      component.editorDate.set('2025-08-15');
      component.onEditorDateChange(null);
      expect(component.editorDate()).toBe('');
    });

    it('met à jour editorTuiDay en même temps', () => {
      const day = new TuiDay(2025, 10, 28);
      component.onEditorDateChange(day);
      expect(component.editorTuiDay).toBe(day);
    });
  });

  // ── publish() ──────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('appelle createEvent pour un nouvel événement', async () => {
      component.openEditor();
      component.editorTitle.set('Événement publié');
      component.editorDate.set('2025-07-14');
      await component.publish();
      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Événement publié' }),
      );
    });

    it('appelle updateEvent pour un événement existant', async () => {
      component.openEditor('evt-1');
      component.editorTitle.set('Titre publié');
      await component.publish();
      expect(mockEventService.updateEvent).toHaveBeenCalledWith(
        'evt-1',
        expect.objectContaining({ title: 'Titre publié' }),
      );
    });

    it("ferme l'éditeur après publication", async () => {
      component.openEditor();
      component.editorTitle.set('Pub');
      await component.publish();
      expect(component.editorView()).toBe(false);
    });
  });

  // ── filtres listRows ──────────────────────────────────────────────────────

  describe('filtres listRows', () => {
    it('filtre par titre via searchQuery', () => {
      component.searchQuery.set('indépendance');
      expect(component.listRows().length).toBe(1);
      expect(component.listRows()[0].title).toBe('Indépendance');
    });

    it('retourne vide quand searchQuery ne correspond à rien', () => {
      component.searchQuery.set('xxxxxxx');
      expect(component.listRows().length).toBe(0);
    });

    it('filtre par année via selectedYear', () => {
      component.selectedYear.set(2025);
      expect(component.listRows().length).toBe(2);
      component.selectedYear.set(2020);
      expect(component.listRows().length).toBe(0);
    });

    it('filtre par statut published', () => {
      component.selectedStatus.set('published');
      expect(component.listRows().length).toBe(1);
    });

    it('filtre par statut draft', () => {
      component.selectedStatus.set('draft');
      expect(component.listRows().length).toBe(1);
    });
  });

  // ── availableYears ────────────────────────────────────────────────────────

  describe('availableYears', () => {
    it('retourne les années uniques des événements', () => {
      expect(component.availableYears()).toContain(2025);
    });

    it('retourne un tableau vide quand aucun événement', () => {
      component.events.set([]);
      expect(component.availableYears().length).toBe(0);
    });
  });

  // ── deleteEvent ───────────────────────────────────────────────────────────

  describe('deleteEvent()', () => {
    it('appelle deleteEvent du service avec l\'id de l\'événement ouvert', async () => {
      component.openEditor('evt-1');
      await component.deleteEvent();
      expect(mockEventService.deleteEvent).toHaveBeenCalledWith('evt-1');
    });

    it('ferme l\'éditeur après suppression', async () => {
      component.openEditor('evt-1');
      await component.deleteEvent();
      expect(component.editorView()).toBe(false);
    });

    it('ne fait rien quand editorEventId est null', async () => {
      component.openEditor(); // new event, no id
      await component.deleteEvent();
      expect(mockEventService.deleteEvent).not.toHaveBeenCalled();
    });
  });

  // ── stats ─────────────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('total correspond au nombre d\'événements chargés', () => {
      expect(component.stats().total).toBe(2);
    });

    it('compte correctement les événements publiés et en brouillon', () => {
      // fakeEvents: evt-1 = published, evt-2 = draft
      expect(component.stats().published).toBe(1);
      expect(component.stats().draft).toBe(1);
    });

    it('compte les événements sans image', () => {
      expect(component.stats().noImage).toBe(2);
    });
  });

  // ── pagination ────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('paginatedRows retourne les lignes de la page courante', () => {
      expect(component.paginatedRows().length).toBe(2); // 2 events < pageSize of 20
    });

    it('totalPages vaut au moins 1', () => {
      expect(component.totalPages()).toBeGreaterThanOrEqual(1);
    });

    it('nextPage incrémente currentPage', () => {
      // Build enough fake events to have 2 pages
      const many = Array.from({ length: 25 }, (_, i) => ({
        ...fakeEvents[0],
        id: `evt-${i}`,
        event_date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      }));
      component.events.set(many);
      expect(component.currentPage()).toBe(0);
      component.nextPage();
      expect(component.currentPage()).toBe(1);
    });

    it('prevPage décrémente currentPage', () => {
      const many = Array.from({ length: 25 }, (_, i) => ({
        ...fakeEvents[0],
        id: `evt-${i}`,
        event_date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      }));
      component.events.set(many);
      component.nextPage();
      component.prevPage();
      expect(component.currentPage()).toBe(0);
    });

    it('nextPage ne dépasse pas la dernière page', () => {
      component.events.set(fakeEvents); // only 1 page
      component.nextPage();
      expect(component.currentPage()).toBe(0);
    });
  });

  // ── filter setters reset page ─────────────────────────────────────────────

  describe('setters de filtre', () => {
    beforeEach(() => {
      // Put component on page 1 with enough events
      const many = Array.from({ length: 25 }, (_, i) => ({
        ...fakeEvents[0],
        id: `evt-${i}`,
        event_date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      }));
      component.events.set(many);
      component.nextPage(); // page = 1
    });

    it('setSearchQuery remet currentPage à 0', () => {
      component.setSearchQuery('test');
      expect(component.currentPage()).toBe(0);
      expect(component.searchQuery()).toBe('test');
    });

    it('setSelectedYear remet currentPage à 0', () => {
      component.setSelectedYear(2025);
      expect(component.currentPage()).toBe(0);
      expect(component.selectedYear()).toBe(2025);
    });

    it('setSelectedStatus remet currentPage à 0', () => {
      component.setSelectedStatus('published');
      expect(component.currentPage()).toBe(0);
      expect(component.selectedStatus()).toBe('published');
    });
  });

  // ── editorImagePath ───────────────────────────────────────────────────────

  describe('editorImagePath', () => {
    it('est null pour un nouvel événement', () => {
      component.openEditor();
      expect(component.editorImagePath()).toBeNull();
    });

    it('est null quand l\'événement n\'a pas d\'image', () => {
      component.openEditor('evt-1'); // fakeEvents[0] has image_path: null
      expect(component.editorImagePath()).toBeNull();
    });

    it('est renseigné quand l\'événement a une image enregistrée', () => {
      component.events.set([
        { ...fakeEvents[0], id: 'evt-img', image_path: 'evt-img/cover.jpg' },
      ]);
      component.openEditor('evt-img');
      expect(component.editorImagePath()).toBe('evt-img/cover.jpg');
    });
  });

  // ── calendars loading ─────────────────────────────────────────────────────

  describe('chargement des calendriers', () => {
    it('charge les calendriers au démarrage', () => {
      expect(mockCalendarService.listCalendars).toHaveBeenCalled();
    });

    it('peuple le signal calendars avec les données du service', () => {
      expect(component.calendars().length).toBe(2);
    });
  });

  // ── editorMmdd / editorMmddLabel ──────────────────────────────────────────

  describe('editorMmdd / editorMmddLabel', () => {
    it('retourne null quand aucune date n\'est saisie', () => {
      component.openEditor();
      expect(component.editorMmdd()).toBeNull();
      expect(component.editorMmddLabel()).toBeNull();
    });

    it('extrait MM-DD de la date ISO', () => {
      component.openEditor('evt-1'); // event_date: '2025-08-15'
      expect(component.editorMmdd()).toBe('08-15');
    });

    it('formate editorMmddLabel en "15 août"', () => {
      component.openEditor('evt-1');
      expect(component.editorMmddLabel()).toBe('15 août');
    });
  });

  // ── openEditor charge les entrées mmdd pour un événement existant ─────────

  describe('openEditor() — chargement mmdd', () => {
    it('appelle getEntriesByMmdd avec le bon mmdd pour un événement existant', () => {
      component.openEditor('evt-1'); // event_date '2025-08-15' → mmdd '08-15'
      expect(mockCalendarEntryService.getEntriesByMmdd).toHaveBeenCalledWith('08-15');
    });

    it('ne charge pas mmdd pour un nouvel événement', () => {
      mockCalendarEntryService.getEntriesByMmdd.mockClear();
      component.openEditor();
      expect(mockCalendarEntryService.getEntriesByMmdd).not.toHaveBeenCalled();
    });

    it('réinitialise mmddEntries à l\'ouverture', () => {
      component.mmddEntries.set([{ calendar_id: 'cal-1', mmdd: '08-15', position: 1, event_id: 'evt-1', id: 'ce-1', workspace_id: 'ws-1', created_by: null, event: null }]);
      component.openEditor();
      expect(component.mmddEntries().length).toBe(0);
    });
  });

  // ── slotMap / slotStates ──────────────────────────────────────────────────

  describe('slotMap / slotStates', () => {
    const baseEntry = {
      id: 'ce-1', calendar_id: 'cal-1', mmdd: '08-15', position: 1 as const,
      event_id: 'evt-1', workspace_id: 'ws-1', created_by: null,
    };

    it('slotMap construit une map keyed par calId:position', () => {
      component.mmddEntries.set([{ ...baseEntry, event: { id: 'evt-1', title: 'Indépendance' } }]);
      expect(component.slotMap().has('cal-1:1')).toBe(true);
    });

    it('état "ours" quand l\'event_id correspond à l\'événement en cours d\'édition', () => {
      component.openEditor('evt-1');
      component.mmddEntries.set([{ ...baseEntry, event: { id: 'evt-1', title: 'Indépendance' } }]);
      expect(component.slotStates().get('cal-1:1')).toBe('ours');
    });

    it('état "other" quand une autre event occupe le slot', () => {
      component.openEditor('evt-1');
      component.mmddEntries.set([{ ...baseEntry, event_id: 'evt-other', event: { id: 'evt-other', title: 'Autre' } }]);
      expect(component.slotStates().get('cal-1:1')).toBe('other');
    });

    it('état "empty" quand aucune entrée n\'existe pour ce slot', () => {
      component.openEditor('evt-1');
      component.mmddEntries.set([]);
      expect(component.slotStates().get('cal-1:1') ?? 'empty').toBe('empty');
    });

    it('état "confirming" quand confirmingRemoval correspond au key', () => {
      component.openEditor('evt-1');
      component.mmddEntries.set([{ ...baseEntry, event: { id: 'evt-1', title: 'Indépendance' } }]);
      component.confirmingRemoval.set('cal-1:1');
      expect(component.slotStates().get('cal-1:1')).toBe('confirming');
    });

    it('état "busy" quand assignmentBusy correspond au key', () => {
      component.openEditor('evt-1');
      component.assignmentBusy.set('cal-1:1');
      expect(component.slotStates().get('cal-1:1')).toBe('busy');
    });
  });

  // ── toggleSlot ────────────────────────────────────────────────────────────

  describe('toggleSlot()', () => {
    const baseEntry = {
      id: 'ce-1', calendar_id: 'cal-1', mmdd: '08-15', position: 1 as const,
      event_id: 'evt-1', workspace_id: 'ws-1', created_by: null,
    };

    it('ne fait rien si editorEventId est null', () => {
      component.openEditor();
      component.toggleSlot('cal-1', 1);
      expect(mockCalendarEntryService.assignEvent).not.toHaveBeenCalled();
    });

    it('passe en état confirming quand le slot est "ours"', () => {
      component.openEditor('evt-1');
      component.mmddEntries.set([{ ...baseEntry, event: { id: 'evt-1', title: 'Indépendance' } }]);
      component.toggleSlot('cal-1', 1);
      expect(component.confirmingRemoval()).toBe('cal-1:1');
    });

    it('appelle assignEvent quand le slot est vide', () => {
      component.openEditor('evt-1');
      component.mmddEntries.set([]);
      component.toggleSlot('cal-1', 1);
      expect(mockCalendarEntryService.assignEvent).toHaveBeenCalledWith('cal-1', '08-15', 'evt-1', 1);
    });

    it('appelle assignEvent pour remplacer un slot "other"', () => {
      component.openEditor('evt-1');
      component.mmddEntries.set([{ ...baseEntry, event_id: 'evt-other', event: { id: 'evt-other', title: 'Autre' } }]);
      component.toggleSlot('cal-1', 1);
      expect(mockCalendarEntryService.assignEvent).toHaveBeenCalledWith('cal-1', '08-15', 'evt-1', 1);
    });
  });

  // ── confirmRemove / cancelRemove ──────────────────────────────────────────

  describe('confirmRemove() / cancelRemove()', () => {
    it('cancelRemove() réinitialise confirmingRemoval', () => {
      component.confirmingRemoval.set('cal-1:1');
      component.cancelRemove();
      expect(component.confirmingRemoval()).toBeNull();
    });

    it('confirmRemove() appelle unassignSlot avec les bons paramètres', async () => {
      component.openEditor('evt-1'); // mmdd = '08-15'
      await component.confirmRemove('cal-1', 1);
      expect(mockCalendarEntryService.unassignSlot).toHaveBeenCalledWith('cal-1', '08-15', 1);
    });

    it('confirmRemove() remet confirmingRemoval à null', async () => {
      component.openEditor('evt-1');
      component.confirmingRemoval.set('cal-1:1');
      await component.confirmRemove('cal-1', 1);
      expect(component.confirmingRemoval()).toBeNull();
    });
  });

  // ── saveDraftAndCreateNew ─────────────────────────────────────────────────

  describe('saveDraftAndCreateNew()', () => {
    beforeEach(() => {
      component.openEditor();
      component.editorTitle.set('Premier événement');
      component.editorDate.set('2025-06-28');
    });

    it('appelle createEvent avec le statut draft', async () => {
      await component.saveDraftAndCreateNew();
      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Premier événement' }),
      );
    });

    it('garde editorView ouvert après la sauvegarde', async () => {
      await component.saveDraftAndCreateNew();
      expect(component.editorView()).toBe(true);
    });

    it('remet le titre à vide après la sauvegarde', async () => {
      await component.saveDraftAndCreateNew();
      expect(component.editorTitle()).toBe('');
    });

    it('remet editorEventId à null après la sauvegarde', async () => {
      await component.saveDraftAndCreateNew();
      expect(component.editorEventId()).toBeNull();
    });
  });
});
