import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'dad-workspace-id';

@Injectable({ providedIn: 'root' })
export class WorkspaceContextService {
  readonly activeWorkspaceId = signal<string | null>(
    localStorage.getItem(STORAGE_KEY),
  );

  setActiveWorkspace(id: string): void {
    this.activeWorkspaceId.set(id);
    localStorage.setItem(STORAGE_KEY, id);
  }
}
