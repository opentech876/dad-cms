import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AppRole } from '../../models';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';

interface UserRow {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: AppRole;
  expiresAt: string | null;
  joinedAt: string;
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
  private supabase = inject(SupabaseService);
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
    const db = this.supabase.client;

    const [rolesRes, profilesRes] = await Promise.all([
      db
        .from('user_roles')
        .select('user_id, role, expires_at, created_at')
        .order('created_at', { ascending: true }),
      db.from('profiles').select('user_id, full_name, avatar_url'),
    ]);

    const profileMap = new Map(
      (profilesRes.data ?? []).map((p) => [p.user_id, p]),
    );

    this.users.set(
      (rolesRes.data ?? []).map((r) => ({
        userId: r.user_id,
        fullName: profileMap.get(r.user_id)?.full_name ?? null,
        avatarUrl: profileMap.get(r.user_id)?.avatar_url ?? null,
        role: r.role as AppRole,
        expiresAt: r.expires_at,
        joinedAt: r.created_at,
      })),
    );
    this.loading.set(false);
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
