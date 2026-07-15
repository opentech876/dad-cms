import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DashboardService } from './dashboard.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

const TODAY = new Date();
const CURRENT_YEAR = TODAY.getFullYear();

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO date i days from today (local clock, same convention as the service). */
function isoIn(days: number): string {
  return toISO(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + days));
}

/** How many of the next 30 days (today included) fall inside the current year. */
function daysOfWindowInCurrentYear(): number {
  let n = 0;
  for (let i = 0; i < 30; i++) {
    if (
      new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + i).getFullYear() ===
      CURRENT_YEAR
    )
      n++;
  }
  return n;
}

/** Then-able recording query chain. Every filter method returns the chain and
 *  logs its call so tests can assert workspace scoping. */
function chain(data: any, calls?: Array<[string, any[]]>): any {
  const q: any = {
    then: (res: any, rej?: any) => Promise.resolve({ data, error: null }).then(res, rej),
    maybeSingle: () =>
      Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
  };
  for (const m of ['select', 'eq', 'is', 'not', 'gte', 'lte', 'order']) {
    q[m] = (...args: any[]) => {
      calls?.push([m, args]);
      return q;
    };
  }
  return q;
}

interface ClientOptions {
  calendar?: { id: string } | null;
  entries?: any[];
  campaigns?: any[];
}

function buildClient(opts: ClientOptions = {}, calls: Array<[string, any[]]> = []) {
  const { calendar = { id: 'cal-1' }, entries = [], campaigns = [] } = opts;
  return {
    from: (table: string) => {
      if (table === 'calendars') return chain(calendar ? [calendar] : [], calls);
      if (table === 'calendar_entries') return chain(entries, calls);
      if (table === 'ad_campaigns') return chain(campaigns, calls);
      return chain([], calls);
    },
  };
}

describe('DashboardService', () => {
  let service: DashboardService;
  let mockSupabase: { client: any };
  let mockWorkspace: { activeWorkspaceId: jest.Mock };

  beforeEach(() => {
    mockSupabase = { client: buildClient() };
    mockWorkspace = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };

    TestBed.configureTestingModule({
      providers: [
        DashboardService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: mockWorkspace },
      ],
    });
    service = TestBed.inject(DashboardService);
  });

  // ── getYearContentStats ──────────────────────────────────────────────────

  describe('getYearContentStats', () => {
    it('compte les événements distincts assignés dans le calendrier publié', async () => {
      mockSupabase.client = buildClient({
        entries: [
          { mmdd: '01-01', event_id: 'e1', event: { deleted_at: null } },
          { mmdd: '01-01', event_id: 'e2', event: { deleted_at: null } },
          { mmdd: '01-02', event_id: 'e1', event: { deleted_at: null } },
        ],
      });

      const stats = await firstValueFrom(service.getYearContentStats(CURRENT_YEAR));

      expect(stats.mobileEvents).toBe(2);
    });

    it('compte les jours distincts ayant au moins un événement', async () => {
      mockSupabase.client = buildClient({
        entries: [
          { mmdd: '01-01', event_id: 'e1', event: { deleted_at: null } },
          { mmdd: '01-01', event_id: 'e2', event: { deleted_at: null } },
          { mmdd: '01-02', event_id: 'e1', event: { deleted_at: null } },
        ],
      });

      const stats = await firstValueFrom(service.getYearContentStats(CURRENT_YEAR));

      expect(stats.filledDays).toBe(2);
    });

    it('ignore les événements doux-supprimés', async () => {
      mockSupabase.client = buildClient({
        entries: [{ mmdd: '01-01', event_id: 'e1', event: { deleted_at: '2026-06-20T10:00:00Z' } }],
      });

      const stats = await firstValueFrom(service.getYearContentStats(CURRENT_YEAR));

      expect(stats.mobileEvents).toBe(0);
      expect(stats.filledDays).toBe(0);
    });

    it("renvoie zéro partout quand aucun calendrier publié n'existe", async () => {
      mockSupabase.client = buildClient({ calendar: null });

      const stats = await firstValueFrom(service.getYearContentStats(CURRENT_YEAR));

      expect(stats.mobileEvents).toBe(0);
      expect(stats.filledDays).toBe(0);
    });

    it('sans calendrier, tous les 30 prochains jours (année courante) sont vides', async () => {
      mockSupabase.client = buildClient({ calendar: null });

      const stats = await firstValueFrom(service.getYearContentStats(CURRENT_YEAR));

      expect(stats.emptyNext30.length).toBe(daysOfWindowInCurrentYear());
    });

    it("exclut de emptyNext30 les jours ayant un événement (aujourd'hui couvert)", async () => {
      const todayMmdd = isoIn(0).slice(5);
      mockSupabase.client = buildClient({
        entries: [{ mmdd: todayMmdd, event_id: 'e1', event: { deleted_at: null } }],
      });

      const stats = await firstValueFrom(service.getYearContentStats(CURRENT_YEAR));

      expect(stats.emptyNext30.some((g) => g.daysUntil === 0)).toBe(false);
      expect(stats.emptyNext30.length).toBe(daysOfWindowInCurrentYear() - 1);
    });

    it('filtre le calendrier par workspace actif', async () => {
      const calls: Array<[string, any[]]> = [];
      mockSupabase.client = buildClient({}, calls);

      await firstValueFrom(service.getYearContentStats(CURRENT_YEAR));

      expect(calls).toContainEqual(['eq', ['workspace_id', 'ws-1']]);
    });
  });

  // ── getAdOutlook ─────────────────────────────────────────────────────────

  describe('getAdOutlook', () => {
    it("détecte la campagne en diffusion aujourd'hui", async () => {
      mockSupabase.client = buildClient({
        campaigns: [
          {
            name: 'Offre étudiant',
            start_date: isoIn(-2),
            end_date: isoIn(4),
            company: { name: 'MTN Congo' },
          },
        ],
      });

      const outlook = await firstValueFrom(service.getAdOutlook(CURRENT_YEAR));

      expect(outlook.currentAd).toEqual({
        campaignName: 'Offre étudiant',
        companyName: 'MTN Congo',
        endDate: isoIn(4),
      });
    });

    it("renvoie currentAd null quand aucune campagne ne couvre aujourd'hui", async () => {
      mockSupabase.client = buildClient({
        campaigns: [
          {
            name: 'Future',
            start_date: isoIn(5),
            end_date: isoIn(12),
            company: { name: 'Airtel' },
          },
        ],
      });

      const outlook = await firstValueFrom(service.getAdOutlook(CURRENT_YEAR));

      expect(outlook.currentAd).toBeNull();
    });

    it('compte les jours vendus par mois sans doubler les chevauchements', async () => {
      mockSupabase.client = buildClient({
        campaigns: [
          {
            name: 'A',
            start_date: `${CURRENT_YEAR}-01-01`,
            end_date: `${CURRENT_YEAR}-01-10`,
            company: null,
          },
          {
            name: 'B',
            start_date: `${CURRENT_YEAR}-01-05`,
            end_date: `${CURRENT_YEAR}-01-14`,
            company: null,
          },
        ],
      });

      const outlook = await firstValueFrom(service.getAdOutlook(CURRENT_YEAR));

      expect(outlook.salesByMonth[0]).toEqual({ month: 1, soldDays: 14, totalDays: 31 });
      expect(outlook.soldDaysYear).toBe(14);
    });

    it("clippe à l'année les campagnes qui débordent sur l'année suivante", async () => {
      mockSupabase.client = buildClient({
        campaigns: [
          {
            name: "Fin d'année",
            start_date: `${CURRENT_YEAR}-12-25`,
            end_date: `${CURRENT_YEAR + 1}-01-05`,
            company: null,
          },
        ],
      });

      const outlook = await firstValueFrom(service.getAdOutlook(CURRENT_YEAR));

      expect(outlook.salesByMonth[11].soldDays).toBe(7);
      expect(outlook.soldDaysYear).toBe(7);
    });

    it('renvoie 12 mois avec le bon nombre de jours', async () => {
      mockSupabase.client = buildClient({ campaigns: [] });

      const outlook = await firstValueFrom(service.getAdOutlook(CURRENT_YEAR));

      expect(outlook.salesByMonth.length).toBe(12);
      expect(outlook.salesByMonth[0].totalDays).toBe(31);
    });

    it('marque vendus les jours des 30 prochains couverts par une campagne', async () => {
      mockSupabase.client = buildClient({
        campaigns: [
          {
            name: 'Courte',
            start_date: isoIn(0),
            end_date: isoIn(1),
            company: null,
          },
        ],
      });

      const outlook = await firstValueFrom(service.getAdOutlook(CURRENT_YEAR));

      expect(outlook.next30.length).toBe(30);
      expect(outlook.next30[0].sold).toBe(true);
      expect(outlook.next30[1].sold).toBe(true);
      expect(outlook.next30[2].sold).toBe(false);
    });

    it('filtre les campagnes par workspace actif', async () => {
      const calls: Array<[string, any[]]> = [];
      mockSupabase.client = buildClient({}, calls);

      await firstValueFrom(service.getAdOutlook(CURRENT_YEAR));

      expect(calls).toContainEqual(['eq', ['workspace_id', 'ws-1']]);
    });
  });

  // ── getFeaturedEvent (ported from the component spec) ───────────────────

  describe('getFeaturedEvent', () => {
    function clientWithToday(
      todayEvents: any[],
      calendar: { id: string } | null = { id: 'cal-1' },
    ) {
      const entries = todayEvents.map((e) => ({
        position: e.position,
        event: {
          title: e.title,
          description: e.description,
          event_date: e.event_date,
          deleted_at: e.deleted_at ?? null,
        },
      }));
      return buildClient({ calendar, entries });
    }

    it("charge le titre de l'événement du jour", async () => {
      mockSupabase.client = clientWithToday([
        {
          title: 'Indépendance de la République du Congo',
          description: "Le Congo accède à l'indépendance.",
          event_date: isoIn(0),
          position: 1,
        },
      ]);

      const featured = await firstValueFrom(service.getFeaturedEvent(CURRENT_YEAR));

      expect(featured!.title).toBe('Indépendance de la République du Congo');
    });

    it('extrait la première lettre de la description comme dropLetter', async () => {
      mockSupabase.client = clientWithToday([
        {
          title: 'Test',
          description: 'Le Congo accède.',
          event_date: isoIn(0),
          position: 1,
        },
      ]);

      const featured = await firstValueFrom(service.getFeaturedEvent(CURRENT_YEAR));

      expect(featured!.dropLetter).toBe('L');
      expect(featured!.excerpt).toBe('e Congo accède.');
    });

    it("affiche le jour d'aujourd'hui, pas la date historique de l'événement", async () => {
      mockSupabase.client = clientWithToday([
        {
          title: 'Indépendance',
          description: 'Desc.',
          event_date: '1960-08-15',
          position: 1,
        },
      ]);

      const featured = await firstValueFrom(service.getFeaturedEvent(CURRENT_YEAR));

      const todayNow = String(new Date().getDate()).padStart(2, '0');
      expect(featured!.day).toBe(todayNow);
    });

    it('ignore les événements doux-supprimés', async () => {
      mockSupabase.client = clientWithToday([
        {
          title: 'Supprimé',
          description: 'Ne doit pas apparaître.',
          event_date: isoIn(0),
          position: 1,
          deleted_at: '2026-06-20T10:00:00Z',
        },
      ]);

      const featured = await firstValueFrom(service.getFeaturedEvent(CURRENT_YEAR));

      expect(featured).toBeNull();
    });

    it("expose le titre de l'événement de position 2 dans 'also'", async () => {
      mockSupabase.client = clientWithToday([
        { title: 'Principal', description: 'Desc.', event_date: isoIn(0), position: 1 },
        { title: 'Secondaire', description: 'Desc.', event_date: isoIn(0), position: 2 },
      ]);

      const featured = await firstValueFrom(service.getFeaturedEvent(CURRENT_YEAR));

      expect(featured!.also).toBe('Secondaire');
    });

    it("renvoie null quand aucun calendrier publié n'existe", async () => {
      mockSupabase.client = clientWithToday([], null);

      const featured = await firstValueFrom(service.getFeaturedEvent(CURRENT_YEAR));

      expect(featured).toBeNull();
    });

    it("renvoie null quand aucun événement n'est assigné aujourd'hui", async () => {
      mockSupabase.client = clientWithToday([]);

      const featured = await firstValueFrom(service.getFeaturedEvent(CURRENT_YEAR));

      expect(featured).toBeNull();
    });
  });
});
