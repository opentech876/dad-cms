import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let mockSupabase: { client: any; invoke: jest.Mock };

  const mockWorkspace = { id: 'ws-1', name: 'OPEN-TECH', logo_url: null };

  function buildClient(workspaceCount: number, workspaceData: any[] = [], profileData: any = null) {
    function makeQuery(data: any, count: number) {
      const chain: any = {
        then: (onFulfilled: any, onRejected?: any) =>
          Promise.resolve({ data, count, error: null }).then(onFulfilled, onRejected),
        select: (_cols: string, _opts?: any) => makeQuery(data, count),
        eq: (_col: string, _val: any) => makeQuery(data, count),
        maybeSingle: () => Promise.resolve({
          data: Array.isArray(data) ? (data[0] ?? null) : data,
          error: null,
        }),
      };
      return chain;
    }
    return {
      from: (table: string) => {
        if (table === 'workspaces') return makeQuery(workspaceData, workspaceCount);
        if (table === 'profiles') return makeQuery(profileData ? [profileData] : [], 1);
        return makeQuery([], 4);
      },
    };
  }

  beforeEach(() => {
    mockSupabase = {
      client: buildClient(0),
      invoke: jest.fn().mockResolvedValue({ data: { workspace: 'ws-new', success: true }, error: null }),
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
    it('retourne false quand aucun workspace n\'existe', async () => {
      mockSupabase.client = buildClient(0);

      const result = await firstValueFrom(service.hasWorkspace());

      expect(result).toBe(false);
    });

    it('retourne true quand au moins un workspace existe', async () => {
      mockSupabase.client = buildClient(1);

      const result = await firstValueFrom(service.hasWorkspace());

      expect(result).toBe(true);
    });
  });

  // ── getWorkspaceSummaries() ────────────────────────────────────────────────

  describe('getWorkspaceSummaries()', () => {
    it('retourne un tableau avec un élément quand un workspace existe', async () => {
      mockSupabase.client = buildClient(1, [mockWorkspace]);

      const result = await firstValueFrom(service.getWorkspaceSummaries());

      expect(result.length).toBe(1);
    });

    it('mappe correctement l\'id et le nom du workspace', async () => {
      mockSupabase.client = buildClient(1, [mockWorkspace]);

      const result = await firstValueFrom(service.getWorkspaceSummaries());

      expect(result[0].id).toBe('ws-1');
      expect(result[0].name).toBe('OPEN-TECH');
    });

    it('mappe le member_count et initialise last_accessed_at à null', async () => {
      mockSupabase.client = buildClient(1, [mockWorkspace]);

      const result = await firstValueFrom(service.getWorkspaceSummaries());

      expect(result[0].member_count).toBe(4);
      expect(result[0].last_accessed_at).toBeNull();
    });

    it('retourne un tableau vide quand aucun workspace n\'existe', async () => {
      mockSupabase.client = buildClient(0, []);

      const result = await firstValueFrom(service.getWorkspaceSummaries());

      expect(result).toEqual([]);
    });
  });

  // ── createWorkspace() ──────────────────────────────────────────────────────

  describe('createWorkspace()', () => {
    it('appelle invoke avec le bon nom de fonction et le bon payload', async () => {
      await firstValueFrom(service.createWorkspace('OPEN-TECH', 'Elvis', '+242'));

      expect(mockSupabase.invoke).toHaveBeenCalledWith('create-workspace', {
        name: 'OPEN-TECH',
        fullName: 'Elvis',
        phone: '+242',
      });
    });

    it('retourne success: true en cas de succès', async () => {
      const result = await firstValueFrom(service.createWorkspace('OPEN-TECH'));

      expect(result.success).toBe(true);
    });

    it('retourne le workspaceId fourni par la fonction Edge en cas de succès', async () => {
      const result = await firstValueFrom(service.createWorkspace('OPEN-TECH'));

      expect(result.workspaceId).toBe('ws-new');
    });

    it('retourne success: false quand invoke retourne une erreur', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Erreur serveur' } });

      const result = await firstValueFrom(service.createWorkspace('OPEN-TECH'));

      expect(result.success).toBe(false);
    });
  });

  // ── inviteUser() ───────────────────────────────────────────────────────────

  describe('inviteUser()', () => {
    it("appelle invoke avec 'invite-user', l'email, le rôle et le redirectTo", async () => {
      await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));

      expect(mockSupabase.invoke).toHaveBeenCalledWith('invite-user', {
        email: 'invite@exemple.com',
        role: 'editeur',
        redirectTo: 'http://localhost:4200/dashboard',
      });
    });

    it('retourne success: true en cas de succès', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: { id: 'u1', email: 'invite@exemple.com' }, error: null });

      const result = await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));

      expect(result.success).toBe(true);
    });

    it('retourne success: false en cas d\'erreur', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Utilisateur déjà invité' } });

      const result = await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));

      expect(result.success).toBe(false);
    });

    it('retourne le message d\'erreur en cas d\'erreur', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Utilisateur déjà invité' } });

      const result = await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));

      expect(result.error).toBe('Utilisateur déjà invité');
    });
  });

  // ── listUsers() ────────────────────────────────────────────────────────────

  describe('listUsers()', () => {
    const rawUsers = [
      {
        id: 'u1', email: 'alice@test.com', full_name: 'Alice Martin',
        phone: null, avatar_url: null, role: 'editeur',
        expires_at: null, banned: false, created_at: '2026-01-15T10:00:00Z',
      },
    ];

    it("appelle invoke avec 'list-users' et un corps vide", async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: rawUsers, error: null });

      await firstValueFrom(service.listUsers());

      expect(mockSupabase.invoke).toHaveBeenCalledWith('list-users', {});
    });

    it('retourne un tableau de la bonne longueur en cas de succès', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: rawUsers, error: null });

      const result = await firstValueFrom(service.listUsers());

      expect(result.length).toBe(1);
    });

    it('préserve les champs id et role dans les entrées retournées', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: rawUsers, error: null });

      const result = await firstValueFrom(service.listUsers());

      expect(result[0].id).toBe('u1');
      expect(result[0].role).toBe('editeur');
    });

    it('préserve le champ banned dans les entrées retournées', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: rawUsers, error: null });

      const result = await firstValueFrom(service.listUsers());

      expect(result[0].banned).toBe(false);
    });

    it('retourne un tableau vide en cas d\'erreur', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Accès refusé' } });

      const result = await firstValueFrom(service.listUsers());

      expect(result).toEqual([]);
    });
  });

  // ── manageUser() ───────────────────────────────────────────────────────────

  describe('manageUser()', () => {
    it("appelle invoke avec 'manage-user', userId et action", async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      await firstValueFrom(service.manageUser('u1', 'block'));

      expect(mockSupabase.invoke).toHaveBeenCalledWith('manage-user', { userId: 'u1', action: 'block' });
    });

    it("inclut le rôle dans le payload quand l'action est update_role", async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      await firstValueFrom(service.manageUser('u1', 'update_role', 'chef_equipe'));

      expect(mockSupabase.invoke).toHaveBeenCalledWith('manage-user', {
        userId: 'u1', action: 'update_role', role: 'chef_equipe',
      });
    });

    it('retourne success: true en cas de succès', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      const result = await firstValueFrom(service.manageUser('u1', 'remove'));

      expect(result.success).toBe(true);
    });

    it('retourne success: false en cas d\'erreur', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Accès refusé' } });

      const result = await firstValueFrom(service.manageUser('u1', 'remove'));

      expect(result.success).toBe(false);
    });

    it('retourne le message d\'erreur en cas d\'erreur', async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Accès refusé' } });

      const result = await firstValueFrom(service.manageUser('u1', 'remove'));

      expect(result.error).toBe('Accès refusé');
    });
  });

  // ── getMyProfile() ─────────────────────────────────────────────────────────

  describe('getMyProfile()', () => {
    const fakeProfile = { full_name: 'Alice Martin', phone: '+242060000000', avatar_url: null };

    it('retourne le profil quand il existe', async () => {
      mockSupabase.client = buildClient(0, [], fakeProfile);

      const result = await firstValueFrom(service.getMyProfile('u1'));

      expect(result?.full_name).toBe('Alice Martin');
    });

    it('retourne null quand aucun profil n\'existe', async () => {
      mockSupabase.client = buildClient(0, [], null);

      const result = await firstValueFrom(service.getMyProfile('u1'));

      expect(result).toBeNull();
    });
  });
});
