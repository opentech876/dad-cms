import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { MONTHS_FR_LONG_CAP } from '../utils/date.utils';

export interface KpiStats {
  totalEvents: number;
  publishedCalendars: number;
  activeCampaigns: number;
  yearEvents: number;
  pendingValidations: number;
  activeCompanies: number;
}

export interface FeaturedEvent {
  title: string;
  dropLetter: string;
  excerpt: string;
  day: string;
  month: string;
  year: string;
  also: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private supabase: SupabaseService) {}

  getKpiStats(year: number, activeCompaniesCount: number): Observable<KpiStats> {
    const db = this.supabase.client;
    return from(
      Promise.all([
        db.from('events').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        db.from('calendars').select('*', { count: 'exact', head: true }).eq('status', 'published').is('deleted_at', null),
        db.from('ad_campaigns').select('*', { count: 'exact', head: true }).eq('active', true).is('deleted_at', null),
        db.from('events').select('*', { count: 'exact', head: true })
          .gte('event_date', `${year}-01-01`)
          .lte('event_date', `${year}-12-31`)
          .is('deleted_at', null),
        db.from('ad_campaigns').select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .is('validated_at', null),
      ]).then(([eventsRes, calendarsRes, campaignsRes, yearEventsRes, pendingValRes]) => ({
        totalEvents:         eventsRes.count ?? 0,
        publishedCalendars:  calendarsRes.count ?? 0,
        activeCampaigns:     campaignsRes.count ?? 0,
        yearEvents:          yearEventsRes.count ?? 0,
        pendingValidations:  pendingValRes.count ?? 0,
        activeCompanies:     activeCompaniesCount,
      })),
    );
  }

  getFeaturedEvent(year: number): Observable<FeaturedEvent | null> {
    const db = this.supabase.client;
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayDay   = String(now.getDate()).padStart(2, '0');
    const todayMonth = MONTHS_FR_LONG_CAP[now.getMonth()];

    return from(
      db.from('calendars').select('id').eq('year', year).eq('status', 'published')
        .is('deleted_at', null).maybeSingle()
        .then(async ({ data: cal }: any) => {
          if (!cal) return null;
          const { data: entries } = await db
            .from('calendar_entries')
            .select('position, event:events(title, description, event_date, deleted_at)')
            .eq('calendar_id', cal.id)
            .eq('mmdd', mmdd)
            .order('position', { ascending: true });

          const rows = ((entries as any[] | null) ?? [])
            .filter((r: any) => r.event && r.event.deleted_at === null);
          const primary   = rows.find((r: any) => r.position === 1);
          if (!primary?.event) return null;
          const secondary = rows.find((r: any) => r.position === 2);
          const ev        = primary.event;
          const desc: string = ev.description ?? '';
          return {
            title:       ev.title,
            dropLetter:  desc.charAt(0),
            excerpt:     desc.slice(1),
            day:         todayDay,
            month:       todayMonth,
            year:        String(year),
            also:        secondary?.event?.title ?? '',
          } satisfies FeaturedEvent;
        }),
    );
  }
}
