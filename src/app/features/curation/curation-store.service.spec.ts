import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CurationStore } from './curation-store.service';
import { CalendarService } from '../../core/calendar/calendar.service';
import { CalendarEntryService } from '../../core/calendar/calendar-entry.service';
import { RecommendationService } from '../../core/presidency/recommendation.service';
import { EventService } from '../../core/events/event.service';
import { SupabaseService } from '../../core/supabase/supabase.service';

const CURRENT_YEAR = new Date().getFullYear();

function makeCal(overrides: any = {}) {
  return {
    id: 'cal-1',
    year: CURRENT_YEAR,
    name: `Calendrier ${CURRENT_YEAR}`,
    status: 'draft',
    createdBy: null,
    publishedAt: null,
    eventCount: 0,
    ...overrides,
  };
}

function makeRec(overrides: any = {}) {
  return {
    id: 'rec-1',
    calendar_id: 'cal-1',
    mmdd: '08-15',
    position: 1,
    event_id: 'ev-1',
    workspace_id: 'ws-1',
    status: 'pending',
    created_by: 'u-1',
    created_at: '2026-07-10T10:00:00Z',
    updated_at: '2026-07-10T10:00:00Z',
    applied_at: null,
    applied_by: null,
    event: null,
    ...overrides,
  };
}

function makeEntry(overrides: any = {}) {
  return {
    id: 'en-1',
    calendar_id: 'cal-1',
    mmdd: '08-15',
    position: 1,
    event_id: 'ev-9',
    event: { id: 'ev-9', title: 'Actuel' },
    ...overrides,
  };
}

describe('CurationStore', () => {
  let store: CurationStore;
  let mockCalendars: { listCalendars: jest.Mock };
  let mockEntries: { getEntriesForCalendar: jest.Mock };
  let mockRecs: { listMine: jest.Mock };
  let mockEvents: { listEvents: jest.Mock };
  let mockSupabase: { client: any };

  beforeEach(() => {
    mockCalendars = { listCalendars: jest.fn().mockReturnValue(of([makeCal()])) };
    mockEntries = { getEntriesForCalendar: jest.fn().mockReturnValue(of([])) };
    mockRecs = { listMine: jest.fn().mockReturnValue(of([])) };
    mockEvents = { listEvents: jest.fn().mockReturnValue(of([])) };
    mockSupabase = {
      client: { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) } },
    };

    TestBed.configureTestingModule({
      providers: [
        CurationStore,
        { provide: CalendarService, useValue: mockCalendars },
        { provide: CalendarEntryService, useValue: mockEntries },
        { provide: RecommendationService, useValue: mockRecs },
        { provide: EventService, useValue: mockEvents },
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });
    store = TestBed.inject(CurationStore);
  });

  describe('load()', () => {
    it("sélectionne le calendrier de l'année courante", async () => {
      mockCalendars.listCalendars.mockReturnValue(
        of([makeCal({ id: 'old', year: CURRENT_YEAR - 1 }), makeCal({ id: 'now' })]),
      );

      await store.load();

      expect(store.selectedCalendarId()).toBe('now');
      expect(store.calendarYear()).toBe(CURRENT_YEAR);
    });

    it("retombe sur le premier calendrier quand l'année courante n'existe pas", async () => {
      mockCalendars.listCalendars.mockReturnValue(
        of([makeCal({ id: 'only', year: CURRENT_YEAR + 1 })]),
      );

      await store.load();

      expect(store.selectedCalendarId()).toBe('only');
    });

    it('charge mes recommandations et les entrées du calendrier', async () => {
      mockRecs.listMine.mockReturnValue(of([makeRec()]));
      mockEntries.getEntriesForCalendar.mockReturnValue(of([makeEntry()]));

      await store.load();

      expect(store.myRecs().length).toBe(1);
      expect(store.entries().length).toBe(1);
      expect(mockEntries.getEntriesForCalendar).toHaveBeenCalledWith('cal-1');
    });
  });

  describe('compteurs de statut', () => {
    it('compte pending et publiées séparément', async () => {
      mockRecs.listMine.mockReturnValue(
        of([
          makeRec({ id: 'r1', status: 'pending' }),
          makeRec({ id: 'r2', status: 'applied' }),
          makeRec({ id: 'r3', status: 'applied' }),
        ]),
      );

      await store.load();

      expect(store.pendingCount()).toBe(1);
      expect(store.publishedCount()).toBe(2);
    });

    it('myCalendarRecs ne garde que les recommandations du calendrier sélectionné', async () => {
      mockRecs.listMine.mockReturnValue(
        of([makeRec({ id: 'r1' }), makeRec({ id: 'r2', calendar_id: 'cal-autre' })]),
      );

      await store.load();

      expect(store.myCalendarRecs().length).toBe(1);
    });
  });

  describe('hubDayState()', () => {
    it('priorité : pending > publiée > remplie > vide', async () => {
      mockRecs.listMine.mockReturnValue(
        of([
          makeRec({ id: 'r1', mmdd: '03-01', status: 'pending' }),
          makeRec({ id: 'r2', mmdd: '03-01', status: 'applied', position: 2 }),
          makeRec({ id: 'r3', mmdd: '03-02', status: 'applied' }),
        ]),
      );
      mockEntries.getEntriesForCalendar.mockReturnValue(
        of([makeEntry({ id: 'e1', mmdd: '03-03' })]),
      );

      await store.load();

      expect(store.hubDayState('03-01')).toBe('pending');
      expect(store.hubDayState('03-02')).toBe('published');
      expect(store.hubDayState('03-03')).toBe('filled');
      expect(store.hubDayState('03-04')).toBe('empty');
    });
  });

  describe('emptyDates', () => {
    it("liste chaque date de l'année sans aucun événement", async () => {
      const entries: any[] = [];
      // Fill every day of the year except March 3rd.
      const d = new Date(CURRENT_YEAR, 0, 1);
      while (d.getFullYear() === CURRENT_YEAR) {
        const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (mmdd !== '03-03') entries.push(makeEntry({ id: `e-${mmdd}`, mmdd }));
        d.setDate(d.getDate() + 1);
      }
      mockEntries.getEntriesForCalendar.mockReturnValue(of(entries));

      await store.load();

      expect(store.emptyDates()).toEqual(['03-03']);
    });

    it("reste vide tant qu'aucun calendrier n'est sélectionné", () => {
      expect(store.emptyDates()).toEqual([]);
    });
  });

  describe('hasSameEventElsewhereOnDay()', () => {
    it("détecte le même événement déjà proposé par moi sur l'autre position", async () => {
      mockRecs.listMine.mockReturnValue(
        of([makeRec({ mmdd: '08-15', position: 1, event_id: 'ev-1' })]),
      );

      await store.load();

      expect(store.hasSameEventElsewhereOnDay('08-15', 2, 'ev-1')).toBe(true);
      // Same slot = simple update of my own recommendation, no conflict.
      expect(store.hasSameEventElsewhereOnDay('08-15', 1, 'ev-1')).toBe(false);
      expect(store.hasSameEventElsewhereOnDay('08-15', 2, 'ev-2')).toBe(false);
    });

    it("détecte le même événement déjà en place sur l'autre position du calendrier", async () => {
      mockEntries.getEntriesForCalendar.mockReturnValue(
        of([makeEntry({ mmdd: '08-15', position: 1, event_id: 'ev-9' })]),
      );

      await store.load();

      expect(store.hasSameEventElsewhereOnDay('08-15', 2, 'ev-9')).toBe(true);
      expect(store.hasSameEventElsewhereOnDay('08-16', 2, 'ev-9')).toBe(false);
    });
  });

  describe('loadMyEvents()', () => {
    it("ne garde que mes ajouts d'origine curateur", async () => {
      mockEvents.listEvents.mockReturnValue(
        of([
          { id: 'e1', origin: 'curateur', created_by: 'u-1' },
          { id: 'e2', origin: 'curateur', created_by: 'quelqu-un-d-autre' },
          { id: 'e3', origin: 'editorial', created_by: 'u-1' },
          { id: 'e4', origin: 'curateur', created_by: null },
        ]),
      );

      await store.loadMyEvents();

      expect(store.myEvents().map((e) => e.id)).toEqual(['e1', 'e4']);
    });
  });
});
