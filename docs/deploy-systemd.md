# Ubuntu Deployment (Systemd)

## 1) Install dependencies and build

```bash
corepack enable
pnpm install
pnpm build
```

## 2) Prepare environment

```bash
cp .env.example .env
```

Set API keys/tokens in `.env`.

## 3) Create systemd service

Create `/etc/systemd/system/media-server-status.service`:

```ini
[Unit]
Description=Media Server Status Dashboard
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/media-server-status
EnvironmentFile=/opt/media-server-status/.env
ExecStart=/usr/bin/env pnpm start
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

## 4) Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable media-server-status
sudo systemctl start media-server-status
sudo systemctl status media-server-status
```

## 5) Back up telemetry DB

Back up `data/status.db` regularly (for example via cron + `sqlite3 .backup`).
