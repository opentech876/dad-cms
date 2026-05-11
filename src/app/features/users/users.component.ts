import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AppRole, ManageUserAction } from '../../models';
import { WorkspaceService } from '../../core/workspace/workspace.service';

interface UserRow {
  userId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: AppRole;
  expiresAt: string | null;
  joinedAt: string;
  banned: boolean;
}

const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Propriétaire',
  chef_equipe: "Chef d'équipe",
  editeur: 'Éditeur',
  charge_communication: 'Chargé comm.',
};

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [TuiIcon, DatePipe, SlicePipe],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
})
export class UsersComponent implements OnInit {
  private workspaceService = inject(WorkspaceService);

  readonly loading = signal(true);
  readonly users = signal<UserRow[]>([]);

  readonly showInviteModal = signal(false);
  readonly inviteEmail = signal('');
  readonly inviteRole = signal<AppRole>('editeur');
  readonly inviteStatus = signal<'idle' | 'loading' | 'sent' | 'error'>('idle');
  readonly inviteError = signal('');

  readonly roleLabels = ROLE_LABELS;

  readonly isEmpty = computed(() => !this.loading() && this.users().length === 0);

  readonly kpiTotal    = computed(() => this.users().length);
  readonly kpiOwners   = computed(() => this.users().filter(u => u.role === 'owner').length);
  readonly kpiEditors  = computed(() => this.users().filter(u => u.role === 'editeur').length);
  readonly kpiComm     = computed(() => this.users().filter(u => u.role === 'charge_communication').length);

  readonly searchQuery = signal('');

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.users();
    return this.users().filter(
      (u) =>
        (u.fullName?.toLowerCase().includes(q) ?? false) ||
        (u.email?.toLowerCase().includes(q) ?? false),
    );
  });

  readonly activeMenuUserId = signal<string | null>(null);

  readonly showRoleModal = signal(false);
  readonly roleModalUserId = signal<string | null>(null);
  readonly roleModalTargetRole = signal<AppRole>('editeur');

  readonly showConfirmModal = signal(false);
  readonly confirmModalUserId = signal<string | null>(null);
  readonly confirmModalAction = signal<'block' | 'unblock' | 'remove' | null>(null);

  readonly confirmModalUser = computed(() =>
    this.users().find(u => u.userId === this.confirmModalUserId()) ?? null
  );

  readonly permissionsMatrix: (string | number)[][] = [
    ["Créer / configurer l'espace",         1, 0, 0, 0],
    ['Inviter / bloquer un membre',         1, 0, 0, 0],
    ['Gérer les rôles',                     1, 0, 0, 0],
    ['CRUD calendriers',                    1, 1, 1, 0],
    ['Dupliquer un calendrier',             1, 1, 1, 0],
    ['CRUD événements historiques',         1, 1, 1, 0],
    ['CRUD campagnes publicitaires',        1, 1, 0, 1],
    ['Assigner / répéter une campagne',     1, 1, 0, 1],
    ['Tableaux de bord (lecture seule)',    1, 1, 1, 1],
  ];

  initials(user: UserRow): string {
    if (user.fullName) {
      return user.fullName
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
    }
    return user.userId.slice(0, 2).toUpperCase();
  }

  isExpired(user: UserRow): boolean {
    return !!user.expiresAt && new Date(user.expiresAt) < new Date();
  }

  isTempOwner(user: UserRow): boolean {
    return user.role === 'owner' && !!user.expiresAt;
  }

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    const entries = await firstValueFrom(this.workspaceService.listUsers());
    this.users.set(
      entries
        .filter((e) => e.role !== null)
        .map((e) => ({
          userId: e.id,
          email: e.email,
          fullName: e.full_name,
          avatarUrl: e.avatar_url,
          role: e.role as AppRole,
          expiresAt: e.expires_at,
          joinedAt: e.created_at,
          banned: e.banned,
        })),
    );
    this.loading.set(false);
  }

  async handleAction(userId: string, action: ManageUserAction, role?: AppRole): Promise<void> {
    const result = await firstValueFrom(this.workspaceService.manageUser(userId, action, role));
    if (result.success) {
      await this.loadUsers();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeActionsMenu();
  }

  openActionsMenu(userId: string): void {
    this.activeMenuUserId.set(userId);
  }

  closeActionsMenu(): void {
    this.activeMenuUserId.set(null);
  }

  openRoleModal(userId: string): void {
    const user = this.users().find(u => u.userId === userId);
    this.roleModalUserId.set(userId);
    this.roleModalTargetRole.set(user?.role ?? 'editeur');
    this.showRoleModal.set(true);
  }

  closeRoleModal(): void {
    this.showRoleModal.set(false);
  }

  async submitRoleChange(): Promise<void> {
    const userId = this.roleModalUserId();
    if (!userId) return;
    await this.handleAction(userId, 'update_role', this.roleModalTargetRole());
    this.closeRoleModal();
  }

  openConfirmModal(userId: string, action: 'block' | 'unblock' | 'remove'): void {
    this.confirmModalUserId.set(userId);
    this.confirmModalAction.set(action);
    this.showConfirmModal.set(true);
  }

  closeConfirmModal(): void {
    this.showConfirmModal.set(false);
  }

  async confirmAction(): Promise<void> {
    const userId = this.confirmModalUserId();
    const action = this.confirmModalAction();
    if (!userId || !action) return;
    await this.handleAction(userId, action);
    this.closeConfirmModal();
  }

  openInviteModal(): void {
    this.inviteEmail.set('');
    this.inviteRole.set('editeur');
    this.inviteStatus.set('idle');
    this.inviteError.set('');
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    this.showInviteModal.set(false);
  }

  async submitInvite(): Promise<void> {
    if (!this.inviteEmail().trim() || this.inviteStatus() === 'loading') return;
    this.inviteStatus.set('loading');
    this.inviteError.set('');

    const result = await firstValueFrom(
      this.workspaceService.inviteUser(this.inviteEmail().trim(), this.inviteRole()),
    );

    if (!result.success) {
      this.inviteStatus.set('error');
      this.inviteError.set(result.error ?? "Impossible d'envoyer l'invitation.");
      return;
    }

    this.inviteStatus.set('sent');
    await this.loadUsers();
  }
}
