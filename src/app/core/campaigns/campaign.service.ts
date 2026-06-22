import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AdCampaign, CreateCampaignDto } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

@Injectable({ providedIn: 'root' })
export class CampaignService {
  constructor(
    private supabase: SupabaseService,
    private workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * Returns all non-deleted ad campaigns for the active workspace.
   * Paginates with `.range()` to work around Supabase's default
   * `max-rows=1000` PostgREST limit — keeps fetching until a page
   * comes back with fewer than PAGE_SIZE rows.
   */
  listCampaigns(): Observable<AdCampaign[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    const PAGE_SIZE = 1000;

    const fetchPage = (offset: number): Promise<AdCampaign[]> => {
      let query = this.supabase.client
        .from('ad_campaigns')
        .select('*, company:companies(*)')
        .is('deleted_at', null)
        .order('start_date', { ascending: false });
      if (wsId) query = (query as any).eq('workspace_id', wsId);
      return (query as any)
        .range(offset, offset + PAGE_SIZE - 1)
        .then(({ data, error }: any) => (error || !data ? [] : (data as AdCampaign[])));
    };

    const fetchAll = async (): Promise<AdCampaign[]> => {
      const all: AdCampaign[] = [];
      let offset = 0;
      // Cap the loop at 50 pages (50k campaigns) as a defensive guard.
      for (let i = 0; i < 50; i++) {
        const page = await fetchPage(offset);
        all.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      return all;
    };

    return from(fetchAll());
  }

  createCampaign(dto: CreateCampaignDto): Observable<{ success: boolean; id?: string; error?: string }> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('ad_campaigns')
          .insert({
            name: dto.name,
            company_id: dto.company_id,
            start_date: dto.start_date,
            end_date: dto.end_date,
            position: dto.position,
            link_url: dto.link_url ?? null,
            active: dto.active ?? false,
            image_path: dto.image_path ?? '',
            workspace_id: wsId,
            created_by: user?.id ?? null,
          })
          .select('id')
          .single(),
      ) as Promise<{ data: { id: string } | null; error: any }>,
    ).pipe(
      map(({ data, error }) =>
        error ? { success: false, error: error.message } : { success: true, id: data?.id },
      ),
    );
  }

  updateCampaign(
    id: string,
    patch: Partial<Pick<AdCampaign, 'name' | 'company_id' | 'start_date' | 'end_date' | 'position' | 'link_url' | 'active' | 'image_path'>>,
  ): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('ad_campaigns')
          .update({ ...patch, updated_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  deleteCampaign(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('ad_campaigns')
          .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
          .eq('id', id),
      ),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }

  uploadBanner(campaignId: string, file: File): Observable<{ path: string | null; error?: string }> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const storagePath = `${campaignId}/banner.${ext}`;
    return from(
      this.supabase.client.storage
        .from('ads-banners')
        .upload(storagePath, file, { upsert: true }),
    ).pipe(
      map(({ data, error }: any) =>
        error ? { path: null, error: error.message } : { path: (data?.path as string) ?? storagePath },
      ),
    );
  }

  getBannerUrl(storagePath: string): string {
    return this.supabase.client.storage
      .from('ads-banners')
      .getPublicUrl(storagePath).data.publicUrl;
  }

  // ── Validation workflow (Round 3) ───────────────────────────────────────

  /** Records advertiser payment. Server-side: chef_equipe_commerciale + owner only. Idempotent. */
  markPaid(campaignId: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.rpc('mark_campaign_paid', { p_campaign_id: campaignId }),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: this._mapValidationError(error) } : { success: true },
      ),
    );
  }

  /** Records manager confirmation. Server-side: chef_equipe_commerciale + owner only. Idempotent. */
  confirmCampaign(campaignId: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.rpc('confirm_campaign', { p_campaign_id: campaignId }),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: this._mapValidationError(error) } : { success: true },
      ),
    );
  }

  /** Reverts a previous "paid" flip. Owner only (corrections). */
  unmarkPaid(campaignId: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.rpc('unmark_campaign_paid', { p_campaign_id: campaignId }),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: this._mapValidationError(error) } : { success: true },
      ),
    );
  }

  /** Reverts a previous "manager confirmed" flip. Owner only (corrections). */
  unconfirmCampaign(campaignId: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.rpc('unconfirm_campaign', { p_campaign_id: campaignId }),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: this._mapValidationError(error) } : { success: true },
      ),
    );
  }

  private _mapValidationError(error: { code?: string; message?: string }): string {
    if (error?.code === '42501' || error?.message?.includes('insufficient_privilege')) {
      return 'Vous n\'avez pas les droits pour cette action.';
    }
    if (error?.code === 'P0002' || error?.message?.includes('campaign_not_found')) {
      return 'Campagne introuvable.';
    }
    return error?.message ?? 'Erreur inconnue.';
  }

  /**
   * Returns active campaigns in the active workspace whose date range
   * intersects the given range. Used by the campaign editor to warn the
   * user before overriding an existing campaign on overlapping days.
   * Pass `excludeId` when editing an existing campaign to skip itself.
   *
   * The position column is left at its DB default of 'footer' for every
   * row, so the filter is implicit; the CMS does not surface position.
   */
  findOverlappingCampaigns(
    start: string,
    end: string,
    excludeId?: string,
  ): Observable<AdCampaign[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    let query = this.supabase.client
      .from('ad_campaigns')
      .select('*, company:companies(*)')
      .is('deleted_at', null)
      .eq('active', true)
      .lte('start_date', end)
      .gte('end_date', start)
      .order('start_date', { ascending: true });
    if (wsId) query = (query as any).eq('workspace_id', wsId);
    if (excludeId) query = (query as any).neq('id', excludeId);
    return from(query).pipe(
      map(({ data, error }: any) => (error || !data ? [] : (data as AdCampaign[]))),
    );
  }
}
