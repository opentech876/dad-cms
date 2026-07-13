import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AdminDashboardStats, AdminService } from '../../core/admin/admin.service';
import { DATE_FMT } from '../../core/utils/date.utils';

/**
 * Platform-level dashboard. Landing surface of /admin for system_admin.
 * Reads aggregate stats in one round-trip via the admin_dashboard_stats()
 * RPC; the page is read-only — actions live on /admin/espaces and
 * /admin/utilisateurs.
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [TuiIcon, DatePipe, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  /** Canonical date-pipe formats (fr) — see date.utils DATE_FMT. */
  protected readonly DATE_FMT = DATE_FMT;
  private admin = inject(AdminService);

  readonly loading = signal(true);
  readonly error   = signal<string | null>(null);
  readonly stats   = signal<AdminDashboardStats | null>(null);

  /** Total memberships across all active workspaces. Derived for the hero KPI. */
  readonly totalMemberships = computed(() =>
    (this.stats()?.recent_workspaces ?? []).reduce((acc, w) => acc + w.member_count, 0),
  );

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const s = await firstValueFrom(this.admin.dashboardStats());
      this.stats.set(s);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Échec du chargement des statistiques.');
    } finally {
      this.loading.set(false);
    }
  }
}
