# SMARTBUS 360 — Network Setup (Windows 10/11, local LAN)

Goal: every laptop, phone and ESP32 on the campus Wi-Fi/LAN opens **http://bus.local** and reaches the one
SMARTBUS 360 server, which serves the three dashboards **and** the API from the same address:

```
http://bus.local/admin     http://bus.local/student     http://bus.local/bus     http://bus.local/api/health
```

> `bus.local` does **not** resolve automatically on every device. You must choose one of the name-resolution
> methods in step 3. Using the server's IP address (e.g. `http://192.168.1.50/login`) always works.

## 1. Give the server PC a fixed IP address
Best: create a **DHCP reservation** in the Wi-Fi router for the server PC's MAC address (router admin page →
LAN / DHCP → Address reservation). Alternatively set a static IP in Windows:

1. Settings → Network & Internet → Wi-Fi (or Ethernet) → your network → **IP assignment → Edit → Manual**.
2. IPv4 on: IP `192.168.1.50` (outside the router's DHCP pool), mask `255.255.255.0`, gateway = router IP
   (e.g. `192.168.1.1`), DNS = router IP.
3. Check with `ipconfig` in PowerShell.

Also set the network profile to **Private** (Settings → Network → your network → Network profile type → Private).

## 2. Open the Windows Firewall
Right-click `scripts\configure_firewall.bat` → **Run as administrator**. It allows inbound TCP 80 (HTTP),
TCP 443 (HTTPS) and UDP 5353 (mDNS) on the *Private* profile. Equivalent PowerShell (admin):
```powershell
New-NetFirewallRule -DisplayName "SMARTBUS 360 HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Private
```

## 3. Make `bus.local` resolve
Pick **one** (A is the most reliable for every device type, including ESP32 and Android):

### A. Router DNS entry (recommended)
Many routers (OpenWrt, MikroTik, pfSense, most TP-Link/ASUS "Static DNS"/"Local DNS" pages) let you add a host
record: `bus.local → 192.168.1.50`. All DHCP clients then resolve it. If your router cannot, run a small LAN DNS
server (e.g. Pi-hole / Technitium DNS) and hand it out via DHCP.

### B. mDNS from the server (zero configuration, partial support)
Set in `.env`:
```
MDNS_ENABLED=true
MDNS_HOSTNAME=bus.local
MDNS_IP=192.168.1.50      # optional, auto-detected if empty
```
The server then answers multicast DNS for `bus.local`. Works on Windows 10/11, macOS, iOS, most Linux and
Android 12+ in Chrome. **Not** guaranteed on older Android versions or in ESP32 HTTP clients — use the IP there.
(Do not also name the Windows PC "bus": two mDNS responders for the same name conflict.)

### C. hosts file (single Windows/Linux/macOS client)
On each Windows *client* PC run `scripts\add_hosts_entry.bat 192.168.1.50` as administrator
(adds `192.168.1.50 bus.local` to `C:\Windows\System32\drivers\etc\hosts`). Phones cannot edit hosts files.

### ESP32 firmware
Use the server **IP address** (`http://192.168.1.50`) or method A. Do not depend on mDNS from the ESP32 HTTP client.

## 4. Run on port 80
`.env` → `PORT=80` (default). Then `scripts\start_backend.bat`. If port 80 is busy (IIS, "World Wide Web Publishing
Service", Skype, another web server) see TROUBLESHOOTING. Alternative: `PORT=8080` and use `http://bus.local:8080`.

## 5. Test
On the server: `Invoke-RestMethod http://localhost/api/health`
On a phone (same Wi-Fi): open `http://192.168.1.50/api/health`, then `http://bus.local/api/health`.
The client must be on the **same Wi-Fi/LAN** — guest Wi-Fi networks usually isolate clients ("AP isolation").

## 6. HTTPS (needed for phone GPS)
Browsers only allow `navigator.geolocation` on **secure origins** (HTTPS or `localhost`). Over plain
`http://bus.local` everything works **except** the student's "Use my GPS" button — students can still choose a stop.
To enable phone GPS:

**Option 1 — mkcert (no browser warnings, recommended):**
1. Install mkcert on the server (`winget install FiloSottile.mkcert` or from GitHub releases).
2. `mkcert -install` then `mkcert -cert-file backend\instance\certs\smartbus360.crt -key-file backend\instance\certs\smartbus360.key bus.local 192.168.1.50 localhost`
3. Install mkcert's `rootCA.pem` (`mkcert -CAROOT`) on each phone: Android → Settings → Security → Install certificate
   → CA certificate; iOS → AirDrop/email the file, install profile, then Settings → General → About → Certificate Trust Settings → enable.

**Option 2 — self-signed (quick, browser warning once per device):**
`scripts\generate_https_cert.bat` → follow the printed `.env` lines.

Then in `.env`:
```
SSL_CERT_FILE=C:\SMARTBUS360_SOFTWARE\backend\instance\certs\smartbus360.crt
SSL_KEY_FILE=C:\SMARTBUS360_SOFTWARE\backend\instance\certs\smartbus360.key
PORT=443
SESSION_COOKIE_SECURE=true
PUBLIC_BASE_URL=https://bus.local
CORS_ORIGINS=https://bus.local,http://localhost:5173
```
Allow TCP 443 in the firewall (step 2 does). ESP32 devices can keep using HTTP only if you also run a second
instance on port 80, or use HTTPS from the ESP32 (`WiFiClientSecure` with the certificate) — simplest is a dedicated
HTTP instance for devices on the isolated bus network, see SECURITY.md.

**Testing-only alternative (Android Chrome):** `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add
`http://bus.local`, relaunch. Not for production.

## 7. Map tiles need internet
The live map loads OpenStreetMap tiles from `tile.openstreetmap.org`. All SMARTBUS data stays on the LAN, but
**tiles require the client device to have internet access**; without it markers still show on a blank background.
Respect the OSM tile usage policy (moderate use, attribution shown). For heavy use, host your own tile server
and change the `TileLayer` URL in `frontend/src/maps/BaseMap.tsx`.

## 8. Development mode (optional)
`scripts\start_backend.bat` + `scripts\start_frontend.bat` → open `http://<server-ip>:5173`. Vite proxies `/api` and
`/socket.io` to the backend (`VITE_DEV_BACKEND` in `frontend\.env`), so cookies and websockets work on phones too.
