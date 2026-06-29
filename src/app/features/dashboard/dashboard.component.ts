import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { CompanyService } from '../../core/companies/company.service';
import { MetriquesService } from '../../core/metriques/metriques.service';
import { MONTHS_FR_LONG_CAP, formatDateShort } from '../../core/utils/date.utils';
import { CampaignTap } from '../../models';

interface KpiStats {
  totalEvents: number;
  publishedCalendars: number;
  activeCampaigns: number;
  yearEvents: number;
  pendingValidations: number;
  activeCompanies: number;
}

interface AdPerformanceRow {
  campaignId: string;
  name: string;
  advertiser: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  period: string;
}

interface FeaturedEvent {
  title: string;
  dropLetter: string;
  excerpt: string;
  day: string;
  month: string;
  year: string;
  also: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DecimalPipe, PercentPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private supabase         = inject(SupabaseService);
  private campaignService  = inject(CampaignService);
  private companyService   = inject(CompanyService);
  private metriquesService = inject(MetriquesService);

  readonly loading = signal(true);
  readonly stats = signal<KpiStats>({
    totalEvents: 0,
    publishedCalendars: 0,
    activeCampaigns: 0,
    yearEvents: 0,
    pendingValidations: 0,
    activeCompanies: 0,
  });

  /** Real top-5 ad performers by impressions, joined with campaign + company data. */
  readonly topAdPerformers = signal<AdPerformanceRow[]>([]);

  readonly currentYear = new Date().getFullYear();
  readonly todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  // Used by the hero's empty-state right-side preview.
  readonly todayDayNum   = String(new Date().getDate()).padStart(2, '0');
  readonly todayMonthCap = MONTHS_FR_LONG_CAP[new Date().getMonth()];

  readonly featuredEvent = signal<FeaturedEvent>({
    title: '', dropLetter: '', excerpt: '', day: '--', month: '---', year: '----', also: '',
  });
  readonly featuredEventLoading = signal(true);

  /** True once we know there's an event published for today on mobile. */
  readonly hasFeaturedEvent = computed(() => this.featuredEvent().title.length > 0);

  readonly fillRate = computed(() => {
    const maxSlots = 365 * 2;
    return Math.round((this.stats().yearEvents / maxSlots) * 100);
  });

  readonly activityFeed = [
    { id: 1, initials: 'AB', who: 'Aïcha Bemba',     action: 'a publié',    target: 'Indépendance de la République du Congo', meta: 'Calendrier 2025 · 15 août',     time: 'Il y a 8 min'  },
    { id: 2, initials: 'SM', who: 'Sylvie Mbembé',    action: 'a assigné',   target: 'MTN Forfait étudiant',                  meta: '91 dates · Avril → Juin 2026',  time: 'Il y a 32 min' },
    { id: 3, initials: 'TM', who: 'Théodore Makosso', action: 'a modifié',   target: 'Conférence nationale souveraine',       meta: 'Calendrier 2025 · 10 mars',     time: 'Il y a 1 h'   },
    { id: 4, initials: 'EO', who: 'Elvis Olembe',     action: 'a dupliqué',  target: 'Calendrier 2025 → 2026',                meta: '243 événements · 12 campagnes', time: 'Il y a 3 h'   },
    { id: 5, initials: 'AB', who: 'Aïcha Bemba',      action: 'a réordonné', target: 'Événements du 28 novembre',             meta: '2 événements',                  time: 'Hier · 18:42' },
  ];

  readonly coverageBars = [78,72,85,68,90,82,75,88,70,65,72,55].map((pct, i) => ({
    pct,
    label: ['J','F','M','A','M','J','J','A','S','O','N','D'][i],
    current: i === new Date().getMonth(),
  }));

  readonly publicationTodos = [
    { icon: '⚠️', text: '4 dates sans événement',  meta: '14 fév · 22 mars · 3 mai · 18 sept', bg: 'var(--warning-soft)', fg: 'var(--warning)' },
    { icon: '🖼️', text: '12 images en attente',    meta: 'Compresser à 800×600 / ≤150 Ko',      bg: 'var(--info-soft)',    fg: 'var(--info)'    },
    { icon: '📢', text: '3 campagnes à approuver', meta: 'Demande de Sylvie Mbembé',             bg: 'var(--accent-soft)', fg: 'var(--accent)'  },
  ];

  async ngOnInit(): Promise<void> {
    const db = this.supabase.client;
    const year = this.currentYear;

    const [eventsRes, calendarsRes, campaignsRes, yearEventsRes, pendingValRes] = await Promise.all([
      db.from('events').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      db
        .from('calendars')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .is('deleted_at', null),
      db
        .from('ad_campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('active', true)
        .is('deleted_at', null),
      db
        .from('events')
        .select('*', { count: 'exact', head: true })
        .gte('event_date', `${year}-01-01`)
        .lte('event_date', `${year}-12-31`)
        .is('deleted_at', null),
      db
        .from('ad_campaigns')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .is('validated_at', null),
    ]);

    // Companies + top ad performers in parallel.
    const [companies, taps] = await Promise.all([
      firstValueFrom(this.companyService.listCompanies()),
      firstValueFrom(this.metriquesService.getCampaignTaps()),
    ]);

    this.stats.set({
      totalEvents: eventsRes.count ?? 0,
      publishedCalendars: calendarsRes.count ?? 0,
      activeCampaigns: campaignsRes.count ?? 0,
      yearEvents: yearEventsRes.count ?? 0,
      pendingValidations: pendingValRes.count ?? 0,
      activeCompanies: companies.length,
    });

    await this._loadTopAdPerformers(taps);

    this.loading.set(false);
    await this._loadFeaturedEvent(db, year);
  }

  private async _loadTopAdPerformers(taps: CampaignTap[]): Promise<void> {
    const top5 = taps.slice(0, 5);
    if (top5.length === 0) {
      this.topAdPerformers.set([]);
      return;
    }
    const ids = top5.map(t => t.campaign_id);
    const { data } = await this.supabase.client
      .from('ad_campaigns')
      .select('id, start_date, end_date')
      .in('id', ids);
    const dateMap = new Map<string, { start_date: string; end_date: string }>();
    for (const r of (data ?? []) as any[]) dateMap.set(r.id, { start_date: r.start_date, end_date: r.end_date });

    this.topAdPerformers.set(top5.map(t => {
      const dates = dateMap.get(t.campaign_id);
      const period = dates
        ? `${formatDateShort(dates.start_date)} → ${formatDateShort(dates.end_date)}`
        : '—';
      return {
        campaignId: t.campaign_id,
        name: t.campaign_name,
        advertiser: t.advertiser,
        impressions: t.tap_count,
        clicks: t.click_count,
        ctr: t.ctr,
        period,
      };
    }));
  }

  private async _loadFeaturedEvent(db: any, year: number): Promise<void> {
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { data: cal } = await db
      .from('calendars')
      .select('id')
      .eq('year', year)
      .eq('status', 'published')
      .is('deleted_at', null)
      .maybeSingle();

    if (!cal) { this.featuredEventLoading.set(false); return; }

    // Same source as mobile's get_today_content RPC — calendar_entries joined to events.
    // Soft-deleted events are filtered client-side to mirror the RPC's `e.deleted_at IS NULL`.
    const { data: entries } = await db
      .from('calendar_entries')
      .select('position, event:events(title, description, event_date, deleted_at)')
      .eq('calendar_id', cal.id)
      .eq('mmdd', mmdd)
      .order('position', { ascending: true });

    const rows = ((entries as any[] | null) ?? []).filter(r => r.event && r.event.deleted_at === null);
    const primary = rows.find(r => r.position === 1);
    if (!primary?.event) { this.featuredEventLoading.set(false); return; }

    const secondary = rows.find(r => r.position === 2);
    const ev = primary.event;
    const desc: string = ev.description ?? '';

    // Right-side preview shows TODAY's date (the day this event is published on mobile),
    // not the event's historical event_date — those are intentionally different fields.
    this.featuredEvent.set({
      title: ev.title,
      dropLetter: desc.charAt(0),
      excerpt: desc.slice(1),
      day: this.todayDayNum,
      month: this.todayMonthCap,
      year: String(year),
      also: secondary?.event?.title ?? '',
    });
    this.featuredEventLoading.set(false);
  }
}
