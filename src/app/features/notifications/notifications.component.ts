import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { Notification, NotificationCategory } from '../../models';
import { NotificationService } from '../../core/notifications/notification.service';

type NotifFilter = 'all' | 'unread' | NotificationCategory;

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [TuiIcon, DatePipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {
  private notifService = inject(NotificationService);

  readonly notifications = signal<Notification[]>([]);
  readonly activeFilter  = signal<NotifFilter>('all');
  readonly loading       = signal(true);

  readonly unreadCount = computed(() =>
    this.notifications().filter(n => !n.read_at).length,
  );

  readonly filtered = computed(() => {
    const f = this.activeFilter();
    const all = this.notifications();
    if (f === 'all')    return all;
    if (f === 'unread') return all.filter(n => !n.read_at);
    return all.filter(n => n.category === f);
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await firstValueFrom(this.notifService.listNotifications());
      this.notifications.set(list);
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(filter: NotifFilter): void {
    this.activeFilter.set(filter);
  }

  async markAsRead(id: string): Promise<void> {
    await firstValueFrom(this.notifService.markAsRead(id));
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n),
    );
  }

  async markAllAsRead(): Promise<void> {
    const unreadIds = this.notifications()
      .filter(n => !n.read_at)
      .map(n => n.id);
    if (unreadIds.length === 0) return;
    await firstValueFrom(this.notifService.markAllAsRead(unreadIds));
    const now = new Date().toISOString();
    this.notifications.update(list =>
      list.map(n => ({ ...n, read_at: n.read_at ?? now })),
    );
  }

  categoryLabel(cat: NotificationCategory): string {
    const map: Record<NotificationCategory, string> = {
      editorial: 'Éditorial',
      campaign:  'Campagne',
      system:    'Système',
    };
    return map[cat] ?? cat;
  }

  categoryIcon(cat: NotificationCategory): string {
    const map: Record<NotificationCategory, string> = {
      editorial: '@tui.book-open',
      campaign:  '@tui.megaphone',
      system:    '@tui.settings',
    };
    return map[cat] ?? '@tui.bell';
  }
}
