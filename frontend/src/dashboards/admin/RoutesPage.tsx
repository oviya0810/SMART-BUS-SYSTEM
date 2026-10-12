import { FormEvent, useEffect, useState } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import { MapPin, Pencil, Plus, Route as RouteIcon, Trash2 } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { del, errorMessage, fieldErrors, post, put } from '../../services/api';
import type { RouteInfo, Stop } from '../../services/types';
import { BaseMap, FitBounds, MapButton, MapToolbar, Point, RouteLayer, validPoint } from '../../maps/BaseMap';
import { pickupIcon } from '../../maps/icons';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, Modal, Notice, PageHeader, SkeletonRows } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { cx } from '../../components/format';

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(7)), Number(e.latlng.lng.toFixed(7))) });
  return null;
}

const emptyStop = { id: 0, name: '', sequence: '', latitude: '', longitude: '' };

export function RoutesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<{ items: RouteInfo[] }>('/api/admin/routes');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [routeModal, setRouteModal] = useState<null | { id?: number; name: string; description: string }>(null);
  const [stop, setStop] = useState(emptyStop);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Stop | null>(null);
  const [fit, setFit] = useState(0);

  useEffect(() => {
    if (!selectedId && data?.items.length) setSelectedId(data.items[0].id);
  }, [data, selectedId]);
  const route = data?.items.find((r) => r.id === selectedId) ?? null;
  const points: Point[] = (route?.stops ?? []).filter((s) => validPoint(s.latitude, s.longitude)).map((s) => [s.latitude!, s.longitude!]);
  useEffect(() => setFit((f) => f + 1), [selectedId]);

  const saveRoute = async (e: FormEvent) => {
    e.preventDefault();
    if (!routeModal) return;
    setBusy(true);
    setErrors({});
    try {
      const body = { name: routeModal.name, description: routeModal.description };
      const res = routeModal.id ? await put<{ route: RouteInfo }>(`/api/admin/routes/${routeModal.id}`, body) : await post<{ route: RouteInfo }>('/api/admin/routes', body);
      setRouteModal(null);
      setSelectedId(res.route.id);
      reload();
      toast({ type: 'success', title: routeModal.id ? 'Route updated' : 'Route created' });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ type: 'error', title: 'Could not save route', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const saveStop = async (e: FormEvent) => {
    e.preventDefault();
    if (!route) return;
    setBusy(true);
    setErrors({});
    const body: Record<string, unknown> = {
      name: stop.name,
      sequence: stop.sequence === '' ? null : Number(stop.sequence),
      latitude: stop.latitude === '' ? null : Number(stop.latitude),
      longitude: stop.longitude === '' ? null : Number(stop.longitude),
    };
    try {
      if (stop.id) await put(`/api/admin/stops/${stop.id}`, body);
      else await post(`/api/admin/routes/${route.id}/stops`, body);
      setStop(emptyStop);
      reload();
      toast({ type: 'success', title: stop.id ? 'Stop updated' : 'Stop added' });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ type: 'error', title: 'Could not save stop', message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const removeStop = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await del(`/api/admin/stops/${deleting.id}`);
      setDeleting(null);
      reload();
      toast({ type: 'success', title: 'Stop deleted' });
    } catch (err) {
      toast({ type: 'error', title: 'Cannot delete stop', message: errorMessage(err) });
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <Card><ErrorState message={errorMessage(error)} onRetry={reload} /></Card>;
  const draftPoint = stop.latitude !== '' && stop.longitude !== '' && validPoint(Number(stop.latitude), Number(stop.longitude)) ? ([Number(stop.latitude), Number(stop.longitude)] as Point) : null;

  return (
    <>
      <PageHeader
        title="Routes & stops"
        subtitle="Configure routes and stop coordinates. Click on the map to place a stop."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setRouteModal({ name: '', description: '' })}>New route</Button>}
      />
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Routes" icon={<RouteIcon className="h-5 w-5" />} />
          {loading && !data ? <SkeletonRows rows={3} /> : !data?.items.length ? (
            <EmptyState title="No routes yet" message="Create a route, then add its stops." />
          ) : (
            <ul className="p-2">
              {data.items.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => { setSelectedId(r.id); setStop(emptyStop); }}
                    className={cx('flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm', r.id === selectedId ? 'bg-electric-50 font-semibold text-electric-700 dark:bg-navy-800 dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-navy-800/60')}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="text-xs text-slate-500">{r.stops.length} stops · {r.bus_count} bus</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {route ? (
          <div className="grid gap-4 2xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader
                title={route.name}
                subtitle={route.description || 'No description'}
                actions={<Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setRouteModal({ id: route.id, name: route.name, description: route.description ?? '' })}>Rename</Button>}
              />
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 dark:divide-navy-800">
                  <thead><tr><th className="th">#</th><th className="th">Stop</th><th className="th">Coordinates</th><th className="th" /></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-navy-800">
                    {route.stops.length === 0 && <tr><td colSpan={4} className="td text-center text-slate-500">No stops yet — add one below.</td></tr>}
                    {route.stops.map((s) => (
                      <tr key={s.id} className={cx(stop.id === s.id && 'bg-electric-50/60 dark:bg-navy-800/60')}>
                        <td className="td mono">{s.sequence}</td>
                        <td className="td font-medium">{s.name}</td>
                        <td className="td mono text-xs">{validPoint(s.latitude, s.longitude) ? `${s.latitude!.toFixed(6)}, ${s.longitude!.toFixed(6)}` : <Badge tone="amber">Not set</Badge>}</td>
                        <td className="td text-right">
                          <button className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-navy-800" aria-label={`Edit ${s.name}`} onClick={() => setStop({ id: s.id, name: s.name, sequence: String(s.sequence), latitude: s.latitude?.toString() ?? '', longitude: s.longitude?.toString() ?? '' })}><Pencil className="h-4 w-4" /></button>
                          <button className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form onSubmit={saveStop} className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2 dark:border-navy-800">
                <p className="text-sm font-semibold sm:col-span-2">{stop.id ? 'Edit stop' : 'Add stop'}</p>
                <Field label="Stop name" htmlFor="st-name" error={errors.name}><input id="st-name" className="input" value={stop.name} onChange={(e) => setStop({ ...stop, name: e.target.value })} /></Field>
                <Field label="Sequence" htmlFor="st-seq" error={errors.sequence} hint="Order along the route"><input id="st-seq" type="number" min={0} className="input" value={stop.sequence} onChange={(e) => setStop({ ...stop, sequence: e.target.value })} /></Field>
                <Field label="Latitude" htmlFor="st-lat" error={errors.latitude}><input id="st-lat" className="input mono" inputMode="decimal" value={stop.latitude} onChange={(e) => setStop({ ...stop, latitude: e.target.value })} /></Field>
                <Field label="Longitude" htmlFor="st-lng" error={errors.longitude}><input id="st-lng" className="input mono" inputMode="decimal" value={stop.longitude} onChange={(e) => setStop({ ...stop, longitude: e.target.value })} /></Field>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" loading={busy} disabled={!stop.name} icon={<MapPin className="h-4 w-4" />}>{stop.id ? 'Save stop' : 'Add stop'}</Button>
                  {(stop.id || stop.name || stop.latitude) ? <Button variant="ghost" type="button" onClick={() => setStop(emptyStop)}>Clear</Button> : null}
                </div>
              </form>
            </Card>
            <div>
              <Notice tone="blue">Click anywhere on the map to fill in the latitude/longitude of the stop you are adding or editing.</Notice>
              <BaseMap className="mt-3 h-[520px]" overlay={<MapToolbar><MapButton label="Fit stops" onClick={() => setFit((f) => f + 1)} /></MapToolbar>}>
                <FitBounds points={points} trigger={fit} />
                <RouteLayer route={route} highlightStopIds={stop.id ? [stop.id] : []} />
                <ClickToPlace onPick={(lat, lng) => setStop((s) => ({ ...s, latitude: String(lat), longitude: String(lng) }))} />
                {draftPoint && <Marker position={draftPoint} icon={pickupIcon('accepted')} />}
              </BaseMap>
            </div>
          </div>
        ) : (
          <Card><EmptyState title="Select or create a route" /></Card>
        )}
      </div>

      <Modal
        open={!!routeModal}
        onClose={() => setRouteModal(null)}
        title={routeModal?.id ? 'Edit route' : 'New route'}
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setRouteModal(null)}>Cancel</Button><Button type="submit" form="route-form" loading={busy}>Save</Button></>}
      >
        {routeModal && (
          <form id="route-form" onSubmit={saveRoute} className="space-y-4">
            <Field label="Route name" htmlFor="rt-name" error={errors.name}><input id="rt-name" className="input" value={routeModal.name} onChange={(e) => setRouteModal({ ...routeModal, name: e.target.value })} /></Field>
            <Field label="Description" htmlFor="rt-desc" error={errors.description}><textarea id="rt-desc" rows={3} className="input" value={routeModal.description} onChange={(e) => setRouteModal({ ...routeModal, description: e.target.value })} /></Field>
          </form>
        )}
      </Modal>
      <ConfirmDialog open={!!deleting} title="Delete stop?" message={`Delete “${deleting?.name}”? Stops used by students cannot be deleted.`} tone="danger" confirmLabel="Delete" loading={busy} onConfirm={removeStop} onClose={() => setDeleting(null)} />
    </>
  );
}
