import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';

const STORAGE_KEY = 'dad-workspace-id';

@Injectable({ providedIn: 'root' })
export class WorkspaceContextService {
  private supabase = inject(SupabaseService);

  readonly activeWorkspaceId = signal<string | null>(
    localStorage.getItem(STORAGE_KEY),
  );

  /**
   * Ping this subject from anywhere that mutates the caller's set of
   * accessible workspaces (create, rename, soft-delete, restore, or a
   * new workspace_members row that the caller became part of). The
   * shell listens and reloads its `workspaces` signal, so the switcher
   * dropdown reflects the change without a page refresh.
   *
   * Fire-and-forget: no payload; consumers just re-fetch.
   */
  readonly workspacesChanged$ = new Subject<void>();

  /** Public helper so features don't have to know about the subject shape. */
  notifyWorkspacesChanged(): void {
    this.workspacesChanged$.next();
  }

  /**
   * Ping this after the caller's own profile changes (full_name, avatar_url,
   * phone). The shell listens and reloads the sidebar user card + avatar
   * so the identity block stays in sync after a save on /profil without
   * a page refresh.
   */
  readonly profileChanged$ = new Subject<void>();

  notifyProfileChanged(): void {
    this.profileChanged$.next();
  }

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
