#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-media-server-status}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${RUN_USER:-$(id -un)}"
RUN_GROUP="${RUN_GROUP:-$(id -gn)}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"
PORT="${PORT:-80}"

log() {
  printf "\n[deploy] %s\n" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "[deploy] Missing required command: %s\n" "$1" >&2
    exit 1
  fi
}

if [[ "${EUID}" -eq 0 ]]; then
  printf "[deploy] Run this script as a regular user with sudo access, not as root.\n" >&2
  exit 1
fi

require_cmd sudo
require_cmd node
require_cmd corepack
require_cmd systemctl

log "Preparing environment file"
if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -f "$REPO_ROOT/.env.example" ]]; then
    cp "$REPO_ROOT/.env.example" "${ENV_FILE}"
    printf "[deploy] Created %s from .env.example. Update values, then re-run if needed.\n" "${ENV_FILE}"
  else
    printf "[deploy] Missing %s and .env.example\n" "${ENV_FILE}" >&2
    exit 1
  fi
fi

if ! rg -n "^PORT=" "${ENV_FILE}" >/dev/null 2>&1; then
  printf "\nPORT=%s\n" "${PORT}" >>"${ENV_FILE}"
  printf "[deploy] Added PORT=%s to %s\n" "${PORT}" "${ENV_FILE}"
fi

log "Installing dependencies and building"
cd "${REPO_ROOT}"
corepack enable
corepack pnpm install
corepack pnpm build

SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

log "Writing systemd unit: ${SERVICE_FILE}"
sudo tee "${SERVICE_FILE}" >/dev/null <<EOF
[Unit]
Description=Media Server Status Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_ROOT}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/env corepack pnpm start
Restart=always
RestartSec=5
User=${RUN_USER}
Group=${RUN_GROUP}
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

log "Reloading and enabling service"
sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

log "Deployment complete"
sudo systemctl --no-pager --full status "${SERVICE_NAME}" || true
printf "\n[deploy] Logs: sudo journalctl -u %s -f\n" "${SERVICE_NAME}"
