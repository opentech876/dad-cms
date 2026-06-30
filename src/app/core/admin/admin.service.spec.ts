import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AdminService } from './admin.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('AdminService', () => {
  let service: AdminService;
  let rpc: jest.Mock;
  let invoke: jest.Mock;

  beforeEach(() => {
    rpc = jest.fn();
    invoke = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        AdminService,
        { provide: SupabaseService, useValue: { client: { rpc }, invoke } },
      ],
    });
    service = TestBed.inject(AdminService);
  });

  it('listAllUsers appelle admin_list_all_users', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await firstValueFrom(service.listAllUsers());
    expect(rpc).toHaveBeenCalledWith('admin_list_all_users');
  });

  it('listWorkspaces appelle admin_list_workspaces', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await firstValueFrom(service.listWorkspaces());
    expect(rpc).toHaveBeenCalledWith('admin_list_workspaces');
  });

  it("listWorkspaces propage l'erreur RPC", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('Rôle system_admin requis') });
    await expect(firstValueFrom(service.listWorkspaces())).rejects.toThrow('system_admin');
  });

  it('createWorkspace appelle admin_create_workspace avec nom et owner', async () => {
    rpc.mockResolvedValueOnce({ data: 'ws-new', error: null });
    const res = await firstValueFrom(service.createWorkspace('Tenant A', 'user-1'));
    expect(rpc).toHaveBeenCalledWith('admin_create_workspace', {
      p_name: 'Tenant A',
      p_owner_user_id: 'user-1',
    });
    expect(res).toEqual({ success: true, workspaceId: 'ws-new' });
  });

  it("createWorkspace renvoie success:false sur erreur", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Le nom de l'espace est requis" } });
    const res = await firstValueFrom(service.createWorkspace('', null));
    expect(res.success).toBe(false);
    expect(res.error).toContain('nom');
  });

  it('renameWorkspace appelle admin_rename_workspace', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await firstValueFrom(service.renameWorkspace('ws-1', 'New name'));
    expect(rpc).toHaveBeenCalledWith('admin_rename_workspace', {
      p_workspace_id: 'ws-1',
      p_name: 'New name',
    });
  });

  it('softDeleteWorkspace appelle admin_soft_delete_workspace', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await firstValueFrom(service.softDeleteWorkspace('ws-1'));
    expect(rpc).toHaveBeenCalledWith('admin_soft_delete_workspace', { p_workspace_id: 'ws-1' });
  });

  it('restoreWorkspace appelle admin_restore_workspace', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await firstValueFrom(service.restoreWorkspace('ws-1'));
    expect(rpc).toHaveBeenCalledWith('admin_restore_workspace', { p_workspace_id: 'ws-1' });
  });

  describe('dashboardStats()', () => {
    it('appelle admin_dashboard_stats et renvoie le payload', async () => {
      const payload = {
        workspaces: { active: 1, deleted: 0 },
        users: { total: 1, confirmed: 1, pending: 0, system_admins: 1 },
        recent_workspaces: [],
        pending_invitations: [],
      };
      rpc.mockResolvedValueOnce({ data: payload, error: null });
      const res = await firstValueFrom(service.dashboardStats());
      expect(rpc).toHaveBeenCalledWith('admin_dashboard_stats');
      expect(res).toEqual(payload);
    });

    it("propage l'erreur RPC", async () => {
      rpc.mockResolvedValueOnce({ data: null, error: new Error('Rôle system_admin requis') });
      await expect(firstValueFrom(service.dashboardStats())).rejects.toThrow('system_admin');
    });
  });

  describe('inviteManager()', () => {
    it("invoque l'EF invite-user avec role='owner' (sysadmin → manager)", async () => {
      invoke.mockResolvedValueOnce({ data: { id: 'u-2', email: 'mgr@x.com' }, error: null });
      const res = await firstValueFrom(service.inviteManager('ws-1', 'mgr@x.com'));
      expect(invoke).toHaveBeenCalledWith('invite-user', {
        email: 'mgr@x.com',
        role: 'owner',
        workspace_id: 'ws-1',
      });
      expect(res).toEqual({ success: true });
    });

    it("renvoie success:false quand l'EF échoue", async () => {
      invoke.mockResolvedValueOnce({ data: null, error: { message: 'rate limit' } });
      const res = await firstValueFrom(service.inviteManager('ws-1', 'mgr@x.com'));
      expect(res.success).toBe(false);
      expect(res.error).toContain('rate limit');
    });
  });
});
