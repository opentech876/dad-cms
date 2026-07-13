import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AdminAuditEntry, AdminAuditTable, AdminService } from '../../core/admin/admin.service';
import { DATE_FMT } from '../../core/utils/date.utils';

const PAGE_SIZE = 50;

type FilterKey = 'all' | AdminAuditTable;

interface FilterTab {
  id:    FilterKey;
  label: string;
  icon:  string;
}

@Component({
  selector: 'app-admin-logs',
  standalone: true,
  imports: [TuiIcon, DatePipe],
  templateUrl: './admin-logs.component.html',
  styleUrl: './admin-logs.component.scss',
})
export class AdminLogsComponent implements OnInit {
  /** Canonical date-pipe formats (fr) — see date.utils DATE_FMT. */
  protected readonly DATE_FMT = DATE_FMT;
  private admin = inject(AdminService);

  readonly loading  = signal(true);
  readonly loadingMore = signal(false);
  readonly entries  = signal<AdminAuditEntry[]>([]);
  readonly error    = signal<string | null>(null);
  readonly hasMore  = signal(true);
  readonly activeFilter = signal<FilterKey>('all');

  readonly filters: FilterTab[] = [
    { id: 'all',                label: 'Tout',           icon: '@tui.list' },
    { id: 'workspaces',         label: 'Espaces',        icon: '@tui.building' },
    { id: 'workspace_members',  label: 'Membres',        icon: '@tui.user-plus' },
    { id: 'user_roles',         label: 'Rôles',          icon: '@tui.shield' },
  ];

  readonly entriesByDay = computed(() => {
    const groups = new Map<string, AdminAuditEntry[]>();
    for (const e of this.entries()) {
      const dayKey = e.changed_at.slice(0, 10); // YYYY-MM-DD
      if (!groups.has(dayKey)) groups.set(dayKey, []);
      groups.get(dayKey)!.push(e);
    }
    return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.hasMore.set(true);
    try {
      const filter = this.activeFilter();
      const list = await firstValueFrom(this.admin.listAuditLog(
        PAGE_SIZE,
        null,
        filter === 'all' ? null : filter,
      ));
      this.entries.set(list);
      this.hasMore.set(list.length === PAGE_SIZE);
    } catch (e: any) {
      console.error('[admin-logs] listAuditLog failed:', e);
      this.error.set(e?.message ?? "Impossible de charger le journal.");
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore()) return;
    const last = this.entries().at(-1);
    if (!last) return;
    this.loadingMore.set(true);
    try {
      const filter = this.activeFilter();
      const more = await firstValueFrom(this.admin.listAuditLog(
        PAGE_SIZE,
        last.changed_at,
        filter === 'all' ? null : filter,
      ));
      this.entries.update(cur => [...cur, ...more]);
      this.hasMore.set(more.length === PAGE_SIZE);
    } catch (e: any) {
      console.error('[admin-logs] loadMore failed:', e);
      this.error.set(e?.message ?? "Impossible de charger la suite.");
    } finally {
      this.loadingMore.set(false);
    }
  }

  async setFilter(id: FilterKey): Promise<void> {
    if (id === this.activeFilter()) return;
    this.activeFilter.set(id);
    await this.reload();
  }

  // ── Row rendering helpers ────────────────────────────────────────────

  /** Human-readable French sentence describing what happened.
   *  Pure function of the audit row — no side effects. */
  describe(e: AdminAuditEntry): { verb: string; target: string; icon: string; tone: 'created' | 'updated' | 'deleted' | 'restored' } {
    // workspaces
    if (e.table_name === 'workspaces') {
      if (e.action === 'INSERT') {
        return { verb: 'a créé l’espace de travail', target: this.workspaceLabel(e), icon: '@tui.building-plus', tone: 'created' };
      }
      if (e.action === 'DELETE') {
        return { verb: 'a supprimé définitivement l’espace', target: this.workspaceLabel(e), icon: '@tui.trash', tone: 'deleted' };
      }
      // UPDATE — distinguish soft-delete / restore / rename
      const oldDel = !!e.old_data?.['deleted_at'];
      const newDel = !!e.new_data?.['deleted_at'];
      if (!oldDel && newDel) {
        return { verb: 'a supprimé l’espace', target: this.workspaceLabel(e), icon: '@tui.building-x', tone: 'deleted' };
      }
      if (oldDel && !newDel) {
        return { verb: 'a restauré l’espace', target: this.workspaceLabel(e), icon: '@tui.building-check', tone: 'restored' };
      }
      const oldName = e.old_data?.['name'];
      const newName = e.new_data?.['name'];
      if (oldName && newName && oldName !== newName) {
        return { verb: 'a renommé l’espace', target: `${oldName} → ${newName}`, icon: '@tui.pencil', tone: 'updated' };
      }
      return { verb: 'a mis à jour l’espace', target: this.workspaceLabel(e), icon: '@tui.pencil', tone: 'updated' };
    }

    // workspace_members
    if (e.table_name === 'workspace_members') {
      const ws = this.workspaceLabel(e);
      if (e.action === 'INSERT') {
        const role = e.new_data?.['role'] ?? '—';
        return { verb: 'a ajouté un membre', target: `${role} · ${ws}`, icon: '@tui.user-plus', tone: 'created' };
      }
      if (e.action === 'DELETE') {
        return { verb: 'a retiré un membre', target: ws, icon: '@tui.user-minus', tone: 'deleted' };
      }
      const oldRole = e.old_data?.['role'];
      const newRole = e.new_data?.['role'];
      if (oldRole && newRole && oldRole !== newRole) {
        return { verb: 'a modifié le rôle d’un membre', target: `${oldRole} → ${newRole} · ${ws}`, icon: '@tui.repeat', tone: 'updated' };
      }
      return { verb: 'a mis à jour un membre', target: ws, icon: '@tui.user-cog', tone: 'updated' };
    }

    // user_roles (global platform role)
    if (e.table_name === 'user_roles') {
      if (e.action === 'INSERT') {
        const role = e.new_data?.['role'] ?? '—';
        return { verb: 'a assigné un rôle plateforme', target: role, icon: '@tui.shield-plus', tone: 'created' };
      }
      if (e.action === 'DELETE') {
        const role = e.old_data?.['role'] ?? '—';
        return { verb: 'a révoqué un rôle plateforme', target: role, icon: '@tui.shield-x', tone: 'deleted' };
      }
      const oldRole = e.old_data?.['role'];
      const newRole = e.new_data?.['role'];
      if (oldRole && newRole && oldRole !== newRole) {
        return { verb: 'a modifié un rôle plateforme', target: `${oldRole} → ${newRole}`, icon: '@tui.shield', tone: 'updated' };
      }
      return { verb: 'a mis à jour un rôle plateforme', target: '', icon: '@tui.shield', tone: 'updated' };
    }

    return { verb: e.action, target: e.table_name, icon: '@tui.circle', tone: 'updated' };
  }

  actorLabel(e: AdminAuditEntry): string {
    return e.actor_name ?? e.actor_email ?? 'Système';
  }

  actorInitial(e: AdminAuditEntry): string {
    return (this.actorLabel(e).charAt(0) || '?').toUpperCase();
  }

  private workspaceLabel(e: AdminAuditEntry): string {
    return e.workspace_name ?? e.new_data?.['name'] ?? e.old_data?.['name'] ?? '(espace inconnu)';
  }
}
