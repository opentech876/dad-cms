import { TestBed } from '@angular/core/testing';
import { WorkspaceContextService } from './workspace-context.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('WorkspaceContextService', () => {
  let service: WorkspaceContextService;
  let rpc: jest.Mock;

  function configure() {
    rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { client: { rpc } } },
      ],
    });
    service = TestBed.inject(WorkspaceContextService);
  }

  beforeEach(() => {
    localStorage.clear();
    configure();
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  it('activeWorkspaceId est null quand localStorage est vide', () => {
    expect(service.activeWorkspaceId()).toBeNull();
  });

  it('setActiveWorkspace met à jour le signal', () => {
    service.setActiveWorkspace('ws-1');
    expect(service.activeWorkspaceId()).toBe('ws-1');
  });

  it('setActiveWorkspace persiste dans localStorage', () => {
    service.setActiveWorkspace('ws-1');
    expect(localStorage.getItem('dad-workspace-id')).toBe('ws-1');
  });

  it('restaure la valeur depuis localStorage à la création du service', () => {
    localStorage.setItem('dad-workspace-id', 'ws-stored');
    TestBed.resetTestingModule();
    configure();
    expect(service.activeWorkspaceId()).toBe('ws-stored');
  });

  it("appelle touch_workspace_access pour mettre à jour last_accessed_at", () => {
    service.setActiveWorkspace('ws-1');
    expect(rpc).toHaveBeenCalledWith('touch_workspace_access', { p_workspace_id: 'ws-1' });
  });

  it('setActiveWorkspace écrase la valeur précédente', () => {
    service.setActiveWorkspace('ws-1');
    service.setActiveWorkspace('ws-2');
    expect(service.activeWorkspaceId()).toBe('ws-2');
    expect(localStorage.getItem('dad-workspace-id')).toBe('ws-2');
  });

  it('notifyWorkspacesChanged émet sur workspacesChanged$', () => {
    const spy = jest.fn();
    service.workspacesChanged$.subscribe(spy);
    service.notifyWorkspacesChanged();
    expect(spy).toHaveBeenCalled();
  });

  it('notifyProfileChanged émet sur profileChanged$', () => {
    const spy = jest.fn();
    service.profileChanged$.subscribe(spy);
    service.notifyProfileChanged();
    expect(spy).toHaveBeenCalled();
  });
});
