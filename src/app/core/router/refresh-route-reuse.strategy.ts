import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
  RouteReuseStrategy,
} from '@angular/router';

/**
 * Default-style route reuse strategy with one-shot "force refresh" support.
 *
 * Combined with `onSameUrlNavigation: 'reload'`, this lets callers force a
 * full component re-instantiation on the next navigation — even when the
 * URL hasn't changed. Used by the workspace switcher to re-fetch data after
 * `activeWorkspaceId` changes without a full `window.location.reload()`.
 */
@Injectable({ providedIn: 'root' })
export class RefreshRouteReuseStrategy implements RouteReuseStrategy {
  private forceRefreshOnce = false;

  /** Arm a one-shot refresh: the next navigation will NOT reuse components. */
  triggerRefresh(): void {
    this.forceRefreshOnce = true;
  }

  shouldDetach(_route: ActivatedRouteSnapshot): boolean { return false; }
  store(_route: ActivatedRouteSnapshot, _handle: DetachedRouteHandle | null): void {}
  shouldAttach(_route: ActivatedRouteSnapshot): boolean { return false; }
  retrieve(_route: ActivatedRouteSnapshot): DetachedRouteHandle | null { return null; }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (this.forceRefreshOnce) {
      this.forceRefreshOnce = false;
      return false;
    }
    return future.routeConfig === curr.routeConfig;
  }
}
