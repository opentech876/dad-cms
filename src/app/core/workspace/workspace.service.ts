import { Injectable } from '@angular/core';
import { Observable, from, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppRole, ManageUserAction, UserListEntry, Workspace, WorkspaceSummary } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from './workspace-context.service';
import { environment } from '../../../environments/environment';
import { inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private workspaceContext = inject(WorkspaceContextService);
  constructor(private supabaseService: SupabaseService) {}

  hasWorkspace(): Observable<boolean> {
    return from(
      this.supabaseService.client
        .from('workspaces')
        .select('id', { count: 'exact', head: true }),
    ).pipe(map(({ count }) => (count ?? 0) > 0));
  }

  getWorkspaces(): Observable<Workspace[]> {
    return from(
      this.supabaseService.client.from('workspaces').select('id, name, logo_url, created_at, updated_at'),
    ).pipe(map(({ data }) => (data as Workspace[]) ?? []));
  }

  /**
   * Returns the caller's workspace list with accurate per-workspace member
   * counts via the `get_my_workspace_summaries()` RPC. Replaces the previous
   * client-side double-query which applied one global member count to every
   * row.
   */
  getWorkspaceSummaries(): Observable<WorkspaceSummary[]> {
    return from(this.supabaseService.client.rpc('get_my_workspace_summaries')).pipe(
      map(({ data }: any) =>
        (data ?? []).map((ws: any) => ({
          id: ws.id,
          name: ws.name,
          logo_url: ws.logo_url ?? null,
          member_count: ws.member_count ?? 0,
          last_accessed_at: ws.last_accessed_at ?? null,
        }) as WorkspaceSummary),
      ),
    );
  }

  /**
   * All three profile methods are workspace-scoped. The active workspace
   * defaults to `WorkspaceContextService.activeWorkspaceId()` when no
   * explicit workspace_id is passed. Returns / writes to the row keyed by
   * (user_id, workspace_id) — same user can have different name / phone /
   * avatar per workspace.
   */
  private resolveWorkspaceId(explicit?: string | null): string | null {
    return explicit ?? this.workspaceContext.activeWorkspaceId();
  }

  upsertProfile(userId: string, fullName: string, phone: string, avatarUrl?: string, workspaceId?: string | null): Observable<void> {
    const workspace_id = this.resolveWorkspaceId(workspaceId);
    if (!workspace_id) return from(Promise.resolve(undefined));
    const payload: Record<string, any> = {
      user_id: userId,
      workspace_id,
      full_name: fullName || null,
      phone: phone || null,
    };
    if (avatarUrl !== undefined) payload['avatar_url'] = avatarUrl;
    return from(
      this.supabaseService.client.from('profiles').upsert(payload, { onConflict: 'user_id,workspace_id' }),
    ).pipe(map(() => undefined));
  }

  getMyProfile(userId: string, workspaceId?: string | null): Observable<{ full_name: string | null; phone: string | null; avatar_url: string | null } | null> {
    const workspace_id = this.resolveWorkspaceId(workspaceId);
    if (!workspace_id) return from(Promise.resolve(null));
    return from(
      this.supabaseService.client
        .from('profiles')
        .select('full_name, phone, avatar_url')
        .eq('user_id', userId)
        .eq('workspace_id', workspace_id)
        .maybeSingle(),
    ).pipe(map(({ data }) => data));
  }

  saveAppearance(userId: string, theme: string, colorMode: string, workspaceId?: string | null): Observable<void> {
    const workspace_id = this.resolveWorkspaceId(workspaceId);
    if (!workspace_id) return from(Promise.resolve(undefined));
    return from(
      this.supabaseService.client
        .from('profiles')
        .upsert({ user_id: userId, workspace_id, theme, color_mode: colorMode }, { onConflict: 'user_id,workspace_id' }),
    ).pipe(map(() => undefined));
  }

  updateWorkspace(id: string, name: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabaseService.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabaseService.client
          .from('workspaces')
          .update({ name, updated_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  uploadAvatar(userId: string, file: File, workspaceId?: string | null): Observable<{ success: boolean; avatarUrl?: string; error?: string }> {
    const workspace_id = this.resolveWorkspaceId(workspaceId);
    if (!workspace_id) {
      return from(Promise.resolve({ success: false, error: 'Aucun espace de travail actif' }));
    }
    // Store the avatar under a per-workspace path so a user can have a different
    // avatar per tenant. Old path was `${userId}/avatar.ext` (single avatar
    // shared across workspaces); new path is `${userId}/${workspace_id}/avatar.ext`.
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const storagePath = `${userId}/${workspace_id}/avatar.${ext}`;
    return from(
      this.supabaseService.client.storage
        .from('avatars')
        .upload(storagePath, file, { upsert: true }),
    ).pipe(
      switchMap(({ data, error }: any) => {
        if (error) return [{ success: false, error: error.message as string }];
        const avatarUrl = this.supabaseService.client.storage
          .from('avatars')
          .getPublicUrl(data!.path).data.publicUrl;
        return from(
          this.supabaseService.client
            .from('profiles')
            .upsert({ user_id: userId, workspace_id, avatar_url: avatarUrl }, { onConflict: 'user_id,workspace_id' }),
        ).pipe(
          map(({ error: dbErr }: any) =>
            dbErr ? { success: false, error: dbErr.message as string } : { success: true, avatarUrl },
          ),
        );
      }),
    );
  }

  uploadLogo(workspaceId: string, file: File): Observable<{ success: boolean; logoUrl?: string; error?: string }> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const storagePath = `${workspaceId}/logo.${ext}`;
    return from(
      this.supabaseService.client.storage
        .from('workspace-logos')
        .upload(storagePath, file, { upsert: true }),
    ).pipe(
      switchMap(({ data, error }: any) => {
        if (error) return [{ success: false, error: error.message as string }];
        const logoUrl = this.supabaseService.client.storage
          .from('workspace-logos')
          .getPublicUrl(data!.path).data.publicUrl;
        return from(
          this.supabaseService.client.auth.getUser().then(({ data: { user } }: any) =>
            this.supabaseService.client
              .from('workspaces')
              .update({ logo_url: logoUrl, updated_by: user?.id ?? null })
              .eq('id', workspaceId),
          ),
        ).pipe(
          map(({ error: dbErr }: any) =>
            dbErr ? { success: false, error: dbErr.message as string } : { success: true, logoUrl },
          ),
        );
      }),
    );
  }

  createWorkspace(
    name: string,
    fullName?: string,
    phone?: string,
  ): Observable<{ success: boolean; workspaceId?: string; error?: any }> {
    return from(
      this.supabaseService.invoke<{ workspace: string }>('create-workspace', { name, fullName, phone }),
    ).pipe(
      map(({ data, error }) => {
        if (error) return { success: false, error };
        return { success: true, workspaceId: data?.workspace };
      }),
    );
  }

  inviteUser(email: string, role: AppRole): Observable<{ success: boolean; error?: string }> {
    const workspace_id = this.workspaceContext.activeWorkspaceId();
    if (!workspace_id) {
      return from(Promise.resolve({ success: false, error: "Aucun espace de travail actif" }));
    }
    return from(
      this.supabaseService.invoke<{ id: string; email: string }>('invite-user', {
        email,
        role,
        workspace_id,
        redirectTo: `${environment.appUrl}/dashboard`,
      }),
    ).pipe(
      map(({ error }) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  listUsers(): Observable<UserListEntry[]> {
    const workspace_id = this.workspaceContext.activeWorkspaceId();
    if (!workspace_id) return from(Promise.resolve([] as UserListEntry[]));
    return from(this.supabaseService.invoke<UserListEntry[]>('list-users', { workspace_id })).pipe(
      map(({ data, error }) => (error || !data ? [] : data)),
    );
  }

  manageUser(
    userId: string,
    action: ManageUserAction,
    role?: AppRole,
    password?: string,
  ): Observable<{ success: boolean; error?: string }> {
    const workspace_id = this.workspaceContext.activeWorkspaceId();
    if (!workspace_id) {
      return from(Promise.resolve({ success: false, error: "Aucun espace de travail actif" }));
    }
    const body: Record<string, unknown> = { userId, action, workspace_id };
    if (role) body['role'] = role;
    if (password) body['password'] = password;
    return from(this.supabaseService.invoke<{ success: boolean }>('manage-user', body)).pipe(
      map(({ error }) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }
}
