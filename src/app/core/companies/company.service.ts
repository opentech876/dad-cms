import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Company, CreateCompanyDto } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private supabase = inject(SupabaseService);
  private workspaceContext = inject(WorkspaceContextService);

  /** All non-deleted companies for the active workspace, sorted by name. */
  listCompanies(): Observable<Company[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    let query = this.supabase.client
      .from('companies')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (wsId) query = (query as any).eq('workspace_id', wsId);
    return from(query).pipe(
      map(({ data, error }: any) => (error || !data ? [] : (data as Company[]))),
    );
  }

  /** Distinct non-empty `business_domain` values across the active workspace. */
  listDomains(): Observable<string[]> {
    return this.listCompanies().pipe(
      map(companies => {
        const set = new Set<string>();
        for (const c of companies) {
          if (c.business_domain && c.business_domain.trim()) set.add(c.business_domain.trim());
        }
        return Array.from(set).sort();
      }),
    );
  }

  createCompany(dto: CreateCompanyDto): Observable<{ success: boolean; id?: string; error?: string }> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('companies')
          .insert({
            workspace_id: wsId,
            name: dto.name.trim(),
            type: dto.type,
            business_domain: dto.business_domain ?? null,
            website: dto.website ?? null,
            contact_email: dto.contact_email ?? null,
            contact_phone: dto.contact_phone ?? null,
            notes: dto.notes ?? null,
            logo_url: dto.logo_url ?? null,
            created_by: user?.id ?? null,
          })
          .select('id')
          .single(),
      ) as Promise<{ data: { id: string } | null; error: any }>,
    ).pipe(
      map(({ data, error }) => {
        if (!error) return { success: true, id: data?.id };
        if (error.code === '23505') return { success: false, error: 'duplicate_name' };
        return { success: false, error: error.message };
      }),
    );
  }

  updateCompany(
    id: string,
    patch: Partial<Pick<Company, 'name' | 'type' | 'business_domain' | 'website' | 'contact_email' | 'contact_phone' | 'notes' | 'logo_url'>>,
  ): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('companies')
          .update({ ...patch, updated_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) => {
        if (!error) return { success: true };
        if (error.code === '23505') return { success: false, error: 'duplicate_name' };
        return { success: false, error: error.message };
      }),
    );
  }

  /** Soft-delete via deleted_at + deleted_by. */
  deleteCompany(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('companies')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }
}
