import { useAuth } from '../hooks/useAuth';
import { Card, CardHeader, PageHeader, StatItem } from '../components/ui';
import { fmtDateTime } from '../components/format';
import { PasswordForm } from './PasswordForm';
import { KeyRound, UserRound } from 'lucide-react';

export function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader title="Account" subtitle="Your sign-in details and password." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" icon={<UserRound className="h-5 w-5" />} />
          <dl className="grid grid-cols-2 gap-4 p-5">
            <StatItem label="Name" value={user.display_name} />
            <StatItem label="Username" value={`@${user.username}`} />
            <StatItem label="Role" value={user.role} />
            <StatItem label="Last sign-in" value={fmtDateTime(user.last_login_at)} />
          </dl>
        </Card>
        <Card>
          <CardHeader title="Change password" icon={<KeyRound className="h-5 w-5" />} subtitle="All other sessions are signed out after a change." />
          <div className="p-5">
            <PasswordForm />
          </div>
        </Card>
      </div>
    </>
  );
}
