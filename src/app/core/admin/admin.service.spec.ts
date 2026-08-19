import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AdminService } from './admin.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('AdminService', () => {
  let service: AdminService;
  let rpc: jest.Mock;
  let invoke: jest.Mock;

  beforeEach(() => {
    rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    invoke = jest.fn().mockResolvedValue({ data: null, error: null });
    TestBed.configureTestingModule({
      providers: [
        AdminService,
        { provide: SupabaseService, useValue: { client: { rpc }, invoke } },
      ],
    });
    service = TestBed.inject(AdminService);
  });

  // ── Read RPCs (throw on error, default [] / data on success) ───────────────

  it('dashboardStats renvoie les données de la RPC', async () => {
    rpc.mockResolvedValueOnce({ data: { workspaces: { active: 3 } }, error: null });
    const stats = await firstValueFrom(service.dashboardStats());
    expect(rpc).toHaveBeenCalledWith('admin_dashboard_stats');
    expect(stats.workspaces.active).toBe(3);
  });

  it('dashboardStats propage une erreur', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
    await expect(firstValueFrom(service.dashboardStats())).rejects.toEqual({ message: 'denied' });
  });

  it('listAllUsers retombe sur un tableau vide sans données', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await firstValueFrom(service.listAllUsers())).toEqual([]);
  });

  it('listAllUsers propage une erreur', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(firstValueFrom(service.listAllUsers())).rejects.toBeTruthy();
  });

  it('listAuditLog transmet limit/before/table et renvoie les lignes', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'a1' }], error: null });
    const rows = await firstValueFrom(service.listAuditLog(10, '2026-01-01', 'workspaces'));
    expect(rpc).toHaveBeenCalledWith('admin_list_audit_log', {
      p_limit: 10,
      p_before: '2026-01-01',
      p_table: 'workspaces',
    });
    expect(rows).toHaveLength(1);
  });

  it('listAuditLog propage une erreur', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(firstValueFrom(service.listAuditLog())).rejects.toBeTruthy();
  });

  it('listWorkspaces retombe sur un tableau vide et propage une erreur', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await firstValueFrom(service.listWorkspaces())).toEqual([]);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(firstValueFrom(service.listWorkspaces())).rejects.toBeTruthy();
  });

  // ── Mutation RPCs ({ success } / { success:false, error }) ─────────────────

  it('createWorkspace renvoie success + workspaceId', async () => {
    rpc.mockResolvedValueOnce({ data: 'ws-9', error: null });
    const res = await firstValueFrom(service.createWorkspace('Congo', 'u1'));
    expect(rpc).toHaveBeenCalledWith('admin_create_workspace', { p_name: 'Congo', p_owner_user_id: 'u1' });
    expect(res).toEqual({ success: true, workspaceId: 'ws-9' });
  });

  it('createWorkspace défaut ownerUserId null + erreur', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'dup' } });
    const res = await firstValueFrom(service.createWorkspace('Congo'));
    expect(rpc).toHaveBeenCalledWith('admin_create_workspace', { p_name: 'Congo', p_owner_user_id: null });
    expect(res).toEqual({ success: false, error: 'dup' });
  });

  it('renameWorkspace succès + erreur', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    expect(await firstValueFrom(service.renameWorkspace('ws-1', 'New'))).toEqual({ success: true });
    rpc.mockResolvedValueOnce({ error: { message: 'no' } });
    expect(await firstValueFrom(service.renameWorkspace('ws-1', 'New'))).toEqual({ success: false, error: 'no' });
  });

  it('softDeleteWorkspace succès + erreur', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    expect(await firstValueFrom(service.softDeleteWorkspace('ws-1'))).toEqual({ success: true });
    rpc.mockResolvedValueOnce({ error: { message: 'no' } });
    expect(await firstValueFrom(service.softDeleteWorkspace('ws-1'))).toEqual({ success: false, error: 'no' });
  });

  it('restoreWorkspace succès + erreur', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    expect(await firstValueFrom(service.restoreWorkspace('ws-1'))).toEqual({ success: true });
    rpc.mockResolvedValueOnce({ error: { message: 'no' } });
    expect(await firstValueFrom(service.restoreWorkspace('ws-1'))).toEqual({ success: false, error: 'no' });
  });

  it('inviteManager passe par la fonction edge invite-user avec le rôle owner', async () => {
    invoke.mockResolvedValueOnce({ data: { id: 'x', email: 'a@b.co' }, error: null });
    const res = await firstValueFrom(service.inviteManager('ws-1', 'a@b.co'));
    expect(invoke).toHaveBeenCalledWith('invite-user', { email: 'a@b.co', role: 'owner', workspace_id: 'ws-1' });
    expect(res).toEqual({ success: true });
  });

  it('inviteManager renvoie une erreur quand la fonction edge échoue', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'ef down' } });
    expect(await firstValueFrom(service.inviteManager('ws-1', 'a@b.co'))).toEqual({ success: false, error: 'ef down' });
  });
});
