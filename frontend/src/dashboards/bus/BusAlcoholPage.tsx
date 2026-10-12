import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Info, Wine } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useLiveReload } from '../../hooks/useRealtime';
import { errorMessage } from '../../services/api';
import type { AlcoholStatus } from '../../services/types';
import { Card, CardHeader, EmptyState, ErrorState, Notice, PageHeader, SkeletonRows, StatItem } from '../../components/ui';
import { AlcoholBadge } from '../../components/StatusBadges';
import { fmtDateTime, fmtTime, timeAgo } from '../../components/format';

interface Reading { raw_adc: number | null; threshold: number; status: string; received_at: string; device_timestamp?: string }

export function BusAlcoholPage() {
  const { data, error, reload } = useFetch<{ alcohol: AlcoholStatus; history: Reading[]; warnings: Reading[] }>('/api/bus/alcohol-status', 30000);
  useLiveReload(['alcohol_updated', 'alcohol_warning'], reload, 100);
  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const a = data?.alcohol;
  return (
    <>
      <PageHeader title="Alcohol monitoring" subtitle="MQ-3 sensor readings reported by the ESP32 (raw 12-bit ADC values)." />
      <div className="mb-4"><Notice tone="blue" icon={<Info className="h-4 w-4" />}>{a?.disclaimer ?? 'Raw MQ-3 readings are indicative only.'}</Notice></div>
      {a?.state === 'warning' && <div className="mb-4"><Notice tone="red" title="Warning threshold exceeded">Latest raw reading {a.raw_adc} ≥ configured threshold {a.threshold}. Follow your institution’s verification procedure.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title="Sensor status" icon={<Wine className="h-5 w-5" />} actions={<AlcoholBadge alc={a} />} />
          {!a ? <SkeletonRows rows={3} /> : (
            <dl className="grid grid-cols-2 gap-4 p-5">
              <StatItem label="Raw ADC reading" value={a.raw_adc ?? '—'} />
              <StatItem label="Warning threshold" value={a.threshold} sub="Configured by admin" />
              <StatItem label="Status" value={a.label} />
              <StatItem label="Last update" value={a.received_at ? timeAgo(a.received_at) : 'Never'} sub={fmtDateTime(a.received_at)} />
              {a.message && <p className="col-span-2 text-xs text-amber-700 dark:text-amber-300">{a.message}</p>}
            </dl>
          )}
        </Card>
        <Card>
          <CardHeader title="Reading trend" subtitle="Latest 120 readings; dashed line is the warning threshold" />
          <div className="h-72 p-4">
            {!data ? <SkeletonRows /> : data.history.length === 0 ? <EmptyState title="Waiting for hardware data" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.history} margin={{ left: -8, right: 8, top: 8 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="received_at" tickFormatter={(v) => fmtTime(v)} tick={{ fontSize: 11 }} minTickGap={40} />
                  <YAxis domain={[0, 4095]} tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(v) => fmtDateTime(String(v))} />
                  {a && <ReferenceLine y={a.threshold} stroke="#dc2626" strokeDasharray="5 5" />}
                  <Line isAnimationActive={false} type="monotone" dataKey="raw_adc" name="Raw ADC" stroke="#7c3aed" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Warning & error history" subtitle="Readings at or above threshold, and sensor errors" />
          {!data ? <SkeletonRows /> : data.warnings.length === 0 ? <EmptyState title="No warnings recorded" /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-navy-800">
                <thead><tr><th className="th">Received</th><th className="th">Device time</th><th className="th">Raw ADC</th><th className="th">Threshold</th><th className="th">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-navy-800">
                  {data.warnings.map((w, i) => (
                    <tr key={i}><td className="td">{fmtDateTime(w.received_at)}</td><td className="td">{fmtDateTime(w.device_timestamp)}</td><td className="td mono">{w.raw_adc ?? '—'}</td><td className="td mono">{w.threshold}</td><td className="td">{w.status === 'warning' ? 'Warning' : 'Sensor Error'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
