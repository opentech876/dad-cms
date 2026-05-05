import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AdCampaign, AdPosition } from '../../models';
import { CampaignService } from '../../core/campaigns/campaign.service';
import { ToastService } from '../../core/services/toast.service';

type CampaignStatus = 'active' | 'scheduled' | 'ended' | 'inactive';

interface CampaignRow {
  id: string;
  name: string;
  advertiser: string;
  position: AdPosition;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  imagePath: string;
}

function campaignStatus(c: AdCampaign): CampaignStatus {
  if (!c.active) return 'inactive';
  const today = new Date().toISOString().slice(0, 10);
  if (c.start_date > today) return 'scheduled';
  if (c.end_date < today) return 'ended';
  return 'active';
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

@Component({
  selector: 'app-ad-campaigns',
  standalone: true,
  imports: [TuiIcon, FormsModule],
  templateUrl: './ad-campaigns.component.html',
  styleUrl: './ad-campaigns.component.scss',
})
export class AdCampaignsComponent implements OnInit {
  readonly campaignService = inject(CampaignService);
  private readonly toast = inject(ToastService);

  readonly campaigns = signal<AdCampaign[]>([]);
  readonly loading   = signal(false);

  async ngOnInit(): Promise<void> {
    await this._reload();
  }

  private async _reload(): Promise<void> {
    this.loading.set(true);
    const data = await firstValueFrom(this.campaignService.listCampaigns());
    this.campaigns.set(data);
    this.loading.set(false);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  readonly stats = computed(() => {
    const all = this.campaigns();
    const today = new Date().toISOString().slice(0, 10);
    const active = all.filter(c => c.active && c.start_date <= today && c.end_date >= today);
    const totalDays = active.reduce((sum, c) => sum + daysBetween(c.start_date, c.end_date), 0);
    return {
      active: active.length,
      scheduled: all.filter(c => c.active && c.start_date > today).length,
      ended: all.filter(c => !c.active || c.end_date < today).length,
      header: active.filter(c => c.position === 'header').length,
      footer: active.filter(c => c.position === 'footer').length,
      totalDays,
    };
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  readonly searchQuery      = signal('');
  readonly selectedPosition = signal('all');
  readonly selectedStatus   = signal('all');
  readonly currentPage      = signal(0);
  readonly pageSize         = 20;

  setSearchQuery(q: string): void      { this.searchQuery.set(q);      this.currentPage.set(0); }
  setSelectedPosition(p: string): void { this.selectedPosition.set(p); this.currentPage.set(0); }
  setSelectedStatus(s: string): void   { this.selectedStatus.set(s);   this.currentPage.set(0); }

  readonly listRows = computed<CampaignRow[]>(() => {
    const q   = this.searchQuery().toLowerCase().trim();
    const pos = this.selectedPosition();
    const st  = this.selectedStatus();
    return this.campaigns()
      .filter(c => {
        if (pos !== 'all' && c.position !== pos) return false;
        if (st !== 'all' && campaignStatus(c) !== st) return false;
        if (q && !c.name.toLowerCase().includes(q) && !c.advertiser.toLowerCase().includes(q)) return false;
        return true;
      })
      .map(c => ({
        id: c.id,
        name: c.name,
        advertiser: c.advertiser,
        position: c.position,
        startDate: c.start_date,
        endDate: c.end_date,
        status: campaignStatus(c),
        imagePath: c.image_path,
      }));
  });

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
  readonly editorAdvertiser  = signal('');
  readonly editorStartDate   = signal('');
  readonly editorEndDate     = signal('');
  readonly editorPosition    = signal<AdPosition>('header');
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

  readonly validationItems = computed(() => {
    const start = this.editorStartDate();
    const end   = this.editorEndDate();
    const days  = start && end ? daysBetween(start, end) : 0;
    return [
      { ok: this.editorName().trim().length >= 3,
        label: 'Nom de la campagne renseigné (≥ 3 caractères)' },
      { ok: this.editorAdvertiser().trim().length >= 2,
        label: 'Nom de l\'annonceur renseigné' },
      { ok: !!start && !!end,
        label: 'Période de validité définie' },
      { ok: !start || !end || start <= end,
        label: 'Date de début antérieure à la date de fin' },
      { ok: this.editorHasBanner(),
        label: 'Bannière publicitaire ajoutée (≤ 150 Ko)' },
      ...(days > 14
        ? [{ ok: false, label: `Durée ${days} j — dépasse les 14 jours recommandés (normal : 7 j)` }]
        : days > 7
          ? [{ ok: false, label: `Durée ${days} j — dépasse la durée normale d'une semaine (7 j)` }]
          : []),
    ];
  });

  readonly editorCurrentStatus = computed<CampaignStatus>(() => {
    if (!this.editorActive()) return 'inactive';
    const today = new Date().toISOString().slice(0, 10);
    const s = this.editorStartDate();
    const e = this.editorEndDate();
    if (!s || !e) return 'inactive';
    if (s > today) return 'scheduled';
    if (e < today) return 'ended';
    return 'active';
  });

  openEditor(campaignId?: string): void {
    const c = campaignId ? this.campaigns().find(x => x.id === campaignId) : undefined;
    const old = this.editorLocalPreview();
    if (old) URL.revokeObjectURL(old);
    this.editorLocalPreview.set(null);
    this.editorCampaignId.set(campaignId ?? null);
    this.editorName.set(c?.name ?? '');
    this.editorAdvertiser.set(c?.advertiser ?? '');
    this.editorStartDate.set(c?.start_date ?? '');
    this.editorEndDate.set(c?.end_date ?? '');
    this.editorPosition.set(c?.position ?? 'header');
    this.editorLinkUrl.set(c?.link_url ?? '');
    this.editorActive.set(c?.active ?? false);
    this.editorImagePath.set(c?.image_path || null);
    this.editorImageName.set(c?.image_path ? c.image_path.split('/').pop() ?? null : null);
    this.editorImageSizeKb.set(0);
    this.editorImageFile.set(null);
    this.editorCreatedAt.set(c?.created_at ?? null);
    this.editorUpdatedAt.set(c?.updated_at ?? null);
    this.editorView.set(true);
  }

  closeEditor(): void {
    const old = this.editorLocalPreview();
    if (old) URL.revokeObjectURL(old);
    this.editorLocalPreview.set(null);
    this.editorView.set(false);
  }

  async save(active: boolean): Promise<void> {
    if (this.editorSaving()) return;
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

    const patch = {
      name:       this.editorName().trim(),
      advertiser: this.editorAdvertiser().trim(),
      start_date: this.editorStartDate(),
      end_date:   this.editorEndDate(),
      position:   this.editorPosition(),
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
      const upload = await firstValueFrom(this.campaignService.uploadBanner(campaignId, file));
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

  advertiserInitials(name: string): string {
    return name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  durationDays(start: string, end: string): number {
    return daysBetween(start, end);
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
}
