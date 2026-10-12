import { useCallback, useEffect, useRef, useState } from 'react';

export type GeoState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; latitude: number; longitude: number; accuracy: number; timestamp: number }
  | { status: 'error'; code: 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure' | 'invalid'; message: string };

const MESSAGES: Record<string, string> = {
  denied: 'Location permission was denied. Allow location access for this site in your browser settings, or choose a boarding stop instead.',
  unavailable: 'Your phone could not determine its location (GPS unavailable). Move to an open area or choose a boarding stop.',
  timeout: 'Getting your location took too long. Try again or choose a boarding stop.',
  unsupported: 'This browser does not support location services. Choose a boarding stop instead.',
  insecure:
    'This browser only shares location on secure (HTTPS) pages or localhost. Ask the administrator to enable HTTPS (see NETWORK_SETUP.md) or choose a boarding stop.',
  invalid: 'The browser returned invalid coordinates. Try again or choose a boarding stop.',
};

/**
 * Real device location via navigator.geolocation — never simulated.
 * `request()` asks for permission and a fresh fix; nothing runs until called.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle' });
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'error', code: 'unsupported', message: MESSAGES.unsupported });
      return;
    }
    if (!window.isSecureContext) {
      setState({ status: 'error', code: 'insecure', message: MESSAGES.insecure });
      return;
    }
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted.current) return;
        const { latitude, longitude, accuracy } = pos.coords;
        const valid =
          Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
          !(latitude === 0 && longitude === 0);
        if (!valid) {
          setState({ status: 'error', code: 'invalid', message: MESSAGES.invalid });
          return;
        }
        setState({ status: 'ok', latitude, longitude, accuracy, timestamp: pos.timestamp });
      },
      (err) => {
        if (!mounted.current) return;
        const code = err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable';
        setState({ status: 'error', code, message: MESSAGES[code] });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
    );
  }, []);

  return { state, request };
}
