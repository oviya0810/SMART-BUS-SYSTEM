import { cx } from './format';

/** SMARTBUS 360 mark: a bus inside a 300° orbit — tracking all the way around. */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="SMARTBUS 360 logo">
      <rect width="64" height="64" rx="15" fill="#0b1736" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#06b6d4" strokeWidth="3" strokeLinecap="round" strokeDasharray="104 28" transform="rotate(-50 32 32)" />
      <circle cx="47.6" cy="17.2" r="2.6" fill="#22d3ee" />
      <rect x="20" y="19" width="24" height="22" rx="5" fill="#2f63ff" />
      <rect x="23" y="22" width="18" height="8" rx="2" fill="#dbe4fb" />
      <circle cx="25.5" cy="35.5" r="2" fill="#fff" />
      <circle cx="38.5" cy="35.5" r="2" fill="#fff" />
      <rect x="22" y="41" width="5" height="4" rx="1.5" fill="#2f63ff" />
      <rect x="37" y="41" width="5" height="4" rx="1.5" fill="#2f63ff" />
    </svg>
  );
}

export function Logo({ compact, light, className }: { compact?: boolean; light?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <div className="leading-none">
          <div className={cx('text-[15px] font-bold tracking-tight', light ? 'text-white' : 'text-navy-900 dark:text-white')}>
            SMARTBUS <span className="text-cyan-500">360</span>
          </div>
          <div className={cx('mt-1 text-[10px] font-medium uppercase tracking-[.14em]', light ? 'text-navy-200' : 'text-slate-500 dark:text-slate-400')}>
            Fleet · Tracking · Safety
          </div>
        </div>
      )}
    </div>
  );
}
