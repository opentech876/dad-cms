import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, PercentPipe, SlicePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { CampaignTap, DailyActivity, DeviceLog, MonthCoverage } from '../../models';
import { MetriquesService, DeviceStats } from '../../core/metriques/metriques.service';
import { InsightsService, MetricsExtraStats } from '../../core/insights/insights.service';

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

@Component({
  selector: 'app-metriques',
  standalone: true,
  imports: [TuiIcon, DecimalPipe, PercentPipe, SlicePipe],
  templateUrl: './metriques.component.html',
  styleUrl: './metriques.component.scss',
})
export class MetriquesComponent implements OnInit {
  private metriquesService = inject(MetriquesService);
  private insightsService  = inject(InsightsService);

  readonly currentYear   = new Date().getFullYear();
  readonly loading       = signal(true);
  readonly deviceStats   = signal<DeviceStats>({ total: 0, android: 0, ios: 0 });
  readonly deviceLogs    = signal<DeviceLog[]>([]);
  readonly campaignTaps  = signal<CampaignTap[]>([]);
  readonly cmsActivity   = signal<DailyActivity[]>([]);
  readonly coverage      = signal<MonthCoverage[]>([]);
  readonly extras        = signal<MetricsExtraStats | null>(null);

  readonly notifOpenRate = computed(() => {
    const logs = this.deviceLogs();
    const received  = logs.filter(l => l.action === 'notification_received').length;
    const responded = logs.filter(l => l.action === 'notification_response').length;
    if (received === 0) return null;
    return responded / received;
  });

  readonly totalTaps = computed(() =>
    this.campaignTaps().reduce((s, t) => s + t.tap_count, 0),
  );

  /** Sum of impressions across all campaigns (= sum of tap_count). */
  readonly totalImpressions = this.totalTaps;

  /** Sum of clicks across all campaigns. */
  readonly totalClicks = computed(() =>
    this.campaignTaps().reduce((s, t) => s + t.click_count, 0),
  );

  /** Aggregate CTR — null when there are no impressions yet. */
  readonly globalCtr = computed<number | null>(() => {
    const impr = this.totalImpressions();
    if (impr === 0) return null;
    return this.totalClicks() / impr;
  });

  /**
   * True when campaigns have impressions but zero recorded clicks across the
   * board — signal that mobile hasn't shipped `record_ad_campaign_click()` yet
   * (per CLAUDE.md, click tracking RPC adoption is pending mobile release).
   */
  readonly clickTrackingPending = computed<boolean>(() => {
    if (this.campaignTaps().length === 0) return false;
    return this.totalImpressions() > 0 && this.totalClicks() === 0;
  });

  readonly coveragePercent = computed(() => {
    const months = this.coverage();
    if (months.length === 0) return 0;
    const filled = months.filter(m => m.percent >= 100).length;
    return Math.round((filled / 12) * 100);
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
    const max   = Math.max(...data.map(d => d.count));
    const w     = 560;
    const h     = 80;
    const pad   = 4;
    const pts   = data.map((d, i) => ({
      x: pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2),
      y: h - pad - ((d.count / max) * (h - pad * 2)),
      d,
    }));
    const line = pts.map(p => `${p.x},${p.y}`).join(' ');
    const area = `${pts[0].x},${h} ` + line + ` ${pts[pts.length - 1].x},${h}`;
    return { polyline: line, area, max, points: pts };
  });

  /** Per-month ad-inventory fill rate, per position. The commercial
   *  "sold vs sellable" evidence — % of days covered by a validated +
   *  active campaign. */
  readonly fillRateBarData = computed(() => {
    const rows = this.extras()?.fill_rate ?? [];
    return MONTH_LABELS.map((label, i) => {
      const m = rows.find(r => r.month === i + 1);
      const days = m?.days ?? 30;
      return {
        label,
        headerPct: m ? Math.round((m.header_days / days) * 100) : 0,
        footerPct: m ? Math.round((m.footer_days / days) * 100) : 0,
      };
    });
  });

  /** Curateur → editorial application speed. Null until any
   *  recommendation has been applied. */
  readonly applyLatency = computed(() => {
    const l = this.extras()?.apply_latency;
    if (!l || l.applied_count === 0) return null;
    return l;
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    await Promise.allSettled([
      firstValueFrom(this.metriquesService.getDeviceStats()).then(v => this.deviceStats.set(v)),
      firstValueFrom(this.metriquesService.getDeviceLogs()).then(v => this.deviceLogs.set(v)),
      firstValueFrom(this.metriquesService.getCampaignTaps()).then(v => this.campaignTaps.set(v)),
      firstValueFrom(this.metriquesService.getCmsActivity()).then(v => this.cmsActivity.set(v)),
      firstValueFrom(this.metriquesService.getCalendarCoverage()).then(v => this.coverage.set(v)),
      firstValueFrom(this.insightsService.getMetricsExtras(new Date().getFullYear())).then(v => this.extras.set(v)),
    ]);
    this.loading.set(false);
  }

  formatAction(action: string): string {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  monthLabel(month: number): string {
    return MONTH_LABELS[month - 1] ?? String(month);
  }
}
