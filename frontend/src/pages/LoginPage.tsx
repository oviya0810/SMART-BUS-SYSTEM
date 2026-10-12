import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Bus,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  MapPin,
  Moon,
  Navigation,
  ShieldCheck,
  Siren,
  Sun,
  User,
  Wifi,
} from 'lucide-react';
import { homeFor, useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { ApiError, errorMessage } from '../services/api';
import { Notice } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { cx } from '../components/format';
import type { Role } from '../services/types';

interface Portal {
  role: Role;
  label: string;
  title: string;
  hint: string;
  icon: (cls: string) => JSX.Element;
  accent: string; // gradient for active tab + button
  ring: string;
}

const PORTALS: Portal[] = [
  {
    role: 'student',
    label: 'Student',
    title: 'Student portal',
    hint: 'Track your bus live, request a pickup and get safety alerts.',
    icon: (c) => <GraduationCap className={c} />,
    accent: 'from-cyan-500 to-electric-600',
    ring: 'focus-within:ring-cyan-500/30 focus-within:border-cyan-500',
  },
  {
    role: 'bus',
    label: 'Bus',
    title: 'Bus console',
    hint: 'Pickup requests, seats, driver duty, hardware and incidents.',
    icon: (c) => <Bus className={c} />,
    accent: 'from-electric-500 to-electric-700',
    ring: 'focus-within:ring-electric-500/30 focus-within:border-electric-500',
  },
  {
    role: 'admin',
    label: 'Admin',
    title: 'Transport office',
    hint: 'Fleet map, accounts, emergencies and reports.',
    icon: (c) => <ShieldCheck className={c} />,
    accent: 'from-violet-500 to-electric-700',
    ring: 'focus-within:ring-violet-500/30 focus-within:border-violet-500',
  },
];

/* ---------------------------------------------------------------- animated hero */
const ROUTE = 'M40,330 C120,330 140,240 230,240 S330,300 400,210 S470,90 560,110';
const STOPS: [number, number][] = [
  [40, 330],
  [230, 240],
  [400, 210],
  [560, 110],
];

function HeroScene() {
  const [reduce] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  return (
    <svg viewBox="0 0 600 400" className="h-full w-full" role="img" aria-label="Illustration of a bus travelling along its route">
      <defs>
        <linearGradient id="routeGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#5a88ff" />
        </linearGradient>
        <radialGradient id="pinGlow">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity=".55" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M30 0H0V30" fill="none" stroke="#ffffff" strokeOpacity=".05" />
        </pattern>
      </defs>
      <rect width="600" height="400" fill="url(#grid)" />
      {/* city blocks */}
      {[
        [70, 60, 90, 60], [190, 40, 70, 90], [300, 70, 80, 60], [450, 200, 110, 70], [90, 210, 70, 50], [300, 300, 120, 60], [480, 300, 80, 60],
      ].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="10" fill="#ffffff" fillOpacity=".035" stroke="#ffffff" strokeOpacity=".06" />
      ))}
      {/* route */}
      <path id="busRoute" d={ROUTE} fill="none" stroke="#ffffff" strokeOpacity=".08" strokeWidth="18" strokeLinecap="round" />
      <path d={ROUTE} fill="none" stroke="url(#routeGrad)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 12" />
      {/* stops */}
      {STOPS.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="26" fill="url(#pinGlow)">
            {!reduce && <animate attributeName="r" values="14;30;14" dur="3s" begin={`${i * 0.6}s`} repeatCount="indefinite" />}
          </circle>
          <circle cx={x} cy={y} r="8" fill="#0b1736" stroke="#22d3ee" strokeWidth="3" />
        </g>
      ))}
      {/* student waiting */}
      <g transform="translate(400 210)">
        <path d="M0,-14 c-9,0 -15,7 -15,15 c0,11 15,25 15,25 s15,-14 15,-25 c0,-8 -6,-15 -15,-15z" transform="translate(0 -44)" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
        <circle cx="0" cy="-43" r="5" fill="#fff" />
      </g>
      {/* moving bus */}
      <g>
        <circle r="22" fill="#2f63ff" fillOpacity=".25">
          {!reduce && <animate attributeName="r" values="18;28;18" dur="1.6s" repeatCount="indefinite" />}
        </circle>
        <rect x="-15" y="-13" width="30" height="26" rx="7" fill="#2f63ff" stroke="#fff" strokeWidth="2.5" />
        <rect x="-10" y="-8" width="20" height="8" rx="2" fill="#dbe4fb" />
        <circle cx="-7" cy="6" r="2.4" fill="#fff" />
        <circle cx="7" cy="6" r="2.4" fill="#fff" />
        {reduce ? (
          <animateMotion dur="0.001s" fill="freeze" keyPoints="0.45;0.45" keyTimes="0;1" calcMode="linear">
            <mpath href="#busRoute" />
          </animateMotion>
        ) : (
          <animateMotion dur="12s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
            <mpath href="#busRoute" />
          </animateMotion>
        )}
      </g>
    </svg>
  );
}

function FloatCard({ icon, title, sub, tone, className }: { icon: JSX.Element; title: string; sub: string; tone: string; className: string }) {
  return (
    <div className={cx('absolute flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-md', className)}>
      <span className={cx('flex h-9 w-9 items-center justify-center rounded-xl text-white', tone)}>{icon}</span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-navy-200">{sub}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page */
export function LoginPage() {
  const { user, login, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialPortal = (params.get('portal') as Role) || 'student';
  const [portal, setPortal] = useState<Role>(PORTALS.some((p) => p.role === initialPortal) ? initialPortal : 'student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState(false);

  useEffect(() => setError(null), [portal]);

  if (!loading && user) {
    if (user.must_change_password) return <Navigate to="/change-password" replace />;
    return <Navigate to={params.get('next') || homeFor(user.role)} replace />;
  }

  const active = PORTALS.find((p) => p.role === portal)!;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(username.trim(), password, portal);
      const next = params.get('next');
      navigate(u.must_change_password ? '/change-password' : next && next.startsWith(`/${u.role}`) ? next : homeFor(u.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WRONG_PORTAL' && err.details?.role) {
        setPortal(err.details.role as Role);
        setError(`${err.message} Switched to the ${err.details.role} portal — sign in again.`);
      } else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-screen overflow-hidden bg-slate-50 lg:grid-cols-[1.15fr_1fr] dark:bg-navy-950">
      {/* ============================== HERO */}
      <section className="relative hidden overflow-hidden bg-[radial-gradient(120%_120%_at_0%_0%,#1f4ff2_0%,#0b1736_45%,#060e24_100%)] lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />

        <header className="relative z-10 flex items-center justify-between px-12 pt-10">
          <div className="flex items-center gap-3">
            <LogoMark className="h-11 w-11 drop-shadow-[0_8px_24px_rgba(34,211,238,.35)]" />
            <div className="leading-none">
              <p className="text-lg font-bold tracking-tight text-white">
                SMARTBUS <span className="bg-gradient-to-r from-cyan-400 to-electric-400 bg-clip-text text-transparent">360</span>
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.22em] text-navy-200">Fleet · Tracking · Safety</p>
            </div>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-navy-100 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Campus network
          </span>
        </header>

        <div className="relative z-10 px-12 pt-12">
          <p className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[.18em] text-cyan-300 ring-1 ring-cyan-400/20">
            <Navigation className="h-3.5 w-3.5" /> Intelligent college transport
          </p>
          <h1 className="mt-5 max-w-xl text-[44px] font-bold leading-[1.08] tracking-tight text-white">
            Every bus. Every seat.
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-electric-300 to-violet-300 bg-clip-text text-transparent">Every student — safe.</span>
          </h1>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-navy-200">
            Live GPS tracking, one-tap pickup requests, real-time seat availability and instant SOS alerts — on one secure campus network.
          </p>
        </div>

        {/* scene */}
        <div className="relative z-0 mx-8 mt-4 flex-1">
          <div className="absolute inset-0">
            <HeroScene />
          </div>
          <FloatCard className="left-6 top-24 animate-[floatY_6s_ease-in-out_infinite]" tone="bg-gradient-to-br from-electric-500 to-electric-700" icon={<MapPin className="h-4 w-4" />} title="Live GPS" sub="Bus position every few seconds" />
          <FloatCard className="right-6 top-4 animate-[floatY_7s_ease-in-out_infinite_1s]" tone="bg-gradient-to-br from-amber-400 to-amber-600" icon={<Navigation className="h-4 w-4" />} title="Pickup request" sub="Sent straight to your bus" />
          <FloatCard className="bottom-8 left-1/4 animate-[floatY_8s_ease-in-out_infinite_.5s]" tone="bg-gradient-to-br from-red-500 to-red-700" icon={<Siren className="h-4 w-4" />} title="SOS alert" sub="Office notified instantly" />
        </div>

        <footer className="relative z-10 grid grid-cols-3 gap-6 border-t border-white/10 px-12 py-6 text-sm">
          {[
            ['ESP32 hardware', 'GPS · seats · alcohol'],
            ['Real-time', 'Socket.IO live updates'],
            ['Driver ID card', 'RFID duty start / end'],
          ].map(([a, b]) => (
            <div key={a}>
              <p className="font-semibold text-white">{a}</p>
              <p className="mt-0.5 text-xs text-navy-300">{b}</p>
            </div>
          ))}
        </footer>
      </section>

      {/* ============================== FORM */}
      <section className="relative flex items-center justify-center px-4 py-10 sm:px-8">
        {/* mobile hero background */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(120%_120%_at_0%_0%,#1f4ff2_0%,#0b1736_60%,#060e24_100%)] lg:hidden" />
        <div className="pointer-events-none absolute -right-40 top-1/4 hidden h-[28rem] w-[28rem] rounded-full bg-electric-500/10 blur-3xl lg:block" />

        <button
          onClick={toggle}
          className="absolute right-4 top-4 z-20 rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-600 backdrop-blur hover:bg-white dark:border-navy-700 dark:bg-navy-900/80 dark:text-slate-300"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="relative z-10 w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <LogoMark className="h-12 w-12" />
            <div>
              <p className="text-xl font-bold tracking-tight text-white">
                SMARTBUS <span className="text-cyan-400">360</span>
              </p>
              <p className="text-xs text-navy-200">Fleet · Tracking · Safety</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_30px_80px_-20px_rgba(11,23,54,.35)] backdrop-blur-xl sm:p-8 lg:bg-white/90 dark:border-navy-700 dark:bg-navy-900 lg:dark:bg-navy-900/90">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">Welcome back</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Sign in to {active.title}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{active.hint}</p>
              </div>
              <span className={cx('hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg sm:flex', active.accent)}>
                {active.icon('h-6 w-6')}
              </span>
            </div>

            {/* portal selector */}
            <div className="mt-6 grid grid-cols-3 gap-2" role="tablist" aria-label="Choose portal">
              {PORTALS.map((p) => {
                const on = portal === p.role;
                return (
                  <button
                    key={p.role}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setPortal(p.role)}
                    className={cx(
                      'group flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-semibold transition',
                      on
                        ? 'border-transparent bg-gradient-to-br text-white shadow-lg shadow-electric-600/25 ' + p.accent
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-950 dark:text-slate-300 dark:hover:bg-navy-800',
                    )}
                  >
                    <span className={cx('flex h-8 w-8 items-center justify-center rounded-xl transition', on ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-white dark:bg-navy-800')}>
                      {p.icon('h-4 w-4')}
                    </span>
                    {p.label}
                  </button>
                );
              })}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              {error && <Notice tone="red">{error}</Notice>}
              <div>
                <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Username
                </label>
                <div className={cx('flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 transition focus-within:ring-4 dark:border-navy-700 dark:bg-navy-950', active.ring)}>
                  <User className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    id="username"
                    className="w-full bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={portal === 'student' ? 'firstname.lastname' : portal === 'bus' ? 'bus_07' : 'admin username'}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Password
                </label>
                <div className={cx('flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 transition focus-within:ring-4 dark:border-navy-700 dark:bg-navy-950', active.ring)}>
                  <KeyRound className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    id="password"
                    className="w-full bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
                    required
                  />
                  <button type="button" className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {caps && <p className="mt-1.5 text-xs font-medium text-amber-600">Caps Lock is on</p>}
              </div>

              <button
                type="submit"
                disabled={busy || !username || !password}
                className={cx(
                  'group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r py-3 text-sm font-semibold text-white shadow-lg shadow-electric-600/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60',
                  active.accent,
                )}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sign in to {active.label} portal
                {!busy && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
              </button>
            </form>

            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:bg-navy-950 dark:text-slate-400">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <p>
                Accounts are created by the transport office. First-time users must change the initial password after signing in.
              </p>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Wifi className="h-3.5 w-3.5" /> SMARTBUS 360 · Secure campus network
          </p>
        </div>
      </section>
    </div>
  );
}
