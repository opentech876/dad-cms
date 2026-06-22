import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { RecommandationsComponent } from './recommandations.component';
import { CalendarService } from '../../core/calendar/calendar.service';
import { CalendarEntryService } from '../../core/calendar/calendar-entry.service';
import { EventService } from '../../core/events/event.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { ToastService } from '../../core/services/toast.service';

const FAKE_CALENDARS = [
  { id: 'cal-1', year: 2026, name: 'Calendrier 2026', status: 'draft' as const, createdBy: null, publishedAt: null, eventCount: 0 },
];

const FAKE_EVENT = {
  id: 'ev-1', event_date: '1960-08-15', title: 'Indépendance', description: null,
  image_path: null, status: 'published' as const, workspace_id: 'ws-1',
  created_by: 'u1', created_at: '', updated_at: '', updated_by: null, deleted_at: null, deleted_by: null,
};

const FAKE_REC = {
  id: 'r1', calendar_id: 'cal-1', mmdd: '08-15', position: 1 as const,
  event_id: 'ev-1', workspace_id: 'ws-1', status: 'pending' as const,
  created_by: 'u1', created_at: '', updated_at: '', applied_at: null, applied_by: null,
  event: FAKE_EVENT,
};

describe('RecommandationsComponent', () => {
  let component: RecommandationsComponent;
  let fixture: ComponentFixture<RecommandationsComponent>;
  let mockCalendar: { listCalendars: jest.Mock };
  let mockCalendarEntry: { getEntriesForCalendar: jest.Mock };
  let mockEvent: { listEventsByMmdd: jest.Mock };
  let mockRec: {
    listByCalendar: jest.Mock;
    upsertSlot: jest.Mock;
    removeSlot: jest.Mock;
  };
  let mockToast: { success: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    mockCalendar = { listCalendars: jest.fn().mockReturnValue(of(FAKE_CALENDARS)) };
    mockCalendarEntry = { getEntriesForCalendar: jest.fn().mockReturnValue(of([])) };
    mockEvent = { listEventsByMmdd: jest.fn().mockReturnValue(of([FAKE_EVENT])) };
    mockRec = {
      listByCalendar: jest.fn().mockReturnValue(of([FAKE_REC])),
      upsertSlot: jest.fn().mockReturnValue(of({ success: true })),
      removeSlot: jest.fn().mockReturnValue(of({ success: true })),
    };
    mockToast = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [RecommandationsComponent],
      providers: [
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
});
