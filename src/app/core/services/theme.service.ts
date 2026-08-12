import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { TUI_DARK_MODE } from '@taiga-ui/core';

export type ThemeId = 'archive' | 'broadsheet' | 'field';
export type ColorMode = 'light' | 'dark' | 'system';

const STORAGE_KEY_THEME = 'dad-theme';
const STORAGE_KEY_MODE  = 'dad-color-mode';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme    = signal<ThemeId>  (this._load(STORAGE_KEY_THEME,  'archive')  as ThemeId);
  // Default to explicit 'light' rather than 'system': the app's editorial
  // identity is light-first, and the dark variant has known contrast traps
  // we haven't audited end-to-end yet. Users on dark-preferring OSes who
  // want dark can still pick it from the theme settings; their choice is
  // persisted in localStorage and takes precedence over this default.
  readonly colorMode = signal<ColorMode>(this._load(STORAGE_KEY_MODE,  'light')    as ColorMode);

  // Taiga's dark-mode signal, injected optionally so the service stays usable
  // and unit-testable without Taiga's providers. Synced below so Taiga
  // components (date picker, dropdowns, tui-root portals) follow the app.
  private readonly tuiDarkMode = inject(TUI_DARK_MODE, { optional: true });

  // Tracks the OS/browser dark preference — only consulted when colorMode is
  // 'system'. Guarded for non-DOM/jsdom environments (matchMedia undefined).
  private readonly _systemDark = signal(
    typeof window !== 'undefined' && !!window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  /** The light/dark actually in effect: explicit mode, else system preference. */
  readonly effectiveDark = computed(() => {
    const mode = this.colorMode();
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return this._systemDark();
  });

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', e => this._systemDark.set(e.matches));
    }
    effect(() => {
      this._apply(this.theme(), this.colorMode());
      // Keep Taiga's theme in lockstep with the app's effective dark state.
      this.tuiDarkMode?.set(this.effectiveDark());
    });
  }

  setTheme(t: ThemeId):      void { this.theme.set(t);     localStorage.setItem(STORAGE_KEY_THEME, t); }
  setColorMode(m: ColorMode): void { this.colorMode.set(m); localStorage.setItem(STORAGE_KEY_MODE, m); }
  toggleDark(): void {
    this.setColorMode(this.colorMode() === 'dark' ? 'system' : 'dark');
  }

  loadFromProfile(theme: string | null, colorMode: string | null): void {
    const validThemes: ThemeId[] = ['archive', 'broadsheet', 'field'];
    const validModes: ColorMode[] = ['light', 'dark', 'system'];
    if (theme && validThemes.includes(theme as ThemeId)) {
      this.theme.set(theme as ThemeId);
      localStorage.setItem(STORAGE_KEY_THEME, theme);
    }
    if (colorMode && validModes.includes(colorMode as ColorMode)) {
      this.colorMode.set(colorMode as ColorMode);
      localStorage.setItem(STORAGE_KEY_MODE, colorMode);
    }
  }

  private _apply(theme: ThemeId, mode: ColorMode): void {
    const root = document.documentElement;
    if (theme === 'archive') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    if (mode === 'system') {
      root.removeAttribute('data-mode');
    } else {
      root.setAttribute('data-mode', mode);
    }
  }

  private _load(key: string, fallback: string): string {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(key)) || fallback;
  }
}
