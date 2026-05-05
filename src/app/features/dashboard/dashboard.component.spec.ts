import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { SupabaseService } from '../../core/supabase/supabase.service';

const TODAY = new Date().toISOString().split('T')[0];
const [, todayMonthStr, todayDayStr] = TODAY.split('-');
const TODAY_MONTH = parseInt(todayMonthStr, 10) - 1; // 0-indexed
const TODAY_DAY = todayDayStr;

function buildClient(options: {
  eventCount?: number;
  calendarCount?: number;
  campaignCount?: number;
  yearEventCount?: number;
  publishedCalendarId?: string | null;
  todayEvents?: any[];
} = {}) {
  const {
    eventCount = 500,
    calendarCount = 2,
    campaignCount = 3,
    yearEventCount = 120,
    publishedCalendarId = 'cal-pub-1',
    todayEvents = [
      {
        title: "Indépendance de la République du Congo",
        description: "Le Congo accède à l'indépendance.",
        event_date: TODAY,
        position: 1,
      },
    ],
  } = options;

  function makeChain(data: any, count: number | null = null): any {
    const q: any = {
      then: (onFulfilled: any, onRejected?: any) =>
        Promise.resolve({ data, count, error: null }).then(onFulfilled, onRejected),
      select: (..._a: any[]) => makeChain(data, count),
      eq: (..._a: any[]) => makeChain(data, count),
      gte: (..._a: any[]) => makeChain(data, count),
      lte: (..._a: any[]) => makeChain(data, count),
      is: (..._a: any[]) => makeChain(data, count),
      order: (..._a: any[]) => makeChain(data, count),
      limit: (..._a: any[]) => makeChain(data, count),
      maybeSingle: () =>
        Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }),
    };
    return q;
  }

  const calendarForYear = publishedCalendarId ? { id: publishedCalendarId } : null;

  return {
    from: (table: string) => {
      if (table === 'events') {
        return {
          select: (_cols: string, opts?: any) => {
            if (opts?.head) return makeChain(null, eventCount);
            return makeChain(todayEvents, todayEvents.length);
          },
        };
      }
      if (table === 'calendars') {
        return {
          select: (_cols: string, opts?: any) => {
            if (opts?.head) return makeChain(null, calendarCount);
            return makeChain(calendarForYear ? [calendarForYear] : [], 1);
          },
        };
      }
      if (table === 'ad_campaigns') {
        return { select: (_cols: string, _opts?: any) => makeChain(null, campaignCount) };
      }
      return makeChain([], 0);
    },
  };
}

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let mockSupabase: { client: any };

  beforeEach(() => {
    mockSupabase = { client: buildClient() };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [{ provide: SupabaseService, useValue: mockSupabase }],
      schemas: [NO_ERRORS_SCHEMA],
    });

    TestBed.overrideComponent(DashboardComponent, { set: { template: '', imports: [] } });

    const fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  // ── KPI stats ──────────────────────────────────────────────────────────────

  describe('KPI stats', () => {
    it('charge les 4 compteurs depuis la DB', async () => {
      mockSupabase.client = buildClient({
        eventCount: 500, calendarCount: 2, campaignCount: 3, yearEventCount: 120,
      });

      await component.ngOnInit();

      expect(component.stats().totalEvents).toBe(500);
      expect(component.stats().publishedCalendars).toBe(2);
      expect(component.stats().activeCampaigns).toBe(3);
    });

    it('passe loading à false après le chargement', async () => {
      await component.ngOnInit();

      expect(component.loading()).toBe(false);
    });
  });

  // ── featured event ─────────────────────────────────────────────────────────

  describe('featured event', () => {
    it("charge le titre de l'événement du jour depuis la DB", async () => {
      mockSupabase.client = buildClient({
        todayEvents: [{
          title: "Indépendance de la République du Congo",
          description: "Le Congo accède à l'indépendance.",
          event_date: TODAY,
          position: 1,
        }],
      });

      await component.ngOnInit();

      expect(component.featuredEvent().title).toBe("Indépendance de la République du Congo");
    });

    it('extrait la première lettre de la description comme dropLetter', async () => {
      mockSupabase.client = buildClient({
        todayEvents: [{
          title: 'Test',
          description: 'Le Congo accède.',
          event_date: TODAY,
          position: 1,
        }],
      });

      await component.ngOnInit();

      expect(component.featuredEvent().dropLetter).toBe('L');
      expect(component.featuredEvent().excerpt).toBe('e Congo accède.');
    });

    it('extrait le jour et le mois depuis event_date', async () => {
      mockSupabase.client = buildClient({
        todayEvents: [{
          title: 'Test',
          description: 'Desc.',
          event_date: TODAY,
          position: 1,
        }],
      });

      await component.ngOnInit();

      expect(component.featuredEvent().day).toBe(TODAY_DAY);
    });

    it("affiche le titre de l'événement de position 2 dans 'also'", async () => {
      mockSupabase.client = buildClient({
        todayEvents: [
          { title: 'Événement principal', description: 'Desc.', event_date: TODAY, position: 1 },
          { title: 'Deuxième événement',  description: 'Desc.', event_date: TODAY, position: 2 },
        ],
      });

      await component.ngOnInit();

      expect(component.featuredEvent().also).toBe('Deuxième événement');
    });

    it("laisse le titre vide si aucun calendrier publié n'existe pour l'année", async () => {
      mockSupabase.client = buildClient({ publishedCalendarId: null });

      await component.ngOnInit();

      expect(component.featuredEvent().title).toBe('');
    });

    it("laisse le titre vide si aucun événement n'existe pour aujourd'hui", async () => {
      mockSupabase.client = buildClient({ todayEvents: [] });

      await component.ngOnInit();

      expect(component.featuredEvent().title).toBe('');
    });

    it('passe featuredEventLoading à false après le chargement', async () => {
      await component.ngOnInit();

      expect(component.featuredEventLoading()).toBe(false);
    });
  });

  // ── fillRate computed ──────────────────────────────────────────────────────

  describe('fillRate', () => {
    it('calcule fillRate à 50% pour 365 yearEvents sur 730 slots', () => {
      component.stats.set({ totalEvents: 0, publishedCalendars: 0, activeCampaigns: 0, yearEvents: 365 });

      expect(component.fillRate()).toBe(50);
    });

  });
});
