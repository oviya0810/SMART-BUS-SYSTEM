import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Armchair } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { useTheme } from '../../hooks/useTheme';
import { errorMessage } from '../../services/api';
import type { OccupancyStatus } from '../../services/types';
import { Card, CardHeader, EmptyState, ErrorState, Notice, PageHeader, SkeletonRows } from '../../components/ui';
import { SeatGauge } from '../../components/SeatGauge';
import { fmtDateTime, fmtTime } from '../../components/format';

export function BusOccupancyPage() {
  const { data, error, reload } = useFetch<{ occupancy: OccupancyStatus; history: { occupied: number; capacity: number; sensor_status: string; received_at: string }[] }>('/api/bus/occupancy', 30000);
  useLiveReload(['occupancy_updated', 'device_status_updated'], reload, 100);
  const { theme } = useTheme();
  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const occ = data?.occupancy;
  return (
    <>
      <PageHeader title="Seat occupancy" subtitle="Live passenger count reported by the occupancy sensor. Readings above capacity are rejected by the server." />
      {occ && occ.state !== 'live' && <div className="mb-4"><Notice tone="amber">{occ.message ?? 'Occupancy data unavailable.'}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader title="Current" icon={<Armchair className="h-5 w-5" />} />
          <div className="p-5">{occ ? <SeatGauge occ={occ} /> : <SkeletonRows rows={3} />}</div>
        </Card>
        <Card>
          <CardHeader title="Recent readings" subtitle="Latest 120 hardware readings" />
          <div className="h-80 p-4">
            {!data ? <SkeletonRows /> : data.history.length === 0 ? <EmptyState title="Waiting for hardware data" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.history} margin={{ left: -16, right: 8, top: 8 }}>
                  <defs><linearGradient id="occ" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f63ff" stopOpacity={0.35} /><stop offset="100%" stopColor="#2f63ff" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke={theme === 'dark' ? '#1c2e63' : '#e2e8f0'} vertical={false} />
                  <XAxis dataKey="received_at" tickFormatter={(v) => fmtTime(v)} tick={{ fontSize: 11 }} minTickGap={40} />
                  <YAxis domain={[0, occ?.capacity ?? 'auto']} allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(v) => fmtDateTime(String(v))} />
                  {occ && <ReferenceLine y={occ.capacity} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'capacity', fontSize: 10 }} />}
                  <Area isAnimationActive={false} type="stepAfter" dataKey="occupied" name="Occupied" stroke="#1f4ff2" strokeWidth={2} fill="url(#occ)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
