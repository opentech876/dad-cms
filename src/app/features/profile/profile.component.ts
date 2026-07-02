import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { filter, firstValueFrom } from 'rxjs';
import { AppRole } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { ToastService } from '../../core/services/toast.service';

const ROLE_LABELS: Record<AppRole, string> = {
  owner:                   'Administrateur',
  chef_equipe:             "Chef d'équipe",
  editeur:                 'Éditeur',
  charge_communication:    'Chargé de communication',
  presidence:              'Présidence',
  chef_equipe_commerciale: "Chef d'équipe commerciale",
  system_admin:            "Administrateur plateforme",
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [TuiIcon, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  private readonly auth             = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly supabase         = inject(SupabaseService);
  private readonly route            = inject(ActivatedRoute);
  private readonly toast            = inject(ToastService);

  private userId = '';

  /**
   * True when the user landed here because the systemAdminGuard refused to
   * let them into /admin without an enrolled TOTP factor (URL has
   * ?mfa_required=1). Drives a top banner that explains why and points to
   * the Sécurité section.
   */
  readonly mfaRequiredBanner = signal(false);

  readonly userEmail = signal('');
  readonly fullName  = signal('');
  readonly phone     = signal('');
  readonly role      = signal<AppRole | null>(null);
  readonly saving          = signal(false);
  readonly avatarUrl       = signal<string | null>(null);
  readonly avatarFile      = signal<File | null>(null);
  readonly avatarPreview   = signal<string | null>(null);
  readonly avatarUploading = signal(false);

  readonly initials = computed(() => {
    const name = this.fullName().trim();
    if (name) {
      const parts = name.split(/\s+/);
      return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase();
    }
    return (this.userEmail()[0] ?? '?').toUpperCase();
  });

  readonly roleLabel = computed(() =>
    this.role() ? ROLE_LABELS[this.role()!] : '',
  );

  readonly displayName = computed(() =>
    this.fullName().trim() || this.userEmail(),
  );

  /**
   * True when the user is a `system_admin`. Drives the per-section
   * conditional rendering: sysadmin identity is workspace-agnostic, so the
   * phone + avatar surfaces are hidden (they'd persist via upsertProfile
   * which needs a workspace), and name is sourced from / saved to
   * auth.users.raw_user_meta_data.full_name instead.
   */
  readonly isSysadmin = computed(() => this.role() === 'system_admin');

  async ngOnInit(): Promise<void> {
    // If the system-admin guard sent us here because TOTP isn't enrolled yet,
    // surface a banner so the user knows why and where to look.
    this.mfaRequiredBanner.set(
      this.route.snapshot.queryParamMap.get('mfa_required') === '1',
    );

    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(filter(Boolean)));
    this.userId = (user as any).id ?? '';
    this.userEmail.set((user as any).email ?? '');
    this.role.set(await firstValueFrom(this.auth.currentRole$));

    // Secondary recovery e-mail lives in user_metadata (global per user, not
    // workspace-scoped) so we read it from the auth user object directly.
    const metaSecondary = (user as any)?.user_metadata?.secondary_email ?? '';
    this.secondaryEmail.set(metaSecondary);

    if (this.isSysadmin()) {
      // Sysadmin name lives in user_metadata (platform-level identity), not
      // in profiles (workspace-scoped). Hydrate from there and skip the
      // workspace-scoped profile lookup entirely.
      const metaFullName = (user as any)?.user_metadata?.full_name ?? '';
      this.fullName.set(metaFullName);
    } else {
      const profile = await firstValueFrom(this.workspaceService.getMyProfile(this.userId));
      if (profile) {
        this.fullName.set(profile.full_name ?? '');
        this.phone.set(profile.phone ?? '');
        this.avatarUrl.set(profile.avatar_url ?? null);
      }
    }

    // Load MFA factors so the UI knows whether 2FA is already enabled.
    try { await this.loadMfaFactors(); } catch { /* non-blocking */ }
  }

  async saveProfile(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      // Sysadmin saves name to auth.users.raw_user_meta_data.full_name (no
      // workspace_id to anchor against). Everyone else writes to the
      // workspace-scoped profiles row via upsertProfile.
      if (this.isSysadmin()) {
        const { error } = await this.supabase.client.auth.updateUser({
          data: { full_name: this.fullName().trim() },
        });
        if (error) {
          this.toast.error('Impossible de mettre à jour le profil : ' + error.message);
        } else {
          this.toast.success('Profil mis à jour avec succès.');
          // Ping the shell so the sidebar name + initials refresh from the
          // updated auth metadata without a full page reload.
          this.workspaceContext.notifyProfileChanged();
        }
      } else {
        const result = await firstValueFrom(
          this.workspaceService.upsertProfile(
            this.userId,
            this.fullName().trim(),
            this.phone().trim(),
          ),
        );
        if (result.success) {
          this.toast.success('Profil mis à jour avec succès.');
          this.workspaceContext.notifyProfileChanged();
        } else {
          this.toast.error(result.error ?? 'Impossible de mettre à jour le profil. Veuillez réessayer.');
        }
      }
    } catch {
      this.toast.error('Impossible de mettre à jour le profil. Veuillez réessayer.');
    } finally {
      this.saving.set(false);
    }
  }

  onAvatarChange(ev: any): void {
    const files = (ev.target as HTMLInputElement).files;
    if (!files?.length) return;
    const file = files[0];
    this.avatarFile.set(file);
    const prev = this.avatarPreview();
    if (prev) URL.revokeObjectURL(prev);
    this.avatarPreview.set(URL.createObjectURL(file));
  }

  async uploadAvatar(): Promise<void> {
    const file = this.avatarFile();
    if (!file || !this.userId) return;
    this.avatarUploading.set(true);
    try {
      const res = await firstValueFrom(this.workspaceService.uploadAvatar(this.userId, file));
      if (!res.success) {
        this.toast.error(res.error ?? 'Erreur lors du téléversement.');
      } else {
        this.avatarUrl.set(res.avatarUrl ?? null);
        this.avatarFile.set(null);
        const prev = this.avatarPreview();
        if (prev) URL.revokeObjectURL(prev);
        this.avatarPreview.set(null);
        this.toast.success('Photo de profil mise à jour.');
        // Refresh the sidebar avatar/initials — reads the new avatar_url
        // from profiles on the next getMyProfile round-trip.
        this.workspaceContext.notifyProfileChanged();
      }
    } finally {
      this.avatarUploading.set(false);
    }
  }

  // ── Email change ─────────────────────────────────────────────────────────

  readonly newEmail        = signal('');
  readonly emailChanging   = signal(false);
  readonly emailError      = signal('');
  readonly pendingNewEmail = signal('');

  async changeEmail(): Promise<void> {
    if (this.emailChanging()) return;
    const target = this.newEmail().trim().toLowerCase();
    this.emailError.set('');
    if (!target) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) {
      this.emailError.set("Adresse e-mail invalide. Saisissez une adresse valide.");
      return;
    }
    if (target === this.userEmail().toLowerCase()) {
      this.emailError.set("Le nouvel e-mail doit être différent de l'actuel.");
      return;
    }

    this.emailChanging.set(true);
    try {
      const { error } = await this.supabase.updateEmail(target);
      if (error) {
        const msg = (error.message ?? '').toLowerCase();
        this.emailError.set(
          msg.includes('rate') || msg.includes('limit')
            ? 'Trop de tentatives. Veuillez patienter quelques minutes.'
            : msg.includes('already') || msg.includes('exists')
              ? 'Cette adresse e-mail est déjà utilisée par un autre compte.'
              : 'Impossible de mettre à jour l\'e-mail : ' + (error.message ?? 'erreur inconnue'),
        );
        return;
      }
      this.pendingNewEmail.set(target);
      this.toast.success("Lien de confirmation envoyé. Vérifiez votre boîte de réception.");
    } finally {
      this.emailChanging.set(false);
    }
  }

  cancelEmailChange(): void {
    this.pendingNewEmail.set('');
    this.newEmail.set('');
    this.emailError.set('');
  }

  // ── Password change ──────────────────────────────────────────────────────

  readonly newPassword    = signal('');
  readonly showNewPassword = signal(false);
  readonly passwordSaving  = signal(false);
  readonly passwordError   = signal('');

  toggleShowNewPassword(): void { this.showNewPassword.update(v => !v); }

  // ── Secondary recovery e-mail ──────────────────────────────────────────
  readonly secondaryEmail        = signal('');
  readonly secondaryEmailSaving  = signal(false);
  readonly secondaryEmailError   = signal('');

  async saveSecondaryEmail(): Promise<void> {
    if (this.secondaryEmailSaving()) return;
    const value = this.secondaryEmail().trim();
    this.secondaryEmailError.set('');
    if (value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      this.secondaryEmailError.set("Adresse e-mail invalide.");
      return;
    }
    if (value && value.toLowerCase() === this.userEmail().toLowerCase()) {
      this.secondaryEmailError.set("L'adresse de secours doit être différente de l'adresse principale.");
      return;
    }
    this.secondaryEmailSaving.set(true);
    try {
      const { error } = await this.supabase.updateSecondaryEmail(value || null);
      if (error) {
        this.secondaryEmailError.set('Erreur : ' + error.message);
        return;
      }
      this.toast.success(value
        ? 'Adresse de secours enregistrée.'
        : 'Adresse de secours supprimée.');
    } finally {
      this.secondaryEmailSaving.set(false);
    }
  }

  // ── MFA / 2FA enrollment ───────────────────────────────────────────────
  readonly mfaFactors        = signal<any[]>([]);
  readonly mfaEnrolling      = signal(false);
  readonly mfaPendingFactor  = signal<{ id: string; qr: string; secret: string } | null>(null);
  readonly mfaCode           = signal('');
  readonly mfaError          = signal('');

  /** True when at least one verified TOTP factor exists. */
  readonly mfaEnrolled = computed(() => this.mfaFactors().some(f => f.status === 'verified'));

  async loadMfaFactors(): Promise<void> {
    const { data } = await this.supabase.listMfaFactors();
    this.mfaFactors.set((data?.totp ?? []) as any[]);
  }

  async startMfaEnrollment(): Promise<void> {
    if (this.mfaEnrolling()) return;
    this.mfaError.set('');
    this.mfaCode.set('');
    this.mfaEnrolling.set(true);
    try {
      // If a previous enrollment was started but not verified, clean it up
      // first so the new enroll() succeeds (Supabase rejects duplicates).
      const { data: existing } = await this.supabase.listMfaFactors();
      const pending = (existing?.totp ?? []).find((f: any) => f.status === 'unverified');
      if (pending) await this.supabase.unenrollTotp(pending.id);

      const { data, error } = await this.supabase.enrollTotp('Authenticator');
      if (error || !data) {
        this.mfaError.set('Impossible de démarrer l\'enrôlement : ' + (error?.message ?? '?'));
        return;
      }
      this.mfaPendingFactor.set({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } finally {
      this.mfaEnrolling.set(false);
    }
  }

  cancelMfaEnrollment(): void {
    const pending = this.mfaPendingFactor();
    if (pending) {
      // Best-effort cleanup of the half-enrolled factor.
      void this.supabase.unenrollTotp(pending.id);
    }
    this.mfaPendingFactor.set(null);
    this.mfaCode.set('');
    this.mfaError.set('');
  }

  async confirmMfaEnrollment(): Promise<void> {
    const pending = this.mfaPendingFactor();
    const code = this.mfaCode().trim();
    if (!pending || code.length < 6) return;
    this.mfaError.set('');
    const { error } = await this.supabase.verifyTotpEnrollment(pending.id, code);
    if (error) {
      this.mfaError.set('Code invalide. Réessayez avec le code courant de votre application.');
      return;
    }
    this.toast.success('Double authentification activée.');
    this.mfaPendingFactor.set(null);
    this.mfaCode.set('');
    // The system-admin guard banner can go now — the user has met the bar.
    this.mfaRequiredBanner.set(false);
    await this.loadMfaFactors();
  }

  async disableMfa(factorId: string): Promise<void> {
    const { error } = await this.supabase.unenrollTotp(factorId);
    if (error) {
      this.toast.error('Impossible de désactiver : ' + error.message);
      return;
    }
    this.toast.success('Double authentification désactivée.');
    await this.loadMfaFactors();
  }

  async changePassword(): Promise<void> {
    if (this.passwordSaving()) return;
    const pwd = this.newPassword();
    this.passwordError.set('');

    if (pwd.length < 8) {
      this.passwordError.set('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }

    this.passwordSaving.set(true);
    try {
      const { error } = await this.supabase.updatePassword(pwd);
      if (error) {
        this.passwordError.set('Erreur : ' + error.message);
        return;
      }
      this.supabase.markPasswordSet();
      this.newPassword.set('');
      this.toast.success('Mot de passe mis à jour.');
    } finally {
      this.passwordSaving.set(false);
    }
  }
}
