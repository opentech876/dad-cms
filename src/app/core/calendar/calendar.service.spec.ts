import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CalendarService } from './calendar.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

describe('CalendarService', () => {
  let service: CalendarService;
  let insertSpy: jest.Mock;
  let updateSpy: jest.Mock;
  let eqCalls: Array<[string, any]>;
  let mockSupabase: { client: any };
  let mockWorkspaceContext: { activeWorkspaceId: jest.Mock };

  const rawCalendars = [
    {
      id: 'cal-1',
      year: 2024,
      name: 'Calendrier 2024',
      status: 'archived',
      created_by: null,
      published_at: null,
      calendar_entries: [{ count: 412 }],
    },
    {
      id: 'cal-2',
      year: 2025,
      name: 'Calendrier 2025',
      status: 'published',
      created_by: 'uid-1',
      published_at: '2025-01-15T10:00:00Z',
      calendar_entries: [{ count: 487 }],
    },
  ];

  function buildClient(options: { calendars?: any[]; newId?: string; simulateError?: string } = {}) {
    const { calendars = rawCalendars, newId = 'cal-new', simulateError } = options;
    eqCalls = [];

    function makeQuery(data: any): any {
      const err = simulateError ? { message: simulateError } : null;
      const q: any = {
        then: (onFulfilled: any, onRejected?: any) =>
          Promise.resolve({ data, error: err }).then(onFulfilled, onRejected),
        select: (_cols?: string, _opts?: any) => makeQuery(data),
        eq: (col: string, val: any) => { eqCalls.push([col, val]); return makeQuery(data); },
        is: (_col: string, _val: any) => makeQuery(data),
        order: (_col: string, _opts?: any) => makeQuery(data),
        single: () =>
          Promise.resolve({
            data: err ? null : (Array.isArray(data) ? data[0] ?? null : data),
            error: err,
          }),
      };
      return q;
    }

    insertSpy = jest.fn().mockImplementation(() => makeQuery([{ id: newId }]));
    updateSpy = jest.fn().mockImplementation(() => makeQuery(null));

    return {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: (table: string) => {
        if (table !== 'calendars') return makeQuery([]);
        return {
          select: (_cols?: string) => makeQuery(calendars),
          insert: insertSpy,
          update: updateSpy,
        };
      },
    };
  }

  beforeEach(() => {
    mockSupabase = { client: buildClient() };
    mockWorkspaceContext = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };

    TestBed.configureTestingModule({
      providers: [
        CalendarService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceContextService, useValue: mockWorkspaceContext },
      ],
    });

    service = TestBed.inject(CalendarService);
  });

  // ── listCalendars() ─────────────────────────────────────────────────────────

  describe('listCalendars()', () => {
    it('retourne un tableau avec le bon nombre de CalendarSummary', async () => {
      const result = await firstValueFrom(service.listCalendars());

      expect(result.length).toBe(2);
    });

    it('mappe correctement id, year, name et status', async () => {
      const result = await firstValueFrom(service.listCalendars());

      expect(result[0].id).toBe('cal-1');
      expect(result[0].year).toBe(2024);
      expect(result[0].name).toBe('Calendrier 2024');
      expect(result[0].status).toBe('archived');
    });

    it('mappe eventCount depuis le tableau calendar_entries embarqué', async () => {
      const result = await firstValueFrom(service.listCalendars());

      expect(result[0].eventCount).toBe(412);
      expect(result[1].eventCount).toBe(487);
    });

    it('retourne un tableau vide en cas d\'erreur DB', async () => {
      mockSupabase.client = buildClient({ simulateError: 'DB error' });

      const result = await firstValueFrom(service.listCalendars());

      expect(result).toEqual([]);
    });
  });

  // ── createCalendar() ────────────────────────────────────────────────────────

  describe('createCalendar()', () => {
    it('appelle insert avec year, name, status, created_by et workspace_id', async () => {
      mockSupabase.client = buildClient();

      await firstValueFrom(service.createCalendar(2026, 'Calendrier 2026', 'draft'));

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ year: 2026, name: 'Calendrier 2026', status: 'draft', created_by: 'user-1', workspace_id: 'ws-1' }),
      );
    });

    it("retourne success: true et l'id retourné par la DB en cas de succès", async () => {
      mockSupabase.client = buildClient({ newId: 'cal-xyz' });

      const result = await firstValueFrom(service.createCalendar(2026, 'Calendrier 2026', 'draft'));

      expect(result.success).toBe(true);
      expect(result.id).toBe('cal-xyz');
    });

    it("retourne success: false avec un message d'erreur en cas d'erreur DB", async () => {
      mockSupabase.client = buildClient({ simulateError: 'Duplicate year' });

      const result = await firstValueFrom(service.createCalendar(2026, 'Calendrier 2026', 'draft'));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Duplicate year');
    });
  });

  // ── workspace isolation ─────────────────────────────────────────────────────

  describe('workspace isolation', () => {
    it('listCalendars() filtre par workspace_id actif', async () => {
      mockSupabase.client = buildClient();
      await firstValueFrom(service.listCalendars());
      expect(eqCalls).toContainEqual(['workspace_id', 'ws-1']);
    });

    it('listCalendars() ne filtre pas par workspace quand activeWorkspaceId est null', async () => {
      mockWorkspaceContext.activeWorkspaceId.mockReturnValue(null);
      mockSupabase.client = buildClient();
      await firstValueFrom(service.listCalendars());
      expect(eqCalls.some(([col]) => col === 'workspace_id')).toBe(false);
    });

    it('createCalendar() passe workspace_id dans le payload insert', async () => {
      mockSupabase.client = buildClient();
      await firstValueFrom(service.createCalendar(2026, 'Test', 'draft'));
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws-1' }),
      );
    });
  });

  // ── updateCalendar() ────────────────────────────────────────────────────────

  describe('updateCalendar()', () => {
    it('appelle update avec le patch fourni', async () => {
      mockSupabase.client = buildClient();

      await firstValueFrom(service.updateCalendar('cal-1', { status: 'published' }));

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published' }),
      );
    });

    it('inclut updated_by dans le payload', async () => {
      mockSupabase.client = buildClient();

      await firstValueFrom(service.updateCalendar('cal-1', { status: 'published' }));

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ updated_by: 'user-1' }),
      );
    });

    it('retourne success: true quand la mise à jour réussit', async () => {
      mockSupabase.client = buildClient();

      const result = await firstValueFrom(service.updateCalendar('cal-1', { status: 'published' }));

      expect(result.success).toBe(true);
    });

    it("retourne success: false avec un message d'erreur en cas d'erreur DB", async () => {
      mockSupabase.client = buildClient({ simulateError: 'Accès refusé' });

      const result = await firstValueFrom(service.updateCalendar('cal-1', { status: 'published' }));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Accès refusé');
    });
  });

  // ── deleteCalendar() ────────────────────────────────────────────────────────

  describe('deleteCalendar()', () => {
    it('appelle update avec un champ deleted_at non null', async () => {
      mockSupabase.client = buildClient();

      await firstValueFrom(service.deleteCalendar('cal-1'));

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) }),
      );
    });

    it('inclut deleted_by dans le payload', async () => {
      mockSupabase.client = buildClient();

      await firstValueFrom(service.deleteCalendar('cal-1'));

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_by: 'user-1' }),
      );
    });

    it('retourne success: true quand la suppression réussit', async () => {
      mockSupabase.client = buildClient();

      const result = await firstValueFrom(service.deleteCalendar('cal-1'));

      expect(result.success).toBe(true);
    });

    it("retourne success: false avec un message d'erreur en cas d'erreur DB", async () => {
      mockSupabase.client = buildClient({ simulateError: 'Suppression impossible' });

      const result = await firstValueFrom(service.deleteCalendar('cal-1'));

      expect(result.success).toBe(false);
      expect(result.error).toBe('Suppression impossible');
    });
  });
});
