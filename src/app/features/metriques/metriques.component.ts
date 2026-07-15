import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, PercentPipe, SlicePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { CampaignTap, DailyActivity, DeviceLog } from '../../models';
import { MetriquesService, DeviceStats } from '../../core/metriques/metriques.service';
import {
  AdvertiserExposure,
  InsightsService,
  MetricsExtraStats,
} from '../../core/insights/insights.service';

const MONTH_LABELS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Jun',
  'Jul',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

@Component({
  selector: 'app-metriques',
  standalone: true,
  imports: [TuiIcon, DecimalPipe, PercentPipe, SlicePipe],
  templateUrl: './metriques.component.html',
  styleUrl: './metriques.component.scss',
})
export class MetriquesComponent implements OnInit {
  private metriquesService = inject(MetriquesService);
  private insightsService = inject(InsightsService);

  readonly currentYear = new Date().getFullYear();
  readonly loading = signal(true);
  readonly deviceStats = signal<DeviceStats>({ total: 0, android: 0, ios: 0 });
  readonly deviceLogs = signal<DeviceLog[]>([]);
  readonly campaignTaps = signal<CampaignTap[]>([]);
  readonly cmsActivity = signal<DailyActivity[]>([]);
  readonly extras = signal<MetricsExtraStats | null>(null);

  readonly totalTaps = computed(() => this.campaignTaps().reduce((s, t) => s + t.tap_count, 0));

  /** Sum of impressions across all campaigns (= sum of tap_count). */
  readonly totalImpressions = this.totalTaps;

  /** Sum of clicks across all campaigns. */
  readonly totalClicks = computed(() => this.campaignTaps().reduce((s, t) => s + t.click_count, 0));

  /** Aggregate CTR — null when there are no impressions yet. */
  readonly globalCtr = computed<number | null>(() => {
    const impr = this.totalImpressions();
    if (impr === 0) return null;
    return this.totalClicks() / impr;
  });

  // ── Log action breakdown ──────────────────────────────────────
  readonly logBreakdown = computed(() => {
    const logs = this.deviceLogs();
    const map = new Map<string, { action: string; count: number; success: number }>();
    for (const l of logs) {
      const entry = map.get(l.action) ?? { action: l.action, count: 0, success: 0 };
      entry.count++;
      if (l.outcome === 'success') entry.success++;
      map.set(l.action, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  });

  // ── SVG chart helpers ─────────────────────────────────────────

  readonly activityPoints = computed(() => {
    const data = this.cmsActivity();
    if (data.length === 0) return { polyline: '', area: '', max: 0, points: [] };
    const max = Math.max(...data.map((d) => d.count));
    const w = 560;
    const h = 80;
    const pad = 4;
    const pts = data.map((d, i) => ({
      x: pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2),
      y: h - pad - (d.count / max) * (h - pad * 2),
      d,
    }));
    const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
    const area = `${pts[0].x},${h} ` + line + ` ${pts[pts.length - 1].x},${h}`;
    return { polyline: line, area, max, points: pts };
  });

  /** Ad days sold per month. Footer-only business rule: one banner per
   *  day, so a month's sales = days covered by a validated + active
   *  campaign (footer_days; legacy header rows are normalized to footer
   *  by the pending footer-only migration). */
  readonly soldDaysBarData = computed(() => {
    const rows = this.extras()?.fill_rate ?? [];
    return MONTH_LABELS.map((label, i) => {
      const m = rows.find((r) => r.month === i + 1);
      const daysInMonth = m?.days ?? 30;
      const soldDays = m?.footer_days ?? 0;
      return {
        label,
        soldDays,
        pct: m ? Math.round((soldDays / daysInMonth) * 100) : 0,
      };
    });
  });

  // ── Advertiser exposure (proof-of-performance) ─────────────────

  readonly advertiserExposure = computed<AdvertiserExposure[]>(
    () => this.extras()?.advertiser_exposure ?? [],
  );

  exposureCtr(row: AdvertiserExposure): number | null {
    return row.impressions > 0 ? row.clicks / row.impressions : null;
  }

  /**
   * Build the CSV for the exposure table. Pure so the spec can assert the
   * exact output. Conventions chosen for French Excel:
   *   - ';' separator (',' is the decimal separator in fr locales)
   *   - UTF-8 BOM prefix so Excel decodes accents without an import wizard
   *   - CRLF line endings
   *   - CTR rendered with a decimal comma
   */
  buildExposureCsv(rows: AdvertiserExposure[]): string {
    const esc = (v: string | number): string => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Annonceur',
      'Campagnes',
      'Jours diffusés',
      'Jours réservés',
      'Impressions',
      'Clics',
      'CTR',
    ];
    const lines = rows.map((r) => {
      const ctr =
        r.impressions > 0
          ? ((r.clicks / r.impressions) * 100).toFixed(2).replace('.', ',') + ' %'
          : '—';
      return [
        esc(r.company_name),
        r.campaigns,
        r.days_aired,
        r.days_booked,
        r.impressions,
        r.clicks,
        ctr,
      ].join(';');
    });
    return '\ufeff' + [header.join(';'), ...lines].join('\r\n');
  }

  exportExposureCsv(): void {
    const rows = this.advertiserExposure();
    if (rows.length === 0) return;
    const blob = new Blob([this.buildExposureCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exposition-annonceurs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Team velocity (last 8 ISO weeks) ───────────────────────────

  readonly teamVelocity = computed(() => {
    const weeks = this.extras()?.team_velocity ?? [];
    return weeks.map((w) => ({ ...w, total: w.events + w.entries + w.campaigns }));
  });

  readonly velocityMax = computed(() => Math.max(1, ...this.teamVelocity().map((w) => w.total)));

  /** Current-week total vs previous week. Null when there's nothing to
   *  compare (fewer than 2 weeks, or both weeks at zero). deltaPct is
   *  null when the previous week was 0 (division impossible) — the
   *  template then shows "nouveau" instead of a percentage. */
  readonly velocityTrend = computed(() => {
    const rows = this.teamVelocity();
    if (rows.length < 2) return null;
    const current = rows[rows.length - 1].total;
    const previous = rows[rows.length - 2].total;
    if (current === 0 && previous === 0) return null;
    const deltaPct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
    const direction: 'up' | 'down' | 'flat' =
      current > previous ? 'up' : current < previous ? 'down' : 'flat';
    return { current, previous, deltaPct, direction };
  });

  /** '2026-06-29' → '29/06' */
  weekLabel(iso: string): string {
    const [, mm, dd] = iso.split('-');
    return `${dd}/${mm}`;
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    await Promise.allSettled([
      firstValueFrom(this.metriquesService.getDeviceStats()).then((v) => this.deviceStats.set(v)),
      firstValueFrom(this.metriquesService.getDeviceLogs()).then((v) => this.deviceLogs.set(v)),
      firstValueFrom(this.metriquesService.getCampaignTaps()).then((v) => this.campaignTaps.set(v)),
      firstValueFrom(this.metriquesService.getCmsActivity()).then((v) => this.cmsActivity.set(v)),
      firstValueFrom(this.insightsService.getMetricsExtras(new Date().getFullYear())).then((v) =>
        this.extras.set(v),
      ),
    ]);
    this.loading.set(false);
  }

  formatAction(action: string): string {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  monthLabel(month: number): string {
    return MONTH_LABELS[month - 1] ?? String(month);
  }
}
