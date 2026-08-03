# Referee Lights 1.2

![release](https://img.shields.io/github/v/tag/jeanribas/referee-lights?label=release&sort=semver) ![visitors](https://visitor-badge.laobi.icu/badge?page_id=jeanribas.referee-lights) ![license](https://img.shields.io/badge/license-Custom-blue)

[Português](README.md) · English · [Español](README.es.md)

Complete referee light system for Powerlifting competitions following IPF rules. Version **1.2** brings responsive viewport scaling on every screen, PWA support, and a redesigned standalone timer page. Five web interfaces share the same real-time state via Socket.IO and can be opened on different devices:

- `/` – admin panel that creates/resumes sessions, generates QR codes, controls the timer, and monitors the platform state
- `/display` – full-screen display with the three lights, countdown timer, interval alerts, and cooldown badges
- `/timer` – standalone timer/interval control panel with cooldown badges
- `/legend` – companion board for broadcast/control desk with customizable layout
- `/ref/<judge>` – individual consoles (left, center, right) with votes and IPF cards

> The admin panel remains available at `/admin` for backwards compatibility with older links.

Each session has a `roomId` and an admin PIN. The panel automatically generates referee QR codes and direct links for the display/legend, and it can rotate tokens if needed.

## What's new in 1.2

- **Responsive viewport scaling** – all screens (admin, display, timer, referee) auto-scale to fit any screen size; no more manual zoom controls on display; admin panel scales proportionally on smaller windows; referee consoles work on any smartphone without manual zoom adjustment
- **PWA support** – Web App Manifest with standalone display mode; apple-mobile-web-app-capable for iOS; saves the current URL (with roomId/token) to home screen; SVG app icon with referee lights design
- **Redesigned standalone timer** (`/timer`) – now a full control panel (not just a display); Timer + Interval cards side by side (landscape) or stacked (portrait); cooldown badges showing lifter change time; responsive scaling
- **Footer auto-hide on scroll** – FooterBadges component hides during scroll, reappears after 1.5 s
- **Cooldown badge improvements** – fixed-width badges (tabular-nums), positioned absolutely above LIFTER/ATTEMPT plates (no layout shift), exported `useCooldownBadges` hook for reuse
- **Key Relay built into server** – no longer requires a separate helper process. The admin panel has an "Ativar Key Relay" toggle that starts/stops the key relay directly from the browser. Supports any key combination (F1–F12, Ctrl+key, Alt+key, etc.) configurable via a modal that captures keystrokes


## Screenshots

![Admin panel](screenshots/admin.jpg)
![Main display](screenshots/display.jpg)
![Display with timer](screenshots/display-2.jpg)
![Interval view – stage 1](screenshots/intervalo-1.jpg)
![Interval view – stage 2](screenshots/intervalo-2.jpg)
![Chroma key screen](screenshots/cromakey.jpg)

## Run on Windows (no install)

1. Download `referee-lights-windows.zip` from the [Releases](https://github.com/jeanribas/referee-lights/releases) page
2. Right-click → **Extract All...**
3. Open the extracted folder and double-click **Iniciar.cmd**
4. The browser will open automatically with the platform
5. Share the QR Codes with referees (same Wi-Fi network)

To stop, press any key in the Iniciar window.

## Running locally

### 1. Server (Fastify + Socket.IO)

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

The server listens on `http://localhost:3333`.

### 2. Frontend (Next.js)

```bash
cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and navigate to the desired route.

> Adjust `NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_API_URL` in `.env.local` to the public server origin when you deploy on a network.

## Environment variables

### Server (.env)
| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3333` |
| `CORS_ORIGIN` | Allowed origins | — |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | `info` |
| `TELEMETRY_ENABLED` | Enable/disable telemetry | `true` |
| `ANALYTICS_DB_PATH` | Analytics database path | `data/analytics.db` |

## Admin panel (`/`, also `/admin`)

- **Create new session** – generates `roomId`, admin PIN, referee tokens, and direct display/legend links
- **Join existing session** – reclaims a platform by entering `roomId` + PIN
- **QR Codes** – shows each referee code, with a button to rotate links (confirmation required before revoking current tokens)
- **Ready / Release / Clear** – controls the standard light flow and the 60 s timer
- **Timer** – start/stop/reset plus quick minute adjustments
- **Interval** – schedules downtime, toggles between red warning and main panel

### Visual and audio alerts

- The interval countdown plays short beeps during the last 10 s and a long tone at zero. After 1 s the message `OPENER CHANGES CLOSED` (localized) replaces the red overlay.
- The main timer also beeps during the last 10 s and plays three quick tones on the final second.
- Browser autoplay rules require one user interaction (click/keypress) before sounds play.

## Suggested workflow

1. Open `/`, create a new session, and copy `roomId`/PIN.
2. Load the display at `/display?roomId=ABCD&pin=1234` and enable fullscreen.
3. Share the QR codes with referees (each one opens their respective console).
4. To rotate the crew, open the QR modal and confirm "Generate new links".
5. Use the "Legend" button to open the companion screen (`/legend?roomId=ABCD&pin=1234`).
6. Typical flow: Ready → referees vote → Release → decision revealed → Clear.

## Quick customization

- Adjust the default timer by editing `INITIAL_TIMER` in `server/src/state.ts`.
- Change token settings/expiration in `server/src/rooms.ts` within `RoomManager`.
- Admin panel UI lives in `frontend/src/pages/admin.tsx`.
- Display scaling and timer layout live in `frontend/src/pages/display.tsx` and `frontend/src/components/TimerDisplay.tsx`.
- Audio cues are handled in `frontend/src/components/IntervalFull.tsx`.

## External shortcuts (F1/F10)

The recommended approach is to use the **"Ativar Key Relay"** toggle in the admin panel. It starts/stops the key relay directly from the browser with no helper process needed. A modal lets you capture any key combination (F1–F12, Ctrl+key, Alt+key, etc.) to customize the shortcuts.

For advanced use, the standalone helper in `tools/key-relay` is still available. Run `start.command` (macOS), `start.bat`/`start.ps1` (Windows), or `start.sh` (Linux), paste the session link (display/admin), and optionally override the shortcut keys. The helper stays connected via Socket.IO and sends:

- `F1` when at least two white lights (good lift) are registered
- `F10` when at least two red lights (no lift) are registered

The helper only requires Node 18+. Full instructions (including OS permissions) are in `tools/key-relay/README.md`. Keep it running on the machine that will emit the keystrokes, even if the backend is hosted elsewhere.

## Deploy

- **Server**: any Node 18+ environment (e.g., EasyPanel). Run `npm run build` and then `npm start`.
- **Frontend**: Vercel or similar. Configure `NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_API_URL` with the server domain.
- **Docker**: mount a volume at `/app/data` to persist data.
