import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MetriquesService } from './metriques.service';
import { SupabaseService } from '../supabase/supabase.service';

const MOCK_DEVICES = [
  { id: 'd1', platform: 'android', registered_at: '2026-05-07T10:00:00Z', last_seen_at: '2026-05-09T12:00:00Z' },
  { id: 'd2', platform: 'android', registered_at: '2026-05-08T09:00:00Z', last_seen_at: '2026-05-10T08:00:00Z' },
];

const MOCK_LOGS = [
  { action: 'device_register_permission', outcome: 'success', created_at: '2026-05-07T10:00:00Z' },
  { action: 'device_register_expo_token', outcome: 'success', created_at: '2026-05-07T10:01:00Z' },
];

const MOCK_TAPS = [
  { campaign_id: 'c1', ad_campaigns: { name: 'Forfait ya sika', company: { name: 'AIRTEL' } } },
  { campaign_id: 'c1', ad_campaigns: { name: 'Forfait ya sika', company: { name: 'AIRTEL' } } },
];

const MOCK_CLICKS = [
  { campaign_id: 'c1' },
];

const MOCK_ACTIVITY = [
  { date: '2026-05-04', count: 4405 },
  { date: '2026-05-05', count: 1827 },
];

const MOCK_COVERAGE = [
  { month: 1, filled_days: 31, total_days: 31, percent: 100 },
  { month: 8, filled_days: 0,  total_days: 31, percent: 0   },
];

function buildSelectChain(resolveValue: any) {
  const base: any = { then: undefined };
  const methods = ['select', 'eq', 'gte', 'lte', 'order', 'limit'];
  methods.forEach(m => { base[m] = jest.fn().mockReturnValue(base); });
  // Make it thenable (resolved with the given value)
  base.then = (resolve: any, reject: any) =>
    Promise.resolve(resolveValue).then(resolve, reject);
  return base;
}

function makeClientMock() {
  const rpcMock = jest.fn((name: string) => {
    if (name === 'get_cms_activity_last30days') return Promise.resolve({ data: MOCK_ACTIVITY, error: null });
    if (name === 'get_calendar_coverage_by_month') return Promise.resolve({ data: MOCK_COVERAGE, error: null });
    return Promise.resolve({ data: null, error: null });
  });

  const fromMock = jest.fn((table: string) => {
    if (table === 'devices')   return buildSelectChain({ data: MOCK_DEVICES, error: null });
    if (table === 'devices_logs') return buildSelectChain({ data: MOCK_LOGS, error: null });
    if (table === 'ad_campaign_device_views') return buildSelectChain({ data: MOCK_TAPS, error: null });
    if (table === 'ad_campaign_device_clicks') return buildSelectChain({ data: MOCK_CLICKS, error: null });
    return buildSelectChain({ data: [], error: null });
  });

  return { from: fromMock, rpc: rpcMock };
}

describe('MetriquesService', () => {
  let service: MetriquesService;
  let clientMock: ReturnType<typeof makeClientMock>;

  beforeEach(() => {
    clientMock = makeClientMock();
    TestBed.configureTestingModule({
      providers: [
        MetriquesService,
        { provide: SupabaseService, useValue: { client: clientMock } },
      ],
    });
    service = TestBed.inject(MetriquesService);
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  describe('getDeviceStats()', () => {
    it('devrait retourner total et breakdown par plateforme', async () => {
      const result = await firstValueFrom(service.getDeviceStats());
      expect(result.total).toBe(2);
      expect(result.android).toBe(2);
      expect(result.ios).toBe(0);
    });
  });

  describe('getDeviceLogs()', () => {
    it('devrait retourner les logs des appareils', async () => {
      const result = await firstValueFrom(service.getDeviceLogs());
      expect(result).toHaveLength(2);
    });
  });

  describe('getCampaignTaps()', () => {
    it('devrait agréger les impressions par campagne', async () => {
      const result = await firstValueFrom(service.getCampaignTaps());
      expect(result[0].tap_count).toBe(2);
      expect(result[0].campaign_name).toBe('Forfait ya sika');
      expect(result[0].advertiser).toBe('AIRTEL');
    });

    it('agrège les clicks et calcule le CTR', async () => {
      const result = await firstValueFrom(service.getCampaignTaps());
      expect(result[0].click_count).toBe(1);
      expect(result[0].ctr).toBeCloseTo(0.5);
    });

    it('retourne ctr=null quand tap_count=0', async () => {
      // Simulate clicks against a campaign with no recorded views.
      clientMock.from = jest.fn((table: string) => {
        if (table === 'ad_campaign_device_views')  return buildSelectChain({ data: [], error: null });
        if (table === 'ad_campaign_device_clicks') return buildSelectChain({ data: [{ campaign_id: 'orphan' }], error: null });
        return buildSelectChain({ data: [], error: null });
      });
      const result = await firstValueFrom(service.getCampaignTaps());
      expect(result[0].tap_count).toBe(0);
      expect(result[0].click_count).toBe(1);
      expect(result[0].ctr).toBeNull();
    });

    it('survit à une erreur sur la lecture des clicks (renvoie 0)', async () => {
      clientMock.from = jest.fn((table: string) => {
        if (table === 'ad_campaign_device_views')  return buildSelectChain({ data: MOCK_TAPS, error: null });
        if (table === 'ad_campaign_device_clicks') return buildSelectChain({ data: null, error: { message: 'boom' } });
        return buildSelectChain({ data: [], error: null });
      });
      const result = await firstValueFrom(service.getCampaignTaps());
      expect(result[0].tap_count).toBe(2);
      expect(result[0].click_count).toBe(0);
      expect(result[0].ctr).toBe(0);
    });
  });

  describe('getCmsActivity()', () => {
    it('devrait appeler le RPC get_cms_activity_last30days', async () => {
      await firstValueFrom(service.getCmsActivity());
      expect(clientMock.rpc).toHaveBeenCalledWith('get_cms_activity_last30days');
    });

    it('devrait retourner les données activité', async () => {
      const result = await firstValueFrom(service.getCmsActivity());
      expect(result).toHaveLength(2);
      expect(result[0].count).toBe(4405);
    });
  });

  describe('getCalendarCoverage()', () => {
    it('devrait appeler le RPC get_calendar_coverage_by_month', async () => {
      await firstValueFrom(service.getCalendarCoverage());
      expect(clientMock.rpc).toHaveBeenCalledWith('get_calendar_coverage_by_month', expect.any(Object));
    });

    it('devrait retourner la couverture par mois', async () => {
      const result = await firstValueFrom(service.getCalendarCoverage());
      expect(result[0].percent).toBe(100);
      expect(result[1].percent).toBe(0);
    });
  });
});
