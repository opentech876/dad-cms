import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SearchService } from './search.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

describe('SearchService', () => {
  let service: SearchService;
  let mockSupabase: any;
  let mockWorkspaceContext: { activeWorkspaceId: jest.Mock };
  let fromCalls: Array<{ table: string; ilike?: [string, string]; limit?: number }>;

  function makeQueryStub(table: string, data: any[]) {
    const call: any = { table };
    fromCalls.push(call);
    const q: any = {};
    q.select = jest.fn(() => q);
    q.eq    = jest.fn(() => q);
    q.is    = jest.fn(() => q);
    q.ilike = jest.fn((col: string, pat: string) => { call.ilike = [col, pat]; return q; });
    q.order = jest.fn(() => q);
    q.limit = jest.fn((n: number) => { call.limit = n; return Promise.resolve({ data, error: null }); });
    return q;
  }

  function setup(rows: { events?: any[]; ad_campaigns?: any[]; companies?: any[]; calendars?: any[] } = {}) {
    fromCalls = [];
    mockWorkspaceContext = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };
    mockSupabase = {
      client: {
        from: jest.fn().mockImplementation((table: string) => makeQueryStub(table, (rows as any)[table] ?? [])),
      },
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SearchService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: mockWorkspaceContext },
      ],
    });
    service = TestBed.inject(SearchService);
  }

  beforeEach(() => {
    setup();
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  it('retourne des groupes vides quand le terme est vide', async () => {
    const result = await firstValueFrom(service.search(''));
    expect(result.events).toEqual([]);
    expect(result.campaigns).toEqual([]);
    expect(result.companies).toEqual([]);
    expect(result.calendars).toEqual([]);
    expect(mockSupabase.client.from).not.toHaveBeenCalled();
  });

  it('retourne des groupes vides quand le terme contient uniquement des espaces', async () => {
    const result = await firstValueFrom(service.search('   '));
    expect(result.events.length).toBe(0);
    expect(mockSupabase.client.from).not.toHaveBeenCalled();
  });

  it('retourne des groupes vides quand aucun workspace n\'est actif', async () => {
    mockWorkspaceContext.activeWorkspaceId.mockReturnValue(null);
    const result = await firstValueFrom(service.search('indep'));
    expect(result.events).toEqual([]);
    expect(mockSupabase.client.from).not.toHaveBeenCalled();
  });

  it('interroge les 4 tables events / ad_campaigns / companies / calendars', async () => {
    await firstValueFrom(service.search('indep'));
    const tables = fromCalls.map(c => c.table).sort();
    expect(tables).toEqual(['ad_campaigns', 'calendars', 'companies', 'events']);
  });

  it('applique un filtre ilike sur title pour events, name pour campaigns/companies/calendars', async () => {
    await firstValueFrom(service.search('indep'));
    const byTable = Object.fromEntries(fromCalls.map(c => [c.table, c.ilike]));
    expect(byTable['events']).toEqual(['title', '%indep%']);
    expect(byTable['ad_campaigns']).toEqual(['name', '%indep%']);
    expect(byTable['companies']).toEqual(['name', '%indep%']);
    expect(byTable['calendars']).toEqual(['name', '%indep%']);
  });

  it('mappe les events en résultats avec type, id, label et subtitle', async () => {
    setup({
      events: [
        { id: 'e1', title: 'Indépendance du Congo', event_date: '1960-08-15' },
        { id: 'e2', title: 'Indépendance américaine', event_date: '1776-07-04' },
      ],
    });
    const result = await firstValueFrom(service.search('indep'));
    expect(result.events.length).toBe(2);
    expect(result.events[0]).toMatchObject({ type: 'event', id: 'e1', label: 'Indépendance du Congo' });
    expect(result.events[0].subtitle).toBeTruthy();
  });

  it('mappe les campaigns avec leur date range en subtitle', async () => {
    setup({
      ad_campaigns: [
        { id: 'c1', name: 'MTN Indépendance 2026', start_date: '2026-08-01', end_date: '2026-08-31' },
      ],
    });
    const result = await firstValueFrom(service.search('indep'));
    expect(result.campaigns.length).toBe(1);
    expect(result.campaigns[0]).toMatchObject({ type: 'campaign', id: 'c1', label: 'MTN Indépendance 2026' });
  });

  it('mappe les companies', async () => {
    setup({
      companies: [{ id: 'co1', name: 'Indépendance Médias SARL', type: 'medias' }],
    });
    const result = await firstValueFrom(service.search('indep'));
    expect(result.companies.length).toBe(1);
    expect(result.companies[0]).toMatchObject({ type: 'company', id: 'co1', label: 'Indépendance Médias SARL' });
  });

  it('mappe les calendars avec leur année en subtitle', async () => {
    setup({
      calendars: [{ id: 'ca1', name: 'Indépendance 2026', year: 2026 }],
    });
    const result = await firstValueFrom(service.search('indep'));
    expect(result.calendars.length).toBe(1);
    expect(result.calendars[0]).toMatchObject({ type: 'calendar', id: 'ca1', label: 'Indépendance 2026' });
    expect(result.calendars[0].subtitle).toContain('2026');
  });

  it('utilise le limit par défaut de 5 par type', async () => {
    await firstValueFrom(service.search('indep'));
    expect(fromCalls.every(c => c.limit === 5)).toBe(true);
  });

  it('respecte un limit personnalisé', async () => {
    await firstValueFrom(service.search('indep', 25));
    expect(fromCalls.every(c => c.limit === 25)).toBe(true);
  });

  it('subtitle undefined quand les champs optionnels manquent', async () => {
    setup({
      events:       [{ id: 'e1', title: 'X' }],
      ad_campaigns: [{ id: 'c1', name: 'Y' }],
      companies:    [{ id: 'co1', name: 'Z' }],
      calendars:    [{ id: 'ca1', name: 'W' }],
    });
    const r = await firstValueFrom(service.search('x'));
    expect(r.events[0].subtitle).toBeUndefined();
    expect(r.campaigns[0].subtitle).toBeUndefined();
    expect(r.companies[0].subtitle).toBeUndefined();
    expect(r.calendars[0].subtitle).toBeUndefined();
  });
});
