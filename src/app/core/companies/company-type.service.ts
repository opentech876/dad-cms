import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { CompanyTypeRow } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

/**
 * CRUD over the workspace-scoped `company_types` lookup — the managed list of
 * advertiser categories. Writes require chef_equipe_commerciale+ (enforced by
 * RLS on the table too). `listTypes()` is resilient: it returns [] if the table
 * isn't there yet (e.g. before the migration is applied), so callers can fall
 * back to defaults instead of crashing.
 */
@Injectable({ providedIn: 'root' })
export class CompanyTypeService {
  private supabase = inject(SupabaseService);
  private workspaceContext = inject(WorkspaceContextService);

  listTypes(): Observable<CompanyTypeRow[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    let query = this.supabase.client
      .from('company_types')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    if (wsId) query = (query as any).eq('workspace_id', wsId);
    return from(query).pipe(
      map(({ data, error }: any) => (error || !data ? [] : (data as CompanyTypeRow[]))),
      catchError(() => of([] as CompanyTypeRow[])),
    );
  }

  createType(label: string, sortOrder = 100): Observable<{ success: boolean; error?: string }> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client.from('company_types').insert({
          workspace_id: wsId,
          label: label.trim(),
          sort_order: sortOrder,
          created_by: user?.id ?? null,
        }),
      ),
    ).pipe(map(({ error }: any) => this._result(error)));
  }

  renameType(id: string, label: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('company_types')
          .update({ label: label.trim(), updated_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(map(({ error }: any) => this._result(error)));
  }

  /** Soft-delete via deleted_at + deleted_by. */
  deleteType(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('company_types')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(map(({ error }: any) => this._result(error)));
  }

  private _result(error: any): { success: boolean; error?: string } {
    if (!error) return { success: true };
    if (error.code === '23505') return { success: false, error: 'duplicate_label' };
    return { success: false, error: error.message };
  }
}
