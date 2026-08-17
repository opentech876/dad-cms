import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AdCampaign, CampaignValidationState, Company, campaignValidationState } from '../../models';
import { CompanyService } from '../../core/companies/company.service';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { formatDateShort } from '../../core/utils/date.utils';
import { compressImage } from '../../core/utils/image.utils';

type CampaignStatus = 'active' | 'planifiee' | 'terminee';

interface CampaignRow {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  status: CampaignStatus;
  validation: CampaignValidationState;
  /** Days from today until start (negative if already started). */
  daysUntilStart: number;
  imagePath: string | null;
}

function campaignStatus(c: AdCampaign): CampaignStatus {
  if (!c.active) return 'terminee';
  const today = new Date().toISOString().slice(0, 10);
  if (c.start_date > today) return 'planifiee';
  if (c.end_date < today) return 'terminee';
  return 'active';
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ad-campaigns',
  standalone: true,
  imports: [TuiIcon, FormsModule, RouterLink],
  templateUrl: './ad-campaigns.component.html',
  styleUrl: './ad-campaigns.component.scss',
})
export class AdCampaignsComponent implements OnInit {
  readonly campaignService = inject(CampaignService);
  private readonly companyService = inject(CompanyService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly campaigns = signal<AdCampaign[]>([]);
  readonly companies = signal<Company[]>([]);
  readonly loading   = signal(false);

  /** True if current user can mark paid / confirm campaigns. Server enforces too via RPC. */
  readonly canValidate = toSignal(
    this.authService.hasRoleAtLeast('chef_equipe_commerciale'),
    { initialValue: false },
  );

  /** Helper to compute days from today to a YYYY-MM-DD; negative = already started. */
  private _daysUntil(startISO: string): number {
    const start = new Date(startISO + 'T00:00:00Z').getTime();
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    return Math.round((start - today) / 86_400_000);
  }

  async ngOnInit(): Promise<void> {
    await this._reload();
  }

  private async _reload(): Promise<void> {
    this.loading.set(true);
    const [campaigns, companies] = await Promise.all([
      firstValueFrom(this.campaignService.listCampaigns()),
      firstValueFrom(this.companyService.listCompanies()),
    ]);
    this.campaigns.set(campaigns);
    this.companies.set(companies);
    this.loading.set(false);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  readonly stats = computed(() => {
    const all = this.campaigns();
    const today = new Date().toISOString().slice(0, 10);
    const active = all.filter(c => c.active && c.start_date <= today && c.end_date >= today);
    const pendingValidation = all.filter(c => !c.deleted_at && !c.validated_at).length;
    const startingSoonUnvalidated = all.filter(c => {
      if (c.deleted_at || c.validated_at) return false;
      const d = this._daysUntil(c.start_date);
      return d >= 0 && d <= 10;
    }).length;
    return {
      active: active.length,
      planifiee: all.filter(c => c.active && c.start_date > today).length,
      terminee: all.filter(c => !c.active || c.end_date < today).length,
      pendingValidation,
      startingSoonUnvalidated,
    };
  });

  readonly currentYear = new Date().getFullYear();

  /** Distinct days of the CURRENT year covered by a validated + active
   *  campaign — footer runs one ad/day, so this is the sold inventory. Mirrors
   *  the dashboard AdOutlook.soldDaysYear definition so the two never disagree. */
  readonly soldDaysYear = computed(() => {
    const year = this.currentYear;
    const yStart = `${year}-01-01`;
    const yEnd = `${year}-12-31`;
    const sold = new Set<string>();
    for (const c of this.campaigns()) {
      if (c.deleted_at || !c.active || !c.validated_at) continue;
      const start = c.start_date > yStart ? c.start_date : yStart;
      const end = c.end_date < yEnd ? c.end_date : yEnd;
      if (start > end) continue;
      for (let d = new Date(start + 'T00:00:00'); ; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (iso > end) break;
        sold.add(iso);
      }
    }
    return sold.size;
  });

  /** Ad space is sold in 7-day blocks, so weeks — not days — are the
   *  commercial unit (same convention as the dashboard). */
  readonly soldWeeksYear = computed(() => Math.round(this.soldDaysYear() / 7));
  readonly totalWeeksYear = computed(() => {
    const y = this.currentYear;
    const days = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
    return Math.floor(days / 7);
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  readonly searchQuery          = signal('');
  readonly selectedStatus       = signal('all');
  readonly filterCompanyId      = signal('all');
  readonly filterMonth          = signal('all'); // '01'..'12' or 'all'
  readonly filterYear           = signal('all'); // '2025', '2026' or 'all'
  readonly filterValidation     = signal<'all' | CampaignValidationState>('all');
  readonly filterActivationFrom = signal('');
  readonly filterActivationTo   = signal('');
  readonly filterCreatedFrom    = signal('');
  readonly filterCreatedTo      = signal('');
  readonly currentPage          = signal(0);
  readonly pageSize             = 20;

  setSearchQuery(q: string): void          { this.searchQuery.set(q);          this.currentPage.set(0); }
  setSelectedStatus(s: string): void       { this.selectedStatus.set(s);       this.currentPage.set(0); }
  setFilterCompanyId(id: string): void     { this.filterCompanyId.set(id);     this.currentPage.set(0); }
  setFilterMonth(m: string): void          { this.filterMonth.set(m);          this.currentPage.set(0); }
  setFilterYear(y: string): void           { this.filterYear.set(y);           this.currentPage.set(0); }
  setFilterValidation(v: string): void     { this.filterValidation.set(v as any); this.currentPage.set(0); }
  setActivationFrom(d: string): void       { this.filterActivationFrom.set(d); this.currentPage.set(0); }
  setActivationTo(d: string): void         { this.filterActivationTo.set(d);   this.currentPage.set(0); }
  setCreatedFrom(d: string): void          { this.filterCreatedFrom.set(d);    this.currentPage.set(0); }
  setCreatedTo(d: string): void            { this.filterCreatedTo.set(d);      this.currentPage.set(0); }

  clearDateFilters(): void {
    this.filterActivationFrom.set('');
    this.filterActivationTo.set('');
    this.filterCreatedFrom.set('');
    this.filterCreatedTo.set('');
    this.currentPage.set(0);
  }

  readonly hasDateFilters = computed(() =>
    !!(this.filterActivationFrom() || this.filterActivationTo() || this.filterCreatedFrom() || this.filterCreatedTo()),
  );

  /** Distinct year strings present across campaigns. */
  readonly availableFilterYears = computed<string[]>(() => {
    const set = new Set<string>();
    for (const c of this.campaigns()) {
      if (c.start_date) set.add(c.start_date.slice(0, 4));
      if (c.end_date)   set.add(c.end_date.slice(0, 4));
    }
    return Array.from(set).sort();
  });

  readonly listRows = computed<CampaignRow[]>(() => {
    const q          = this.searchQuery().toLowerCase().trim();
    const st         = this.selectedStatus();
    const companyId  = this.filterCompanyId();
    const month      = this.filterMonth();
    const year       = this.filterYear();
    const valFilter  = this.filterValidation();
    const actFrom    = this.filterActivationFrom();
    const actTo      = this.filterActivationTo();
    const creatFrom  = this.filterCreatedFrom();
    const creatTo    = this.filterCreatedTo();
    return this.campaigns()
      .filter(c => {
        const companyName = c.company?.name ?? '';
        if (st !== 'all' && campaignStatus(c) !== st) return false;
        if (q && !c.name.toLowerCase().includes(q) && !companyName.toLowerCase().includes(q)) return false;
        if (companyId !== 'all' && c.company_id !== companyId) return false;
        if (valFilter !== 'all' && campaignValidationState(c) !== valFilter) return false;
        // Month/year filters: a campaign matches if its period intersects the chosen YYYY-MM bucket.
        if (year !== 'all' || month !== 'all') {
          const yPart = year === 'all' ? null : year;
          const mPart = month === 'all' ? null : month;
          const matches = this._campaignIntersectsBucket(c.start_date, c.end_date, yPart, mPart);
          if (!matches) return false;
        }
        if (actFrom && c.start_date < actFrom) return false;
        if (actTo   && c.start_date > actTo)   return false;
        const createdDay = c.created_at.slice(0, 10);
        if (creatFrom && createdDay < creatFrom) return false;
        if (creatTo   && createdDay > creatTo)   return false;
        return true;
      })
      .map(c => ({
        id: c.id,
        name: c.name,
        companyId: c.company_id,
        companyName: c.company?.name ?? '—',
        startDate: c.start_date,
        endDate: c.end_date,
        createdAt: c.created_at.slice(0, 10),
        status: campaignStatus(c),
        validation: campaignValidationState(c),
        daysUntilStart: this._daysUntil(c.start_date),
        imagePath: c.image_path || null,
      }));
  });

  /**
   * True iff the campaign's [start_date..end_date] range intersects the
   * year/month bucket. month/year null = wildcard for that dimension.
   */
  private _campaignIntersectsBucket(start: string, end: string, year: string | null, month: string | null): boolean {
    // Construct the bucket range.
    let bucketStart: string, bucketEnd: string;
    if (year && month) {
      bucketStart = `${year}-${month}-01`;
      const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
      bucketEnd = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;
    } else if (year) {
      bucketStart = `${year}-01-01`;
      bucketEnd   = `${year}-12-31`;
    } else if (month) {
      // Month without year — match any year for that month.
      const startYear = start.slice(0, 4);
      const endYear   = end.slice(0, 4);
      // Test each year in the campaign's span.
      for (let y = parseInt(startYear, 10); y <= parseInt(endYear, 10); y++) {
        const ys = y.toString();
        const lastDay = new Date(y, parseInt(month, 10), 0).getDate();
        if (start <= `${ys}-${month}-${String(lastDay).padStart(2,'0')}` && end >= `${ys}-${month}-01`) return true;
      }
      return false;
    } else {
      return true;
    }
    return start <= bucketEnd && end >= bucketStart;
  }

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.listRows().length / this.pageSize)),
  );
  readonly paginatedRows = computed(() => {
    const p = this.currentPage();
    return this.listRows().slice(p * this.pageSize, (p + 1) * this.pageSize);
  });

  nextPage(): void { if (this.currentPage() < this.totalPages() - 1) this.currentPage.update(p => p + 1); }
  prevPage(): void { if (this.currentPage() > 0) this.currentPage.update(p => p - 1); }

  // ── Editor ────────────────────────────────────────────────────────────────

  readonly editorView        = signal(false);
  readonly editorCampaignId  = signal<string | null>(null);
  readonly editorName        = signal('');
  readonly editorCompanyId   = signal<string | null>(null);
  readonly editorStartDate   = signal('');
  readonly editorEndDate     = signal('');
  readonly editorLinkUrl     = signal('');
  readonly editorActive      = signal(false);
  readonly editorImagePath   = signal<string | null>(null);
  readonly editorImageName   = signal<string | null>(null);
  readonly editorImageSizeKb = signal(0);
  readonly editorImageFile   = signal<File | null>(null);
  readonly editorLocalPreview = signal<string | null>(null);
  readonly editorSaving      = signal(false);
  readonly editorCreatedAt   = signal<string | null>(null);
  readonly editorUpdatedAt   = signal<string | null>(null);
  readonly editorPaidAt              = signal<string | null>(null);
  readonly editorManagerConfirmedAt  = signal<string | null>(null);
  readonly editorValidatedAt         = signal<string | null>(null);
  readonly editorValidationBusy      = signal(false);

  readonly editorValidationState = computed<CampaignValidationState>(() =>
    campaignValidationState({ paid_at: this.editorPaidAt(), manager_confirmed_at: this.editorManagerConfirmedAt() }),
  );

  // ── Overlap confirmation dialog ────────────────────────────────────────
  readonly overlapDialogVisible = signal(false);
  readonly overlapList = signal<AdCampaign[]>([]);
  private pendingSaveActive: boolean | null = null;

  readonly editorHasBanner = computed(() =>
    !!this.editorImageName() || !!this.editorImagePath(),
  );

  readonly editorBannerUrl = computed(() => {
    const local = this.editorLocalPreview();
    if (local) return local;
    const path = this.editorImagePath();
    if (!path) return null;
    return this.campaignService.getBannerUrl(path);
  });

  readonly validationItems = computed<{ ok: boolean; label: string; kind?: 'warn' | 'error' }[]>(() => {
    const start = this.editorStartDate();
    const end   = this.editorEndDate();
    const days  = start && end ? daysBetween(start, end) : 0;
    const durationItem = (start && end)
      ? days > 14
        ? { ok: false, label: `Durée ${days} j — limite maximale de 14 jours dépassée`, kind: 'error' as const }
        : days > 7
          ? { ok: true,  label: `Durée ${days} j — au-delà de la période normale (7 j recommandés)`, kind: 'warn' as const }
          : null
      : null;
    return [
      { ok: this.editorName().trim().length >= 3,
        label: 'Nom de la campagne renseigné (≥ 3 caractères)' },
      { ok: !!this.editorCompanyId(),
        label: 'Compagnie annonceuse sélectionnée' },
      { ok: !!start && !!end,
        label: 'Période de validité définie' },
      { ok: !start || !end || start <= end,
        label: 'Date de début antérieure à la date de fin' },
      { ok: this.editorHasBanner(),
        label: 'Bannière publicitaire ajoutée (≤ 150 Ko)' },
      ...(durationItem ? [durationItem] : []),
      ...(this.editorCampaignId()
        ? [{
            ok: !!this.editorValidatedAt(),
            label: this.editorValidatedAt()
              ? 'Campagne validée (paiement + confirmation managériale)'
              : 'Validation en attente — mobile ne diffusera pas la campagne',
            kind: (this.editorValidatedAt() ? undefined : 'warn') as 'warn' | 'error' | undefined,
          }]
        : []),
    ];
  });

  readonly isDurationExceeded = computed(() => {
    const start = this.editorStartDate();
    const end   = this.editorEndDate();
    return !!(start && end && daysBetween(start, end) > 14);
  });

  readonly editorCurrentStatus = computed<CampaignStatus>(() => {
    if (!this.editorActive()) return 'terminee';
    const today = new Date().toISOString().slice(0, 10);
    const s = this.editorStartDate();
    const e = this.editorEndDate();
    if (!s || !e) return 'terminee';
    if (s > today) return 'planifiee';
    if (e < today) return 'terminee';
    return 'active';
  });

  openEditor(campaignId?: string): void {
    const c = campaignId ? this.campaigns().find(x => x.id === campaignId) : undefined;
    const old = this.editorLocalPreview();
    if (old) URL.revokeObjectURL(old);
    this.editorLocalPreview.set(null);
    this.editorCampaignId.set(campaignId ?? null);
    this.editorName.set(c?.name ?? '');
    this.editorCompanyId.set(c?.company_id ?? null);
    this.editorStartDate.set(c?.start_date ?? '');
    this.editorEndDate.set(c?.end_date ?? '');
    this.editorLinkUrl.set(c?.link_url ?? '');
    this.editorActive.set(c?.active ?? false);
    this.editorImagePath.set(c?.image_path || null);
    this.editorImageName.set(c?.image_path ? c.image_path.split('/').pop() ?? null : null);
    this.editorImageSizeKb.set(0);
    this.editorImageFile.set(null);
    this.editorCreatedAt.set(c?.created_at ?? null);
    this.editorUpdatedAt.set(c?.updated_at ?? null);
    this.editorPaidAt.set(c?.paid_at ?? null);
    this.editorManagerConfirmedAt.set(c?.manager_confirmed_at ?? null);
    this.editorValidatedAt.set(c?.validated_at ?? null);
    this.editorView.set(true);
  }

  // ── Validation actions (Round 3) ────────────────────────────────────────

  async markPaidFromEditor(): Promise<void> {
    const id = this.editorCampaignId();
    if (!id || this.editorValidationBusy() || !this.canValidate()) return;
    this.editorValidationBusy.set(true);
    const res = await firstValueFrom(this.campaignService.markPaid(id));
    this.editorValidationBusy.set(false);
    if (!res.success) { this.toast.error(res.error ?? 'Erreur.'); return; }
    this.toast.success('Paiement enregistré.');
    await this._reloadAndSyncEditor(id);
  }

  async confirmFromEditor(): Promise<void> {
    const id = this.editorCampaignId();
    if (!id || this.editorValidationBusy() || !this.canValidate()) return;
    this.editorValidationBusy.set(true);
    const res = await firstValueFrom(this.campaignService.confirmCampaign(id));
    this.editorValidationBusy.set(false);
    if (!res.success) { this.toast.error(res.error ?? 'Erreur.'); return; }
    this.toast.success('Campagne confirmée.');
    await this._reloadAndSyncEditor(id);
  }

  async markPaidRow(campaignId: string): Promise<void> {
    if (!this.canValidate()) return;
    const res = await firstValueFrom(this.campaignService.markPaid(campaignId));
    if (!res.success) { this.toast.error(res.error ?? 'Erreur.'); return; }
    this.toast.success('Paiement enregistré.');
    await this._reload();
  }

  async confirmRow(campaignId: string): Promise<void> {
    if (!this.canValidate()) return;
    const res = await firstValueFrom(this.campaignService.confirmCampaign(campaignId));
    if (!res.success) { this.toast.error(res.error ?? 'Erreur.'); return; }
    this.toast.success('Campagne confirmée.');
    await this._reload();
  }

  private async _reloadAndSyncEditor(id: string): Promise<void> {
    await this._reload();
    const c = this.campaigns().find(x => x.id === id);
    if (!c) return;
    this.editorPaidAt.set(c.paid_at);
    this.editorManagerConfirmedAt.set(c.manager_confirmed_at);
    this.editorValidatedAt.set(c.validated_at);
    this.editorUpdatedAt.set(c.updated_at);
  }

  validationLabel(s: CampaignValidationState): string {
    switch (s) {
      case 'pending':   return 'À valider';
      case 'paid':      return 'Payée';
      case 'confirmed': return 'Confirmée';
      case 'validated': return 'Validée';
    }
  }

  closeEditor(): void {
    const old = this.editorLocalPreview();
    if (old) URL.revokeObjectURL(old);
    this.editorLocalPreview.set(null);
    this.editorView.set(false);
  }

  async save(active: boolean): Promise<void> {
    if (this.editorSaving()) return;
    // Only an active campaign actually displays on mobile, so overlap with
    // existing active campaigns only matters when activating.
    if (active) {
      const start = this.editorStartDate();
      const end   = this.editorEndDate();
      if (start && end) {
        const conflicts = await firstValueFrom(
          this.campaignService.findOverlappingCampaigns(
            start, end, this.editorCampaignId() ?? undefined,
          ),
        );
        if (conflicts.length > 0) {
          this.overlapList.set(conflicts);
          this.pendingSaveActive = active;
          this.overlapDialogVisible.set(true);
          return;
        }
      }
    }
    await this._runSave(active);
  }

  async confirmOverlap(): Promise<void> {
    const active = this.pendingSaveActive;
    this.overlapDialogVisible.set(false);
    this.pendingSaveActive = null;
    if (active !== null) await this._runSave(active);
  }

  cancelOverlap(): void {
    this.overlapDialogVisible.set(false);
    this.overlapList.set([]);
    this.pendingSaveActive = null;
  }

  private async _runSave(active: boolean): Promise<void> {
    this.editorSaving.set(true);
    const ok = await this._save(active);
    this.editorSaving.set(false);
    if (ok) {
      this.toast.success(active ? 'Campagne activée avec succès.' : 'Campagne enregistrée.');
      this.closeEditor();
      await this._reload();
    }
  }

  async deleteCampaign(): Promise<void> {
    const id = this.editorCampaignId();
    if (!id) return;
    const res = await firstValueFrom(this.campaignService.deleteCampaign(id));
    if (!res.success) {
      this.toast.error(res.error ?? 'Impossible de supprimer la campagne.');
      return;
    }
    this.toast.success('Campagne supprimée.');
    this.closeEditor();
    await this._reload();
  }

  private async _save(active: boolean): Promise<boolean> {
    const id = this.editorCampaignId();
    let campaignId = id ?? undefined;

    const companyId = this.editorCompanyId();
    if (!companyId) {
      this.toast.error('Sélectionnez une compagnie annonceuse.');
      return false;
    }

    // position is fixed at the DB default ('footer'); the CMS no longer
    // surfaces it. Omitting it from the patch leaves the column unchanged
    // on update and lets the DB default fill it on insert.
    const patch = {
      name:       this.editorName().trim(),
      company_id: companyId,
      start_date: this.editorStartDate(),
      end_date:   this.editorEndDate(),
      position:   'footer' as const,
      link_url:   this.editorLinkUrl().trim() || undefined,
      active,
    };

    if (id) {
      const res = await firstValueFrom(this.campaignService.updateCampaign(id, patch));
      if (!res.success) { this.toast.error(res.error ? res.error + '.' : 'Erreur de sauvegarde.'); return false; }
    } else {
      const res = await firstValueFrom(this.campaignService.createCampaign(patch));
      if (!res.success) { this.toast.error(res.error ? res.error + '.' : 'Erreur de création.'); return false; }
      campaignId = res.id;
    }

    const file = this.editorImageFile();
    if (file && campaignId) {
      const compressed = await compressImage(file);
      const upload = await firstValueFrom(this.campaignService.uploadBanner(campaignId, compressed));
      if (upload.path) {
        await firstValueFrom(this.campaignService.updateCampaign(campaignId, { image_path: upload.path }));
        this.editorImageFile.set(null);
      }
    }

    return true;
  }

  onBannerChange(event: Event | globalThis.Event): void {
    const file = (event as globalThis.Event & { target: HTMLInputElement }).target?.files?.[0];
    if (!file) return;
    this.editorImageName.set(file.name);
    this.editorImageSizeKb.set(Math.round(file.size / 1024));
    this.editorImageFile.set(file);
    const old = this.editorLocalPreview();
    if (old) URL.revokeObjectURL(old);
    this.editorLocalPreview.set(URL.createObjectURL(file));
  }

  durationDays(start: string, end: string): number {
    return daysBetween(start, end);
  }

  formatDate(iso: string): string {
    return iso ? formatDateShort(iso) : '—';
  }
}
