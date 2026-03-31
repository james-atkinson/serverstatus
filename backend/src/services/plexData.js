import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { getPlexAuthState, getPlexConnection } from "./plexAuth.js";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

const plexClient = axios.create({ timeout: 10000 });

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const buildPlexWebUrl = (entry) => {
  const auth = getPlexAuthState();
  const serverId = auth?.serverId;
  const key = entry?.key || (entry?.ratingKey ? `/library/metadata/${entry.ratingKey}` : null);
  if (!serverId || !key) return null;
  return `https://app.plex.tv/desktop/#!/server/${encodeURIComponent(serverId)}/details?key=${encodeURIComponent(key)}`;
};

const pickArt = (entry) => {
  const candidates = [
    entry?.grandparentThumb,
    entry?.parentThumb,
    entry?.thumb,
    entry?.art
  ].filter(Boolean);
  const selected = candidates[0] || null;
  if (!selected) return { artPath: null, artUrl: null };
  if (selected.startsWith("http://") || selected.startsWith("https://")) {
    return { artPath: null, artUrl: selected };
  }
  return { artPath: selected, artUrl: null };
};

const fetchPlexXml = async (endpoint, params = {}) => {
  const connection = getPlexConnection();
  if (!connection) {
    throw new Error("Plex is not connected");
  }
  const response = await plexClient.get(`${connection.url}${endpoint}`, {
    headers: { "X-Plex-Token": connection.token },
    params: { ...params, "X-Plex-Token": connection.token },
    responseType: "text"
  });
  return xmlParser.parse(response.data);
};

const fetchPlexContainer = async (endpoint, params = {}) => {
  const connection = getPlexConnection();
  if (!connection) {
    throw new Error("Plex is not connected");
  }

  try {
    const jsonResponse = await plexClient.get(`${connection.url}${endpoint}`, {
      headers: { Accept: "application/json", "X-Plex-Token": connection.token },
      params: { ...params, "X-Plex-Token": connection.token }
    });
    if (jsonResponse?.data?.MediaContainer) {
      return jsonResponse.data.MediaContainer;
    }
  } catch {
    // Fallback to XML parser below.
  }

  const xmlParsed = await fetchPlexXml(endpoint, params);
  return xmlParsed?.MediaContainer || {};
};

export const getPlexNowPlaying = async () => {
  const container = await fetchPlexContainer("/status/sessions");
  const sessions = [
    ...asArray(container.Metadata),
    ...asArray(container.Video),
    ...asArray(container.Track),
    ...asArray(container.Photo)
  ];
  if (!sessions.length) {
    const altContainer = await fetchPlexContainer("/status/sessions/all");
    sessions.push(
      ...asArray(altContainer.Metadata),
      ...asArray(altContainer.Video),
      ...asArray(altContainer.Track),
      ...asArray(altContainer.Photo)
    );
  }
  return sessions.map((entry) => {
    const user = asArray(entry.User)[0] || {};
    const player = asArray(entry.Player)[0] || {};
    const session = asArray(entry.Session)[0] || {};
    const duration = Number(entry.duration || 0);
    const viewOffset = Number(entry.viewOffset || 0);
    const progressPct = duration > 0 ? Number(((viewOffset / duration) * 100).toFixed(2)) : 0;
    const art = pickArt(entry);

    return {
      sessionId: session.id || null,
      user: user.title || "Unknown User",
      title: entry.title || "Unknown Title",
      grandparentTitle: entry.grandparentTitle || null,
      type: entry.type || null,
      client: player.product || player.title || "Unknown Client",
      state: player.state || "unknown",
      progressPct,
      startedAt: entry.lastViewedAt || null,
      artPath: art.artPath,
      artUrl: art.artUrl,
      appUrl: buildPlexWebUrl(entry)
    };
  });
};

export const getPlexHistory = async (limit = 20) => {
  const container = await fetchPlexContainer("/status/sessions/history/all", {
    sort: "viewedAt:desc",
    "X-Plex-Container-Start": 0,
    "X-Plex-Container-Size": Math.max(1, Math.min(100, Number(limit) || 20))
  });
  const videos = [...asArray(container.Metadata), ...asArray(container.Video)];

  return videos.map((entry) => {
    const title = entry.title || "Unknown Title";
    const seriesTitle = entry.grandparentTitle || null;
    const art = pickArt(entry);

    return {
      historyId: entry.ratingKey || null,
      user: entry.accountID || "Unknown User",
      title,
      grandparentTitle: seriesTitle,
      type: entry.type || null,
      playedAt: entry.viewedAt ? new Date(Number(entry.viewedAt) * 1000).toISOString() : null,
      durationMs: entry.duration ? Number(entry.duration) : null,
      viewOffsetMs: entry.viewOffset ? Number(entry.viewOffset) : null,
      artPath: art.artPath,
      artUrl: art.artUrl,
      appUrl: buildPlexWebUrl(entry)
    };
  });
};
