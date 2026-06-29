import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  RecommendationService,
  PresidencyRecommendationWithEvent,
} from './recommendation.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';
import { CalendarEntryWithEvent } from '../calendar/calendar-entry.service';

function makeRec(over: Partial<PresidencyRecommendationWithEvent> = {}): PresidencyRecommendationWithEvent {
  return {
    id: 'r1',
    calendar_id: 'cal-1',
    mmdd: '08-15',
    position: 1,
    event_id: 'ev-1',
    workspace_id: 'ws-1',
    status: 'pending',
    created_by: 'u1',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    applied_at: null,
    applied_by: null,
    event: {
      id: 'ev-1', event_date: '1960-08-15', title: 'Indépendance', description: null,
      image_path: null, status: 'published', workspace_id: 'ws-1',
      created_by: 'u1', created_at: '', updated_at: '',
      updated_by: null, deleted_at: null, deleted_by: null,
    },
    ...over,
  };
}

function makeEntry(over: Partial<CalendarEntryWithEvent> = {}): CalendarEntryWithEvent {
  return {
    id: 'e1', calendar_id: 'cal-1', mmdd: '08-15', position: 1,
    event_id: 'ev-1', workspace_id: 'ws-1', created_by: 'u1', created_at: '',
    updated_at: '',
    event: {
      id: 'ev-1', event_date: '1960-08-15', title: 'Indépendance', description: null,
      image_path: null, status: 'published', workspace_id: 'ws-1',
      created_by: 'u1', created_at: '', updated_at: '',
      updated_by: null, deleted_at: null, deleted_by: null,
    },
    ...over,
  };
}

describe('RecommendationService', () => {
  let service: RecommendationService;
  let mockSupabase: { client: any };
  let workspaceCtx: { activeWorkspaceId: jest.Mock };
  let eqCalls: Array<[string, unknown]>;
  let upsertSpy: jest.Mock;
  let deleteSpy: jest.Mock;
  let rpcSpy: jest.Mock;

  function buildClient(opts: { data?: any; error?: any; count?: number; rpcData?: any; rpcError?: any } = {}) {
    eqCalls = [];
    const err = opts.error ?? null;

    function makeQuery(data: any): any {
      return {
        then: (fn: any) => Promise.resolve({ data, error: err, count: opts.count ?? null }).then(fn),
        select: () => makeQuery(data),
        eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return makeQuery(data); },
        order: () => makeQuery(data),
      };
    }

    upsertSpy = jest.fn().mockReturnValue({
      then: (fn: any) => Promise.resolve({ error: err }).then(fn),
    });
    deleteSpy = jest.fn().mockReturnValue({
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return {
          eq: (col2: string, val2: unknown) => {
            eqCalls.push([col2, val2]);
            return {
              eq: (col3: string, val3: unknown) => {
                eqCalls.push([col3, val3]);
                return Promise.resolve({ error: err });
              },
            };
          },
        };
      },
    });
    rpcSpy = jest.fn().mockResolvedValue({ data: opts.rpcData, error: opts.rpcError ?? null });

    return {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
      from: (_table: string) => ({
        select: () => makeQuery(opts.data ?? []),
        upsert: upsertSpy,
        delete: deleteSpy,
      }),
      rpc: rpcSpy,
    };
  }

  beforeEach(() => {
    mockSupabase = { client: buildClient() };
    workspaceCtx = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };
    TestBed.configureTestingModule({
      providers: [
        RecommendationService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: workspaceCtx },
      ],
    });
    service = TestBed.inject(RecommendationService);
  });

  describe('listByCalendar()', () => {
    it('retourne les recommandations du calendrier donné', async () => {
      mockSupabase.client = buildClient({ data: [makeRec()] });
      const result = await firstValueFrom(service.listByCalendar('cal-1'));
      expect(result.length).toBe(1);
      expect(eqCalls).toContainEqual(['calendar_id', 'cal-1']);
    });

    it('retourne [] en cas d\'erreur', async () => {
      mockSupabase.client = buildClient({ data: null, error: { message: 'fail' } });
      const result = await firstValueFrom(service.listByCalendar('cal-1'));
      expect(result).toEqual([]);
    });
  });

  describe('countPending()', () => {
    it('retourne le nombre de pending', async () => {
      mockSupabase.client = buildClient({ count: 5 });
      const result = await firstValueFrom(service.countPending('cal-1'));
      expect(result).toBe(5);
      expect(eqCalls).toContainEqual(['calendar_id', 'cal-1']);
      expect(eqCalls).toContainEqual(['status', 'pending']);
    });

    it('retourne 0 en cas d\'erreur', async () => {
      mockSupabase.client = buildClient({ error: { message: 'x' }, count: null });
      const result = await firstValueFrom(service.countPending('cal-1'));
      expect(result).toBe(0);
    });
  });

  describe('upsertSlot()', () => {
    it('appelle upsert avec created_by, workspace_id et status pending', async () => {
      const res = await firstValueFrom(service.upsertSlot('cal-1', '08-15', 1, 'ev-1'));
      expect(res.success).toBe(true);
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          calendar_id: 'cal-1', mmdd: '08-15', position: 1, event_id: 'ev-1',
          workspace_id: 'ws-1', status: 'pending', created_by: 'u-1',
        }),
        { onConflict: 'calendar_id,mmdd,position' },
      );
    });

    it('retourne success false en cas d\'erreur', async () => {
      mockSupabase.client = buildClient({ error: { message: 'unique violation' } });
      const res = await firstValueFrom(service.upsertSlot('cal-1', '08-15', 1, 'ev-1'));
      expect(res.success).toBe(false);
      expect(res.error).toBe('unique violation');
    });
  });

  describe('removeSlot()', () => {
    it('appelle delete avec les 3 filtres (calendar_id, mmdd, position)', async () => {
      const res = await firstValueFrom(service.removeSlot('cal-1', '08-15', 1));
      expect(res.success).toBe(true);
      expect(eqCalls).toContainEqual(['calendar_id', 'cal-1']);
      expect(eqCalls).toContainEqual(['mmdd', '08-15']);
      expect(eqCalls).toContainEqual(['position', 1]);
    });
  });

  describe('getConflicts()', () => {
    it('signale un conflit quand l\'événement courant diffère de la recommandation', () => {
      const recs = [makeRec({ event_id: 'ev-2', event: { ...makeRec().event!, id: 'ev-2', title: 'Recommandé' } })];
      const entries = [makeEntry({ event_id: 'ev-1', event: { ...makeEntry().event!, title: 'Actuel' } })];
      const conflicts = service.getConflicts(recs, entries);
      expect(conflicts).toEqual([{
        mmdd: '08-15', position: 1, current_event_title: 'Actuel', recommended_event_title: 'Recommandé',
      }]);
    });

    it('ne signale aucun conflit quand la recommandation = l\'événement courant', () => {
      const recs = [makeRec({ event_id: 'ev-1' })];
      const entries = [makeEntry({ event_id: 'ev-1' })];
      expect(service.getConflicts(recs, entries)).toEqual([]);
    });

    it('ne signale aucun conflit quand le slot est libre', () => {
      const recs = [makeRec({ event_id: 'ev-2' })];
      expect(service.getConflicts(recs, [])).toEqual([]);
    });

    it('ignore les recommandations déjà appliquées', () => {
      const recs = [makeRec({ status: 'applied', event_id: 'ev-2' })];
      const entries = [makeEntry({ event_id: 'ev-1' })];
      expect(service.getConflicts(recs, entries)).toEqual([]);
    });
  });

  describe('applyAll()', () => {
    it('appelle le RPC avec p_calendar_id et p_overwrite=true par défaut', async () => {
      mockSupabase.client = buildClient({ rpcData: { applied: 3, skipped: 0 } });
      const res = await firstValueFrom(service.applyAll('cal-1'));
      expect(res.success).toBe(true);
      expect(res.applied).toBe(3);
      expect(rpcSpy).toHaveBeenCalledWith('apply_presidency_recommendations', {
        p_calendar_id: 'cal-1', p_overwrite: true,
      });
    });

    it('retourne success false si le RPC échoue', async () => {
      mockSupabase.client = buildClient({ rpcError: { message: 'insufficient_privilege' } });
      const res = await firstValueFrom(service.applyAll('cal-1'));
      expect(res.success).toBe(false);
      expect(res.error).toBe('insufficient_privilege');
    });
  });
});
