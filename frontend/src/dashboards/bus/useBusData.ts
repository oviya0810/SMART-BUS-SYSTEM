import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import type { Bus, Incident, LiveSummary, Pickup, RouteInfo } from '../../services/types';

export interface BusOverviewData {
  bus: Bus;
  route: RouteInfo | null;
  live: LiveSummary;
  pending_pickups: number;
  active_pickups: Pickup[];
  active_incidents: Incident[];
  assigned_students: number;
}

export const BUS_EVENTS = [
  'bus_location_updated', 'occupancy_updated', 'alcohol_updated', 'device_status_updated', 'sos_created', 'sos_acknowledged',
  'sos_updated', 'pickup_request_created', 'pickup_request_updated', 'driver_rfid_event',
];

export function useBusOverview() {
  const o = useFetch<BusOverviewData>('/api/bus/overview', 20000);
  useLiveReload(BUS_EVENTS, o.reload, 200);
  return o;
}
