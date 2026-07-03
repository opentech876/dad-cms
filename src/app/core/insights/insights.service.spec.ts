import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { InsightsService } from './insights.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

describe('InsightsService', () => {
  let service: InsightsService;
  let rpcSpy: jest.Mock;
  let mockContext: { activeWorkspaceId: jest.Mock };

  const FAKE_DASH = {
    activity: [],
    empty_days: { count: 3, next: ['07-04'] },
    events_no_image: 12,
    validations_soon: [],
    pending_recommendations: 2,
    inventory: [],
  };

  const FAKE_METRICS = {
    fill_rate: [{ month: 1, days: 31, header_days: 0, footer_days: 5 }],
    apply_latency: { applied_count: 4, avg_hours: 12.5, median_hours: 8.0 },
  };

  beforeEach(() => {
    rpcSpy = jest.fn().mockResolvedValue({ data: FAKE_DASH, error: null });
    mockContext = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };

    TestBed.configureTestingModule({
      providers: [
        InsightsService,
        { provide: SupabaseService, useValue: { client: { rpc: rpcSpy } } },
        { provide: WorkspaceContextService, useValue: mockContext },
      ],
    });
    service = TestBed.inject(InsightsService);
  });

  describe('getDashboardStats()', () => {
    it('délègue à la RPC dashboard_operational_stats avec le workspace actif', async () => {
      await firstValueFrom(service.getDashboardStats());
      expect(rpcSpy).toHaveBeenCalledWith('dashboard_operational_stats', { p_workspace_id: 'ws-1' });
    });

    it('renvoie le blob jsonb tel quel', async () => {
      const result = await firstValueFrom(service.getDashboardStats());
      expect(result).toEqual(FAKE_DASH);
    });

    it('renvoie null sans appel RPC quand aucun workspace actif', async () => {
      mockContext.activeWorkspaceId.mockReturnValue(null);
      const result = await firstValueFrom(service.getDashboardStats());
      expect(result).toBeNull();
      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it('renvoie null en cas d\'erreur RPC', async () => {
      rpcSpy.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
      const result = await firstValueFrom(service.getDashboardStats());
      expect(result).toBeNull();
    });
  });

  describe('getMetricsExtras()', () => {
    it('délègue à la RPC metrics_extra_stats avec workspace + année', async () => {
      rpcSpy.mockResolvedValueOnce({ data: FAKE_METRICS, error: null });
      const result = await firstValueFrom(service.getMetricsExtras(2026));
      expect(rpcSpy).toHaveBeenCalledWith('metrics_extra_stats', { p_workspace_id: 'ws-1', p_year: 2026 });
      expect(result).toEqual(FAKE_METRICS);
    });

    it('renvoie null en cas d\'erreur RPC', async () => {
      rpcSpy.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
      const result = await firstValueFrom(service.getMetricsExtras(2026));
      expect(result).toBeNull();
    });
  });
});
