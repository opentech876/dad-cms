import { inject, Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { CampaignTap, DailyActivity, DeviceLog, MonthCoverage } from '../../models';

type DeviceSlice = { id: string; platform: 'ios' | 'android'; registered_at: string; last_seen_at: string | null };
import { SupabaseService } from '../supabase/supabase.service';

export interface DeviceStats {
  total: number;
  android: number;
  ios: number;
}

@Injectable({ providedIn: 'root' })
export class MetriquesService {
  private supabase = inject(SupabaseService);

  getDeviceStats(): Observable<DeviceStats> {
    return from(
      this.supabase.client
        .from('devices')
        .select('id, platform, registered_at, last_seen_at')
        .order('registered_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const devices: DeviceSlice[] = (data ?? []) as DeviceSlice[];
        return {
          total:   devices.length,
          android: devices.filter(d => d.platform === 'android').length,
          ios:     devices.filter(d => d.platform === 'ios').length,
        };
      }),
    );
  }

  getDeviceLogs(): Observable<DeviceLog[]> {
    return from(
      this.supabase.client
        .from('devices_logs')
        .select('id, device_id, action, outcome, error_message, logged_at')
        .order('logged_at', { ascending: false })
        .limit(100),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as DeviceLog[];
      }),
    );
  }

  getCampaignTaps(): Observable<CampaignTap[]> {
    return from(
      this.supabase.client
        .from('ad_campaign_device_views')
        .select('campaign_id, ad_campaigns(name, advertiser)'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const rows: any[] = data ?? [];
        const agg = new Map<string, CampaignTap>();
        for (const row of rows) {
          const existing = agg.get(row.campaign_id);
          if (existing) {
            existing.tap_count++;
          } else {
            agg.set(row.campaign_id, {
              campaign_id:   row.campaign_id,
              campaign_name: row.ad_campaigns?.name ?? '—',
              advertiser:    row.ad_campaigns?.advertiser ?? '—',
              tap_count:     1,
            });
          }
        }
        return Array.from(agg.values()).sort((a, b) => b.tap_count - a.tap_count);
      }),
    );
  }

  getCmsActivity(): Observable<DailyActivity[]> {
    return from(
      this.supabase.client.rpc('get_cms_activity_last30days'),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as DailyActivity[];
      }),
    );
  }

  getCalendarCoverage(): Observable<MonthCoverage[]> {
    return from(
      this.supabase.client.rpc('get_calendar_coverage_by_month', { p_year: new Date().getFullYear() }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as MonthCoverage[];
      }),
    );
  }
}
