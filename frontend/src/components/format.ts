export function parseIso(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(iso?: string | null): string {
  const d = parseIso(iso);
  if (!d) return '—';
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDate(iso?: string | null): string {
  const d = parseIso(iso);
  return d ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export function fmtTime(iso?: string | null): string {
  const d = parseIso(iso);
  return d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function timeAgo(iso?: string | null, now = Date.now()): string {
  const d = parseIso(iso);
  if (!d) return 'never';
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function fmtCoord(v?: number | null, digits = 6): string {
  return v === null || v === undefined ? '—' : v.toFixed(digits);
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
