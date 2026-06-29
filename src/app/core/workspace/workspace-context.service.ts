import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../supabase/supabase.service';

const STORAGE_KEY = 'dad-workspace-id';

@Injectable({ providedIn: 'root' })
export class WorkspaceContextService {
  private supabase = inject(SupabaseService);

  readonly activeWorkspaceId = signal<string | null>(
    localStorage.getItem(STORAGE_KEY),
  );

  /**
   * Set the active workspace and stamp `workspace_members.last_accessed_at`
   * for the caller. The stamp is fire-and-forget — failure here shouldn't
   * block the switch, and the value is purely used to order the switcher
   * (most recently accessed first) on the next session.
   */
  setActiveWorkspace(id: string): void {
    this.activeWorkspaceId.set(id);
    localStorage.setItem(STORAGE_KEY, id);
    void this.supabase.client.rpc('touch_workspace_access', { p_workspace_id: id });
  }
}
