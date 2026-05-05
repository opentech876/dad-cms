import { TestBed } from '@angular/core/testing';
import { WorkspaceContextService } from './workspace-context.service';

describe('WorkspaceContextService', () => {
  let service: WorkspaceContextService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkspaceContextService);
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
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(WorkspaceContextService);
    expect(fresh.activeWorkspaceId()).toBe('ws-stored');
  });

  it('setActiveWorkspace écrase la valeur précédente', () => {
    service.setActiveWorkspace('ws-1');
    service.setActiveWorkspace('ws-2');
    expect(service.activeWorkspaceId()).toBe('ws-2');
    expect(localStorage.getItem('dad-workspace-id')).toBe('ws-2');
  });
});
