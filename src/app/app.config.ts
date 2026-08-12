import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withRouterConfig, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideTaiga } from '@taiga-ui/core';
import { routes } from './app.routes';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { GlobalErrorHandler } from './core/services/global-error-handler';
import { RefreshRouteReuseStrategy } from './core/router/refresh-route-reuse.strategy';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // NOTE (perf): the app is fully OnPush + signal-driven, so it is a
    // candidate for zoneless CD — `provideZonelessChangeDetection()` builds
    // clean and would drop zone.js (~35 KB) + its per-task overhead. Not
    // switched yet: it needs interactive runtime QA (Taiga UI interactions,
    // modals, async flows) that unit tests can't cover. To try it: swap this
    // provider, remove "zone.js" from angular.json polyfills, switch
    // src/setup-jest.ts to `jest-preset-angular/setup-env/zoneless`, then
    // exercise every page. See sprint notes.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withRouterConfig({ onSameUrlNavigation: 'reload' })),
    provideHttpClient(),
    provideTaiga(),
    { provide: LOCALE_ID, useValue: 'fr' },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: RouteReuseStrategy, useClass: RefreshRouteReuseStrategy },
  ],
};
