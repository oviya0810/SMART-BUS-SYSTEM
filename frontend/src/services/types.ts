export type Role = 'admin' | 'student' | 'bus';

export interface User {
  id: number;
  username: string;
  role: Role;
  display_name: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  student_id?: number;
  bus_id?: number;
}

export interface Stop {
  id: number;
  route_id: number;
  name: string;
  sequence: number;
  latitude: number | null;
  longitude: number | null;
}

export interface RouteInfo {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  stops: Stop[];
  bus_count: number;
}

export interface BusBrief {
  id: number;
  bus_number: string;
  route_id: number | null;
  route_name: string | null;
}

export interface Student {
  id: number;
  user_id: number;
  full_name: string;
  register_number: string;
  department: string;
  year: number;
  phone?: string;
  username: string;
  is_active: boolean;
  must_change_password: boolean;
  bus: BusBrief | null;
  boarding_stop: Stop | null;
  destination_stop: Stop | null;
  created_at: string;
}

export interface LocationStatus {
  available: boolean;
  state: 'live' | 'stale' | 'no_data';
  latitude?: number;
  longitude?: number;
  speed_kmh?: number | null;
  heading_deg?: number | null;
  satellites?: number | null;
  device_timestamp?: string;
  received_at?: string;
  age_seconds?: number;
  message?: string | null;
}

export interface OccupancyStatus {
  available: boolean;
  state: 'live' | 'stale' | 'no_data' | 'sensor_error';
  capacity: number;
  occupied: number | null;
  available_seats: number | null;
  occupancy_percent: number | null;
  sensor_connected: boolean;
  sensor_status?: string;
  received_at?: string;
  age_seconds?: number;
  message?: string | null;
}

export interface AlcoholStatus {
  available: boolean;
  state: 'warming_up' | 'normal' | 'warning' | 'sensor_error' | 'offline';
  label: string;
  raw_adc: number | null;
  threshold: number;
  received_at?: string;
  age_seconds?: number;
  message?: string | null;
  disclaimer: string;
}

export interface DeviceStatus {
  assigned: boolean;
  online: boolean;
  device_id?: string;
  is_active?: boolean;
  connection?: 'online' | 'offline' | 'never_connected';
  firmware_version?: string | null;
  registered_at?: string | null;
  last_seen_at?: string | null;
  last_telemetry_at?: string | null;
  last_seen_age_seconds?: number | null;
  last_ip?: string | null;
  components?: Record<string, string>;
  last_error?: string | null;
  last_error_at?: string | null;
  message?: string;
}

export interface DriverDuty {
  card_registered: boolean;
  on_duty: boolean;
  state: 'on_duty' | 'off_duty' | 'no_data';
  driver_name: string | null;
  since: string | null;
  last_tap_at: string | null;
  last_tap_result: string | null;
}

export interface DriverEvent {
  id: number;
  bus_id: number;
  bus_number: string | null;
  card_uid: string;
  result: 'authorized' | 'unknown_card' | 'other_bus_driver';
  result_label: string;
  authorized: boolean;
  action: 'duty_start' | 'duty_end' | null;
  driver_name: string | null;
  device_timestamp: string;
  received_at: string;
}

export interface LiveSummary {
  location: LocationStatus;
  occupancy: OccupancyStatus;
  alcohol: AlcoholStatus;
  device: DeviceStatus;
  driver: DriverDuty;
  active_incidents: number;
}

export interface Bus {
  id: number;
  bus_number: string;
  registration_number: string;
  route_id: number | null;
  route_name: string | null;
  driver_name: string;
  driver_phone: string;
  capacity: number;
  username: string;
  is_active: boolean;
  alcohol_threshold: number;
  driver_rfid_uid: string | null;
  device_id: string | null;
  assigned_students: number;
  live?: LiveSummary;
  route?: RouteInfo | null;
}

export type PickupStatus = 'pending' | 'accepted' | 'approaching' | 'picked_up' | 'cancelled';

export interface Pickup {
  id: number;
  student_id: number;
  student_name: string;
  register_number?: string;
  bus_id: number;
  bus_number: string;
  latitude: number | null;
  longitude: number | null;
  location_source: 'phone_gps' | 'stop';
  location_accuracy_m: number | null;
  boarding_stop_id: number | null;
  boarding_stop_name: string;
  note: string | null;
  status: PickupStatus;
  status_label: string;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  history?: { from_status: string | null; to_status: string; changed_by: string; reason: string | null; at: string }[];
}

export interface Incident {
  id: number;
  event_id: string;
  bus_id: number;
  bus_number: string;
  incident_type: 'sos' | 'breakdown' | 'medical' | 'other';
  type_label: string;
  source: string;
  description?: string | null;
  latitude: number | null;
  longitude: number | null;
  location_source: string | null;
  status: 'active' | 'acknowledged' | 'resolved';
  acknowledged_at: string | null;
  acknowledged_by?: string | null;
  resolved_at: string | null;
  resolved_by?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: number;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: number | null;
  is_read: boolean;
  created_at: string;
}

export interface Credentials {
  username: string;
  initial_password?: string;
  temporary_password?: string;
  notice: string;
}
