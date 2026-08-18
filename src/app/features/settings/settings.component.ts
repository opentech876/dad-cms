import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService, ThemeId, ColorMode } from '../../core/services/theme.service';
import { SupabaseService } from '../../core/supabase/supabase.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-settings',
  standalone: true,
  imports: [TuiIcon],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  readonly themeService       = inject(ThemeService);
  private readonly auth       = inject(AuthService);
  private readonly supabase   = inject(SupabaseService);

  readonly isOwner = toSignal(this.auth.currentRole$.pipe(map(r => r === 'owner')), { initialValue: false });

  readonly dbStatus = signal<'checking' | 'connected' | 'error'>('checking');
  readonly storageUsedMb = signal<number | null>(null);

  storagePercent(): number {
    const mb = this.storageUsedMb();
    if (mb === null) return 0;
    return Math.min(100, (mb / 500) * 100);
  }

  readonly themes: { id: ThemeId; label: string; desc: string }[] = [
    { id: 'archive',    label: 'Archive',    desc: 'Ivoire crème, accent bordeaux & ocre' },
    { id: 'broadsheet', label: 'Broadsheet', desc: 'Surfaces blanches, accent rouge & bleu' },
    { id: 'field',      label: 'Terrain',    desc: 'Kraft & vert forêt, accent sarcelle' },
  ];

  readonly colorModes: { id: ColorMode; label: string; icon: string }[] = [
    { id: 'light',  label: 'Clair',   icon: '@tui.sun' },
    { id: 'dark',   label: 'Sombre',  icon: '@tui.moon' },
    { id: 'system', label: 'Système', icon: '@tui.monitor' },
  ];

  async ngOnInit(): Promise<void> {
    if (this.isOwner()) {
      await this._checkHealth();
    }
  }

  selectTheme(t: ThemeId): void { this.themeService.setTheme(t); }
  selectColorMode(m: ColorMode): void { this.themeService.setColorMode(m); }

  async refreshHealth(): Promise<void> {
    this.dbStatus.set('checking');
    this.storageUsedMb.set(null);
    await this._checkHealth();
  }

  private async _checkHealth(): Promise<void> {
    try {
      const { error } = await this.supabase.client
        .from('workspaces')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      this.dbStatus.set('connected');

      const { data } = await this.supabase.client.rpc('get_storage_usage_mb') as any;
      if (data !== null && data !== undefined) this.storageUsedMb.set(data);
    } catch {
      this.dbStatus.set('error');
    }
  }
}
