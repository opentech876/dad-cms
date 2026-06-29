import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AdminService } from './admin.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('AdminService', () => {
  let service: AdminService;
  let rpc: jest.Mock;

  beforeEach(() => {
    rpc = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        AdminService,
        { provide: SupabaseService, useValue: { client: { rpc } } },
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
});
