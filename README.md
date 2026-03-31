# Media Server Status

Standalone Vue + Node.js dashboard for a home Ubuntu media server stack:
Sonarr, Radarr, Whisparr, Overseerr, Bazarr, SABnzbd, Plex, and Jellyfin.

Requires Node.js 20+.

## Features

- System health metrics (CPU, memory, disk, uptime)
- Service status checks for media applications
- Media summary aggregation
- Scheduled network ping checks + uptime history
- Scheduled speed tests with historical storage in SQLite
- Dark mode default with light mode toggle

## Project Structure

- `frontend/` Vue 3 dashboard (Vite)
- `backend/` Express API + schedulers + SQLite persistence
- `docs/` deployment notes

## Setup

```bash
corepack enable
cp .env.example .env
pnpm install
pnpm dev
```

`pnpm dev` runs backend on `3001` and frontend on `5173` by default.
The backend watches `/.env` in dev mode, so env edits should auto-restart the API process.
Backend env loading checks both root `.env` and `backend/.env` (root file is preferred).

## Production

```bash
bash ./scripts/deploy-ubuntu.sh
```

Server binds to `PORT` (default `80`).
The deploy script installs dependencies, builds the app, writes a systemd unit,
and enables autostart for `media-server-status`.
