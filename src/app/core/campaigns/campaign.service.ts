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

  listCampaigns(): Observable<AdCampaign[]> {
    const wsId = this.workspaceContext.activeWorkspaceId();
    let query = this.supabase.client
      .from('ad_campaigns')
      .select('*')
      .is('deleted_at', null)
      .order('start_date', { ascending: false });
    if (wsId) query = (query as any).eq('workspace_id', wsId);
    return from(query).pipe(
      map(({ data, error }: any) => (error || !data ? [] : (data as AdCampaign[]))),
    );
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
