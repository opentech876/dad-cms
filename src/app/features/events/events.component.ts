import { Component, computed, inject, OnInit, signal } from '@angular/core';
import * as XLSX from 'xlsx';
import { FormsModule } from '@angular/forms';
import { TuiDay } from '@taiga-ui/cdk/date-time';
import { TuiIcon } from '@taiga-ui/core';
import { TuiInputDate } from '@taiga-ui/kit';
import { firstValueFrom } from 'rxjs';
import { Event, EventPosition } from '../../models';
import { EventService } from '../../core/events/event.service';
import { ToastService } from '../../core/services/toast.service';
import { CalendarService, CalendarSummary } from '../../core/calendar/calendar.service';
import { CalendarEntryService, CalendarEntrySlim } from '../../core/calendar/calendar-entry.service';

interface EventRow {
  eventId: string;
  date: string;
  year: number;
  title: string;
  excerpt: string | null;
  status: 'draft' | 'published';
  hasImage: boolean;
}

type SlotState = 'empty' | 'ours' | 'other' | 'confirming' | 'busy';

interface ImportPreviewRow {
  date:        string;
  title:       string;
  description: string;
  rawDate:     string;
  source:      string;
}

const MONTHS_FR_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Juil','Aoû','Sep','Oct','Nov','Déc'];
const MONTHS_FR_LONG  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function formatDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const d = parseInt(parts[2], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[0], 10);
  return `${d} ${MONTHS_FR_SHORT[m]} ${y}`;
}

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [TuiIcon, FormsModule, ...TuiInputDate],
  templateUrl: './events.component.html',
  styleUrl: './events.component.scss',
})
export class EventsComponent implements OnInit {
  private readonly eventService        = inject(EventService);
  private readonly calendarService     = inject(CalendarService);
  private readonly calendarEntryService = inject(CalendarEntryService);
  private readonly toast               = inject(ToastService);

  readonly events    = signal<Event[]>([]);
  readonly calendars = signal<CalendarSummary[]>([]);
  readonly loading   = signal(false);

  readonly positions: EventPosition[] = [1, 2];

  async ngOnInit(): Promise<void> {
    await Promise.all([this._reload(), this._reloadCalendars()]);
  }

  private async _reload(): Promise<void> {
    this.loading.set(true);
    const evts = await firstValueFrom(this.eventService.listEvents());
    this.events.set(evts);
    this.loading.set(false);
  }

  private async _reloadCalendars(): Promise<void> {
    const cals = await firstValueFrom(this.calendarService.listCalendars());
    this.calendars.set(cals);
  }

  // ── Filters ──────────────────────────────────────────────────────────────────
  readonly searchQuery    = signal('');
  readonly selectedYear   = signal(0);
  readonly selectedStatus = signal('all');

  readonly availableYears = computed(() => {
    const years = new Set(this.events().map(e => new Date(e.event_date + 'T00:00:00').getFullYear()));
    return [...years].sort((a, b) => b - a);
  });

  setSearchQuery(q: string): void    { this.searchQuery.set(q);    this.currentPage.set(0); }
  setSelectedYear(y: number): void   { this.selectedYear.set(y);   this.currentPage.set(0); }
  setSelectedStatus(s: string): void { this.selectedStatus.set(s); this.currentPage.set(0); }

  readonly listRows = computed<EventRow[]>(() => {
    const q      = this.searchQuery().toLowerCase().trim();
    const yr     = this.selectedYear();
    const status = this.selectedStatus();

    return this.events()
      .filter(e => {
        const year = new Date(e.event_date + 'T00:00:00').getFullYear();
        if (yr && year !== yr) return false;
        if (status !== 'all' && e.status !== status) return false;
        if (q && !e.title.toLowerCase().includes(q) && !e.event_date.includes(q)) return false;
        return true;
      })
      .map(e => ({
        eventId:  e.id,
        date:     formatDate(e.event_date),
        year:     new Date(e.event_date + 'T00:00:00').getFullYear(),
        title:    e.title,
        excerpt:  e.description ? e.description.slice(0, 70) + (e.description.length > 70 ? '…' : '') : null,
        status:   e.status,
        hasImage: !!e.image_path,
      }));
  });

  readonly stats = computed(() => {
    const all = this.events();
    return {
      total:     all.length,
      published: all.filter(e => e.status === 'published').length,
      draft:     all.filter(e => e.status === 'draft').length,
      noImage:   all.filter(e => !e.image_path).length,
    };
  });

  // ── Pagination ────────────────────────────────────────────────────────────────
  readonly currentPage = signal(0);
  readonly pageSize    = 20;

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.listRows().length / this.pageSize)),
  );

  readonly paginatedRows = computed(() => {
    const p = this.currentPage();
    return this.listRows().slice(p * this.pageSize, (p + 1) * this.pageSize);
  });

  nextPage(): void { if (this.currentPage() < this.totalPages() - 1) this.currentPage.update(p => p + 1); }
  prevPage(): void { if (this.currentPage() > 0) this.currentPage.update(p => p - 1); }

  // ── Editor core ───────────────────────────────────────────────────────────────
  readonly editorView = signal(false);

  readonly editorEventId      = signal<string | null>(null);
  readonly editorTitle        = signal('');
  readonly editorDate         = signal('');
  readonly editorDescription  = signal('');
  readonly editorCaption      = signal('');
  readonly editorStatus       = signal<'draft' | 'published'>('draft');
  readonly editorImageName    = signal<string | null>(null);
  readonly editorImageSizeKb  = signal(0);
  readonly editorImageFile    = signal<File | null>(null);
  readonly editorImagePath    = signal<string | null>(null);
  readonly editorLocalPreview = signal<string | null>(null);
  readonly editorSaving       = signal(false);
  readonly editorCreatedAt    = signal<string | null>(null);
  readonly editorUpdatedAt    = signal<string | null>(null);

  editorTuiDay: TuiDay | null = null;

  readonly editorHasImage  = computed(() => this.editorImageName() !== null);
  readonly titleCharCount  = computed(() => this.editorTitle().length);
  readonly descCharCount   = computed(() => this.editorDescription().length);

  readonly editorImageUrl = computed(() => {
    const local = this.editorLocalPreview();
    if (local) return local;
    const path = this.editorImagePath();
    if (!path) return null;
    return this.eventService.getImageUrl(path);
  });

  /** 'MM-DD' derived from the editor's date field, e.g. '08-15'. */
  readonly editorMmdd = computed(() => {
    const d = this.editorDate();
    return d.length >= 8 ? d.slice(5) : null;
  });

  /** Human label for the mmdd slot, e.g. '15 août'. */
  readonly editorMmddLabel = computed(() => {
    const d = this.editorDate();
    if (d.length < 10) return null;
    const parts = d.split('-');
    return `${parseInt(parts[2], 10)} ${MONTHS_FR_LONG[parseInt(parts[1], 10) - 1]}`;
  });

  readonly validationItems = computed(() => [
    { ok: this.editorTitle().length >= 4 && this.editorTitle().length <= 80,
      label: `Titre renseigné (${this.titleCharCount()} / 80 caractères)` },
    { ok: this.editorDate().length > 0,
      label: 'Date historique renseignée' },
    { ok: this.editorDescription().length >= 50,
      label: 'Description ≥ 50 caractères' },
    { ok: this.editorHasImage(),
      label: 'Image 800 × 600 px ≤ 150 Ko' },
    { ok: this.editorCaption().length > 0,
      label: "Légende d'image renseignée (recommandé)" },
  ]);

  // ── Calendar assignment panel ─────────────────────────────────────────────────
  readonly mmddEntries       = signal<CalendarEntrySlim[]>([]);
  readonly assignmentsLoading = signal(false);
  readonly confirmingRemoval  = signal<string | null>(null); // key = 'calId:position'
  readonly assignmentBusy     = signal<string | null>(null); // key of in-flight slot

  /** Maps 'calendarId:position' → entry for quick O(1) lookups. */
  readonly slotMap = computed(() => {
    const map = new Map<string, CalendarEntrySlim>();
    for (const e of this.mmddEntries()) {
      map.set(`${e.calendar_id}:${e.position}`, e);
    }
    return map;
  });

  /** Derives the visual state for each slot from reactive signals. */
  readonly slotStates = computed(() => {
    const slots     = this.slotMap();
    const eventId   = this.editorEventId();
    const confirming = this.confirmingRemoval();
    const busy      = this.assignmentBusy();
    const map = new Map<string, SlotState>();

    slots.forEach((entry, key) => {
      map.set(key, entry.event_id === eventId ? 'ours' : 'other');
    });

    // Transient UI states take precedence over data-derived states
    if (busy)      map.set(busy, 'busy');
    if (confirming) map.set(confirming, 'confirming');

    return map;
  });

  /** Titles of events occupying slots that belong to other events (for tooltip). */
  readonly slotOtherTitles = computed(() => {
    const map     = new Map<string, string>();
    const eventId = this.editorEventId();
    for (const [key, entry] of this.slotMap()) {
      if (entry.event_id !== eventId) {
        map.set(key, entry.event?.title ?? 'autre événement');
      }
    }
    return map;
  });

  toggleSlot(calendarId: string, position: EventPosition): void {
    const mmdd    = this.editorMmdd();
    const eventId = this.editorEventId();
    if (!mmdd || !eventId) return;

    const key   = `${calendarId}:${position}`;
    const state = this.slotStates().get(key) ?? 'empty';

    if (state === 'ours') {
      // Enter button-swap confirmation mode; auto-cancel after 4 s
      this.confirmingRemoval.set(key);
      setTimeout(() => {
        if (this.confirmingRemoval() === key) this.confirmingRemoval.set(null);
      }, 4000);
    } else if (state === 'empty' || state === 'other') {
      this._assign(calendarId, mmdd, eventId, position);
    }
  }

  confirmRemove(calendarId: string, position: EventPosition): void {
    const mmdd = this.editorMmdd();
    if (!mmdd) return;
    const key = `${calendarId}:${position}`;
    this.confirmingRemoval.set(null);
    this.assignmentBusy.set(key);
    firstValueFrom(this.calendarEntryService.unassignSlot(calendarId, mmdd, position))
      .then(() => this._reloadMmddEntries())
      .then(() => this.assignmentBusy.set(null))
      .catch((err) => {
        this.assignmentBusy.set(null);
        this.toast.error('Impossible de retirer l\'affectation.');
        console.error(err);
      });
  }

  cancelRemove(): void { this.confirmingRemoval.set(null); }

  private _assign(calendarId: string, mmdd: string, eventId: string, position: EventPosition): void {
    const key = `${calendarId}:${position}`;
    this.assignmentBusy.set(key);
    firstValueFrom(this.calendarEntryService.assignEvent(calendarId, mmdd, eventId, position))
      .then(() => this._reloadMmddEntries())
      .then(() => this.assignmentBusy.set(null))
      .catch((err) => {
        this.assignmentBusy.set(null);
        this.toast.error('Impossible d\'affecter l\'événement.');
        console.error(err);
      });
  }

  private async _reloadMmddEntries(): Promise<void> {
    const mmdd = this.editorMmdd();
    if (!mmdd) return;
    const entries = await firstValueFrom(this.calendarEntryService.getEntriesByMmdd(mmdd));
    this.mmddEntries.set(entries);
  }

  // ── Editor lifecycle ──────────────────────────────────────────────────────────
  onEditorDateChange(day: TuiDay | null): void {
    this.editorTuiDay = day;
    if (!day) { this.editorDate.set(''); return; }
    const m = String(day.month + 1).padStart(2, '0');
    const d = String(day.day).padStart(2, '0');
    this.editorDate.set(`${day.year}-${m}-${d}`);
  }

  private _isoToTuiDay(iso: string): TuiDay | null {
    const parts = iso.split('-');
    if (parts.length !== 3) return null;
    return TuiDay.normalizeOf(+parts[0], +parts[1] - 1, +parts[2]);
  }

  openEditor(eventId?: string): void {
    const evt = eventId ? this.events().find(e => e.id === eventId) : undefined;

    const old = this.editorLocalPreview();
    if (old) URL.revokeObjectURL(old);

    this.editorLocalPreview.set(null);
    this.confirmingRemoval.set(null);
    this.assignmentBusy.set(null);
    this.mmddEntries.set([]);

    this.editorEventId.set(eventId ?? null);
    this.editorTitle.set(evt?.title ?? '');
    this.editorDate.set(evt?.event_date ?? '');
    this.editorTuiDay = evt?.event_date ? this._isoToTuiDay(evt.event_date) : null;
    this.editorDescription.set(evt?.description ?? '');
    this.editorCaption.set('');
    this.editorStatus.set(evt?.status ?? 'draft');
    this.editorImageName.set(evt?.image_path ? evt.image_path.split('/').pop() ?? null : null);
    this.editorImagePath.set(evt?.image_path ?? null);
    this.editorImageSizeKb.set(0);
    this.editorImageFile.set(null);
    this.editorCreatedAt.set(evt?.created_at ?? null);
    this.editorUpdatedAt.set(evt?.updated_at ?? null);

    if (eventId && evt?.event_date) {
      this.assignmentsLoading.set(true);
      firstValueFrom(this.calendarEntryService.getEntriesByMmdd(evt.event_date.slice(5)))
        .then(entries => { this.mmddEntries.set(entries); this.assignmentsLoading.set(false); })
        .catch(() => this.assignmentsLoading.set(false));
    }

    this.editorView.set(true);
  }

  closeEditor(): void {
    const local = this.editorLocalPreview();
    if (local) URL.revokeObjectURL(local);
    this.editorLocalPreview.set(null);
    this.editorView.set(false);
  }

  private _resetEditor(): void {
    const old = this.editorLocalPreview();
    if (old) URL.revokeObjectURL(old);
    this.editorEventId.set(null);
    this.editorTitle.set('');
    this.editorDate.set('');
    this.editorTuiDay = null;
    this.editorDescription.set('');
    this.editorCaption.set('');
    this.editorStatus.set('draft');
    this.editorImageName.set(null);
    this.editorImagePath.set(null);
    this.editorImageSizeKb.set(0);
    this.editorImageFile.set(null);
    this.editorLocalPreview.set(null);
    this.mmddEntries.set([]);
    this.confirmingRemoval.set(null);
    this.assignmentBusy.set(null);
    // editorView intentionally left true
  }

  async saveDraft(): Promise<void> {
    if (this.editorSaving()) return;
    this.editorSaving.set(true);
    const ok = await this._save('draft');
    this.editorSaving.set(false);
    if (ok) {
      this.toast.success('Événement enregistré en brouillon.');
      this.closeEditor();
      await this._reload();
    }
  }

  async publish(): Promise<void> {
    if (this.editorSaving()) return;
    this.editorSaving.set(true);
    const ok = await this._save('published');
    this.editorSaving.set(false);
    if (ok) {
      this.toast.success('Événement publié avec succès.');
      this.closeEditor();
      await this._reload();
    }
  }

  /** Saves as draft, then immediately resets the form for a new event — no navigation. */
  async saveDraftAndCreateNew(): Promise<void> {
    if (this.editorSaving()) return;
    this.editorSaving.set(true);
    const ok = await this._save('draft');
    this.editorSaving.set(false);
    if (ok) {
      this.toast.success('Événement enregistré. Formulaire prêt pour un nouvel événement.');
      void this._reload();
      this._resetEditor();
    }
  }

  async deleteEvent(): Promise<void> {
    const id = this.editorEventId();
    if (!id) return;
    const res = await firstValueFrom(this.eventService.deleteEvent(id));
    if (!res.success) {
      this.toast.error(res.error ?? 'Impossible de supprimer l\'événement.');
      return;
    }
    this.toast.success('Événement supprimé.');
    this.closeEditor();
    await this._reload();
  }

  private async _save(status: 'draft' | 'published'): Promise<boolean> {
    const id = this.editorEventId();
    let eventId = id ?? undefined;

    if (id) {
      const res = await firstValueFrom(
        this.eventService.updateEvent(id, {
          title:       this.editorTitle().trim(),
          description: this.editorDescription() || null,
          event_date:  this.editorDate(),
          status,
        }),
      );
      if (!res.success) { this.toast.error(res.error ?? 'Erreur de sauvegarde.'); return false; }
    } else {
      const result = await firstValueFrom(
        this.eventService.createEvent({
          event_date:  this.editorDate(),
          title:       this.editorTitle().trim(),
          description: this.editorDescription() || undefined,
        }),
      );
      if (!result.success) { this.toast.error(result.error ?? 'Erreur de création.'); return false; }
      eventId = result.id;
    }

    const file = this.editorImageFile();
    if (file && eventId) {
      const upload = await firstValueFrom(this.eventService.uploadImage(eventId, file));
      if (upload.path) {
        await firstValueFrom(this.eventService.updateEvent(eventId, { image_path: upload.path }));
        this.editorImageFile.set(null);
      } else if (upload.error) {
        this.toast.warning(`Événement sauvegardé, mais l'upload de l'image a échoué : ${upload.error}`);
      }
    }
    return true;
  }

  // ── Excel import ─────────────────────────────────────────────────────────────

  readonly showImportModal = signal(false);
  readonly importPreview   = signal<ImportPreviewRow[]>([]);
  readonly importStatus    = signal<'idle' | 'preview' | 'importing' | 'done'>('idle');
  readonly importInserted  = signal(0);
  readonly importSkipped   = signal(0);
  readonly importError     = signal<string | null>(null);
  readonly importProgress  = signal(0);

  openImportModal(): void {
    this.importStatus.set('idle');
    this.importPreview.set([]);
    this.importInserted.set(0);
    this.importSkipped.set(0);
    this.importError.set(null);
    this.importProgress.set(0);
    this.showImportModal.set(true);
  }

  closeImportModal(): void { this.showImportModal.set(false); }

  onImportFileChange(ev: any): void {
    const file = ev?.target?.files?.[0] as File | undefined;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames.includes('Tableau_evenements')
          ? 'Tableau_evenements'
          : wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, defval: '' }) as string[][];
        const { valid, skipped } = this._parseImportRows(rows.slice(1));
        this.importPreview.set(valid);
        this.importSkipped.set(skipped);
        this.importStatus.set('preview');
        this.importError.set(null);
      } catch {
        this.importError.set('Impossible de lire le fichier. Vérifiez qu\'il s\'agit d\'un fichier Excel valide.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (ev?.target) ev.target.value = '';
  }

  private _parseImportRows(rows: string[][]): { valid: ImportPreviewRow[]; skipped: number } {
    let skipped = 0;
    const valid: ImportPreviewRow[] = [];
    for (const row of rows) {
      const rawDate  = String(row[0] ?? '').trim();
      const rawEvent = String(row[1] ?? '').trim().replace(/\r\n|\r/g, '\n');
      if (!rawDate || !rawEvent) { skipped++; continue; }
      const date = this._parseDDMMYYYY(rawDate);
      if (!date) { skipped++; continue; }
      const source      = String(row[2] ?? '').trim();
      const title       = this._extractTitle(rawEvent);
      const description = source ? `${rawEvent}\n\nSource : ${source}` : rawEvent;
      valid.push({ date, title, description, rawDate, source });
    }
    return { valid, skipped };
  }

  private _parseDDMMYYYY(raw: string): string | null {
    const parts = raw.split('/');
    if (parts.length !== 3) return null;
    const day   = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year  = parts[2];
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31 || year.length < 4) return null;
    return `${year}-${month}-${day}`;
  }

  private _extractTitle(text: string): string {
    let cleaned = text.replace(/\.?P\d+$/, '').trim();
    if (cleaned.length <= 100) return cleaned;
    const cut = cleaned.slice(0, 100);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
  }

  async runImport(): Promise<void> {
    const rows = this.importPreview();
    if (!rows.length || this.importStatus() === 'importing') return;
    this.importStatus.set('importing');
    this.importProgress.set(0);
    const CHUNK = 100;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const result = await firstValueFrom(
        this.eventService.batchCreateEvents(chunk.map(r => ({
          event_date: r.date, title: r.title, description: r.description,
        }))),
      );
      inserted += result.inserted;
      this.importProgress.set(Math.round(((i + chunk.length) / rows.length) * 100));
      if (result.error) { this.importError.set(result.error); break; }
    }
    this.importInserted.set(inserted);
    this.importStatus.set('done');
    await this._reload();
  }

  onImageChange(event: Event | globalThis.Event): void {
    const file = (event as globalThis.Event & { target: HTMLInputElement }).target?.files?.[0];
    if (!file) return;
    this.editorImageName.set(file.name);
    this.editorImageSizeKb.set(Math.round(file.size / 1024));
    this.editorImageFile.set(file);
    const old = this.editorLocalPreview();
    if (old) URL.revokeObjectURL(old);
    this.editorLocalPreview.set(URL.createObjectURL(file));
  }
}
