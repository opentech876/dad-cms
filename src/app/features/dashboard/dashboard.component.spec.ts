import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { CompanyService } from '../../core/companies/company.service';
import { MetriquesService } from '../../core/metriques/metriques.service';

const TODAY = new Date().toISOString().split('T')[0];
const [, todayMonthStr, todayDayStr] = TODAY.split('-');
const TODAY_MONTH = parseInt(todayMonthStr, 10) - 1; // 0-indexed
const TODAY_DAY = todayDayStr;

function buildClient(options: {
  eventCount?: number;
  calendarCount?: number;
  campaignCount?: number;
  yearEventCount?: number;
  pendingValidationCount?: number;
  publishedCalendarId?: string | null;
  todayEvents?: any[];
} = {}) {
  const {
    eventCount = 500,
    calendarCount = 2,
    campaignCount = 3,
    yearEventCount = 120,
    pendingValidationCount = 0,
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
  const todayEntries = todayEvents.map((e: any) => ({
    position: e.position,
    event: { title: e.title, description: e.description, event_date: e.event_date },
  }));

  return {
    from: (table: string) => {
      if (table === 'events') {
        return {
          select: (_cols: string, opts?: any) => {
            if (opts?.head) return makeChain(null, eventCount);
            return makeChain([], 0);
          },
        };
      }
      if (table === 'calendar_entries') {
        return {
          select: (_cols: string, _opts?: any) => makeChain(todayEntries, todayEntries.length),
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
        // Two different ad_campaigns queries: head-count for active OR pending validation,
        // and an `id IN (...)` lookup for top performers. Distinguish by checking opts.head.
        return {
          select: (_cols: string, opts?: any) => {
            if (opts?.head) {
              // Heuristic: the validation-pending query is the only one chaining .is('validated_at', null).
              // We expose both counts via the same makeChain — last is() call wins. Tests pass
              // pendingValidationCount via the option; we route head-count requests through a
              // shared chain whose .is('validated_at', null) flips the count.
              const c: any = { _count: campaignCount };
              const q: any = {
                then: (r: any, rj?: any) => Promise.resolve({ data: null, count: c._count, error: null }).then(r, rj),
                eq:    (_col: string) => q,
                is:    (col: string, _v: any) => {
                  if (col === 'validated_at') c._count = pendingValidationCount;
                  return q;
                },
              };
              return q;
            }
            // Non-head: id-in() lookup for top performers.
            return {
              in: (_col: string, _vals: any[]) =>
                Promise.resolve({ data: [], error: null }),
              eq: (_col: string, _v: any) => makeChain([], 0),
            };
          },
        };
      }
      return makeChain([], 0);
    },
  };
}

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let mockSupabase: { client: any };

  let mockCampaigns: { listCampaigns: jest.Mock };
  let mockCompanies: { listCompanies: jest.Mock };
  let mockMetriques: { getCampaignTaps: jest.Mock };

  beforeEach(() => {
    mockSupabase = { client: buildClient() };
    mockCampaigns = { listCampaigns: jest.fn().mockReturnValue(of([])) };
    mockCompanies = { listCompanies: jest.fn().mockReturnValue(of([])) };
    mockMetriques = { getCampaignTaps: jest.fn().mockReturnValue(of([])) };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: SupabaseService,   useValue: mockSupabase },
        { provide: CampaignService,   useValue: mockCampaigns },
        { provide: CompanyService,    useValue: mockCompanies },
        { provide: MetriquesService,  useValue: mockMetriques },
      ],
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
      component.stats.set({
        totalEvents: 0, publishedCalendars: 0, activeCampaigns: 0, yearEvents: 365,
        pendingValidations: 0, activeCompanies: 0,
      });

      expect(component.fillRate()).toBe(50);
    });
  });

  // ── Validation + Companies KPIs (Round 4) ────────────────────────────────

  describe('Round 4 KPIs', () => {
    it('charge pendingValidations depuis ad_campaigns.is("validated_at", null)', async () => {
      mockSupabase.client = buildClient({ pendingValidationCount: 7 });
      await component.ngOnInit();
      expect(component.stats().pendingValidations).toBe(7);
    });

    it('charge activeCompanies depuis CompanyService.listCompanies()', async () => {
      mockCompanies.listCompanies.mockReturnValue(of([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]));
      await component.ngOnInit();
      expect(mockCompanies.listCompanies).toHaveBeenCalled();
      expect(component.stats().activeCompanies).toBe(3);
    });
  });

  // ── Top ad performers (Round 4) ──────────────────────────────────────────

  describe('topAdPerformers', () => {
    it('garde au plus 5 lignes', async () => {
      const taps = Array.from({ length: 8 }, (_, i) => ({
        campaign_id: `c-${i}`, campaign_name: `Camp ${i}`, advertiser: 'A',
        tap_count: 100 - i, click_count: 5, ctr: 0.05,
      }));
      mockMetriques.getCampaignTaps.mockReturnValue(of(taps));
      await component.ngOnInit();
      expect(component.topAdPerformers().length).toBe(5);
    });

    it('mappe campaign_name → name et tap_count → impressions', async () => {
      mockMetriques.getCampaignTaps.mockReturnValue(of([
        { campaign_id: 'c1', campaign_name: 'Forfait', advertiser: 'MTN',
          tap_count: 1500, click_count: 30, ctr: 0.02 },
      ]));
      await component.ngOnInit();
      const row = component.topAdPerformers()[0];
      expect(row.name).toBe('Forfait');
      expect(row.advertiser).toBe('MTN');
      expect(row.impressions).toBe(1500);
      expect(row.clicks).toBe(30);
      expect(row.ctr).toBe(0.02);
    });

    it('retourne [] quand aucun tap', async () => {
      mockMetriques.getCampaignTaps.mockReturnValue(of([]));
      await component.ngOnInit();
      expect(component.topAdPerformers()).toEqual([]);
    });
  });
});
