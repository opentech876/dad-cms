import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { CalendarComponent } from './calendar.component';
import { CalendarService } from '../../core/calendar/calendar.service';
import { CalendarEntryService, CalendarEntryWithEvent } from '../../core/calendar/calendar-entry.service';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';

const fakeCalendars = [
  { id: 'cal-1', year: 2024, name: 'Calendrier 2024', status: 'archived'  as const, createdBy: null, publishedAt: null, eventCount: 412, fillPct: 56 },
  { id: 'cal-2', year: 2025, name: 'Calendrier 2025', status: 'published' as const, createdBy: null, publishedAt: null, eventCount: 487, fillPct: 67 },
  { id: 'cal-3', year: 2026, name: 'Calendrier 2026', status: 'draft'     as const, createdBy: null, publishedAt: null, eventCount: 124, fillPct: 17 },
];

const fakeEntries: CalendarEntryWithEvent[] = [
  {
    id: 'entry-1',
    calendar_id: 'cal-3',
    mmdd: '08-15',
    position: 1,
    event_id: 'evt-1',
    workspace_id: 'ws-1',
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    event: {
      id: 'evt-1', event_date: '1960-08-15',
      title: 'Indépendance', status: 'published', workspace_id: 'ws-1',
      description: null, image_path: null,
      created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      updated_by: null, deleted_at: null, deleted_by: null,
    },
  },
];

describe('CalendarComponent', () => {
  let component: CalendarComponent;
  let mockCalendarService: {
    listCalendars: jest.Mock;
    createCalendar: jest.Mock;
    updateCalendar: jest.Mock;
    deleteCalendar: jest.Mock;
  };
  let mockCalendarEntryService: { getEntriesForCalendar: jest.Mock };
  let mockCampaignService: { listCampaigns: jest.Mock };
  let mockRecommendationService: {
    countPending: jest.Mock;
    listByCalendar: jest.Mock;
    applyAll: jest.Mock;
    getConflicts: jest.Mock;
  };
  let mockToast: { success: jest.Mock; error: jest.Mock; info: jest.Mock };
  let canApplyRole$: BehaviorSubject<boolean>;

  beforeEach(async () => {
    mockCalendarService = {
      listCalendars: jest.fn().mockReturnValue(of(fakeCalendars)),
      createCalendar: jest.fn().mockReturnValue(of({ success: true, id: 'cal-new' })),
      updateCalendar: jest.fn().mockReturnValue(of({ success: true })),
      deleteCalendar: jest.fn().mockReturnValue(of({ success: true })),
    };

    mockCalendarEntryService = {
      getEntriesForCalendar: jest.fn().mockReturnValue(of([])),
    };

    mockCampaignService = {
      listCampaigns: jest.fn().mockReturnValue(of([])),
    };

    mockRecommendationService = {
      countPending:   jest.fn().mockReturnValue(of(0)),
      listByCalendar: jest.fn().mockReturnValue(of([])),
      applyAll:       jest.fn().mockReturnValue(of({ success: true, applied: 0, skipped: 0 })),
      getConflicts:   jest.fn().mockReturnValue([]),
    };

    // Default: signed-in as an editorial role that *can* apply.
    canApplyRole$ = new BehaviorSubject<boolean>(true);
    const mockAuthService = {
      hasRoleAtLeast: jest.fn().mockReturnValue(canApplyRole$.asObservable()),
    };

    mockToast = {
      success: jest.fn(),
      error:   jest.fn(),
      info:    jest.fn(),
    };

    TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: CalendarService, useValue: mockCalendarService },
        { provide: CalendarEntryService, useValue: mockCalendarEntryService },
        { provide: CampaignService, useValue: mockCampaignService },
        { provide: RecommendationService, useValue: mockRecommendationService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ToastService, useValue: mockToast },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    TestBed.overrideComponent(CalendarComponent, { set: { template: '' } });

    const fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.ngOnInit();
  });

  // ── chargement ─────────────────────────────────────────────────────────────

  it('charge les calendriers depuis le service au démarrage', () => {
    expect(mockCalendarService.listCalendars).toHaveBeenCalled();
  });

  it('remplit le signal calendars avec les données du service', () => {
    expect(component.calendars().length).toBe(3);
  });

  it('calcule fillPct depuis eventCount', () => {
    const cal = component.calendars()[0];
    expect(cal.fillPct).toBe(Math.min(100, Math.round((412 / 730) * 100)));
  });

  it('sélectionne automatiquement le dernier calendrier après chargement', () => {
    expect(component.selectedCalendarId()).toBe('cal-3');
  });

  // ── navigation des calendriers ─────────────────────────────────────────────

  it('canPrevCalendar est false quand le premier calendrier est sélectionné', () => {
    component.selectCalendar('cal-1');
    expect(component.canPrevCalendar()).toBe(false);
  });

  it('canNextCalendar est false quand le dernier calendrier est sélectionné', () => {
    expect(component.canNextCalendar()).toBe(false);
  });

  it('prevCalendar sélectionne le calendrier précédent', () => {
    component.selectCalendar('cal-2');
    component.prevCalendar();
    expect(component.selectedCalendarId()).toBe('cal-1');
  });

  it('nextCalendar sélectionne le calendrier suivant', () => {
    component.selectCalendar('cal-1');
    component.nextCalendar();
    expect(component.selectedCalendarId()).toBe('cal-2');
  });

  // ── création de calendrier ─────────────────────────────────────────────────

  it('createCalendar appelle le service avec year, name et status', async () => {
    component.openNewCalModal();
    component.newCalYear.set(2027);
    component.newCalName.set('Calendrier 2027');
    component.newCalStatus.set('draft');

    await component.createCalendar();

    expect(mockCalendarService.createCalendar).toHaveBeenCalledWith(2027, 'Calendrier 2027', 'draft');
  });

  it('createCalendar ferme la modal en cas de succès', async () => {
    component.openNewCalModal();
    component.newCalYear.set(2027);

    await component.createCalendar();

    expect(component.showNewCalModal()).toBe(false);
  });

  it('createCalendar affiche une erreur en cas d\'échec', async () => {
    mockCalendarService.createCalendar.mockReturnValueOnce(
      of({ success: false, error: 'Année déjà existante' }),
    );
    component.openNewCalModal();
    component.newCalYear.set(2025);

    await component.createCalendar();

    expect(component.showNewCalModal()).toBe(true);
    expect(component.newCalError()).toBe('Année déjà existante');
  });

  it('createCalendar utilise le year comme nom par défaut si newCalName est vide', async () => {
    component.openNewCalModal();
    component.newCalYear.set(2027);
    component.newCalName.set('');

    await component.createCalendar();

    expect(mockCalendarService.createCalendar).toHaveBeenCalledWith(2027, 'Calendrier 2027', 'draft');
  });

  // ── vue mois ────────────────────────────────────────────────────────────────

  it('monthCells retourne 42 cellules pour la vue mois', () => {
    expect(component.monthCells().length).toBe(42);
  });

  it('prevMonth décrémente le mois sélectionné', () => {
    component.selectedMonth.set(5);
    component.prevMonth();
    expect(component.selectedMonth()).toBe(4);
  });

  it('nextMonth incrémente le mois sélectionné', () => {
    component.selectedMonth.set(5);
    component.nextMonth();
    expect(component.selectedMonth()).toBe(6);
  });

  it('prevMonth ne va pas en dessous de 0', () => {
    component.selectedMonth.set(0);
    component.prevMonth();
    expect(component.selectedMonth()).toBe(0);
  });

  it('nextMonth ne dépasse pas 11', () => {
    component.selectedMonth.set(11);
    component.nextMonth();
    expect(component.selectedMonth()).toBe(11);
  });

  // ── publication ───────────────────────────────────────────────────────────

  describe('publishCalendar()', () => {
    it('appelle updateCalendar avec status published', async () => {
      await component.publishCalendar();
      expect(mockCalendarService.updateCalendar).toHaveBeenCalledWith(
        'cal-3',
        { status: 'published' },
      );
    });

    it('recharge les calendriers après succès', async () => {
      mockCalendarService.listCalendars.mockClear();
      await component.publishCalendar();
      expect(mockCalendarService.listCalendars).toHaveBeenCalled();
    });

    it("canPublish est true quand le calendrier sélectionné est 'draft'", () => {
      expect(component.canPublish()).toBe(true);
    });

    it("canPublish est false quand le calendrier sélectionné n'est pas 'draft'", () => {
      component.selectCalendar('cal-2');
      expect(component.canPublish()).toBe(false);
    });
  });

  // ── chargement des entrées ──────────────────────────────────────────────────

  describe('chargement des entrées', () => {
    it('getEntriesForCalendar est appelé au démarrage avec le calendrier sélectionné', () => {
      expect(mockCalendarEntryService.getEntriesForCalendar).toHaveBeenCalledWith('cal-3');
    });

    it('getEntriesForCalendar est appelé quand on sélectionne un nouveau calendrier', () => {
      mockCalendarEntryService.getEntriesForCalendar.mockClear();
      component.selectCalendar('cal-1');
      expect(mockCalendarEntryService.getEntriesForCalendar).toHaveBeenCalledWith('cal-1');
    });

    it('le signal entries est mis à jour avec les données retournées', () => {
      mockCalendarEntryService.getEntriesForCalendar.mockReturnValueOnce(of(fakeEntries));
      component.selectCalendar('cal-1'); // cal-1 n'est pas dans le cache
      expect(component.entries().length).toBe(1);
    });

    it('loadingEntries passe à true pendant le chargement et revient à false', () => {
      const subject = new Subject<CalendarEntryWithEvent[]>();
      mockCalendarEntryService.getEntriesForCalendar.mockReturnValueOnce(subject.asObservable());
      component.selectCalendar('cal-1');
      expect(component.loadingEntries()).toBe(true);
      subject.next([]);
      subject.complete();
      expect(component.loadingEntries()).toBe(false);
    });

    it('loadingEntries est false après un chargement synchrone', () => {
      component.selectCalendar('cal-2');
      expect(component.loadingEntries()).toBe(false);
    });
  });

  // ── entriesByMmdd ──────────────────────────────────────────────────────────

  describe('entriesByMmdd', () => {
    it('groupe les entrées par mmdd', () => {
      mockCalendarEntryService.getEntriesForCalendar.mockReturnValueOnce(of(fakeEntries));
      component.selectCalendar('cal-1'); // cal-1 n'est pas encore dans le cache
      const byMmdd = component.entriesByMmdd();
      expect(byMmdd.has('08-15')).toBe(true);
      expect(byMmdd.get('08-15')?.length).toBe(1);
    });

    it('retourne une Map vide quand entries est vide', () => {
      expect(component.entriesByMmdd().size).toBe(0);
    });
  });

  // ── listRows (computed) ────────────────────────────────────────────────────

  describe('listRows', () => {
    it('génère 365 lignes pour une année non bissextile', () => {
      component.selectedYear.set(2026);
      expect(component.listRows().length).toBe(365);
    });

    it('génère 366 lignes pour une année bissextile', () => {
      component.selectedYear.set(2024);
      expect(component.listRows().length).toBe(366);
    });

    it('marque les lignes sans événements comme "empty"', () => {
      const row = component.listRows()[0];
      expect(row.status).toBe('empty');
    });
  });

  // ── filtre ─────────────────────────────────────────────────────────────────

  describe('filtre', () => {
    it("activeFilter démarre à 'all'", () => {
      expect(component.activeFilter()).toBe('all');
    });

    it("setFilter change la valeur de activeFilter", () => {
      component.setFilter('empty');
      expect(component.activeFilter()).toBe('empty');
    });

    it('setFilter remet currentPage à 0', () => {
      component.nextPage();
      component.setFilter('all');
      expect(component.currentPage()).toBe(0);
    });

    it("filteredRows avec filtre 'empty' retourne uniquement les lignes vides", () => {
      mockCalendarEntryService.getEntriesForCalendar.mockReturnValueOnce(of(fakeEntries));
      component.selectCalendar('cal-3');
      component.setFilter('empty');
      const hasNonEmpty = component.filteredRows().some(r => r.totalEvents > 0);
      expect(hasNonEmpty).toBe(false);
    });
  });

  // ── pagination ─────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('paginatedRows retourne au plus pageSize éléments', () => {
      expect(component.paginatedRows().length).toBeLessThanOrEqual(component.pageSize);
    });

    it('nextPage incrémente currentPage', () => {
      component.nextPage();
      expect(component.currentPage()).toBe(1);
    });

    it('prevPage décrémente currentPage', () => {
      component.nextPage();
      component.prevPage();
      expect(component.currentPage()).toBe(0);
    });

    it('prevPage ne va pas en dessous de 0', () => {
      component.prevPage();
      expect(component.currentPage()).toBe(0);
    });
  });

  // ── pickMonth ──────────────────────────────────────────────────────────────

  it('pickMonth change le mois sélectionné et passe en vue mois', () => {
    component.pickMonth(5);
    expect(component.selectedMonth()).toBe(5);
    expect(component.view()).toBe('month');
  });

  // ── monthLabel / monthDayCount / monthCells ────────────────────────────────

  it('monthLabel retourne le nom du mois et l\'année sélectionnée', () => {
    component.selectedMonth.set(0);
    component.selectedYear.set(2026);
    expect(component.monthLabel()).toContain('janvier');
    expect(component.monthLabel()).toContain('2026');
  });

  it('monthDayCount retourne 31 pour janvier', () => {
    component.selectedYear.set(2026);
    component.selectedMonth.set(0);
    expect(component.monthDayCount()).toBe(31);
  });

  it('monthDayCount retourne 28 pour février 2025', () => {
    component.selectedYear.set(2025);
    component.selectedMonth.set(1);
    expect(component.monthDayCount()).toBe(28);
  });

  it('monthDayCount retourne 29 pour février 2024 (année bissextile)', () => {
    component.selectedYear.set(2024);
    component.selectedMonth.set(1);
    expect(component.monthDayCount()).toBe(29);
  });

  // ── yearHeatmap ────────────────────────────────────────────────────────────

  it('yearHeatmap retourne 12 mois', () => {
    expect(component.yearHeatmap().length).toBe(12);
  });

  it('yearHeatmap colore un jour avec 1 événement en intensity 1', () => {
    mockCalendarEntryService.getEntriesForCalendar.mockReturnValueOnce(of(fakeEntries));
    component.selectCalendar('cal-1'); // cal-1 n'est pas dans le cache
    component.selectedYear.set(2026);
    const août = component.yearHeatmap()[7]; // index 7 = août
    const day15 = août.cells.find(c => c.d === 15);
    expect(day15?.intensity).toBe(1);
  });

  it('yearHeatmap colore les jours vides en intensity 0', () => {
    const jan = component.yearHeatmap()[0];
    const day1 = jan.cells.find(c => c.d === 1);
    expect(day1?.intensity).toBe(0);
  });

  // ── filteredRows — branches full / partial ─────────────────────────────────

  it("filteredRows avec filtre 'full' retourne uniquement les lignes à pinnedCount 2", () => {
    component.setFilter('full');
    component.filteredRows().forEach(r => expect(r.pinnedCount).toBe(2));
  });

  it("filteredRows avec filtre 'partial' retourne uniquement les lignes à pinnedCount 1", () => {
    component.setFilter('partial');
    component.filteredRows().forEach(r => expect(r.pinnedCount).toBe(1));
  });

  // ── openDayDetail / closeDayDetail ─────────────────────────────────────────

  describe('openDayDetail() / closeDayDetail()', () => {
    it('openDayDetail positionne selectedDay', () => {
      component.openDayDetail(15, 7);
      expect(component.selectedDay()).toEqual({ day: 15, month: 7 });
    });

    it('openDayDetail avec null ne modifie pas selectedDay', () => {
      component.selectedDay.set({ day: 5, month: 0 });
      component.openDayDetail(null, 0);
      expect(component.selectedDay()).toEqual({ day: 5, month: 0 });
    });

    it('closeDayDetail remet selectedDay à null', () => {
      component.openDayDetail(15, 7);
      component.closeDayDetail();
      expect(component.selectedDay()).toBeNull();
    });
  });

  // ── navigateToPrevDay / navigateToNextDay ──────────────────────────────────

  describe('navigateToPrevDay()', () => {
    it('décrémente le jour si > 1', () => {
      component.openDayDetail(10, 0);
      component.navigateToPrevDay();
      expect(component.selectedDay()).toEqual({ day: 9, month: 0 });
    });

    it('passe au dernier jour du mois précédent si jour === 1', () => {
      component.selectedYear.set(2026);
      component.openDayDetail(1, 1); // 1er février
      component.navigateToPrevDay();
      expect(component.selectedDay()).toEqual({ day: 31, month: 0 }); // 31 janvier
    });

    it('ne fait rien si selectedDay est null', () => {
      component.navigateToPrevDay();
      expect(component.selectedDay()).toBeNull();
    });
  });

  describe('navigateToNextDay()', () => {
    it('incrémente le jour si < max du mois', () => {
      component.selectedYear.set(2026);
      component.openDayDetail(14, 7); // 14 août
      component.navigateToNextDay();
      expect(component.selectedDay()).toEqual({ day: 15, month: 7 });
    });

    it('passe au 1er du mois suivant si dernier jour du mois', () => {
      component.selectedYear.set(2026);
      component.openDayDetail(31, 0); // 31 janvier
      component.navigateToNextDay();
      expect(component.selectedDay()).toEqual({ day: 1, month: 1 });
    });

    it('ne fait rien si selectedDay est null', () => {
      component.navigateToNextDay();
      expect(component.selectedDay()).toBeNull();
    });
  });

  // ── helpers ────────────────────────────────────────────────────────────────

  describe('helpers', () => {
    it("statusBadgeClass retourne 'badge-success' pour published", () => {
      expect(component.statusBadgeClass('published')).toBe('badge-success');
    });

    it("statusBadgeClass retourne 'badge-warning' pour draft", () => {
      expect(component.statusBadgeClass('draft')).toBe('badge-warning');
    });

    it("statusLabel retourne 'Publié' pour published", () => {
      expect(component.statusLabel('published')).toBe('Publié');
    });

    it("statusLabel retourne 'Brouillon' pour draft", () => {
      expect(component.statusLabel('draft')).toBe('Brouillon');
    });

    it("calLabel retourne uniquement le nom saisi par l'utilisateur", () => {
      const cal = component.calendars()[0];
      expect(component.calLabel(cal)).toBe(cal.name);
    });

    it('intensityBg retourne une couleur pour chaque intensité', () => {
      expect(component.intensityBg(0)).toContain('--bg-sunken');
      expect(component.intensityBg(1)).toContain('--accent');
      expect(component.intensityBg(2)).toContain('--accent');
      expect(component.intensityBg(3)).toContain('--accent');
    });

    it('pinnedCount compte les événements dont displayPosition est non-null', () => {
      const events: any[] = [
        { displayPosition: 1 },
        { displayPosition: null },
        { displayPosition: 2 },
      ];
      expect(component.pinnedCount(events)).toBe(2);
    });

    it('dayDetailHeadline retourne le message vide quand aucun événement', () => {
      expect(component.dayDetailHeadline([])).toBe('Aucun événement pour cette date');
    });

    it('dayDetailHeadline retourne le titre entre guillemets quand 1 événement épinglé', () => {
      const events: any[] = [{ displayPosition: 1, title: 'Indépendance' }];
      expect(component.dayDetailHeadline(events)).toBe('« Indépendance »');
    });

    it('dayDetailHeadline retourne "Une date, deux histoires" quand 2 épinglés', () => {
      const events: any[] = [
        { displayPosition: 1, title: 'A' },
        { displayPosition: 2, title: 'B' },
      ];
      expect(component.dayDetailHeadline(events)).toBe('Une date, deux histoires');
    });

    it("dayDetailHeadline indique qu'aucun n'est sélectionné s'il y a des événements non épinglés", () => {
      const events: any[] = [{ displayPosition: null, title: 'A' }];
      expect(component.dayDetailHeadline(events)).toContain('aucun sélectionné');
    });
  });

  // ── navigation shortcuts ───────────────────────────────────────────────────

  describe('navigation shortcuts', () => {
    it('goToEvents() navigue vers /evenements', () => {
      const router = TestBed.inject(Router);
      component.goToEvents();
      expect(router.navigate).toHaveBeenCalledWith(['/evenements']);
    });

    it('goToCampaigns() navigue vers /campagnes', () => {
      const router = TestBed.inject(Router);
      component.goToCampaigns();
      expect(router.navigate).toHaveBeenCalledWith(['/campagnes']);
    });
  });

  // ── selectedDayDetail ─────────────────────────────────────────────────────

  describe('selectedDayDetail', () => {
    it('retourne null quand aucun jour sélectionné', () => {
      expect(component.selectedDayDetail()).toBeNull();
    });

    it('retourne null quand aucun calendrier sélectionné', () => {
      component.selectedDay.set({ day: 15, month: 7 });
      component.calendars.set([]);
      expect(component.selectedDayDetail()).toBeNull();
    });

    it('retourne les données du jour sélectionné', () => {
      component.openDayDetail(15, 7);
      const detail = component.selectedDayDetail();
      expect(detail).not.toBeNull();
      expect(detail?.day).toBe(15);
      expect(detail?.month).toBe(7);
    });

    it("inclut l'événement du jour s'il y en a un", () => {
      mockCalendarEntryService.getEntriesForCalendar.mockReturnValueOnce(of(fakeEntries));
      component.selectCalendar('cal-1'); // cal-1 n'est pas dans le cache
      component.openDayDetail(15, 7); // mmdd = '08-15'
      expect(component.selectedDayDetail()?.events.length).toBe(1);
    });
  });

  // ── dup modal ─────────────────────────────────────────────────────────────

  describe('dupModal', () => {
    it('openDupModal ouvre la modal', () => {
      component.openDupModal();
      expect(component.showDupModal()).toBe(true);
    });

    it('closeDupModal ferme la modal', () => {
      component.openDupModal();
      component.closeDupModal();
      expect(component.showDupModal()).toBe(false);
    });

    it('dupSourceCalendar retourne le calendrier source', () => {
      component.openDupModal();
      expect(component.dupSourceCalendar()?.id).toBe('cal-3');
    });

    it('dupTargetCalendars exclut le calendrier source et les archivés', () => {
      component.openDupModal();
      const targets = component.dupTargetCalendars();
      const hasSource = targets.some(c => c.id === 'cal-3');
      const hasArchived = targets.some(c => c.status === 'archived');
      expect(hasSource).toBe(false);
      expect(hasArchived).toBe(false);
    });

    it('confirmDuplicate vers new crée un nouveau calendrier dans la liste', () => {
      component.openDupModal();
      component.dupTargetType.set('new');
      component.dupNewYear.set(2027);
      component.dupNewName.set('Calendrier Test');
      const initialCount = component.calendars().length;
      component.confirmDuplicate();
      expect(component.calendars().length).toBe(initialCount + 1);
      expect(component.dupStatus()).toBe('done');
    });

    it('confirmDuplicate vers existing augmente eventCount du calendrier cible', () => {
      component.openDupModal();
      component.dupTargetType.set('existing');
      component.dupTargetId.set('cal-2');
      const before = component.calendars().find(c => c.id === 'cal-2')!.eventCount;
      component.confirmDuplicate();
      const after = component.calendars().find(c => c.id === 'cal-2')!.eventCount;
      expect(after).toBeGreaterThanOrEqual(before);
      expect(component.dupStatus()).toBe('done');
    });

    it('goToDupResult sélectionne le calendrier dupliqué et ferme la modal', () => {
      component.openDupModal();
      component.dupTargetType.set('new');
      component.dupNewYear.set(2029);
      component.confirmDuplicate();
      component.goToDupResult();
      expect(component.showDupModal()).toBe(false);
    });

    it('confirmDuplicate ne fait rien si dupSourceCalendar est undefined', () => {
      component.dupSourceId.set('inexistant');
      const before = component.calendars().length;
      component.confirmDuplicate();
      expect(component.calendars().length).toBe(before);
    });
  });

  // ── Presidency apply flow ──────────────────────────────────────────────
  describe('flux d\'application des recommandations du Curateur', () => {
    it('canApplyRecommendations est true pour un rôle éditorial', () => {
      expect(component.canApplyRecommendations()).toBe(true);
    });

    it('canApplyRecommendations est false pour un rôle non-éditorial (presidence / charge_communication)', () => {
      canApplyRole$.next(false);
      expect(component.canApplyRecommendations()).toBe(false);
    });

    it('hasRoleAtLeast est appelé avec "chef_equipe" (le tier minimal accepté par la RPC)', () => {
      const auth = TestBed.inject(AuthService) as unknown as { hasRoleAtLeast: jest.Mock };
      expect(auth.hasRoleAtLeast).toHaveBeenCalledWith('chef_equipe');
    });

    it('refreshPendingCount met à jour pendingRecommendationsCount depuis le service', async () => {
      mockRecommendationService.countPending.mockReturnValueOnce(of(7));
      await component.refreshPendingCount();
      expect(component.pendingRecommendationsCount()).toBe(7);
    });

    it('refreshPendingCount remet à 0 quand aucun calendrier n\'est sélectionné', async () => {
      component.selectedCalendarId.set('');
      await component.refreshPendingCount();
      expect(component.pendingRecommendationsCount()).toBe(0);
    });

    it('selectCalendar déclenche refreshPendingCount pour le nouveau calendrier', () => {
      mockRecommendationService.countPending.mockClear();
      component.selectCalendar('cal-1');
      expect(mockRecommendationService.countPending).toHaveBeenCalledWith('cal-1');
    });

    it('openApplyDialog charge les recommandations et les entrées puis ouvre le dialogue', async () => {
      await component.openApplyDialog();
      expect(mockRecommendationService.listByCalendar).toHaveBeenCalledWith('cal-3');
      expect(mockCalendarEntryService.getEntriesForCalendar).toHaveBeenCalledWith('cal-3');
      expect(mockRecommendationService.getConflicts).toHaveBeenCalled();
      expect(component.applyDialogVisible()).toBe(true);
    });

    it('openApplyDialog ne fait rien pour un rôle non-éditorial', async () => {
      canApplyRole$.next(false);
      mockRecommendationService.listByCalendar.mockClear();
      await component.openApplyDialog();
      expect(mockRecommendationService.listByCalendar).not.toHaveBeenCalled();
      expect(component.applyDialogVisible()).toBe(false);
    });

    it('openApplyDialog stocke les conflits pour affichage', async () => {
      mockRecommendationService.getConflicts.mockReturnValueOnce([
        { mmdd: '08-15', position: 1, current_event_title: 'A', recommended_event_title: 'B' },
      ]);
      await component.openApplyDialog();
      expect(component.applyConflicts().length).toBe(1);
    });

    it('cancelApply ferme le dialogue et vide les conflits', () => {
      component.applyDialogVisible.set(true);
      component.applyConflicts.set([
        { mmdd: '01-01', position: 1, current_event_title: 'X', recommended_event_title: 'Y' },
      ]);
      component.cancelApply();
      expect(component.applyDialogVisible()).toBe(false);
      expect(component.applyConflicts().length).toBe(0);
    });

    it('confirmApply appelle la RPC applyAll avec overwrite=true', async () => {
      await component.confirmApply();
      expect(mockRecommendationService.applyAll).toHaveBeenCalledWith('cal-3', true);
    });

    it('confirmApply affiche un toast succès avec le nombre appliqué', async () => {
      mockRecommendationService.applyAll.mockReturnValueOnce(
        of({ success: true, applied: 4, skipped: 0 }),
      );
      await component.confirmApply();
      expect(mockToast.success).toHaveBeenCalledWith('4 recommandation(s) appliquée(s).');
    });

    it('confirmApply rafraîchit le compteur après succès', async () => {
      mockRecommendationService.countPending.mockClear();
      await component.confirmApply();
      expect(mockRecommendationService.countPending).toHaveBeenCalled();
    });

    it('confirmApply rafraîchit les entrées après succès (les événements appliqués apparaissent sans reload)', async () => {
      mockCalendarEntryService.getEntriesForCalendar.mockClear();
      await component.confirmApply();
      expect(mockCalendarEntryService.getEntriesForCalendar).toHaveBeenCalledWith('cal-3');
    });

    it('confirmApply affiche un toast erreur quand la RPC échoue', async () => {
      mockRecommendationService.applyAll.mockReturnValueOnce(
        of({ success: false, error: 'insufficient_privilege' }),
      );
      await component.confirmApply();
      expect(mockToast.error).toHaveBeenCalled();
    });

    it('confirmApply ne fait rien pour un rôle non-éditorial', async () => {
      canApplyRole$.next(false);
      mockRecommendationService.applyAll.mockClear();
      await component.confirmApply();
      expect(mockRecommendationService.applyAll).not.toHaveBeenCalled();
    });

    it('confirmApply ferme le dialogue après la RPC', async () => {
      component.applyDialogVisible.set(true);
      await component.confirmApply();
      expect(component.applyDialogVisible()).toBe(false);
    });
  });
});
