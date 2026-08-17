import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TuiIcon } from '@taiga-ui/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Company, CompanyTypeRow } from '../../models';
import { CompanyService } from '../../core/companies/company.service';
import { CompanyTypeService } from '../../core/companies/company-type.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { formatDateShort } from '../../core/utils/date.utils';

/** Fallback categories shown before the managed `company_types` table is
 *  populated (e.g. pre-migration) so the editor dropdown is never empty. */
const DEFAULT_TYPE_LABELS = [
  'Télécommunications', 'Banque & Finance', 'Énergie', 'Distribution',
  'Services', 'Gouvernement', 'ONG', 'Médias', 'Santé', 'Autre',
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
  private readonly companyService     = inject(CompanyService);
  private readonly companyTypeService = inject(CompanyTypeService);
  private readonly authService        = inject(AuthService);
  private readonly toast              = inject(ToastService);

  readonly companies = signal<Company[]>([]);
  readonly types     = signal<CompanyTypeRow[]>([]);
  readonly loading   = signal(true);

  /** Only chef_equipe_commerciale (and owner) can create/edit/delete. */
  readonly canWrite = toSignal(
    this.authService.hasRoleAtLeast('chef_equipe_commerciale'),
    { initialValue: false },
  );

  readonly searchQuery = signal('');
  readonly filterType  = signal<string>('all');

  setSearchQuery(q: string): void { this.searchQuery.set(q); }
  setFilterType(t: string): void  { this.filterType.set(t); }

  /** Category labels for the editor dropdown + type filter — the managed rows
   *  when present, otherwise the built-in defaults so the UI still works before
   *  the migration is applied. */
  readonly typeOptions = computed<string[]>(() => {
    const rows = this.types();
    return rows.length ? rows.map(r => r.label) : DEFAULT_TYPE_LABELS;
  });

  readonly filteredCompanies = computed<Company[]>(() => {
    const q    = this.searchQuery().toLowerCase().trim();
    const type = this.filterType();
    return this.companies().filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.type ?? '').toLowerCase().includes(q)) return false;
      if (type !== 'all' && c.type !== type) return false;
      return true;
    });
  });

  formatDate(iso: string): string { return formatDateShort(iso); }

  // ── Company editor (modal) ──────────────────────────────────────────────────

  readonly editorOpen    = signal(false);
  readonly editorId      = signal<string | null>(null);
  readonly editorName    = signal('');
  readonly editorType    = signal<string>('');
  readonly editorWebsite = signal('');
  readonly editorEmail   = signal('');
  readonly editorPhone   = signal('');
  readonly editorNotes   = signal('');
  readonly editorSaving  = signal(false);

  readonly editorValid = computed(
    () => this.editorName().trim().length >= 2 && this.editorType().trim().length > 0,
  );

  openEditor(id?: string): void {
    if (!this.canWrite()) return;
    const c = id ? this.companies().find(co => co.id === id) : undefined;
    this.editorId.set(c?.id ?? null);
    this.editorName.set(c?.name ?? '');
    this.editorType.set(c?.type ?? this.typeOptions()[0] ?? '');
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
      type: this.editorType().trim(),
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

  // ── Types manager (modal) ───────────────────────────────────────────────────

  readonly typesManagerOpen = signal(false);
  readonly newTypeLabel     = signal('');
  readonly typeBusy         = signal(false);

  openTypesManager(): void {
    if (!this.canWrite()) return;
    this.newTypeLabel.set('');
    this.typesManagerOpen.set(true);
  }
  closeTypesManager(): void { this.typesManagerOpen.set(false); }

  async addType(): Promise<void> {
    const label = this.newTypeLabel().trim();
    if (!label || this.typeBusy()) return;
    this.typeBusy.set(true);
    const res = await firstValueFrom(this.companyTypeService.createType(label));
    this.typeBusy.set(false);
    if (!res.success) {
      this.toast.error(res.error === 'duplicate_label' ? 'Ce type existe déjà.' : (res.error ?? "Échec de l'ajout."));
      return;
    }
    this.newTypeLabel.set('');
    await this.reloadTypes();
  }

  async renameType(row: CompanyTypeRow): Promise<void> {
    const label = (prompt('Nouveau nom du type :', row.label) ?? '').trim();
    if (!label || label === row.label || this.typeBusy()) return;
    this.typeBusy.set(true);
    const res = await firstValueFrom(this.companyTypeService.renameType(row.id, label));
    this.typeBusy.set(false);
    if (!res.success) {
      this.toast.error(res.error === 'duplicate_label' ? 'Ce type existe déjà.' : (res.error ?? 'Échec du renommage.'));
      return;
    }
    this.toast.warning(
      "Type renommé. Les compagnies déjà classées gardent l'ancien libellé jusqu'à leur prochaine modification.",
    );
    await this.reloadTypes();
  }

  async removeType(row: CompanyTypeRow): Promise<void> {
    if (this.typeBusy()) return;
    if (!confirm(`Supprimer le type « ${row.label} » ? Les compagnies déjà classées conservent ce libellé.`)) return;
    this.typeBusy.set(true);
    const res = await firstValueFrom(this.companyTypeService.deleteType(row.id));
    this.typeBusy.set(false);
    if (!res.success) {
      this.toast.error(res.error ?? 'Impossible de supprimer.');
      return;
    }
    await this.reloadTypes();
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    const [list, types] = await Promise.all([
      firstValueFrom(this.companyService.listCompanies()),
      firstValueFrom(this.companyTypeService.listTypes()),
    ]);
    this.companies.set(list);
    this.types.set(types);
    this.loading.set(false);
  }

  private async reloadTypes(): Promise<void> {
    this.types.set(await firstValueFrom(this.companyTypeService.listTypes()));
  }
}
