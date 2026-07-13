import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { Notification, NotificationActor, NotificationCategory } from '../../models';
import { NotificationService } from '../../core/notifications/notification.service';
import { getInitials } from '../../core/utils/labels.utils';
import { DATE_FMT } from '../../core/utils/date.utils';

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
  /** Canonical date-pipe formats (fr) — see date.utils DATE_FMT. */
  protected readonly DATE_FMT = DATE_FMT;
  private notifService = inject(NotificationService);
  private router       = inject(Router);

  readonly notifications = signal<Notification[]>([]);
  readonly activeFilter  = signal<NotifFilter>('all');
  readonly loading       = signal(true);
  readonly currentPage   = signal(1);
  readonly pageSize      = PAGE_SIZE;

  // ── Detail modal state ─────────────────────────────────────────────
  readonly selectedNotif  = signal<Notification | null>(null);
  readonly selectedActor  = signal<NotificationActor | null>(null);
  readonly loadingActor   = signal(false);

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

  // ── Detail modal handlers ────────────────────────────────────────────

  /** Row click → open detail modal + mark read if it wasn't already. */
  async openDetail(notif: Notification): Promise<void> {
    this.selectedNotif.set(notif);
    this.selectedActor.set(null);
    // Mark read only on first open (visual + badge accuracy).
    if (!notif.read_at) {
      await this.markAsRead(notif.id);
    }
    // Fetch actor lazily. Failures leave the modal without an author
    // block — non-blocking, the timestamp + action still tell the story.
    if (notif.actor_id && notif.workspace_id) {
      this.loadingActor.set(true);
      try {
        const actor = await firstValueFrom(
          this.notifService.getActorProfile(notif.actor_id, notif.workspace_id),
        );
        this.selectedActor.set(actor);
      } finally {
        this.loadingActor.set(false);
      }
    }
  }

  closeDetail(): void {
    this.selectedNotif.set(null);
    this.selectedActor.set(null);
  }

  async openLink(): Promise<void> {
    const notif = this.selectedNotif();
    if (!notif?.link_path) return;
    this.closeDetail();
    await this.router.navigateByUrl(notif.link_path);
  }

  /** Human-readable action label. Falls back to the raw op if unknown. */
  actionLabel(action: string | null): string {
    if (!action) return '';
    const map: Record<string, string> = {
      INSERT: 'Créé',
      UPDATE: 'Modifié',
      DELETE: 'Supprimé',
    };
    return map[action] ?? action;
  }

  /** Human-readable target label. Uses the singular form. */
  tableLabel(tableName: string | null): string {
    if (!tableName) return '';
    const map: Record<string, string> = {
      events:                     'Événement',
      calendars:                  'Calendrier',
      calendar_entries:           'Affectation de calendrier',
      ad_campaigns:               'Campagne publicitaire',
      companies:                  'Entreprise',
      presidency_recommendations: 'Recommandation du Curateur',
      workspaces:                 'Espace de travail',
      workspace_members:          'Membre',
      user_roles:                 'Rôle plateforme',
      profiles:                   'Profil',
    };
    return map[tableName] ?? tableName;
  }

  /** Initials for the actor avatar fallback (when avatar_url is null). */
  actorInitials(fullName: string | null): string {
    if (!fullName) return '?';
    return getInitials(fullName);
  }
}
