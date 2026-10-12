import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { EmptyState } from '../components/ui';
import { MapPin } from 'lucide-react';

export function NotFound() {
  const { user } = useAuth();
  return (
    <div className="py-16">
      <EmptyState
        icon={<MapPin className="h-6 w-6" />}
        title="Page not found"
        message="This stop isn’t on any route."
        action={
          <Link to={user ? `/${user.role}` : '/login'} className="text-sm font-semibold text-electric-600 hover:underline">
            Go to dashboard
          </Link>
        }
      />
    </div>
  );
}
