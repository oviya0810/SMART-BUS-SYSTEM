import L from 'leaflet';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BUS_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>';

export function busIcon(label: string, opts: { state?: 'live' | 'stale' | 'offline'; sos?: boolean } = {}) {
  const color = opts.sos ? '#dc2626' : opts.state === 'live' ? '#1f4ff2' : opts.state === 'stale' ? '#d97706' : '#64748b';
  const pulse = opts.sos ? `<span class="sb-pulse" style="background:${color}55"></span>` : '';
  return L.divIcon({
    className: 'sb-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -18],
    html: `<div style="position:relative;width:40px;height:40px">${pulse}
      <div style="position:absolute;inset:4px;border-radius:12px;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px -4px ${color}aa;border:2px solid white">${BUS_SVG}</div>
      <div style="position:absolute;top:36px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#0b1736;color:white;font:600 10px/1 Inter,system-ui;padding:3px 6px;border-radius:6px">${esc(label)}</div>
    </div>`,
  });
}

export const studentIcon = L.divIcon({
  className: 'sb-marker',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -10],
  html: `<div style="position:relative;width:22px;height:22px"><span class="sb-pulse" style="background:#06b6d455"></span>
    <div style="position:absolute;inset:3px;border-radius:9999px;background:#06b6d4;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div></div>`,
});

export function stopIcon(seq?: number, highlight = false) {
  const bg = highlight ? '#0b1736' : 'white';
  const fg = highlight ? 'white' : '#0b1736';
  return L.divIcon({
    className: 'sb-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -10],
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:${bg};border:2.5px solid #0b1736;display:flex;align-items:center;justify-content:center;font:700 10px/1 Inter,system-ui;color:${fg};box-shadow:0 1px 4px rgba(0,0,0,.25)">${seq ?? ''}</div>`,
  });
}

export function pickupIcon(status: string) {
  const color = status === 'pending' ? '#f59e0b' : status === 'approaching' ? '#06b6d4' : '#1f4ff2';
  return L.divIcon({
    className: 'sb-marker',
    iconSize: [28, 36],
    iconAnchor: [14, 34],
    popupAnchor: [0, -30],
    html: `<svg width="28" height="36" viewBox="0 0 28 36"><path d="M14 35s12-11.6 12-21A12 12 0 0 0 2 14c0 9.4 12 21 12 21z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="white"/></svg>`,
  });
}

export const incidentIcon = L.divIcon({
  className: 'sb-marker',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: `<div style="position:relative;width:30px;height:30px"><span class="sb-pulse" style="background:#dc262666"></span><div style="position:absolute;inset:4px;border-radius:9999px;background:#dc2626;border:2px solid white;color:white;font:800 12px/22px Inter,system-ui;text-align:center">!</div></div>`,
});
