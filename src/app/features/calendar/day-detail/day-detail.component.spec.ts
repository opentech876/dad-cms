import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { DayDetailComponent } from './day-detail.component';
import { EventService } from '../../../core/events/event.service';
import { CalendarEntryService, CalendarEntryWithEvent } from '../../../core/calendar/calendar-entry.service';
import { CampaignService } from '../../../core/campaigns/campaign.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdCampaign, Event } from '../../../models';

const MOCK_LIBRARY_EVENTS: Event[] = [
  {
    id: 'evt-1', event_date: '1960-08-15',
    title: 'Indépendance de la République', status: 'published', workspace_id: 'ws-1',
    description: null, image_path: null,
    created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    updated_by: null, deleted_at: null, deleted_by: null,
  },
  {
    id: 'evt-2', event_date: '1938-08-15',
    title: 'Naissance de Marien Ngouabi', status: 'published', workspace_id: 'ws-1',
    description: null, image_path: null,
    created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    updated_by: null, deleted_at: null, deleted_by: null,
  },
];

const MOCK_CAMPAIGNS: AdCampaign[] = [
  {
    id: 'camp-1', name: 'MTN Congo', advertiser: 'MTN', position: 'header',
    start_date: '2026-08-01', end_date: '2026-08-31',
    active: true, image_path: '', link_url: null, workspace_id: 'ws-1',
    created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    updated_by: null, deleted_at: null, deleted_by: null,
  },
  {
    id: 'camp-2', name: 'Airtel Congo', advertiser: 'Airtel', position: 'footer',
    start_date: '2026-09-01', end_date: '2026-09-30',
    active: true, image_path: '', link_url: null, workspace_id: 'ws-1',
    created_by: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    updated_by: null, deleted_at: null, deleted_by: null,
  },
];

const MOCK_ENTRIES: CalendarEntryWithEvent[] = [
  {
    id: 'entry-1', calendar_id: 'cal-1', mmdd: '08-15', position: 1,
    event_id: 'evt-1', workspace_id: 'ws-1', created_by: 'u1', created_at: '2026-01-01T00:00:00Z',
    event: MOCK_LIBRARY_EVENTS[0],
  },
  {
    id: 'entry-2', calendar_id: 'cal-1', mmdd: '08-15', position: 2,
    event_id: 'evt-2', workspace_id: 'ws-1', created_by: 'u1', created_at: '2026-01-01T00:00:00Z',
    event: MOCK_LIBRARY_EVENTS[1],
  },
];

describe('DayDetailComponent', () => {
  let component: DayDetailComponent;
  let fixture: ComponentFixture<DayDetailComponent>;
  let mockEventService: { listEventsByMmdd: jest.Mock };
  let mockCalendarEntryService: {
    getEntriesForCalendar: jest.Mock;
    assignEvent: jest.Mock;
    unassignSlot: jest.Mock;
  };
  let mockCampaignService: {
    listCampaigns: jest.Mock;
  };
  let mockRouter: { navigate: jest.Mock };
  let mockToast: jest.Mocked<Pick<ToastService, 'success' | 'error'>>;
  let mockAuth: { hasRoleAtLeast: jest.Mock };

  beforeEach(async () => {
    mockEventService = {
      listEventsByMmdd: jest.fn().mockReturnValue(of(MOCK_LIBRARY_EVENTS)),
    };
    mockCalendarEntryService = {
      getEntriesForCalendar: jest.fn().mockReturnValue(of(MOCK_ENTRIES)),
      assignEvent: jest.fn().mockReturnValue(of({ success: true })),
      unassignSlot: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockCampaignService = {
      listCampaigns: jest.fn().mockReturnValue(of(MOCK_CAMPAIGNS)),
    };
    mockRouter = { navigate: jest.fn() };
    mockToast  = { success: jest.fn(), error: jest.fn() };
    // Default: chef_equipe so save() proceeds. The 'role-gated' describe block
    // overrides to return false (plain editeur).
    mockAuth = { hasRoleAtLeast: jest.fn().mockReturnValue(of(true)) };

    await TestBed.configureTestingModule({
      imports: [DayDetailComponent],
      providers: [
        { provide: EventService, useValue: mockEventService },
        { provide: CalendarEntryService, useValue: mockCalendarEntryService },
        { provide: CampaignService, useValue: mockCampaignService },
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: ToastService, useValue: mockToast },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => key === 'calendarId' ? 'cal-1' : '2026-08-15',
              },
            },
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(DayDetailComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(DayDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.ngOnInit();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  // ── chargement ─────────────────────────────────────────────────────────────

  describe('chargement', () => {
    it('appelle listEventsByMmdd avec le mmdd extrait de la date de route', () => {
      expect(mockEventService.listEventsByMmdd).toHaveBeenCalledWith('08-15');
    });

    it('appelle getEntriesForCalendar avec le calendarId de route', () => {
      expect(mockCalendarEntryService.getEntriesForCalendar).toHaveBeenCalledWith('cal-1');
    });

    it('peuple libraryEvents avec les données retournées', () => {
      expect(component.libraryEvents().length).toBe(2);
    });

    it('expose calendarId depuis les paramètres de route', () => {
      expect(component.calendarId).toBe('cal-1');
    });

    it('expose date depuis les paramètres de route', () => {
      expect(component.date).toBe('2026-08-15');
    });

    it('calcule mmdd depuis la date', () => {
      expect(component.mmdd).toBe('08-15');
    });
  });

  // ── selectedPos1 / selectedPos2 ────────────────────────────────────────────

  describe('selectedPos1 / selectedPos2', () => {
    it('selectedPos1 est initialisé avec l\'event_id de l\'entrée à position 1', () => {
      expect(component.selectedPos1()).toBe('evt-1');
    });

    it('selectedPos2 est initialisé avec l\'event_id de l\'entrée à position 2', () => {
      expect(component.selectedPos2()).toBe('evt-2');
    });

    it('event1 computed retourne l\'événement de bibliothèque correspondant à selectedPos1', () => {
      expect(component.event1()?.id).toBe('evt-1');
    });

    it('event2 computed retourne l\'événement de bibliothèque correspondant à selectedPos2', () => {
      expect(component.event2()?.id).toBe('evt-2');
    });

    it('event1() retourne null si selectedPos1 ne correspond à aucun événement', () => {
      component.selectedPos1.set('inexistant');
      expect(component.event1()).toBeNull();
    });

    it('event2() retourne null si selectedPos2 ne correspond à aucun événement', () => {
      component.selectedPos2.set('inexistant');
      expect(component.event2()).toBeNull();
    });
  });

  // ── positions null à l\'init ───────────────────────────────────────────────

  describe('positions null à l\'init', () => {
    it('selectedPos1 est null quand aucune entrée n\'a position 1', async () => {
      mockCalendarEntryService.getEntriesForCalendar.mockReturnValueOnce(of([MOCK_ENTRIES[1]]));
      await component.ngOnInit();
      expect(component.selectedPos1()).toBeNull();
    });

    it('selectedPos2 est null quand aucune entrée n\'a position 2', async () => {
      mockCalendarEntryService.getEntriesForCalendar.mockReturnValueOnce(of([MOCK_ENTRIES[0]]));
      await component.ngOnInit();
      expect(component.selectedPos2()).toBeNull();
    });
  });

  // ── assign ─────────────────────────────────────────────────────────────────

  describe('assign()', () => {
    it('assign(eventId, 1) met à jour selectedPos1', () => {
      component.assign('evt-2', 1);
      expect(component.selectedPos1()).toBe('evt-2');
    });

    it('assign(eventId, 2) met à jour selectedPos2', () => {
      component.assign('evt-1', 2);
      expect(component.selectedPos2()).toBe('evt-1');
    });

    it('assign(null, 1) vide le slot 1', () => {
      component.assign(null, 1);
      expect(component.selectedPos1()).toBeNull();
    });

    it('assign(null, 2) vide le slot 2', () => {
      component.assign(null, 2);
      expect(component.selectedPos2()).toBeNull();
    });
  });

  // ── save ───────────────────────────────────────────────────────────────────

  describe('save()', () => {
    it('appelle assignEvent pour la position 1 quand selectedPos1 est défini', async () => {
      await component.save();
      expect(mockCalendarEntryService.assignEvent).toHaveBeenCalledWith(
        'cal-1', '08-15', 'evt-1', 1,
      );
    });

    it('appelle assignEvent pour la position 2 quand selectedPos2 est défini', async () => {
      await component.save();
      expect(mockCalendarEntryService.assignEvent).toHaveBeenCalledWith(
        'cal-1', '08-15', 'evt-2', 2,
      );
    });

    it('appelle unassignSlot pour la position 1 quand selectedPos1 est null', async () => {
      component.selectedPos1.set(null);
      await component.save();
      expect(mockCalendarEntryService.unassignSlot).toHaveBeenCalledWith('cal-1', '08-15', 1);
    });

    it('appelle unassignSlot pour la position 2 quand selectedPos2 est null', async () => {
      component.selectedPos2.set(null);
      await component.save();
      expect(mockCalendarEntryService.unassignSlot).toHaveBeenCalledWith('cal-1', '08-15', 2);
    });

    it('ne sauvegarde pas quand saveLoading est true', async () => {
      component.saveLoading.set(true);
      await component.save();
      expect(mockCalendarEntryService.assignEvent).not.toHaveBeenCalled();
      expect(mockCalendarEntryService.unassignSlot).not.toHaveBeenCalled();
    });

    it('affiche un toast d\'erreur en cas d\'échec', async () => {
      mockCalendarEntryService.assignEvent.mockReturnValue(
        of({ success: false, error: 'Conflit de position' }),
      );
      await component.save();
      expect(mockToast.error).toHaveBeenCalledWith('Conflit de position');
    });

    it('utilise le message par défaut quand error est undefined', async () => {
      mockCalendarEntryService.assignEvent.mockReturnValue(of({ success: false }));
      await component.save();
      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  // ── dateLabel ──────────────────────────────────────────────────────────────

  describe('dateLabel', () => {
    it('formate la date en "15 août 2026"', () => {
      expect(component.dateLabel()).toBe('15 août 2026');
    });

    it('retourne la date brute si le format est invalide', () => {
      component.date = 'date-invalide';
      expect(component.dateLabel()).toBe('date-invalide');
    });
  });

  // ── navigation ─────────────────────────────────────────────────────────────

  describe('goBack()', () => {
    it('navigue vers /calendrier', () => {
      component.goBack();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/calendrier']);
    });
  });

  // ── chargement campagnes (lecture seule) ───────────────────────────────────

  describe('availableCampaigns', () => {
    it('appelle listCampaigns au démarrage', () => {
      expect(mockCampaignService.listCampaigns).toHaveBeenCalled();
    });

    it('filtre aux campagnes actives couvrant la date', () => {
      // camp-1: 2026-08-01 → 2026-08-31 covers 2026-08-15 ✓
      // camp-2: 2026-09-01 → 2026-09-30 does NOT cover 2026-08-15 ✗
      expect(component.availableCampaigns().length).toBe(1);
      expect(component.availableCampaigns()[0].id).toBe('camp-1');
    });
  });

  // ── role-gated save (editeur read-only) ────────────────────────────────────

  describe('save() — rôle insuffisant', () => {
    it("refuse d'appeler assignEvent quand canEditAssignments est false", async () => {
      mockAuth.hasRoleAtLeast.mockReturnValue(of(false));
      const tb = TestBed.resetTestingModule();
      await tb.configureTestingModule({
        imports: [DayDetailComponent],
        providers: [
          { provide: EventService, useValue: mockEventService },
          { provide: CalendarEntryService, useValue: mockCalendarEntryService },
          { provide: CampaignService, useValue: mockCampaignService },
          { provide: AuthService, useValue: mockAuth },
          { provide: Router, useValue: mockRouter },
          { provide: ToastService, useValue: mockToast },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: { get: (k: string) => k === 'calendarId' ? 'cal-1' : '2026-08-15' } },
            },
          },
        ],
        schemas: [NO_ERRORS_SCHEMA],
      }).compileComponents();

      tb.overrideComponent(DayDetailComponent, { set: { template: '' } });
      const fix = tb.createComponent(DayDetailComponent);
      const editeurComp = fix.componentInstance;
      fix.detectChanges();
      await editeurComp.ngOnInit();

      mockCalendarEntryService.assignEvent.mockClear();
      mockCalendarEntryService.unassignSlot.mockClear();

      await editeurComp.save();

      expect(editeurComp.canEditAssignments()).toBe(false);
      expect(mockCalendarEntryService.assignEvent).not.toHaveBeenCalled();
      expect(mockCalendarEntryService.unassignSlot).not.toHaveBeenCalled();
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringContaining('Présidence'),
      );
    });
  });
});
