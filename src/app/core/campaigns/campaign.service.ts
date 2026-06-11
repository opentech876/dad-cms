import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { AdCampaign, CampaignAssignment, CreateCampaignDto } from '../../models';
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
        .select('*')
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
            advertiser: dto.advertiser,
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
    patch: Partial<Pick<AdCampaign, 'name' | 'advertiser' | 'start_date' | 'end_date' | 'position' | 'link_url' | 'active' | 'image_path'>>,
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

  listCampaignAssignments(calendarId: string): Observable<CampaignAssignment[]> {
    return from(
      this.supabase.client
        .from('campaign_assignments')
        .select('*')
        .eq('calendar_id', calendarId)
        .order('event_date', { ascending: true }),
    ).pipe(
      map(({ data, error }: any) => (error || !data ? [] : (data as CampaignAssignment[]))),
    );
  }

  createCampaignAssignment(dto: {
    campaign_id: string;
    calendar_id: string;
    event_date: string;
  }): Observable<{ success: boolean; id?: string; error?: string }> {
    return from(
      this.supabase.client.auth.getUser().then(({ data: { user } }: any) =>
        this.supabase.client
          .from('campaign_assignments')
          .insert({
            campaign_id: dto.campaign_id,
            calendar_id: dto.calendar_id,
            event_date: dto.event_date,
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

  deleteCampaignAssignment(id: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client
        .from('campaign_assignments')
        .delete()
        .eq('id', id),
    ).pipe(
      map(({ error }: any) =>
        error ? { success: false, error: error.message } : { success: true },
      ),
    );
  }
}
