import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AdminService, AdminUser } from '../../core/admin/admin.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [TuiIcon, DatePipe],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss',
})
export class AdminUsersComponent implements OnInit {
  private admin = inject(AdminService);

  readonly loading     = signal(true);
  readonly users       = signal<AdminUser[]>([]);
  readonly searchQuery = signal('');
  readonly error       = signal<string | null>(null);

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter(u =>
      (u.email?.toLowerCase().includes(q) ?? false) ||
      (u.display_name?.toLowerCase().includes(q) ?? false) ||
      u.memberships.some(m => m.workspace_name.toLowerCase().includes(q)),
    );
  });

  readonly totalCount       = computed(() => this.users().length);
  readonly pendingCount     = computed(() => this.users().filter(u => !u.email_confirmed_at).length);
  readonly systemAdminCount = computed(() => this.users().filter(u => u.global_role === 'system_admin').length);
  readonly orphanCount      = computed(() => this.users().filter(u => u.memberships.length === 0).length);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const users = await firstValueFrom(this.admin.listAllUsers());
      this.users.set(users);
    } catch (e: any) {
      // Previously this silently reset users to []. That left the page
      // showing "no users" with no clue why — hiding the actual failure
      // (auth, RLS, network). Surface both the console error and a
      // human-readable banner so we can debug from the UI.
      console.error('[admin-users] listAllUsers failed:', e);
      this.error.set(e?.message ?? 'Impossible de charger la liste des utilisateurs.');
      this.users.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
