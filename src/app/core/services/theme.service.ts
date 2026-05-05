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

  private _apply(theme: ThemeId, mode: ColorMode): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme === 'archive' ? (mode === 'dark' ? 'dark' : 'light') : theme);
    if (mode === 'dark' && theme === 'archive') root.setAttribute('data-theme', 'dark');
    if (mode === 'light') root.removeAttribute('data-theme'); // light = CSS :root default
    if (mode === 'system') root.removeAttribute('data-theme'); // let prefers-color-scheme take over
  }

  private _load(key: string, fallback: string): string {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(key)) || fallback;
  }
}
