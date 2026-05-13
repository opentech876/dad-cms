import { inject, Injectable } from '@angular/core';
import { from, map, Observable, switchMap } from 'rxjs';
import { Notification } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private supabase = inject(SupabaseService);

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
      map(() => undefined),
    );
  }

  unreadCount(): Observable<number> {
    return this.listNotifications().pipe(
      map(notifs => notifs.filter(n => !n.read_at).length),
    );
  }
}
