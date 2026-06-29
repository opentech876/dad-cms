export type AppRole = 'owner' | 'chef_equipe' | 'editeur' | 'charge_communication' | 'presidence' | 'chef_equipe_commerciale' | 'system_admin';

export type CompanyType =
  | 'telecom' | 'banque' | 'energie' | 'distribution'
  | 'services' | 'gouvernement' | 'ong' | 'medias' | 'sante' | 'autre';
export type EventPosition = 1 | 2;
export type AdPosition = 'header' | 'footer';
export type CalendarStatus = 'draft' | 'published' | 'archived';
export type EventStatus = 'draft' | 'published';
export type ManageUserAction = 'update_role' | 'block' | 'unblock' | 'remove' | 'set_password' | 'resend_invitation' | 'revoke_invitation';

export interface UserListEntry {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: AppRole | null;
  /** Legacy: temp-owner expiry. Always null for workspace-scoped memberships. */
  expires_at?: string | null;
  /** null = pending invitation (user invited but hasn't accepted yet). */
  email_confirmed_at: string | null;
  /** When the membership row was created (= when invitation was sent). */
  invited_at: string | null;
  banned: boolean;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  logo_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  logo_url: string | null;
  member_count: number;
  last_accessed_at: string | null;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Calendar {
  id: string;
  year: number;
  name: string;
  status: CalendarStatus;
  workspace_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  published_at: string | null;
}

/** A historical event in the content library — not tied to any calendar. */
export interface Event {
  id: string;
  event_date: string;        // YYYY-MM-DD — the actual historical date
  title: string;
  description: string | null;
  image_path: string | null;
  /** Reference work / URL backing this entry. Free text. */
  source: string | null;
  /** Name of the curator who entered this row (preserved across Excel imports). */
  historian: string | null;
  status: EventStatus;
  workspace_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

/** Links one calendar day (identified by mmdd) to a library event at a given position. */
export interface CalendarEntry {
  id: string;
  calendar_id: string;
  mmdd: string;              // 'MM-DD', e.g. '08-15'
  position: EventPosition;   // 1 = main, 2 = secondary
  event_id: string;
  workspace_id: string;
  created_by: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  workspace_id: string;
  name: string;
  type: CompanyType;
  business_domain: string | null;
  website: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  logo_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface CreateCompanyDto {
  name: string;
  type: CompanyType;
  business_domain?: string | null;
  website?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  logo_url?: string | null;
}

export interface AdCampaign {
  id: string;
  name: string;
  company_id: string;
  /** Joined company data (populated by Supabase select). */
  company?: Company | null;
  start_date: string;
  end_date: string;
  position: AdPosition;
  image_path: string;
  link_url: string | null;
  active: boolean;
  workspace_id: string;
  /** Validation workflow — two keys (paid + manager confirmed). Mobile hides ads where validated_at IS NULL. */
  paid_at: string | null;
  paid_by: string | null;
  manager_confirmed_at: string | null;
  manager_confirmed_by: string | null;
  /** Derived (GENERATED ALWAYS): set when both paid_at AND manager_confirmed_at are set. */
  validated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

/** Discrete validation state of an AdCampaign, used by the UI to render badges + actions. */
export type CampaignValidationState =
  | 'pending'    // no key flipped yet
  | 'paid'       // paid but not manager-confirmed
  | 'confirmed'  // manager-confirmed but not paid
  | 'validated'; // both done

export function campaignValidationState(c: Pick<AdCampaign, 'paid_at' | 'manager_confirmed_at'>): CampaignValidationState {
  const paid = !!c.paid_at, confirmed = !!c.manager_confirmed_at;
  if (paid && confirmed) return 'validated';
  if (paid) return 'paid';
  if (confirmed) return 'confirmed';
  return 'pending';
}

export interface ContentVersion {
  year: number;
  version_hash: string;
  published_at: string | null;
  updated_at: string;
}

/** DTO for creating a new ad campaign. */
export interface CreateCampaignDto {
  name: string;
  company_id: string;
  start_date: string;   // YYYY-MM-DD
  end_date: string;     // YYYY-MM-DD
  position: AdPosition;
  link_url?: string;
  image_path?: string;
  active?: boolean;
}

/** DTO for creating a new event in the library. */
export interface CreateEventDto {
  event_date: string;        // YYYY-MM-DD
  title: string;
  description?: string;
  image_path?: string;
  source?: string | null;
  historian?: string | null;
}

export interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
  /**
   * Workspace this audit row belongs to. NULL for platform-level / legacy
   * rows (visible only to system_admin under RLS). Workspace-scoped rows
   * are visible to chef_equipe+ of that workspace.
   */
  workspace_id: string | null;
}

export type NotificationCategory = 'editorial' | 'campaign' | 'system';

export interface Notification {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  created_at: string;
  read_at: string | null;
}

export interface Device {
  id: string;
  user_id: string | null;
  expo_push_token: string;
  platform: 'ios' | 'android';
  app_version: string | null;
  registered_at: string;
  last_seen_at: string | null;
}

export interface DeviceLog {
  id: string;
  device_uuid: string | null;
  action: string;
  outcome: string | null;
  error_message: string | null;
  created_at: string;
}

export interface CampaignTap {
  campaign_id: string;
  campaign_name: string;
  advertiser: string;
  /** Total impressions (rows in ad_campaign_device_views). */
  tap_count: number;
  /** Total clicks (rows in ad_campaign_device_clicks). 0 until mobile ships record_ad_campaign_click. */
  click_count: number;
  /** Computed: click_count / tap_count. null when tap_count = 0. */
  ctr: number | null;
}

export interface DailyActivity {
  date: string;
  count: number;
}

export interface MonthCoverage {
  month: number;
  filled_days: number;
  total_days: number;
  percent: number;
}
