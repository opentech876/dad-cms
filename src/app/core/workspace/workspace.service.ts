import { Injectable } from '@angular/core';
import { Observable, forkJoin, from, switchMap } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppRole, ManageUserAction, UserListEntry, Workspace, WorkspaceSummary } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
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

  getWorkspaceSummaries(): Observable<WorkspaceSummary[]> {
    const workspaces$ = from(
      this.supabaseService.client.from('workspaces').select('id, name, logo_url'),
    );
    const memberCount$ = from(
      this.supabaseService.client
        .from('workspace_members')
        .select('*', { count: 'exact', head: true }),
    );

    return forkJoin([workspaces$, memberCount$]).pipe(
      map(([{ data: workspaces }, { count }]) =>
        (workspaces ?? []).map((ws) => ({
          id: ws.id,
          name: ws.name,
          logo_url: ws.logo_url ?? null,
          member_count: count ?? 0,
          last_accessed_at: null,
        })),
      ),
    );
  }

  upsertProfile(userId: string, fullName: string, phone: string, avatarUrl?: string): Observable<void> {
    const payload: Record<string, any> = {
      user_id: userId,
      full_name: fullName || null,
      phone: phone || null,
    };
    if (avatarUrl !== undefined) payload['avatar_url'] = avatarUrl;
    return from(
      this.supabaseService.client.from('profiles').upsert(payload, { onConflict: 'user_id' }),
    ).pipe(map(() => undefined));
  }

  getMyProfile(userId: string): Observable<{ full_name: string | null; phone: string | null; avatar_url: string | null } | null> {
    return from(
      this.supabaseService.client
        .from('profiles')
        .select('full_name, phone, avatar_url')
        .eq('user_id', userId)
        .maybeSingle(),
    ).pipe(map(({ data }) => data));
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
    return from(
      this.supabaseService.invoke<{ id: string; email: string }>('invite-user', {
        email,
        role,
        redirectTo: `${environment.appUrl}/dashboard`,
      }),
    ).pipe(
      map(({ error }) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  listUsers(): Observable<UserListEntry[]> {
    return from(this.supabaseService.invoke<UserListEntry[]>('list-users', {})).pipe(
      map(({ data, error }) => (error || !data ? [] : data)),
    );
  }

  manageUser(
    userId: string,
    action: ManageUserAction,
    role?: AppRole,
  ): Observable<{ success: boolean; error?: string }> {
    const body: Record<string, unknown> = { userId, action };
    if (role) body['role'] = role;
    return from(this.supabaseService.invoke<{ success: boolean }>('manage-user', body)).pipe(
      map(({ error }) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }
}
