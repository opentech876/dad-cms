import { Component, computed, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { TuiIcon } from '@taiga-ui/core';

interface DateRow {
  date: string;
  dow: string;
  count: 0 | 1 | 2;
  title: string | null;
  sub: string | null;
  ad: string;
  status: 'published' | 'draft' | 'empty';
}

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [TuiIcon, SlicePipe],
  templateUrl: './events.component.html',
  styleUrl: './events.component.scss',
})
export class EventsComponent {
  // ── List ──
  readonly searchQuery = signal('');
  readonly selectedYear = signal(0);
  readonly selectedStatus = signal('all');
  readonly yearOptions = [2024, 2025, 2026];

  // ── Editor toggle ──
  readonly editorView = signal(false);

  // ── Editor form ──
  readonly editorTitle       = signal('');
  readonly editorDate        = signal('');
  readonly editorCalendar    = signal('2025');
  readonly editorDescription = signal('');
  readonly editorCaption     = signal('');
  readonly editorStatus      = signal<'draft' | 'published'>('draft');
  readonly editorImageName   = signal<string | null>(null);
  readonly editorImageSizeKb = signal(0);

  readonly editorHasImage  = computed(() => this.editorImageName() !== null);
  readonly titleCharCount  = computed(() => this.editorTitle().length);
  readonly descCharCount   = computed(() => this.editorDescription().length);

  readonly validationItems = computed(() => [
    { ok: this.editorTitle().length >= 4 && this.editorTitle().length <= 80,
      label: `Titre renseigné (${this.titleCharCount()} / 80 caractères)` },
    { ok: this.editorHasImage(),
      label: 'Image 800 × 600 px ≤ 150 Ko' },
    { ok: this.editorDescription().length >= 50,
      label: 'Description ≥ 50 caractères' },
    { ok: this.editorDate().length > 0,
      label: 'Date valide et unique sur le calendrier' },
    { ok: this.editorCaption().length > 0,
      label: "Légende d'image renseignée (recommandé)" },
  ]);

  openEditor(row?: DateRow): void {
    this.editorTitle.set(row?.title ?? '');
    this.editorDate.set(row?.date ?? '');
    this.editorCalendar.set('2025');
    this.editorDescription.set('');
    this.editorCaption.set('');
    this.editorStatus.set(row?.status === 'published' ? 'published' : 'draft');
    this.editorImageName.set(null);
    this.editorImageSizeKb.set(0);
    this.editorView.set(true);
  }

  closeEditor(): void { this.editorView.set(false); }

  saveDraft(): void {
    this.editorStatus.set('draft');
    this.closeEditor();
  }

  publish(): void {
    this.editorStatus.set('published');
    this.closeEditor();
  }

  onImageChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.editorImageName.set(file.name);
    this.editorImageSizeKb.set(Math.round(file.size / 1024));
  }

  // ── Data ──
  readonly rows: DateRow[] = [
    { date: '15 août 2025',     dow: 'Vendredi',  count: 2, title: 'Indépendance de la République du Congo', sub: '+ Premier Conseil des ministres',       ad: 'MTN · SG Congo',           status: 'published' },
    { date: '14 août 2025',     dow: 'Jeudi',     count: 1, title: 'Visite officielle à Pointe-Noire',       sub: null,                                     ad: 'MTN',                      status: 'published' },
    { date: '13 août 2025',     dow: 'Mercredi',  count: 0, title: null,                                     sub: null,                                     ad: '—',                        status: 'empty'     },
    { date: '12 août 2025',     dow: 'Mardi',     count: 2, title: "Création de l'AEF à Brazzaville",        sub: '+ Inauguration du chemin de fer',         ad: 'MTN · SG Congo',           status: 'published' },
    { date: '11 août 2025',     dow: 'Lundi',     count: 1, title: "Discours de Léon M'Ba à l'Assemblée",   sub: null,                                     ad: '—',                        status: 'draft'     },
    { date: '10 août 2025',     dow: 'Dimanche',  count: 2, title: "Naissance de Tchicaya U Tam'si",         sub: '+ Festival panafricain de musique',       ad: 'BraCongo · TotalEnergies', status: 'published' },
    { date: '09 août 2025',     dow: 'Samedi',    count: 0, title: null,                                     sub: null,                                     ad: '—',                        status: 'empty'     },
    { date: '08 août 2025',     dow: 'Vendredi',  count: 1, title: "Sommet de l'OUA à Brazzaville",          sub: null,                                     ad: 'SG Congo',                 status: 'published' },
    { date: '28 novembre 2025', dow: 'Vendredi',  count: 2, title: 'Adoption de la Constitution de 1958',   sub: '+ Serment de la République',             ad: '—',                        status: 'published' },
    { date: '10 mars 2025',     dow: 'Lundi',     count: 2, title: 'Conférence nationale souveraine',        sub: "+ Discours d'André Milongo",              ad: '—',                        status: 'draft'     },
    { date: '28 juin 2025',     dow: 'Samedi',    count: 1, title: 'Naissance de Marien Ngouabi',            sub: null,                                     ad: '—',                        status: 'published' },
    { date: '18 février 2025',  dow: 'Mardi',     count: 1, title: 'Création du Parti Congolais du Travail', sub: null,                                    ad: '—',                        status: 'published' },
  ];

  readonly stats = {
    total: 365,
    complete: 243,
    partial: 56,
    empty: 66,
  };
}
