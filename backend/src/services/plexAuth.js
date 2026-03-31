import axios from "axios";
import { readStore, writeStore } from "../db/sqlite.js";
import { services } from "../config/env.js";

const PLEX_CLIENT_ID = "media-server-status-local";
const PLEX_HEADERS = {
  Accept: "application/json",
  "X-Plex-Product": "Media Server Status",
  "X-Plex-Version": "0.1.0",
  "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
  "X-Plex-Device": "Web",
  "X-Plex-Device-Name": "Media Status Dashboard"
};

const plexTvClient = axios.create({
  baseURL: "https://plex.tv",
  timeout: 10000,
  headers: PLEX_HEADERS
});

const serviceById = Object.fromEntries(services.map((service) => [service.id, service]));

const getHost = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

export const startPlexDeviceAuth = async () => {
  const response = await plexTvClient.post("/api/v2/pins?strong=true");
  const pin = response.data;
  return {
    pinId: pin.id,
    code: pin.code,
    authUrl: `https://app.plex.tv/auth#?clientID=${encodeURIComponent(PLEX_CLIENT_ID)}&code=${encodeURIComponent(pin.code)}`,
    expiresAt: pin.expiresAt || null
  };
};

const resolvePlexServer = async (accountToken) => {
  const response = await plexTvClient.get("/api/v2/resources?includeHttps=1&includeRelay=1", {
    headers: { ...PLEX_HEADERS, "X-Plex-Token": accountToken }
  });
  const resources = Array.isArray(response.data) ? response.data : [];
  const plexService = serviceById.plex;
  const preferredHost = getHost(plexService?.url || "");
  const servers = resources.filter((item) => (item?.provides || "").includes("server"));

  const matchedByHost = preferredHost
    ? servers.find((server) => (server.connections || []).some((conn) => getHost(conn.uri) === preferredHost))
    : null;
  const selected = matchedByHost || servers.find((server) => server.owned) || servers[0] || null;
  if (!selected) {
    throw new Error("No Plex server found on account resources");
  }

  const localConnection =
    (selected.connections || []).find((conn) => conn.local && conn.uri) ||
    (selected.connections || []).find((conn) => conn.uri) ||
    null;
  const serverUrl = localConnection?.uri || null;
  const serverToken = selected.accessToken || accountToken;
  if (!serverUrl || !serverToken) {
    throw new Error("Unable to resolve usable Plex server connection");
  }
  return {
    serverUrl: serverUrl.replace(/\/$/, ""),
    serverToken,
    serverId: selected.clientIdentifier || selected.uuid || selected.machineIdentifier || null,
    serverName: selected.name || "Plex Server"
  };
};

export const checkPlexDeviceAuthStatus = async (pinId) => {
  const response = await plexTvClient.get(`/api/v2/pins/${encodeURIComponent(pinId)}`);
  const pin = response.data;
  if (!pin?.authToken) {
    return { authorized: false, expired: Boolean(pin?.expired || pin?.expiredAt) };
  }

  const resolved = await resolvePlexServer(pin.authToken);
  writeStore((store) => {
    store.plex_auth = {
      connected: true,
      accountToken: pin.authToken,
      serverToken: resolved.serverToken,
      serverUrl: resolved.serverUrl,
      serverId: resolved.serverId,
      serverName: resolved.serverName,
      updatedAt: new Date().toISOString()
    };
  });

  return {
    authorized: true,
    serverName: resolved.serverName,
    serverUrl: resolved.serverUrl,
    serverId: resolved.serverId
  };
};

export const getPlexAuthState = () => {
  const state = readStore().plex_auth || {};
  const fallback = serviceById.plex?.token
    ? {
        connected: true,
        accountToken: null,
        serverToken: serviceById.plex.token,
        serverUrl: serviceById.plex.url,
        serverId: null,
        serverName: "Plex (env fallback)",
        updatedAt: null
      }
    : null;

  const effective = state.connected ? state : fallback;
  return {
    connected: Boolean(effective?.connected),
    serverName: effective?.serverName || null,
    serverUrl: effective?.serverUrl || null,
    serverId: effective?.serverId || null,
    updatedAt: effective?.updatedAt || null
  };
};

export const getPlexConnection = () => {
  const state = readStore().plex_auth || {};
  if (state.connected && state.serverToken && state.serverUrl) {
    return {
      token: state.serverToken,
      url: state.serverUrl
    };
  }

  const plex = serviceById.plex;
  if (plex?.token && plex?.url) {
    return { token: plex.token, url: plex.url };
  }
  return null;
};
