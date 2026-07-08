import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { RecommandationsComponent } from './recommandations.component';
import { AuthService } from '../../core/auth/auth.service';
import { CalendarService } from '../../core/calendar/calendar.service';
import { CalendarEntryService } from '../../core/calendar/calendar-entry.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { AppRole } from '../../models';

const FAKE_CALENDARS = [
  { id: 'cal-1', year: 2026, name: 'Calendrier 2026', status: 'draft' as const, createdBy: null, publishedAt: null, eventCount: 0 },
];

const FAKE_REC = {
  id: 'r1', calendar_id: 'cal-1', mmdd: '08-15', position: 1 as const,
  event_id: 'ev-1', workspace_id: 'ws-1', status: 'pending' as const,
  created_by: 'u1', created_at: '', updated_at: '', applied_at: null, applied_by: null,
  event: { id: 'ev-1', title: 'Indépendance', event_date: '1960-08-15', image_path: null },
};

describe('RecommandationsComponent (shell)', () => {
  let component: RecommandationsComponent;
  let fixture: ComponentFixture<RecommandationsComponent>;
  let mockCalendar: { listCalendars: jest.Mock };
  let mockCalendarEntry: { getEntriesForCalendar: jest.Mock };
  let mockRec: { listByCalendar: jest.Mock };

  async function createComponent(granted: AppRole[]): Promise<void> {
    const grantedSet = new Set<AppRole>(granted);
    mockCalendar     = { listCalendars: jest.fn().mockReturnValue(of(FAKE_CALENDARS)) };
    mockCalendarEntry = { getEntriesForCalendar: jest.fn().mockReturnValue(of([])) };
    mockRec          = { listByCalendar: jest.fn().mockReturnValue(of([FAKE_REC])) };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [RecommandationsComponent],
      providers: [
        { provide: AuthService, useValue: { hasRoleAtLeast: jest.fn((role: AppRole) => of(grantedSet.has(role))) } },
        { provide: CalendarService, useValue: mockCalendar },
        { provide: CalendarEntryService, useValue: mockCalendarEntry },
        { provide: RecommendationService, useValue: mockRec },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(RecommandationsComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(RecommandationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('sélection du calendrier', () => {
    beforeEach(async () => {
      await createComponent(['chef_equipe']);
    });

    it('devrait être créé', () => {
      expect(component).toBeTruthy();
    });

    it('charge les calendriers au démarrage', async () => {
      await component.ngOnInit();
      expect(mockCalendar.listCalendars).toHaveBeenCalled();
      expect(component.calendars().length).toBe(1);
    });

    it("sélectionne par défaut le calendrier de l'année courante si disponible", async () => {
      const currentYear = new Date().getFullYear();
      mockCalendar.listCalendars.mockReturnValueOnce(of([
        { ...FAKE_CALENDARS[0], year: currentYear - 1 },
        { ...FAKE_CALENDARS[0], id: 'cal-now', year: currentYear },
      ]));
      await component.ngOnInit();
      expect(component.selectedCalendarId()).toBe('cal-now');
    });

    it('selectCalendar charge les recommandations et entries', async () => {
      await component.selectCalendar('cal-1');
      expect(mockRec.listByCalendar).toHaveBeenCalledWith('cal-1');
      expect(mockCalendarEntry.getEntriesForCalendar).toHaveBeenCalledWith('cal-1');
      expect(component.recommendations().length).toBeGreaterThan(0);
    });

    it('ne fait rien si le calendarId est vide', async () => {
      mockRec.listByCalendar.mockClear();
      await component.selectCalendar('');
      expect(mockRec.listByCalendar).not.toHaveBeenCalled();
    });
  });

  describe('role signals', () => {
    it('canManageRecommendations=true pour presidence', async () => {
      await createComponent(['presidence']);
      fixture.detectChanges();
      expect(component.canManageRecommendations()).toBe(true);
    });

    it('canManageRecommendations=false pour chef_equipe', async () => {
      await createComponent(['chef_equipe']);
      fixture.detectChanges();
      expect(component.canManageRecommendations()).toBe(false);
    });

    it('canApply=true pour chef_equipe', async () => {
      await createComponent(['chef_equipe']);
      fixture.detectChanges();
      expect(component.canApply()).toBe(true);
    });

    it('canApply=false pour editeur', async () => {
      await createComponent(['editeur']);
      fixture.detectChanges();
      expect(component.canApply()).toBe(false);
    });
  });
});
