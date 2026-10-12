import { Navigate, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../hooks/useAuth';
import { Logo } from '../components/Logo';
import { Notice } from '../components/ui';
import { PasswordForm } from './PasswordForm';

export function ChangePasswordPage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Logo className="mb-8" />
        <div className="card p-6">
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="mt-1 text-sm text-slate-500">Signed in as <strong>@{user.username}</strong></p>
          {user.must_change_password && (
            <div className="mt-4">
              <Notice tone="blue">For your security, the initial password issued by the administrator must be changed before you continue.</Notice>
            </div>
          )}
          <div className="mt-5">
            <PasswordForm onDone={(u) => navigate(homeFor(u.role), { replace: true })} />
          </div>
          <button className="mt-4 text-xs text-slate-500 hover:underline" onClick={async () => { await logout(); navigate('/login'); }}>
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
