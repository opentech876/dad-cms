import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let mockSupabase: any;

  const mockWorkspace = { id: 'ws-1', name: 'OPEN-TECH', logo_url: null };

  function buildClient(workspaceCount: number, workspaceData: any[] = []) {
    return {
      from: (table: string) => ({
        select: (_cols: string, _opts?: any) =>
          Promise.resolve(
            table === 'workspaces'
              ? { data: workspaceData, count: workspaceCount, error: null }
              : { data: [], count: 4, error: null }, // user_roles member count
          ),
      }),
    };
  }

  beforeEach(() => {
    mockSupabase = {
      client: buildClient(0),
      invoke: jest.fn().mockResolvedValue({ data: { id: 'ws-new' }, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [
        WorkspaceService,
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });

    service = TestBed.inject(WorkspaceService);
  });

  // ── hasWorkspace() ─────────────────────────────────────────────────────────

  describe('hasWorkspace()', () => {
    it('returns false when no workspaces exist', async () => {
      mockSupabase.client = buildClient(0);
      expect(await firstValueFrom(service.hasWorkspace())).toBe(false);
    });

    it('returns true when at least one workspace exists', async () => {
      mockSupabase.client = buildClient(1);
      expect(await firstValueFrom(service.hasWorkspace())).toBe(true);
    });
  });

  // ── getWorkspaceSummaries() ────────────────────────────────────────────────

  describe('getWorkspaceSummaries()', () => {
    it('maps workspace data and member count correctly', async () => {
      mockSupabase.client = buildClient(1, [mockWorkspace]);
      const result = await firstValueFrom(service.getWorkspaceSummaries());

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ws-1');
      expect(result[0].name).toBe('OPEN-TECH');
      expect(result[0].member_count).toBe(4);
      expect(result[0].last_accessed_at).toBeNull();
    });

    it('returns empty array when no workspaces', async () => {
      mockSupabase.client = buildClient(0, []);
      expect(await firstValueFrom(service.getWorkspaceSummaries())).toEqual([]);
    });
  });

  // ── createWorkspace() ──────────────────────────────────────────────────────

  describe('createWorkspace()', () => {
    it('calls invoke with the correct function name and payload', async () => {
      await firstValueFrom(service.createWorkspace('OPEN-TECH'));
      expect(mockSupabase.invoke).toHaveBeenCalledWith('create-workspace', { name: 'OPEN-TECH' });
    });

    it('returns success true and workspaceId on success', async () => {
      const result = await firstValueFrom(service.createWorkspace('OPEN-TECH'));
      expect(result.success).toBe(true);
      expect(result.workspaceId).toBe('ws-new');
    });

    it('returns success false when invoke returns an error', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Erreur serveur' } });
      const result = await firstValueFrom(service.createWorkspace('OPEN-TECH'));
      expect(result.success).toBe(false);
    });
  });

  // ── inviteUser() ───────────────────────────────────────────────────────────

  describe('inviteUser()', () => {
    it("appelle invoke avec 'invite-user', l'email et le rôle", async () => {
      await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));
      expect(mockSupabase.invoke).toHaveBeenCalledWith('invite-user', {
        email: 'invite@exemple.com',
        role: 'editeur',
      });
    });

    it('retourne { success: true } en cas de succès', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: { id: 'u1', email: 'invite@exemple.com' }, error: null });
      const result = await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));
      expect(result.success).toBe(true);
    });

    it('retourne { success: false, error } en cas d\'erreur', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Utilisateur déjà invité' } });
      const result = await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Utilisateur déjà invité');
    });
  });
});
