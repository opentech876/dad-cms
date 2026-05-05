import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CalendarEntryService } from './calendar-entry.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

describe('CalendarEntryService', () => {
  let service: CalendarEntryService;
  let mockSupabase: any;
  let mockWorkspaceContext: { activeWorkspaceId: jest.Mock };

  /** Thenable chain for select/filter queries. */
  function buildSelectChain(result: any) {
    const chain: any = {};
    Object.assign(chain, {
      select: jest.fn().mockReturnValue(chain),
      eq:     jest.fn().mockReturnValue(chain),
      order:  jest.fn().mockReturnValue(chain),
      then:   (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
    });
    return chain;
  }

  /** Thenable chain for delete/eq chains. */
  function buildDeleteChain(result: any) {
    const chain: any = {};
    Object.assign(chain, {
      delete: jest.fn().mockReturnValue(chain),
      eq:     jest.fn().mockReturnValue(chain),
      then:   (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
    });
    return chain;
  }

  beforeEach(() => {
    mockSupabase = {
      client: {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
        },
        from: jest.fn(),
      },
    };

    mockWorkspaceContext = {
      activeWorkspaceId: jest.fn().mockReturnValue('ws-1'),
    };

    TestBed.configureTestingModule({
      providers: [
        CalendarEntryService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: mockWorkspaceContext },
      ],
    });

    service = TestBed.inject(CalendarEntryService);
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  // ─── getEntriesByMmdd() ─────────────────────────────────────

  describe('getEntriesByMmdd()', () => {
    it('interroge calendar_entries avec le mmdd donné', async () => {
      const chain = buildSelectChain({ data: [], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.getEntriesByMmdd('08-15'));

      expect(mockSupabase.client.from).toHaveBeenCalledWith('calendar_entries');
      expect(chain.eq).toHaveBeenCalledWith('mmdd', '08-15');
    });

    it('filtre par workspace_id quand activeWorkspaceId est non-null', async () => {
      const chain = buildSelectChain({ data: [], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.getEntriesByMmdd('08-15'));

      expect(chain.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
    });

    it('ne filtre pas par workspace_id quand activeWorkspaceId est null', async () => {
      mockWorkspaceContext.activeWorkspaceId.mockReturnValue(null);
      const chain = buildSelectChain({ data: [], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.getEntriesByMmdd('08-15'));

      const eqCalls: Array<[string, unknown]> = chain.eq.mock.calls;
      expect(eqCalls.some(([col]) => col === 'workspace_id')).toBe(false);
    });

    it('retourne les entrées avec les événements joints', async () => {
      const fakeEntries = [
        { id: 'e1', mmdd: '08-15', position: 1, event: { id: 'evt-1', title: 'Test' } },
      ];
      const chain = buildSelectChain({ data: fakeEntries, error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.getEntriesByMmdd('08-15'));
      expect(result).toEqual(fakeEntries);
    });

    it("retourne [] en cas d'erreur Supabase", async () => {
      const chain = buildSelectChain({ data: null, error: { message: 'DB error' } });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.getEntriesByMmdd('08-15'));
      expect(result).toEqual([]);
    });
  });

  // ─── getEntriesForCalendar() ─────────────────────────────────

  describe('getEntriesForCalendar()', () => {
    it('interroge la table calendar_entries avec le calendrier donné', async () => {
      const chain = buildSelectChain({ data: [], error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.getEntriesForCalendar('cal-1'));

      expect(mockSupabase.client.from).toHaveBeenCalledWith('calendar_entries');
      expect(chain.eq).toHaveBeenCalledWith('calendar_id', 'cal-1');
    });

    it('retourne les entrées avec événements joints', async () => {
      const fakeEntries = [{ id: 'e1', mmdd: '08-15', position: 1, event: { title: 'Test' } }];
      const chain = buildSelectChain({ data: fakeEntries, error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.getEntriesForCalendar('cal-1'));
      expect(result).toEqual(fakeEntries);
    });

    it("retourne [] en cas d'erreur Supabase", async () => {
      const chain = buildSelectChain({ data: null, error: { message: 'DB error' } });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.getEntriesForCalendar('cal-1'));
      expect(result).toEqual([]);
    });
  });

  // ─── assignEvent() ───────────────────────────────────────────

  describe('assignEvent()', () => {
    it('appelle upsert sur calendar_entries avec les bons paramètres', async () => {
      const upsertMock = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.client.from.mockReturnValue({ upsert: upsertMock });

      await firstValueFrom(service.assignEvent('cal-1', '08-15', 'evt-1', 1));

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          calendar_id: 'cal-1',
          mmdd: '08-15',
          event_id: 'evt-1',
          position: 1,
          workspace_id: 'ws-1',
          created_by: 'user-1',
        }),
        expect.objectContaining({ onConflict: 'calendar_id,mmdd,position' }),
      );
    });

    it('retourne success:true quand le upsert réussit', async () => {
      mockSupabase.client.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: null }),
      });

      const result = await firstValueFrom(service.assignEvent('cal-1', '08-15', 'evt-1', 1));
      expect(result).toEqual({ success: true });
    });

    it("retourne success:false avec message en cas d'erreur", async () => {
      mockSupabase.client.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: { message: 'Contrainte violée' } }),
      });

      const result = await firstValueFrom(service.assignEvent('cal-1', '08-15', 'evt-1', 1));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Contrainte violée');
    });
  });

  // ─── unassignEntry() ─────────────────────────────────────────

  describe('unassignEntry()', () => {
    it('supprime l\'entrée par id', async () => {
      const chain = buildDeleteChain({ error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.unassignEntry('entry-1'));

      expect(mockSupabase.client.from).toHaveBeenCalledWith('calendar_entries');
      expect(chain.eq).toHaveBeenCalledWith('id', 'entry-1');
    });

    it('retourne success:true après suppression', async () => {
      const chain = buildDeleteChain({ error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.unassignEntry('entry-1'));
      expect(result).toEqual({ success: true });
    });

    it("retourne success:false en cas d'erreur", async () => {
      const chain = buildDeleteChain({ error: { message: 'Erreur' } });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.unassignEntry('entry-1'));
      expect(result.success).toBe(false);
    });
  });

  // ─── unassignSlot() ──────────────────────────────────────────

  describe('unassignSlot()', () => {
    it('supprime par calendar_id, mmdd et position', async () => {
      const chain = buildDeleteChain({ error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      await firstValueFrom(service.unassignSlot('cal-1', '08-15', 1));

      expect(chain.eq).toHaveBeenCalledWith('calendar_id', 'cal-1');
      expect(chain.eq).toHaveBeenCalledWith('mmdd', '08-15');
      expect(chain.eq).toHaveBeenCalledWith('position', 1);
    });

    it('retourne success:true après suppression', async () => {
      const chain = buildDeleteChain({ error: null });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.unassignSlot('cal-1', '08-15', 1));
      expect(result).toEqual({ success: true });
    });

    it("retourne success:false en cas d'erreur", async () => {
      const chain = buildDeleteChain({ error: { message: 'Erreur' } });
      mockSupabase.client.from.mockReturnValue(chain);

      const result = await firstValueFrom(service.unassignSlot('cal-1', '08-15', 2));
      expect(result.success).toBe(false);
    });
  });
});
