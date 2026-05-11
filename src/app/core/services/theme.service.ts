import { Injectable, signal, effect } from '@angular/core';

export type ThemeId = 'archive' | 'broadsheet' | 'field';
export type ColorMode = 'light' | 'dark' | 'system';

const STORAGE_KEY_THEME = 'dad-theme';
const STORAGE_KEY_MODE  = 'dad-color-mode';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme    = signal<ThemeId>  (this._load(STORAGE_KEY_THEME,  'archive')  as ThemeId);
  readonly colorMode = signal<ColorMode>(this._load(STORAGE_KEY_MODE,  'system')   as ColorMode);

  constructor() {
    effect(() => this._apply(this.theme(), this.colorMode()));
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
