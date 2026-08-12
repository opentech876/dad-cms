import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TuiIcon } from '@taiga-ui/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Company, CompanyType } from '../../models';
import { CompanyService } from '../../core/companies/company.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { formatDateShort } from '../../core/utils/date.utils';

const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  telecom:      'Télécommunications',
  banque:       'Banque & Finance',
  energie:      'Énergie',
  distribution: 'Distribution',
  services:     'Services',
  gouvernement: 'Gouvernement',
  ong:          'ONG',
  medias:       'Médias',
  sante:        'Santé',
  autre:        'Autre',
};

const COMPANY_TYPES: CompanyType[] = [
  'telecom', 'banque', 'energie', 'distribution',
  'services', 'gouvernement', 'ong', 'medias', 'sante', 'autre',
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-companies',
  standalone: true,
  imports: [CommonModule, FormsModule, TuiIcon],
  templateUrl: './companies.component.html',
  styleUrl: './companies.component.scss',
})
export class CompaniesComponent implements OnInit {
  private readonly companyService = inject(CompanyService);
  private readonly authService    = inject(AuthService);
  private readonly toast          = inject(ToastService);

  readonly companies = signal<Company[]>([]);
  readonly loading   = signal(true);

  /** Only chef_equipe_commerciale (and owner) can create/edit/delete. */
  readonly canWrite = toSignal(
    this.authService.hasRoleAtLeast('chef_equipe_commerciale'),
    { initialValue: false },
  );

  readonly searchQuery   = signal('');
  readonly filterType    = signal<CompanyType | 'all'>('all');
  readonly filterDomain  = signal('all');

  setSearchQuery(q: string): void { this.searchQuery.set(q); }
  setFilterType(t: string): void  { this.filterType.set(t as any); }
  setFilterDomain(d: string): void { this.filterDomain.set(d); }

  readonly availableDomains = computed<string[]>(() => {
    const set = new Set<string>();
    for (const c of this.companies()) {
      if (c.business_domain && c.business_domain.trim()) set.add(c.business_domain.trim());
    }
    return Array.from(set).sort();
  });

  readonly filteredCompanies = computed<Company[]>(() => {
    const q     = this.searchQuery().toLowerCase().trim();
    const type  = this.filterType();
    const dom   = this.filterDomain();
    return this.companies().filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.business_domain ?? '').toLowerCase().includes(q)) return false;
      if (type !== 'all' && c.type !== type) return false;
      if (dom !== 'all' && c.business_domain !== dom) return false;
      return true;
    });
  });

  readonly companyTypes = COMPANY_TYPES;
  readonly companyTypeLabels = COMPANY_TYPE_LABELS;
  typeLabel(t: CompanyType): string { return COMPANY_TYPE_LABELS[t] ?? t; }
  formatDate(iso: string): string { return formatDateShort(iso); }

  // ── Editor (modal) ────────────────────────────────────────────────────────

  readonly editorOpen     = signal(false);
  readonly editorId       = signal<string | null>(null);
  readonly editorName     = signal('');
  readonly editorType     = signal<CompanyType>('autre');
  readonly editorDomain   = signal('');
  readonly editorWebsite  = signal('');
  readonly editorEmail    = signal('');
  readonly editorPhone    = signal('');
  readonly editorNotes    = signal('');
  readonly editorSaving   = signal(false);

  readonly editorValid = computed(() => this.editorName().trim().length >= 2);

  openEditor(id?: string): void {
    if (!this.canWrite()) return;
    const c = id ? this.companies().find(co => co.id === id) : undefined;
    this.editorId.set(c?.id ?? null);
    this.editorName.set(c?.name ?? '');
    this.editorType.set(c?.type ?? 'autre');
    this.editorDomain.set(c?.business_domain ?? '');
    this.editorWebsite.set(c?.website ?? '');
    this.editorEmail.set(c?.contact_email ?? '');
    this.editorPhone.set(c?.contact_phone ?? '');
    this.editorNotes.set(c?.notes ?? '');
    this.editorOpen.set(true);
  }

  closeEditor(): void { this.editorOpen.set(false); }

  async saveEditor(): Promise<void> {
    if (!this.editorValid() || this.editorSaving()) return;
    this.editorSaving.set(true);
    const payload = {
      name: this.editorName().trim(),
      type: this.editorType(),
      business_domain: this.editorDomain().trim() || null,
      website: this.editorWebsite().trim() || null,
      contact_email: this.editorEmail().trim() || null,
      contact_phone: this.editorPhone().trim() || null,
      notes: this.editorNotes().trim() || null,
    };
    const id = this.editorId();
    const res = id
      ? await firstValueFrom(this.companyService.updateCompany(id, payload))
      : await firstValueFrom(this.companyService.createCompany(payload));
    this.editorSaving.set(false);
    if (!res.success) {
      const msg = res.error === 'duplicate_name'
        ? 'Une compagnie porte déjà ce nom dans cet espace.'
        : (res.error ?? 'Erreur lors de l\'enregistrement.');
      this.toast.error(msg);
      return;
    }
    this.toast.success(id ? 'Compagnie mise à jour.' : 'Compagnie créée.');
    this.closeEditor();
    await this.reload();
  }

  async deleteCompany(id: string): Promise<void> {
    if (!this.canWrite()) return;
    if (!confirm('Supprimer cette compagnie ? Les campagnes liées ne pourront plus la référencer.')) return;
    const res = await firstValueFrom(this.companyService.deleteCompany(id));
    if (!res.success) {
      this.toast.error(res.error ?? 'Impossible de supprimer.');
      return;
    }
    this.toast.success('Compagnie supprimée.');
    await this.reload();
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    const list = await firstValueFrom(this.companyService.listCompanies());
    this.companies.set(list);
    this.loading.set(false);
  }
}
