import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';

interface KpiStats {
  totalEvents: number;
  publishedCalendars: number;
  activeCampaigns: number;
  yearEvents: number;
}

interface SparkPoints { pts: string; area: string; cx: number; cy: number; }
interface AdRow { name: string; advertiser: string; position: 'header' | 'footer'; impressions: string; clicks: string; ctr: string; period: string; }

interface FeaturedEvent {
  title: string;
  dropLetter: string;
  excerpt: string;
  day: string;
  month: string;
  year: string;
  also: string;
}

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private supabase = inject(SupabaseService);

  readonly loading = signal(true);
  readonly stats = signal<KpiStats>({
    totalEvents: 0,
    publishedCalendars: 0,
    activeCampaigns: 0,
    yearEvents: 0,
  });

  readonly currentYear = new Date().getFullYear();
  readonly todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  readonly featuredEvent = signal<FeaturedEvent>({
    title: '', dropLetter: '', excerpt: '', day: '--', month: '---', year: '----', also: '',
  });
  readonly featuredEventLoading = signal(true);

  readonly fillRate = computed(() => {
    const maxSlots = 365 * 2;
    return Math.round((this.stats().yearEvents / maxSlots) * 100);
  });

  private buildSparkline(data: number[], w = 120, h = 36): SparkPoints {
    const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
    const ptsArr = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`);
    const pts = ptsArr.join(' ');
    const lastV = data[data.length - 1];
    return { pts, area: `0,${h} ${pts} ${w},${h}`, cx: w, cy: h - ((lastV - min) / span) * (h - 4) - 2 };
  }

  readonly sparkEvents    = this.buildSparkline([12,18,14,22,30,28,35,42,38,45,52,48,55,62]);
  readonly sparkCoverage  = this.buildSparkline([40,42,45,48,50,53,55,58,60,62,64,65,66,67]);
  readonly sparkCampaigns = this.buildSparkline([3,4,5,5,6,6,5,5,4,4,5,5,4,4]);
  readonly sparkReaders   = this.buildSparkline([8,9,10,11,12,11,12,12,13,14,12,12,13,12]);

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

  readonly adPerformance: AdRow[] = [
    { name: 'Forfait étudiant', advertiser: 'MTN Congo',    position: 'header', impressions: '184 220', clicks: '3 412', ctr: '1,85 %', period: '01/04 → 30/06'            },
    { name: 'Tontine+',        advertiser: 'SG Congo',      position: 'footer', impressions: '142 008', clicks: '1 977', ctr: '1,39 %', period: '15/03 → 15/05'            },
    { name: 'Stations',        advertiser: 'TotalEnergies', position: 'footer', impressions: '98 442',  clicks: '1 102', ctr: '1,12 %', period: '01/01 → 31/03'            },
    { name: "Ngok'",           advertiser: 'BraCongo',      position: 'header', impressions: '0',       clicks: '0',     ctr: '—',      period: '10/05 → 10/07 · planifié' },
  ];

  async ngOnInit(): Promise<void> {
    const db = this.supabase.client;
    const year = this.currentYear;

    const [eventsRes, calendarsRes, campaignsRes, yearEventsRes] = await Promise.all([
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
    ]);

    this.stats.set({
      totalEvents: eventsRes.count ?? 0,
      publishedCalendars: calendarsRes.count ?? 0,
      activeCampaigns: campaignsRes.count ?? 0,
      yearEvents: yearEventsRes.count ?? 0,
    });
    this.loading.set(false);

    await this._loadFeaturedEvent(db, year);
  }

  private async _loadFeaturedEvent(db: any, year: number): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: cal } = await db
      .from('calendars')
      .select('id')
      .eq('year', year)
      .eq('status', 'published')
      .is('deleted_at', null)
      .maybeSingle();

    if (!cal) { this.featuredEventLoading.set(false); return; }  // no published calendar for this year

    const { data: events } = await db
      .from('events')
      .select('title, description, event_date, position')
      .eq('calendar_id', cal.id)
      .eq('event_date', todayStr)
      .is('deleted_at', null)
      .order('position', { ascending: true });

    const primary = (events as any[] | null)?.find((e: any) => e.position === 1);
    if (!primary) { this.featuredEventLoading.set(false); return; }

    const secondary = (events as any[]).find((e: any) => e.position === 2);
    const desc: string = primary.description ?? '';
    const dateParts = (primary.event_date as string).split('-');
    const monthIndex = parseInt(dateParts[1], 10) - 1;

    this.featuredEvent.set({
      title: primary.title,
      dropLetter: desc.charAt(0),
      excerpt: desc.slice(1),
      day: dateParts[2],
      month: MONTHS_FR[monthIndex] ?? '',
      year: dateParts[0],
      also: secondary ? secondary.title : '',
    });
    this.featuredEventLoading.set(false);
  }
}
