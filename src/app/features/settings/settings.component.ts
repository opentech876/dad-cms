import { Component, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService, ThemeId, ColorMode } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [TuiIcon, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  readonly themeService        = inject(ThemeService);
  private readonly auth        = inject(AuthService);
  private readonly wsService   = inject(WorkspaceService);
  private readonly wsCtx       = inject(WorkspaceContextService);
  private readonly toast       = inject(ToastService);

  readonly isOwner = toSignal(this.auth.currentRole$.pipe(map(r => r === 'owner')), { initialValue: false });

  readonly workspaceName = signal('');
  readonly wsSaving      = signal(false);

  readonly themes: { id: ThemeId; label: string; desc: string }[] = [
    { id: 'archive',     label: 'Archive',     desc: 'Ivoire crème, serif classique' },
    { id: 'broadsheet',  label: 'Broadsheet',  desc: 'Blanc pur, typographie journal' },
    { id: 'field',       label: 'Terrain',     desc: 'Kaki foncé, contraste élevé' },
  ];

  readonly colorModes: { id: ColorMode; label: string; icon: string }[] = [
    { id: 'light',  label: 'Clair',   icon: '@tui.sun' },
    { id: 'dark',   label: 'Sombre',  icon: '@tui.moon' },
    { id: 'system', label: 'Système', icon: '@tui.monitor' },
  ];

  async ngOnInit(): Promise<void> {
    const workspaces = await firstValueFrom(this.wsService.getWorkspaces());
    const wsId = this.wsCtx.activeWorkspaceId();
    const active = workspaces.find(w => w.id === wsId) ?? workspaces[0] ?? null;
    if (active) this.workspaceName.set(active.name);
  }

  selectTheme(t: ThemeId): void {
    this.themeService.setTheme(t);
  }

  selectColorMode(m: ColorMode): void {
    this.themeService.setColorMode(m);
  }

  async saveWorkspaceName(): Promise<void> {
    const name = this.workspaceName().trim();
    const wsId = this.wsCtx.activeWorkspaceId();
    if (!name || !wsId || this.wsSaving()) return;

    this.wsSaving.set(true);
    const res = await firstValueFrom(this.wsService.updateWorkspace(wsId, name));
    this.wsSaving.set(false);

    if (res.success) {
      this.toast.success('Nom de l\'espace de travail mis à jour.');
    } else {
      this.toast.error(res.error ? res.error + '.' : 'Erreur de sauvegarde.');
    }
  }
}
