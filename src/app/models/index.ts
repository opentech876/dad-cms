export type AppRole = 'owner' | 'chef_equipe' | 'editeur' | 'charge_communication';
export type EventPosition = 1 | 2;
export type AdPosition = 'header' | 'footer';
export type CalendarStatus = 'draft' | 'published' | 'archived';
export type EventStatus = 'draft' | 'published';
export type ManageUserAction = 'update_role' | 'block' | 'unblock' | 'remove';

export interface UserListEntry {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: AppRole | null;
  expires_at: string | null;
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

export interface AdCampaign {
  id: string;
  name: string;
  advertiser: string;
  start_date: string;
  end_date: string;
  position: AdPosition;
  image_path: string;
  link_url: string | null;
  active: boolean;
  workspace_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

export interface CampaignAssignment {
  id: string;
  campaign_id: string;
  calendar_id: string;
  event_date: string;
  created_by: string | null;
  created_at: string;
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
  advertiser: string;
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
  device_id: string | null;
  action: string;
  outcome: string | null;
  error_message: string | null;
  logged_at: string;
}

export interface CampaignTap {
  campaign_id: string;
  campaign_name: string;
  advertiser: string;
  tap_count: number;
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
