export type AppRole = 'owner' | 'chef_equipe' | 'editeur' | 'charge_communication';
export type EventPosition = 1 | 2;
export type AdPosition = 'header' | 'footer';
export type CalendarStatus = 'draft' | 'published' | 'archived';

export interface Workspace {
  id: string;
  name: string;
  logo_path: string | null;
  created_at: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  logo_path: string | null;
  member_count: number;
  last_accessed_at: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  assigned_by: string | null;
  created_at: string;
}

export interface Calendar {
  id: string;
  year: number;
  label: string | null;
  status: CalendarStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  calendar_id: string;
  event_date: string;
  position: EventPosition;
  title: string;
  description: string | null;
  image_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AdCampaign {
  id: string;
  advertiser: string;
  start_date: string;
  end_date: string;
  position: AdPosition;
  image_path: string | null;
  link_url: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CampaignAssignment {
  id: string;
  campaign_id: string;
  assigned_date: string;
  calendar_id: string;
  created_at: string;
}

export interface ContentVersion {
  id: string;
  year: number;
  version_hash: string;
  published_at: string | null;
}
