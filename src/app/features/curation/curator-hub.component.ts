import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { MONTHS_FR_LONG_CAP } from '../../core/utils/date.utils';
import { CurationStore, HubDayState } from './curation-store.service';
import { ProposeModalComponent } from './propose-modal.component';

interface DayCell {
  day: number;
  mmdd: string;
}
interface MonthSection {
  index: number;
  name: string;
  days: DayCell[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Recommander" — the propose hub: pick a day of the calendar year and
 *  open the propose modal on it. Day cells show the curator's own
 *  recommendation state plus whether the calendar already has content. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-curator-hub',
  standalone: true,
  imports: [TuiIcon, ProposeModalComponent],
  templateUrl: './curator-hub.component.html',
})
export class CuratorHubComponent implements OnInit {
  readonly store = inject(CurationStore);

  readonly expandedMonths = signal<Set<number>>(new Set([new Date().getMonth()]));
  readonly proposeMmdd = signal<string | null>(null);

  readonly months = computed<MonthSection[]>(() => {
    const year = this.store.calendarYear();
    return MONTHS_FR_LONG_CAP.map((name, idx) => {
      const lastDay = new Date(year, idx + 1, 0).getDate();
      const days: DayCell[] = [];
      for (let d = 1; d <= lastDay; d++) days.push({ day: d, mmdd: `${pad2(idx + 1)}-${pad2(d)}` });
      return { index: idx, name, days };
    });
  });

  async ngOnInit(): Promise<void> {
    await this.store.load();
  }

  toggleMonth(idx: number): void {
    this.expandedMonths.update((s) => {
      const next = new Set(s);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  isExpanded(idx: number): boolean {
    return this.expandedMonths().has(idx);
  }

  dayState(mmdd: string): HubDayState {
    return this.store.hubDayState(mmdd);
  }

  /** Count of my recommendations inside one month. */
  monthRecCount(monthIndex: number): number {
    const prefix = `${pad2(monthIndex + 1)}-`;
    return this.store.myCalendarRecs().filter((r) => r.mmdd.startsWith(prefix)).length;
  }

  onCalendarChange(id: string): void {
    if (id) void this.store.selectCalendar(id);
  }

  openDay(mmdd: string): void {
    this.proposeMmdd.set(mmdd);
  }

  closePropose(): void {
    this.proposeMmdd.set(null);
  }

  async onProposeSaved(): Promise<void> {
    this.proposeMmdd.set(null);
    await this.store.refreshRecs();
  }
}
