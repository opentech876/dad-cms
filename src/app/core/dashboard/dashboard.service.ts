import { inject, Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';
import { MONTHS_FR_LONG_CAP } from '../utils/date.utils';

/** A day within the next 30 with no event assigned (mobile shows nothing). */
export interface GapDay {
  date: string; // 'YYYY-MM-DD'
  daysUntil: number; // 0 = today
}

/** What the mobile app actually shows for the year — computed from the
 *  published calendar's entries, never from the events library. */
export interface YearContentStats {
  /** Distinct events assigned in the published calendar of the year. */
  mobileEvents: number;
  /** Distinct days of the year with at least one assigned event. */
  filledDays: number;
  /** Days within the next 30 (current year only) with no event at all. */
  emptyNext30: GapDay[];
}

/** The single campaign airing today — one ad at a time (footer slot). */
export interface CurrentAd {
  campaignName: string;
  companyName: string;
  endDate: string; // 'YYYY-MM-DD'
}

export interface MonthAdSales {
  month: number; // 1..12
  soldDays: number; // distinct days of the month covered by a validated campaign
  totalDays: number;
}

/** One day of the 30-day sales outlook. */
export interface AdDay {
  date: string; // 'YYYY-MM-DD'
  sold: boolean;
  daysUntil: number; // 0 = today
}

/** Commercial outlook for the year, from validated + active campaigns.
 *  Days are booleans — the app runs a single ad per day (no positions). */
export interface AdOutlook {
  currentAd: CurrentAd | null;
  soldDaysYear: number;
  salesByMonth: MonthAdSales[]; // always 12 rows
  next30: AdDay[]; // today + 29 following days
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

interface CampaignRange {
  name: string;
  start_date: string;
  end_date: string;
  company: { name: string } | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private supabase = inject(SupabaseService);
  private workspaceContext = inject(WorkspaceContextService);

  private toISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Local date i days from today at midnight. */
  private dayFromToday(i: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
  }

  getYearContentStats(year: number): Observable<YearContentStats> {
    const db = this.supabase.client;
    const wsId = this.workspaceContext.activeWorkspaceId();

    return from(
      (async (): Promise<YearContentStats> => {
        let calQuery = db
          .from('calendars')
          .select('id')
          .eq('year', year)
          .eq('status', 'published')
          .is('deleted_at', null);
        if (wsId) calQuery = calQuery.eq('workspace_id', wsId);
        const { data: cal } = await calQuery.maybeSingle();

        const mmddSet = new Set<string>();
        const eventSet = new Set<string>();
        if (cal) {
          const { data: entries } = await db
            .from('calendar_entries')
            .select('mmdd, event_id, event:events(deleted_at)')
            .eq('calendar_id', cal.id);
          for (const row of (entries as any[] | null) ?? []) {
            if (!row.event || row.event.deleted_at !== null) continue;
            mmddSet.add(row.mmdd);
            eventSet.add(row.event_id);
          }
        }

        // Gap scan is clamped to the requested year: each calendar covers one
        // year, so late-December windows simply shrink instead of guessing
        // about a next-year calendar that may not exist yet.
        const emptyNext30: GapDay[] = [];
        for (let i = 0; i < 30; i++) {
          const d = this.dayFromToday(i);
          if (d.getFullYear() !== year) continue;
          const mmdd = this.toISO(d).slice(5);
          if (!mmddSet.has(mmdd)) emptyNext30.push({ date: this.toISO(d), daysUntil: i });
        }

        return { mobileEvents: eventSet.size, filledDays: mmddSet.size, emptyNext30 };
      })(),
    );
  }

  getAdOutlook(year: number): Observable<AdOutlook> {
    const db = this.supabase.client;
    const wsId = this.workspaceContext.activeWorkspaceId();

    return from(
      (async (): Promise<AdOutlook> => {
        const todayISO = this.toISO(this.dayFromToday(0));
        const windowEnd = this.toISO(this.dayFromToday(29));
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        // Fetch every campaign overlapping the year OR the 30-day window, so a
        // window crossing New Year still sees next-year bookings.
        const fetchMax = windowEnd > yearEnd ? windowEnd : yearEnd;

        let query = db
          .from('ad_campaigns')
          .select('name, start_date, end_date, company:companies(name)')
          .eq('active', true)
          .not('validated_at', 'is', null)
          .is('deleted_at', null)
          .gte('end_date', yearStart)
          .lte('start_date', fetchMax);
        if (wsId) query = query.eq('workspace_id', wsId);
        const { data } = await query;
        const campaigns = ((data as any[] | null) ?? []) as CampaignRange[];

        // Distinct sold days within the year (overlaps counted once).
        const sold = new Set<string>();
        for (const c of campaigns) {
          const first = c.start_date > yearStart ? c.start_date : yearStart;
          const last = c.end_date < yearEnd ? c.end_date : yearEnd;
          for (let d = this.parseISO(first); this.toISO(d) <= last; d.setDate(d.getDate() + 1)) {
            sold.add(this.toISO(d));
          }
        }

        const salesByMonth: MonthAdSales[] = [];
        for (let m = 1; m <= 12; m++) {
          const totalDays = new Date(year, m, 0).getDate();
          let soldDays = 0;
          for (const iso of sold) if (Number(iso.slice(5, 7)) === m) soldDays++;
          salesByMonth.push({ month: m, soldDays, totalDays });
        }

        const airing =
          campaigns.find((c) => c.start_date <= todayISO && c.end_date >= todayISO) ?? null;
        const currentAd: CurrentAd | null = airing
          ? {
              campaignName: airing.name,
              companyName: airing.company?.name ?? '—',
              endDate: airing.end_date,
            }
          : null;

        const next30: AdDay[] = [];
        for (let i = 0; i < 30; i++) {
          const iso = this.toISO(this.dayFromToday(i));
          next30.push({
            date: iso,
            daysUntil: i,
            sold: campaigns.some((c) => c.start_date <= iso && c.end_date >= iso),
          });
        }

        return { currentAd, soldDaysYear: sold.size, salesByMonth, next30 };
      })(),
    );
  }

  private parseISO(iso: string): Date {
    return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  }

  getFeaturedEvent(year: number): Observable<FeaturedEvent | null> {
    const db = this.supabase.client;
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayDay = String(now.getDate()).padStart(2, '0');
    const todayMonth = MONTHS_FR_LONG_CAP[now.getMonth()];

    return from(
      db
        .from('calendars')
        .select('id')
        .eq('year', year)
        .eq('status', 'published')
        .is('deleted_at', null)
        .maybeSingle()
        .then(async ({ data: cal }: any) => {
          if (!cal) return null;
          const { data: entries } = await db
            .from('calendar_entries')
            .select('position, event:events(title, description, event_date, deleted_at)')
            .eq('calendar_id', cal.id)
            .eq('mmdd', mmdd)
            .order('position', { ascending: true });

          const rows = ((entries as any[] | null) ?? []).filter(
            (r: any) => r.event && r.event.deleted_at === null,
          );
          const primary = rows.find((r: any) => r.position === 1);
          if (!primary?.event) return null;
          const secondary = rows.find((r: any) => r.position === 2);
          const ev = primary.event;
          const desc: string = ev.description ?? '';
          return {
            title: ev.title,
            dropLetter: desc.charAt(0),
            excerpt: desc.slice(1),
            day: todayDay,
            month: todayMonth,
            year: String(year),
            also: secondary?.event?.title ?? '',
          } satisfies FeaturedEvent;
        }),
    );
  }
}
