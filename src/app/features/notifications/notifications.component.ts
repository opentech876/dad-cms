import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { Notification, NotificationCategory } from '../../models';
import { NotificationService } from '../../core/notifications/notification.service';

type NotifFilter = 'all' | 'unread' | NotificationCategory;

const PAGE_SIZE = 20;

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
  readonly currentPage   = signal(1);
  readonly pageSize      = PAGE_SIZE;

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

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.pageSize)),
  );

  readonly paged = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });

  readonly pageRangeLabel = computed(() => {
    const total = this.filtered().length;
    if (total === 0) return '0';
    const start = (this.currentPage() - 1) * this.pageSize + 1;
    const end   = Math.min(start + this.pageSize - 1, total);
    return `${start}–${end} sur ${total}`;
  });

  constructor() {
    // Reset to page 1 whenever the active filter changes AND clamp the
    // current page to [1, totalPages] if the filtered list shrinks under
    // it (e.g., after markAllAsRead() empties the "unread" tab).
    effect(() => {
      // Read to establish dependency, then reset. Filter is the trigger.
      this.activeFilter();
      this.currentPage.set(1);
    });
    effect(() => {
      const max = this.totalPages();
      if (this.currentPage() > max) this.currentPage.set(max);
    });
  }

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

  goToPage(page: number): void {
    const target = Math.max(1, Math.min(page, this.totalPages()));
    this.currentPage.set(target);
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
