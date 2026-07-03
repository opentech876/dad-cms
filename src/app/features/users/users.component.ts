import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AppRole, ManageUserAction } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { ToastService } from '../../core/services/toast.service';

interface UserRow {
  userId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  role: AppRole;
  expiresAt: string | null;
  joinedAt: string;
  banned: boolean;
  /** null = pending invitation. */
  emailConfirmedAt: string | null;
  invitedAt: string | null;
}

const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Administrateur',
  chef_equipe: "Chef d'équipe",
  editeur: 'Éditeur',
  charge_communication: 'Commercial',
  presidence: 'Curateur',
  chef_equipe_commerciale: 'Chef d\'équipe comm.',
  system_admin: 'Admin plateforme',
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
  private authService      = inject(AuthService);
  private toast            = inject(ToastService);

  /** True when the caller is a platform system_admin — used to unlock the
   *  "Administrateur" option in the invite-role dropdown when they've
   *  impersonated into a workspace. The invite-user Edge Function
   *  authorises owner-role minting for sysadmins server-side; this signal
   *  only controls whether the option is *visible*. Regular workspace
   *  owner / chef_equipe never see it — they'd hit a 403 anyway. */
  readonly isSysadmin = toSignal(this.authService.isSystemAdmin(), { initialValue: false });

  /** Active workspace name — used in destructive confirmation modals so the
   *  user can't mistake which tenant they're acting on. Fetched once in
   *  ngOnInit from `getWorkspaceSummaries`. */
  readonly activeWorkspaceName = signal('');

  readonly loading = signal(true);
  readonly users = signal<UserRow[]>([]);

  readonly showInviteModal = signal(false);
  readonly inviteEmail = signal('');
  readonly inviteRole = signal<AppRole>('editeur');
  readonly inviteStatus = signal<'idle' | 'loading' | 'sent' | 'error'>('idle');
  readonly inviteError = signal('');

  readonly roleLabels = ROLE_LABELS;

  readonly isEmpty = computed(() => !this.loading() && this.users().length === 0);

  // KPIs count active members only (pending invitations don't inflate the
  // headcount — they're tracked separately in pendingInvitations()).
  readonly kpiTotal      = computed(() => this.users().filter(u => !!u.emailConfirmedAt).length);
  readonly kpiOwners     = computed(() => this.users().filter(u => u.role === 'owner' && !!u.emailConfirmedAt).length);
  readonly kpiEditors    = computed(() => this.users().filter(u => u.role === 'editeur' && !!u.emailConfirmedAt).length);
  readonly kpiComm       = computed(() => this.users().filter(u => u.role === 'charge_communication' && !!u.emailConfirmedAt).length);
  readonly kpiPresidence     = computed(() => this.users().filter(u => u.role === 'presidence' && !!u.emailConfirmedAt).length);
  readonly kpiCommercialLead = computed(() => this.users().filter(u => u.role === 'chef_equipe_commerciale' && !!u.emailConfirmedAt).length);

  readonly searchQuery = signal('');

  /** Pending = invited but never accepted (no email_confirmed_at). */
  readonly pendingInvitations = computed(() =>
    this.users().filter(u => !u.emailConfirmedAt),
  );

  /** Active = email confirmed (real users who can sign in). */
  readonly activeUsers = computed(() =>
    this.users().filter(u => !!u.emailConfirmedAt),
  );

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.activeUsers();
    if (!q) return list;
    return list.filter(
      (u) =>
        (u.fullName?.toLowerCase().includes(q) ?? false) ||
        (u.email?.toLowerCase().includes(q) ?? false),
    );
  });

  readonly filteredPendingInvitations = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.pendingInvitations();
    if (!q) return list;
    return list.filter(
      (u) =>
        (u.fullName?.toLowerCase().includes(q) ?? false) ||
        (u.email?.toLowerCase().includes(q) ?? false),
    );
  });

  /** Tracks the userId currently being resent/revoked, for per-row spinners. */
  readonly invitationActionBusyId = signal<string | null>(null);
  readonly invitationActionError  = signal<string>('');

  readonly activeMenuUserId = signal<string | null>(null);

  readonly showRoleModal = signal(false);
  readonly roleModalUserId = signal<string | null>(null);
  readonly roleModalTargetRole = signal<AppRole>('editeur');

  readonly showConfirmModal = signal(false);
  readonly confirmModalUserId = signal<string | null>(null);
  readonly confirmModalAction = signal<'block' | 'unblock' | 'remove' | null>(null);

  readonly showPasswordModal     = signal(false);
  readonly passwordModalUserId   = signal<string | null>(null);
  readonly passwordModalValue    = signal('');
  readonly passwordModalShow     = signal(false);
  readonly passwordModalLoading  = signal(false);
  readonly passwordModalError    = signal('');

  readonly passwordModalUser = computed(() =>
    this.users().find(u => u.userId === this.passwordModalUserId()) ?? null,
  );

  readonly confirmModalUser = computed(() =>
    this.users().find(u => u.userId === this.confirmModalUserId()) ?? null
  );

  // Columns (after the label): Administrateur | Chef d'équipe | Éditeur | Commercial | Curateur | Chef d'équipe comm.
  readonly permissionsMatrix: (string | number)[][] = [
    ["Créer / configurer l'espace",                       1, 0, 0, 0, 0, 0],
    ['Inviter / bloquer un membre',                       1, 0, 0, 0, 0, 0],
    ['Gérer les rôles',                                   1, 0, 0, 0, 0, 0],
    ['CRUD calendriers',                                  1, 1, 0, 0, 0, 0],
    ['Dupliquer un calendrier',                           1, 1, 0, 0, 0, 0],
    ['CRUD entrées de la bibliothèque historique',        1, 1, 1, 0, 0, 0],
    ['Assigner un événement à un jour (calendrier)',      1, 1, 0, 0, 0, 0],
    ['Recommander un événement à un jour (Curateur)',     1, 0, 0, 0, 1, 0],
    ['Appliquer une recommandation du Curateur',          1, 1, 1, 0, 0, 0],
    ['CRUD compagnies (annonceurs)',                      1, 0, 0, 0, 0, 1],
    ['CRUD encarts publicitaires',                        1, 1, 0, 1, 0, 1],
    ['Tableaux de bord (lecture seule)',                  1, 1, 1, 1, 1, 1],
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
    // Fetch the active workspace name once — used in destructive modals so
    // the operator sees exactly which tenant they're acting on.
    try {
      const summaries = await firstValueFrom(this.workspaceService.getWorkspaceSummaries());
      const active = summaries[0]; // RPC orders by last_accessed_at DESC — most recent first
      if (active) this.activeWorkspaceName.set(active.name);
    } catch {
      // Non-blocking — modal copy falls back to generic wording.
    }
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
          expiresAt: e.expires_at ?? null,
          joinedAt: e.created_at,
          banned: e.banned,
          emailConfirmedAt: e.email_confirmed_at,
          invitedAt: e.invited_at,
        })),
    );
    this.loading.set(false);
  }

  async handleAction(userId: string, action: ManageUserAction, role?: AppRole): Promise<void> {
    const result = await firstValueFrom(this.workspaceService.manageUser(userId, action, role));
    if (result.success) {
      const messages: Record<ManageUserAction, string> = {
        update_role:        'Rôle mis à jour.',
        block:              'Utilisateur bloqué.',
        unblock:            'Utilisateur débloqué.',
        remove:             'Utilisateur retiré de cet espace.',
        set_password:       'Mot de passe mis à jour.',
        resend_invitation:  'Invitation renvoyée.',
        revoke_invitation:  'Invitation révoquée.',
      };
      this.toast.success(messages[action] ?? 'Action effectuée.');
      await this.loadUsers();
    } else {
      // Previously the failure was silently swallowed — the modal just closed
      // and the user saw no feedback (which is why "I cannot change a user's
      // role" felt like a missing feature rather than a permission error).
      // Surface the real EF message.
      this.toast.error(result.error ?? "L'action n'a pas pu être exécutée.");
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

  openPasswordModal(userId: string): void {
    this.passwordModalUserId.set(userId);
    this.passwordModalValue.set('');
    this.passwordModalShow.set(false);
    this.passwordModalError.set('');
    this.showPasswordModal.set(true);
  }

  closePasswordModal(): void {
    this.showPasswordModal.set(false);
  }

  togglePasswordModalShow(): void { this.passwordModalShow.update(v => !v); }

  async submitSetPassword(): Promise<void> {
    if (this.passwordModalLoading()) return;
    const userId = this.passwordModalUserId();
    const password = this.passwordModalValue();
    if (!userId) return;
    if (password.length < 8) {
      this.passwordModalError.set('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }

    this.passwordModalLoading.set(true);
    this.passwordModalError.set('');
    const result = await firstValueFrom(
      this.workspaceService.manageUser(userId, 'set_password', undefined, password),
    );
    this.passwordModalLoading.set(false);

    if (!result.success) {
      this.passwordModalError.set(result.error ?? 'Échec de la mise à jour du mot de passe.');
      return;
    }

    this.closePasswordModal();
  }

  // ── Pending invitation management ──────────────────────────────────────

  async resendInvitation(userId: string): Promise<void> {
    if (this.invitationActionBusyId()) return;
    this.invitationActionBusyId.set(userId);
    this.invitationActionError.set('');
    try {
      const result = await firstValueFrom(this.workspaceService.manageUser(userId, 'resend_invitation'));
      if (!result.success) {
        this.invitationActionError.set(result.error ?? "Échec de l'envoi du lien.");
      } else {
        await this.loadUsers();
      }
    } finally {
      this.invitationActionBusyId.set(null);
    }
  }

  async revokeInvitation(userId: string): Promise<void> {
    if (this.invitationActionBusyId()) return;
    this.invitationActionBusyId.set(userId);
    this.invitationActionError.set('');
    try {
      const result = await firstValueFrom(this.workspaceService.manageUser(userId, 'revoke_invitation'));
      if (!result.success) {
        this.invitationActionError.set(result.error ?? "Échec de la révocation.");
      } else {
        await this.loadUsers();
      }
    } finally {
      this.invitationActionBusyId.set(null);
    }
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
