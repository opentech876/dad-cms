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
    description: 'Proclamation officielle à Brazzaville', image_path: null,
    source: 'Wikipédia', historian: 'Geovann Auguste NKOUKA',
    created_by: 'u1', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
    updated_by: null, deleted_at: null, deleted_by: null,
  },
  {
    id: 'evt-2', event_date: '2025-11-28',
    title: 'Naissance de Marien Ngouabi', status: 'draft', workspace_id: 'ws-1',
    description: null, image_path: null,
    source: null, historian: null,
    created_by: 'u1', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
    updated_by: null, deleted_at: null, deleted_by: null,
  },
];

const fakeCalendars = [
  { id: 'cal-1', year: 2025, name: 'Calendrier 2025', status: 'published', eventCount: 0 },
  { id: 'cal-2', year: 2024, name: 'Calendrier 2024', status: 'archived',  eventCount: 0 },
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
    getEntriesForCalendar: jest.Mock;
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
      uploadThumbnailFor: jest.fn().mockResolvedValue(undefined),
      getImageUrl: jest.fn().mockReturnValue('https://supabase.example/historical-images/evt-1/cover.jpg'),
    };
    mockCalendarService = {
      listCalendars: jest.fn().mockReturnValue(of(fakeCalendars)),
    };
    mockCalendarEntryService = {
      getEntriesByMmdd:      jest.fn().mockReturnValue(of([])),
      getEntriesForCalendar: jest.fn().mockReturnValue(of([])),
      assignEvent:           jest.fn().mockReturnValue(of({ success: true })),
      unassignSlot:          jest.fn().mockReturnValue(of({ success: true })),
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

    it('cherche dans la description', () => {
      component.searchQuery.set('proclamation');
      expect(component.listRows().length).toBe(1);
      expect(component.listRows()[0].title).toBe('Indépendance');
    });

    it('cherche dans la source', () => {
      component.searchQuery.set('wikipédia');
      expect(component.listRows().length).toBe(1);
    });

    it("cherche dans l'historien (insensible à la casse et aux accents)", () => {
      component.searchQuery.set('geovann');
      expect(component.listRows().length).toBe(1);
    });

    it('cherche par nom de mois en français', () => {
      // 2025-08-15 → "août"
      component.searchQuery.set('août');
      expect(component.listRows().length).toBe(1);
      expect(component.listRows()[0].title).toBe('Indépendance');
    });

    it("cherche par format jj/mm/aaaa", () => {
      component.searchQuery.set('15/08/2025');
      expect(component.listRows().length).toBe(1);
    });
  });

  describe('tri (sortBy)', () => {
    it('par défaut, trie par date croissante', () => {
      const rows = component.listRows();
      expect(rows[0].title).toBe('Indépendance');       // 2025-08-15
      expect(rows[1].title).toBe('Naissance de Marien Ngouabi'); // 2025-11-28
    });

    it('date_desc met le plus récent en premier', () => {
      component.sortBy.set('date_desc');
      const rows = component.listRows();
      expect(rows[0].title).toBe('Naissance de Marien Ngouabi');
      expect(rows[1].title).toBe('Indépendance');
    });

    it('title_asc trie par ordre alphabétique', () => {
      component.sortBy.set('title_asc');
      const rows = component.listRows();
      expect(rows[0].title).toBe('Indépendance');
      expect(rows[1].title).toBe('Naissance de Marien Ngouabi');
    });

    it('title_desc trie par ordre alphabétique inverse', () => {
      component.sortBy.set('title_desc');
      const rows = component.listRows();
      expect(rows[0].title).toBe('Naissance de Marien Ngouabi');
      expect(rows[1].title).toBe('Indépendance');
    });

    it('setSortBy remet la pagination à 0', () => {
      component.currentPage.set(5);
      component.setSortBy('title_asc');
      expect(component.currentPage()).toBe(0);
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

    it('réserves = finalisés (published) non placés ; brouillons = draft', () => {
      // fakeEvents: evt-1 = published, evt-2 = draft ; rien sur le calendrier publié
      expect(component.stats().reserves).toBe(1);
      expect(component.stats().brouillons).toBe(1);
      expect(component.stats().publies).toBe(0);
    });

    it('publiés = événements assignés au calendrier publié (retire du décompte réserve)', async () => {
      mockCalendarEntryService.getEntriesForCalendar.mockReturnValue(of([{ event_id: 'evt-1' }]));
      await component['_reloadCalendars']();
      expect(component.stats().publies).toBe(1);
      expect(component.stats().reserves).toBe(0);
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

  // ── Excel import: date cell parsing ───────────────────────────────
  describe('parseDateCell — formats acceptés', () => {
    it('parse une chaîne dd/mm/yyyy', () => {
      expect((component as any)._parseDateCell('15/05/2026')).toBe('2026-05-15');
    });

    it('parse une chaîne d/m/yyyy sans zéros', () => {
      expect((component as any)._parseDateCell('5/1/2026')).toBe('2026-01-05');
    });

    it('parse une chaîne ISO yyyy-mm-dd', () => {
      expect((component as any)._parseDateCell('2026-08-15')).toBe('2026-08-15');
    });

    it('parse un objet Date JS', () => {
      // 15 mai 2026 à midi UTC pour éviter les sauts de fuseau
      const d = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
      expect((component as any)._parseDateCell(d)).toBe('2026-05-15');
    });

    it("préserve le jour pour une Date construite en heure locale (régression UTC+1 -1 jour)", () => {
      // SheetJS avec cellDates:true produit des Date en HEURE LOCALE
      // (new Date(y, m, d) sans Date.UTC). En UTC+1 (Brazzaville), une telle
      // Date pour le 15 août 1960 est minuit local = 23h00 UTC le 14 août.
      // L'ancien code lisait getUTCDate() → renvoyait 14 → tous les
      // événements importés étaient décalés d'un jour en arrière en base.
      // La version corrigée doit lire les composantes locales et renvoyer 15.
      const sheetJsStyle = new Date(1960, 7, 15); // 15 août 1960, minuit local
      expect((component as any)._parseDateCell(sheetJsStyle)).toBe('1960-08-15');
    });

    it('parse un numéro de série Excel (45782 = 2025-05-15)', () => {
      // Excel serial 45792 = 2025-05-15
      const serial = 45792;
      const result = (component as any)._parseDateCell(serial);
      expect(result).toBe('2025-05-15');
    });

    it("parse le sérial 22143 → 1960-08-15 (Indépendance du Congo)", () => {
      // Ground truth: opening the real spreadsheet with cellDates OFF returns
      // 22143 for the Independence Day row. The UTC math must give 1960-08-15
      // regardless of the runner's timezone — this is the canonical
      // regression test that documents why we don't use cellDates:true.
      expect((component as any)._parseDateCell(22143)).toBe('1960-08-15');
    });

    it('renvoie null pour une chaîne vide', () => {
      expect((component as any)._parseDateCell('')).toBeNull();
    });

    it('renvoie null pour une chaîne invalide', () => {
      expect((component as any)._parseDateCell('pas une date')).toBeNull();
    });

    it('renvoie null pour un mois hors plage (13)', () => {
      expect((component as any)._parseDateCell('15/13/2026')).toBeNull();
    });

    it('renvoie null pour null/undefined', () => {
      expect((component as any)._parseDateCell(null)).toBeNull();
      expect((component as any)._parseDateCell(undefined)).toBeNull();
    });
  });

  describe('_parseImportRows — robustesse formats Excel', () => {
    it('accepte un mélange de formats (Date, serial, dd/mm/yyyy)', () => {
      const rows: any[][] = [
        ['15/05/2026',                   'Indépendance', 'Source A'],
        [new Date(Date.UTC(2026, 7, 15, 12, 0, 0)), 'Fête nationale', 'Source B'],
        [45792,                          'Anniversaire', ''],
        ['',                             'Sans date',    ''],          // skip — pas de date
        ['mauvais',                      'Mauvaise date',''],          // skip — date invalide
      ];
      const result = (component as any)._parseImportRows(rows);
      expect(result.valid).toHaveLength(3);
      expect(result.skipped).toBe(2);
      expect(result.valid[0].date).toBe('2026-05-15');
      expect(result.valid[1].date).toBe('2026-08-15');
      expect(result.valid[2].date).toBe('2025-05-15');
    });

    it('compte les lignes ignorées par raison (empty vs badDate)', () => {
      const rows: any[][] = [
        ['', '', ''],                  // empty
        ['15/05/2026', '', ''],        // empty title
        ['mauvais', 'Titre', ''],      // bad date
      ];
      const result = (component as any)._parseImportRows(rows);
      expect(result.valid).toHaveLength(0);
      expect(result.skipped).toBe(3);
      expect(result.skippedEmpty).toBe(2);
      expect(result.skippedBadDate).toBe(1);
    });

    it("refuse les lignes dont l'Evenement contient déjà la queue 'Source :' (garde anti-régression)", () => {
      // Si une description importée contient déjà "\nSource : ..." c'est le
      // signe que le bug du parser d'origine est revenu OU qu'on relit un
      // fichier déjà pollué. Dans les deux cas, on REFUSE plutôt que de
      // dupliquer la pollution dans la base.
      const rows: any[][] = [
        ['date', 'evenement', 'source', 'historien'],
        ['15/08/1960', "Indépendance du Congo\n\nSource : Wikipédia", 'Vraie source', 'Geovann'],
      ];
      const result = (component as any)._parseImportRows(rows);
      expect(result.valid).toHaveLength(0);
      expect(result.skippedEmpty).toBe(1);
    });
  });

  describe('éditeur — validation, image, vignette', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('validationItems reflète les champs remplis', () => {
      component.openEditor();
      component.editorTitle.set('Indépendance');
      component.editorDate.set('1960-08-15');
      component.editorDescription.set('x'.repeat(60));
      const items = component.validationItems();
      expect(items[0].ok).toBe(true);
      expect(items[1].ok).toBe(true);
      expect(items[2].ok).toBe(true);
    });

    it('saveDraft avec image → upload cover + vignette', async () => {
      component.openEditor();
      component.editorTitle.set('Titre');
      component.editorDate.set('2026-08-15');
      component.editorImageFile.set(new File([new Uint8Array(10)], 'x.jpg', { type: 'image/jpeg' }));
      await component.saveDraft();
      expect(mockEventService.uploadImage).toHaveBeenCalled();
      expect(mockEventService.uploadThumbnailFor).toHaveBeenCalled();
    });

    it('onThumbError bascule sur le cover une seule fois', () => {
      const img: any = { dataset: {}, src: '' };
      component.onThumbError({ target: img } as any, 'evt-1/cover.jpg');
      expect(img.dataset.fellBack).toBe('1');
      const after = img.src;
      expect(after).toBeTruthy();
      component.onThumbError({ target: img } as any, 'evt-1/cover.jpg');
      expect(img.src).toBe(after);
    });
  });

  describe('import Excel — modal + parsing', () => {
    it('openImportModal réinitialise l\'état et closeImportModal ferme', () => {
      component.openImportModal();
      expect(component.showImportModal()).toBe(true);
      expect(component.importStatus()).toBe('idle');
      component.closeImportModal();
      expect(component.showImportModal()).toBe(false);
    });

    it('onImportFileChange ignore l\'absence de fichier', () => {
      expect(() => component.onImportFileChange({ target: { files: [] } })).not.toThrow();
    });

    describe('_parseDateCell', () => {
      const parse = (v: unknown) => (component as any)._parseDateCell(v);

      it('null/undefined/vide → null', () => {
        expect(parse(null)).toBeNull();
        expect(parse(undefined)).toBeNull();
        expect(parse('')).toBeNull();
      });

      it('objet Date valide → ISO, Date invalide → null', () => {
        expect(parse(new Date('1960-08-15T00:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(parse(new Date('pas-une-date'))).toBeNull();
      });

      it('numéro de série Excel → ISO ; Infinity → null', () => {
        expect(parse(25569)).toMatch(/^\d{4}-\d{2}-\d{2}$/); // 1970-01-01
        expect(parse(Infinity)).toBeNull();
      });

      it('chaîne ISO valide/invalide', () => {
        expect(parse('1960-08-15')).toBe('1960-08-15');
        expect(parse('1960-13-15')).toBeNull();
      });

      it('format jj/mm/aaaa avec année sur 2 chiffres', () => {
        expect(parse('15/08/1960')).toBe('1960-08-15');
        expect(parse('15/08/60')).toBe('1960-08-15');
        expect(parse('15/08/30')).toBe('2030-08-15');
        expect(parse('15/13/1960')).toBeNull();
        expect(parse('bonjour')).toBeNull();
      });
    });

    describe('_parseImportRows', () => {
      const run = (rows: unknown[][]) => (component as any)._parseImportRows(rows);

      it('tableau vide → résultat vide', () => {
        expect(run([]).valid).toEqual([]);
      });

      it('en-têtes reconnus + ligne valide → 1 événement, colonne inconnue ignorée', () => {
        const res = run([
          ['Date', 'Titre', 'Description', 'Remarques'],
          ['1960-08-15', 'Indépendance', 'Le Congo devient indépendant.', 'x'],
        ]);
        expect(res.valid).toHaveLength(1);
        expect(res.valid[0].title).toBe('Indépendance');
        expect(res.ignored.map((i: any) => i.header)).toContain('Remarques');
      });

      it('date invalide → comptée dans skippedBadDate', () => {
        const res = run([
          ['Date', 'Titre'],
          ['pas-une-date', 'Titre'],
        ]);
        expect(res.skippedBadDate).toBe(1);
        expect(res.valid).toHaveLength(0);
      });

      it('mode sans en-tête → colonnes positionnelles', () => {
        const res = run([
          ['aaa', 'bbb', 'ccc'],
          ['1960-08-15', 'Texte descriptif suffisant', ''],
        ]);
        expect(res.valid).toHaveLength(1);
        expect(res.skippedBadDate).toBe(1); // la ligne 'aaa' n'a pas de date valide
      });
    });
  });

  describe('runImport + onImageChange', () => {
    beforeEach(() => {
      (mockEventService as any).batchCreateEvents = jest.fn().mockReturnValue(of({ inserted: 2 }));
    });

    it('runImport ne fait rien sans aperçu', async () => {
      component.importPreview.set([]);
      await component.runImport();
      expect((mockEventService as any).batchCreateEvents).not.toHaveBeenCalled();
    });

    it('runImport insère par lots puis passe à « done »', async () => {
      component.importPreview.set([
        { date: '1960-08-15', title: 'A', description: 'x', rawDate: '', source: '', historian: '' },
        { date: '1961-01-02', title: 'B', description: 'y', rawDate: '', source: '', historian: '' },
      ] as any);
      await component.runImport();
      expect((mockEventService as any).batchCreateEvents).toHaveBeenCalled();
      expect(component.importInserted()).toBe(2);
      expect(component.importStatus()).toBe('done');
    });

    it('runImport interrompt et expose l\'erreur en cas d\'échec d\'un lot', async () => {
      (mockEventService as any).batchCreateEvents = jest.fn().mockReturnValue(of({ inserted: 0, error: 'DB down' }));
      component.importPreview.set([
        { date: '1960-08-15', title: 'A', description: 'x', rawDate: '', source: '', historian: '' },
      ] as any);
      await component.runImport();
      expect(component.importError()).toBe('DB down');
    });

    it('onImageChange enregistre le fichier et son aperçu', () => {
      const file = new File(['x'], 'cover.jpg', { type: 'image/jpeg' });
      Object.defineProperty(file, 'size', { value: 2048 });
      component.onImageChange({ target: { files: [file] } } as any);
      expect(component.editorImageName()).toBe('cover.jpg');
      expect(component.editorImageFile()).toBe(file);
    });

    it('onImageChange ignore l\'absence de fichier', () => {
      expect(() => component.onImageChange({ target: { files: [] } } as any)).not.toThrow();
    });
  });
});
