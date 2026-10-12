import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Armchair,
  Bus,
  ChevronRight,
  Cpu,
  IdCard,
  FileBarChart,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Map,
  Menu,
  Moon,
  Route,
  ScrollText,
  Siren,
  Sun,
  UserRound,
  Users,
  Wine,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Logo } from '../components/Logo';
import { NotificationCenter } from '../components/NotificationCenter';
import { ConnectionIndicator, OfflineBanner } from '../components/ConnectionIndicator';
import { cx } from '../components/format';
import type { Role } from '../services/types';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  mobile?: boolean;
}

const ic = 'h-[18px] w-[18px]';
export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'Overview', icon: <LayoutDashboard className={ic} />, end: true },
    { to: '/admin/map', label: 'Fleet Map', icon: <Map className={ic} /> },
    { to: '/admin/students', label: 'Students', icon: <Users className={ic} /> },
    { to: '/admin/buses', label: 'Buses & Devices', icon: <Bus className={ic} /> },
    { to: '/admin/routes', label: 'Routes & Stops', icon: <Route className={ic} /> },
    { to: '/admin/pickups', label: 'Pickup Requests', icon: <ListChecks className={ic} /> },
    { to: '/admin/emergency', label: 'Emergency Center', icon: <Siren className={ic} /> },
    { to: '/admin/reports', label: 'Reports', icon: <FileBarChart className={ic} /> },
    { to: '/admin/audit', label: 'Audit Log', icon: <ScrollText className={ic} /> },
    { to: '/admin/account', label: 'Account', icon: <KeyRound className={ic} /> },
  ],
  student: [
    { to: '/student', label: 'Overview', icon: <LayoutDashboard className={ic} />, end: true, mobile: true },
    { to: '/student/map', label: 'Live Map & Pickup', icon: <Map className={ic} />, mobile: true },
    { to: '/student/requests', label: 'My Requests', icon: <ListChecks className={ic} />, mobile: true },
    { to: '/student/alerts', label: 'Safety Alerts', icon: <Siren className={ic} />, mobile: true },
    { to: '/student/profile', label: 'Profile', icon: <UserRound className={ic} />, mobile: true },
  ],
  bus: [
    { to: '/bus', label: 'Overview', icon: <LayoutDashboard className={ic} />, end: true, mobile: true },
    { to: '/bus/pickups', label: 'Pickup Requests', icon: <ListChecks className={ic} />, mobile: true },
    { to: '/bus/map', label: 'Live Map', icon: <Map className={ic} />, mobile: true },
    { to: '/bus/occupancy', label: 'Seat Occupancy', icon: <Armchair className={ic} /> },
    { to: '/bus/alcohol', label: 'Alcohol Monitor', icon: <Wine className={ic} /> },
    { to: '/bus/driver', label: 'Driver Duty', icon: <IdCard className={ic} /> },
    { to: '/bus/emergency', label: 'SOS & Incidents', icon: <Siren className={ic} />, mobile: true },
    { to: '/bus/device', label: 'Hardware Status', icon: <Cpu className={ic} /> },
    { to: '/bus/account', label: 'Account', icon: <KeyRound className={ic} />, mobile: true },
  ],
};

const PORTAL: Record<Role, string> = { admin: 'Administration', student: 'Student Portal', bus: 'Bus Console' };

function SidebarContent({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <Logo light />
        <div className="mt-4 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-cyan-300">{PORTAL[role]}</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {NAV[role].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-electric-600 text-white shadow-lg shadow-electric-900/40' : 'text-navy-100/80 hover:bg-white/5 hover:text-white',
              )
            }
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-[11px] text-navy-300">SMARTBUS 360 · v1.0 · Local network</div>
    </div>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!user) return null;
  const initials = user.display_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const accountPath = user.role === 'student' ? '/student/profile' : `/${user.role}/account`;
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100 dark:hover:bg-navy-800" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-xs font-bold text-white dark:bg-electric-600">{initials}</span>
        <span className="hidden max-w-[140px] truncate text-sm font-medium md:block">{user.display_name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-[1100] mt-2 w-60 animate-fadeIn overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-pop dark:border-navy-700 dark:bg-navy-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-navy-800">
            <p className="truncate text-sm font-semibold">{user.display_name}</p>
            <p className="truncate text-xs text-slate-500">@{user.username} · {user.role}</p>
          </div>
          <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-navy-800" onClick={() => { setOpen(false); navigate(accountPath); }}>
            <KeyRound className="h-4 w-4" /> Change password
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ role }: { role: Role }) {
  const [drawer, setDrawer] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const current = [...NAV[role]].sort((a, b) => b.to.length - a.to.length).find((n) => location.pathname === n.to || location.pathname.startsWith(n.to + '/'));
  useEffect(() => setDrawer(false), [location.pathname]);
  const mobileNav = NAV[role].filter((n) => n.mobile);

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-navy-900 lg:block dark:bg-navy-950 dark:ring-1 dark:ring-navy-800">
        <SidebarContent role={role} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-[1300] lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fadeIn bg-navy-900">
            <button className="absolute right-3 top-4 rounded-lg p-1.5 text-navy-200 hover:bg-white/10" onClick={() => setDrawer(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent role={role} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur dark:border-navy-800 dark:bg-navy-950/85">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-navy-800" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
            <span className="text-slate-500 dark:text-slate-400">{PORTAL[role]}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className="truncate font-semibold text-slate-900 dark:text-white">{current?.label ?? ''}</span>
          </nav>
          <span className="truncate text-sm font-semibold sm:hidden">{current?.label}</span>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <ConnectionIndicator compact={false} />
            <button
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <NotificationCenter />
            <ProfileMenu />
          </div>
        </div>
        <OfflineBanner />
      </header>

      <main className={cx('mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8', mobileNav.length > 0 && 'pb-24 lg:pb-8')}>
        <Outlet />
      </main>

      {mobileNav.length > 0 && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-navy-800 dark:bg-navy-950/95" aria-label="Quick navigation">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0,1fr))` }}>
            {mobileNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-electric-600 dark:text-electric-400' : 'text-slate-500')
                }
              >
                {item.icon}
                <span className="max-w-full truncate px-1">{item.label.split(' ')[0]}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
