import { Component, signal } from '@angular/core';

interface Campaign {
  id: number;
  name: string;
  advertiser: string;
  position: 'header' | 'footer';
  from: string;
  to: string;
  dates: number;
  status: 'active' | 'scheduled' | 'ended';
  color: string;
}

@Component({
  selector: 'app-ad-campaigns',
  standalone: true,
  templateUrl: './ad-campaigns.component.html',
  styleUrl: './ad-campaigns.component.scss',
})
export class AdCampaignsComponent {
  readonly searchQuery = signal('');
  readonly selectedPosition = signal('all');
  readonly selectedStatus = signal('all');

  readonly campaigns: Campaign[] = [
    { id: 1, name: 'MTN Congo — Forfait étudiant', advertiser: 'MTN Congo', position: 'header', from: '01/04/2026', to: '30/06/2026', dates: 91, status: 'active', color: '#FFC72C' },
    { id: 2, name: 'Société Générale Congo — Tontine+', advertiser: 'SG Congo', position: 'footer', from: '15/03/2026', to: '15/05/2026', dates: 62, status: 'active', color: '#E60028' },
    { id: 3, name: "Brasseries du Congo — Ngok'", advertiser: 'BraCongo', position: 'header', from: '10/05/2026', to: '10/07/2026', dates: 62, status: 'scheduled', color: '#005CA9' },
    { id: 4, name: 'Total Energies — Stations', advertiser: 'TotalEnergies', position: 'footer', from: '01/01/2026', to: '31/03/2026', dates: 90, status: 'ended', color: '#ED1C24' },
    { id: 5, name: 'Air France — Paris/Brazza', advertiser: 'Air France', position: 'header', from: '01/06/2026', to: '31/08/2026', dates: 92, status: 'scheduled', color: '#002157' },
    { id: 6, name: 'Université Marien Ngouabi', advertiser: 'UMNG', position: 'footer', from: '15/08/2026', to: '15/10/2026', dates: 62, status: 'scheduled', color: '#1F6E3D' },
  ];

  readonly stats = {
    active: 2,
    datesCovered: 218,
    impressions: '424 K',
    ctr: '1,52%',
  };

  advertiserInitials(name: string): string {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('');
  }
}
