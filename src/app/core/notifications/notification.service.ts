import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, from, map, Observable, switchMap, tap } from 'rxjs';
import { Notification } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private supabase = inject(SupabaseService);

  /** Single source of truth for the unread counter. The shell's bell badge
   *  reads this directly. markAsRead / markAllAsRead update it optimistically
   *  so the badge reacts without a round-trip. refreshUnread() re-syncs
   *  with the server (called on shell startup + on relevant navigations). */
  readonly unreadCount = signal(0);

  /** Fetch the current unread count from the server and push it into the
   *  signal. Callers should await this on startup. Failures are swallowed
   *  (the count stays at whatever it was) — notifications aren't blocking. */
  async refreshUnread(): Promise<void> {
    try {
      const list = await firstValueFrom(this.listNotifications());
      this.unreadCount.set(list.filter(n => !n.read_at).length);
    } catch {
      // Non-fatal: leave the previous count in place.
    }
  }

  listNotifications(): Observable<Notification[]> {
    return from(
      this.supabase.client
        .from('notifications')
        .select('*, notification_reads!left(read_at)')
        .order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
          id:         row.id,
          title:      row.title,
          body:       row.body,
          category:   row.category,
          created_at: row.created_at,
          read_at:    row.notification_reads?.[0]?.read_at ?? null,
        }));
      }),
    );
  }

  markAsRead(notificationId: string): Observable<void> {
    return from(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data }) =>
        from(
          this.supabase.client
            .from('notification_reads')
            .upsert(
              { notification_id: notificationId, user_id: data.user?.id ?? null, read_at: new Date().toISOString() },
              { onConflict: 'notification_id,user_id' },
            ),
        ),
      ),
      // Optimistically decrement the badge — no round-trip needed to keep
      // the UI honest. Clamped at 0 for safety.
      tap(() => this.unreadCount.update(n => Math.max(0, n - 1))),
      map(() => undefined),
    );
  }

  markAllAsRead(ids: string[]): Observable<void> {
    if (ids.length === 0) return from(Promise.resolve(undefined));
    return from(this.supabase.client.auth.getUser()).pipe(
      switchMap(({ data }) => {
        const now = new Date().toISOString();
        const rows = ids.map(id => ({
          notification_id: id,
          user_id: data.user?.id ?? null,
          read_at: now,
        }));
        return from(
          this.supabase.client
            .from('notification_reads')
            .upsert(rows, { onConflict: 'notification_id,user_id' }),
        );
      }),
      tap(() => this.unreadCount.set(0)),
      map(() => undefined),
    );
  }
}
