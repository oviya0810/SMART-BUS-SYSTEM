import { useNavigate } from 'react-router-dom';
import { Bus, KeyRound, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { errorMessage } from '../../services/api';
import { Button, Card, CardHeader, ErrorState, PageHeader, SkeletonRows, StatItem } from '../../components/ui';
import { PasswordForm } from '../../pages/PasswordForm';
import { useProfile } from './useStudentData';

export function StudentProfilePage() {
  const { data, error, reload } = useProfile();
  const { logout } = useAuth();
  const navigate = useNavigate();
  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const s = data?.student;
  return (
    <>
      <PageHeader
        title="Profile"
        actions={<Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={async () => { await logout(); navigate('/login'); }}>Sign out</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile details" icon={<UserRound className="h-5 w-5" />} subtitle="Contact the transport office to correct any details." />
          {!s ? <SkeletonRows rows={3} /> : (
            <dl className="grid grid-cols-2 gap-4 p-5">
              <StatItem label="Full name" value={s.full_name} />
              <StatItem label="Register number" value={s.register_number} />
              <StatItem label="Department" value={s.department} />
              <StatItem label="Year" value={s.year} />
              <StatItem label="Phone" value={s.phone ?? '—'} />
              <StatItem label="Username" value={`@${s.username}`} />
            </dl>
          )}
        </Card>
        <Card>
          <CardHeader title="Assigned bus & route" icon={<Bus className="h-5 w-5" />} />
          {!data ? <SkeletonRows rows={3} /> : !data.bus ? <p className="p-5 text-sm text-slate-500">No bus assigned.</p> : (
            <dl className="grid grid-cols-2 gap-4 p-5">
              <StatItem label="Bus" value={`Bus ${data.bus.bus_number}`} sub={data.bus.registration_number} />
              <StatItem label="Route" value={data.bus.route_name ?? '—'} />
              <StatItem label="Driver" value={data.bus.driver_name} sub={<a className="text-electric-600" href={`tel:${data.bus.driver_phone}`}>{data.bus.driver_phone}</a>} />
              <StatItem label="Capacity" value={`${data.bus.capacity} seats`} />
              <StatItem label="Boarding stop" value={s?.boarding_stop?.name ?? '—'} />
              <StatItem label="Destination stop" value={s?.destination_stop?.name ?? '—'} />
              {data.route && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-slate-500">Route stops</p>
                  <ol className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {data.route.stops.map((st) => <li key={st.id}><span className="mono text-xs text-slate-400">{st.sequence}.</span> {st.name}</li>)}
                  </ol>
                </div>
              )}
            </dl>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Change password" icon={<KeyRound className="h-5 w-5" />} />
          <div className="max-w-md p-5"><PasswordForm /></div>
        </Card>
      </div>
    </>
  );
}
