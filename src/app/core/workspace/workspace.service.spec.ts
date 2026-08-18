import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from './workspace-context.service';

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
      // RPC mock — returns workspace summaries for get_my_workspace_summaries.
      // The default mirrors the workspaceData rows with a fixed member_count.
      rpc: jest.fn((name: string) => {
        if (name === 'get_my_workspace_summaries') {
          const rows = (workspaceData ?? []).map((w: any) => ({
            id: w.id,
            name: w.name,
            logo_url: w.logo_url ?? null,
            member_count: 4,
            last_accessed_at: w.last_accessed_at ?? null,
          }));
          return Promise.resolve({ data: rows, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
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
        {
          provide: WorkspaceContextService,
          useValue: { activeWorkspaceId: jest.fn().mockReturnValue('ws-active') },
        },
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
    it("appelle invoke avec 'invite-user', l'email, le rôle, workspace_id et le redirectTo", async () => {
      await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));

      expect(mockSupabase.invoke).toHaveBeenCalledWith('invite-user', {
        email: 'invite@exemple.com',
        role: 'editeur',
        workspace_id: 'ws-active',
        redirectTo: 'http://localhost:4200/dashboard',
      });
    });

    it("retourne une erreur claire si aucun workspace n'est actif", async () => {
      const ctx = TestBed.inject(WorkspaceContextService) as any;
      ctx.activeWorkspaceId.mockReturnValueOnce(null);
      const result = await firstValueFrom(service.inviteUser('invite@exemple.com', 'editeur'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('espace de travail');
      expect(mockSupabase.invoke).not.toHaveBeenCalled();
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

      expect(mockSupabase.invoke).toHaveBeenCalledWith('list-users', { workspace_id: 'ws-active' });
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
    it("appelle invoke avec 'manage-user', userId, action et workspace_id", async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      await firstValueFrom(service.manageUser('u1', 'block'));

      expect(mockSupabase.invoke).toHaveBeenCalledWith('manage-user', {
        userId: 'u1', action: 'block', workspace_id: 'ws-active',
      });
    });

    it("inclut le rôle dans le payload quand l'action est update_role", async () => {
      mockSupabase.invoke.mockResolvedValueOnce({ data: { success: true }, error: null });

      await firstValueFrom(service.manageUser('u1', 'update_role', 'chef_equipe'));

      expect(mockSupabase.invoke).toHaveBeenCalledWith('manage-user', {
        userId: 'u1', action: 'update_role', role: 'chef_equipe', workspace_id: 'ws-active',
      });
    });

    it("retourne une erreur claire si aucun workspace n'est actif", async () => {
      const ctx = TestBed.inject(WorkspaceContextService) as any;
      ctx.activeWorkspaceId.mockReturnValueOnce(null);
      const result = await firstValueFrom(service.manageUser('u1', 'block'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('espace de travail');
      expect(mockSupabase.invoke).not.toHaveBeenCalled();
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
    const fakeProfile = { full_name: 'Alice Martin', phone: '+242060000000', avatar_url: null, theme: 'broadsheet', color_mode: 'dark' };

    it('retourne le profil quand il existe', async () => {
      mockSupabase.client = buildClient(0, [], fakeProfile);

      const result = await firstValueFrom(service.getMyProfile('u1'));

      expect(result?.full_name).toBe('Alice Martin');
    });

    it('retourne les préférences d\'apparence avec le profil', async () => {
      mockSupabase.client = buildClient(0, [], fakeProfile);

      const result = await firstValueFrom(service.getMyProfile('u1'));

      expect(result?.theme).toBe('broadsheet');
      expect(result?.color_mode).toBe('dark');
    });

    it('retourne null quand aucun profil n\'existe', async () => {
      mockSupabase.client = buildClient(0, [], null);

      const result = await firstValueFrom(service.getMyProfile('u1'));

      expect(result).toBeNull();
    });
  });

  // ── saveAppearance() ────────────────────────────────────────────────────────

  describe('saveAppearance()', () => {
    it('appelle upsert sur profiles avec user_id, theme et color_mode', async () => {
      const upsertSpy = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.client = {
        from: () => ({ upsert: upsertSpy }),
      } as any;

      await firstValueFrom(service.saveAppearance('u1', 'field', 'dark'));

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u1', workspace_id: 'ws-active', theme: 'field', color_mode: 'dark' }),
        expect.objectContaining({ onConflict: 'user_id,workspace_id' }),
      );
    });

    it('ne fait rien (void) sans workspace actif', async () => {
      const ctx = TestBed.inject(WorkspaceContextService) as any;
      ctx.activeWorkspaceId.mockReturnValueOnce(null);
      await expect(firstValueFrom(service.saveAppearance('u1', 'field', 'dark'))).resolves.toBeUndefined();
    });
  });

  // ── getWorkspaces() ─────────────────────────────────────────────────────────

  describe('getWorkspaces()', () => {
    it('retourne les workspaces', async () => {
      mockSupabase.client = buildClient(1, [mockWorkspace]);
      const res = await firstValueFrom(service.getWorkspaces());
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('ws-1');
    });

    it('retourne [] quand data est null', async () => {
      mockSupabase.client = { from: () => ({ select: () => Promise.resolve({ data: null, error: null }) }) } as any;
      const res = await firstValueFrom(service.getWorkspaces());
      expect(res).toEqual([]);
    });
  });

  // ── upsertProfile() ─────────────────────────────────────────────────────────

  describe('upsertProfile()', () => {
    it('upsert profiles avec onConflict et retourne success', async () => {
      const upsertSpy = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.client = { from: () => ({ upsert: upsertSpy }) } as any;
      const res = await firstValueFrom(service.upsertProfile('u1', 'Alice', '+242', 'http://a.png'));
      expect(res.success).toBe(true);
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u1', workspace_id: 'ws-active', full_name: 'Alice', phone: '+242', avatar_url: 'http://a.png' }),
        expect.objectContaining({ onConflict: 'user_id,workspace_id' }),
      );
    });

    it('retourne une erreur sans workspace actif', async () => {
      const ctx = TestBed.inject(WorkspaceContextService) as any;
      ctx.activeWorkspaceId.mockReturnValueOnce(null);
      const res = await firstValueFrom(service.upsertProfile('u1', 'Alice', '+242'));
      expect(res.success).toBe(false);
    });

    it('remonte l\'erreur DB', async () => {
      mockSupabase.client = { from: () => ({ upsert: jest.fn().mockResolvedValue({ error: { message: 'boom' } }) }) } as any;
      const res = await firstValueFrom(service.upsertProfile('u1', 'Alice', '+242'));
      expect(res).toEqual({ success: false, error: 'boom' });
    });
  });

  // ── getMyProfile() sans workspace ───────────────────────────────────────────

  describe('getMyProfile() sans workspace', () => {
    it('retourne null sans workspace actif', async () => {
      const ctx = TestBed.inject(WorkspaceContextService) as any;
      ctx.activeWorkspaceId.mockReturnValueOnce(null);
      const res = await firstValueFrom(service.getMyProfile('u1'));
      expect(res).toBeNull();
    });
  });

  // ── updateWorkspace() ───────────────────────────────────────────────────────

  describe('updateWorkspace()', () => {
    function clientWithUpdate(error: any) {
      return {
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
        from: () => ({ update: () => ({ eq: () => Promise.resolve({ error }) }) }),
      } as any;
    }
    it('retourne success', async () => {
      mockSupabase.client = clientWithUpdate(null);
      const res = await firstValueFrom(service.updateWorkspace('ws-1', 'Nouveau'));
      expect(res.success).toBe(true);
    });
    it('remonte l\'erreur', async () => {
      mockSupabase.client = clientWithUpdate({ message: 'nope' });
      const res = await firstValueFrom(service.updateWorkspace('ws-1', 'Nouveau'));
      expect(res).toEqual({ success: false, error: 'nope' });
    });
  });

  // ── uploadAvatar() ──────────────────────────────────────────────────────────

  describe('uploadAvatar()', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    function storageClient(opts: { uploadError?: any; dbError?: any }) {
      return {
        storage: {
          from: () => ({
            upload: jest.fn().mockResolvedValue({ data: { path: 'u1/ws/a.png' }, error: opts.uploadError ?? null }),
            getPublicUrl: () => ({ data: { publicUrl: 'http://cdn/a.png' } }),
          }),
        },
        from: () => ({ upsert: jest.fn().mockResolvedValue({ error: opts.dbError ?? null }) }),
      } as any;
    }
    it('retourne success + avatarUrl', async () => {
      mockSupabase.client = storageClient({});
      const res = await firstValueFrom(service.uploadAvatar('u1', file));
      expect(res).toEqual({ success: true, avatarUrl: 'http://cdn/a.png' });
    });
    it('erreur si upload échoue', async () => {
      mockSupabase.client = storageClient({ uploadError: { message: 'up fail' } });
      const res = await firstValueFrom(service.uploadAvatar('u1', file));
      expect(res).toEqual({ success: false, error: 'up fail' });
    });
    it('erreur si écriture profil échoue', async () => {
      mockSupabase.client = storageClient({ dbError: { message: 'db fail' } });
      const res = await firstValueFrom(service.uploadAvatar('u1', file));
      expect(res).toEqual({ success: false, error: 'db fail' });
    });
    it('erreur sans workspace actif', async () => {
      const ctx = TestBed.inject(WorkspaceContextService) as any;
      ctx.activeWorkspaceId.mockReturnValueOnce(null);
      const res = await firstValueFrom(service.uploadAvatar('u1', file));
      expect(res.success).toBe(false);
    });
  });

  // ── uploadLogo() ────────────────────────────────────────────────────────────

  describe('uploadLogo()', () => {
    const file = new File(['x'], 'l.png', { type: 'image/png' });
    function logoClient(opts: { uploadError?: any; dbError?: any }) {
      return {
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
        storage: {
          from: () => ({
            upload: jest.fn().mockResolvedValue({ data: { path: 'ws-1/logo.png' }, error: opts.uploadError ?? null }),
            getPublicUrl: () => ({ data: { publicUrl: 'http://cdn/logo.png' } }),
          }),
        },
        from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: opts.dbError ?? null }) }) }),
      } as any;
    }
    it('retourne success + logoUrl', async () => {
      mockSupabase.client = logoClient({});
      const res = await firstValueFrom(service.uploadLogo('ws-1', file));
      expect(res).toEqual({ success: true, logoUrl: 'http://cdn/logo.png' });
    });
    it('erreur upload', async () => {
      mockSupabase.client = logoClient({ uploadError: { message: 'up' } });
      const res = await firstValueFrom(service.uploadLogo('ws-1', file));
      expect(res).toEqual({ success: false, error: 'up' });
    });
    it('erreur db', async () => {
      mockSupabase.client = logoClient({ dbError: { message: 'db' } });
      const res = await firstValueFrom(service.uploadLogo('ws-1', file));
      expect(res).toEqual({ success: false, error: 'db' });
    });
  });
});
