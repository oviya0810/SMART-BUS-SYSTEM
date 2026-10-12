import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import type { Incident, LocationStatus, OccupancyStatus, Pickup, RouteInfo, Student } from '../../services/types';

export interface BusStatus {
  assigned: boolean;
  message?: string;
  bus?: { id: number; bus_number: string; route_name: string | null; capacity: number; is_active: boolean };
  location?: LocationStatus;
  occupancy?: OccupancyStatus;
  device?: { assigned: boolean; online: boolean; last_seen_at?: string | null };
  route?: RouteInfo | null;
  active_incidents?: number;
}

export interface StudentProfile {
  student: Student;
  bus: { id: number; bus_number: string; registration_number: string; driver_name: string; driver_phone: string; capacity: number; route_name: string | null } | null;
  route: RouteInfo | null;
}

export function useBusStatus() {
  const s = useFetch<BusStatus>('/api/student/bus-status', 30000);
  useLiveReload(['bus_location_updated', 'occupancy_updated', 'sos_created', 'sos_acknowledged', 'sos_updated'], s.reload, 200);
  return s;
}

export function useMyPickups() {
  const p = useFetch<{ items: Pickup[] }>('/api/student/pickup-requests');
  useLiveReload(['pickup_request_created', 'pickup_request_updated'], p.reload, 100);
  return p;
}

export function useMyAlerts() {
  const a = useFetch<{ items: Incident[] }>('/api/student/alerts');
  useLiveReload(['sos_created', 'sos_acknowledged', 'sos_updated'], a.reload, 100);
  return a;
}

export function useProfile() {
  return useFetch<StudentProfile>('/api/student/profile');
}
