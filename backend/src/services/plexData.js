import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { getPlexConnection } from "./plexAuth.js";
import { services } from "../config/env.js";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});

const plexClient = axios.create({ timeout: 10000 });
const byId = Object.fromEntries(services.map((service) => [service.id, service]));

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const normalize = (value) => String(value || "").trim().toLowerCase();

const safeGet = async (url, options = {}) => {
  try {
    const response = await plexClient.get(url, options);
    return response.data;
  } catch {
    return null;
  }
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
      artPath: entry.thumb || entry.grandparentThumb || entry.art || null
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
  const sonarr = byId.sonarr;
  const radarr = byId.radarr;
  const [sonarrSeries, radarrMovies] = await Promise.all([
    sonarr?.enabled
      ? safeGet(`${sonarr.url}/api/v3/series`, { headers: { "X-Api-Key": sonarr.token } })
      : null,
    radarr?.enabled
      ? safeGet(`${radarr.url}/api/v3/movie`, { headers: { "X-Api-Key": radarr.token } })
      : null
  ]);

  const sonarrByTitle = new Map(
    (Array.isArray(sonarrSeries) ? sonarrSeries : []).map((series) => [normalize(series?.title), series])
  );
  const radarrList = Array.isArray(radarrMovies) ? radarrMovies : [];

  return videos.map((entry) => {
    const type = normalize(entry.type);
    const title = entry.title || "Unknown Title";
    const seriesTitle = entry.grandparentTitle || null;
    let appUrl = null;

    if (type === "episode" && sonarr?.url && seriesTitle) {
      const series = sonarrByTitle.get(normalize(seriesTitle));
      if (series?.id) appUrl = `${sonarr.url}/series/${series.id}`;
    }

    if (type === "movie" && radarr?.url) {
      const movie = radarrList.find((row) => normalize(row?.title) === normalize(title));
      if (movie?.id) appUrl = `${radarr.url}/movie/${movie.id}`;
    }

    return {
      historyId: entry.ratingKey || null,
      user: entry.accountID || "Unknown User",
      title,
      grandparentTitle: seriesTitle,
      type: entry.type || null,
      playedAt: entry.viewedAt ? new Date(Number(entry.viewedAt) * 1000).toISOString() : null,
      durationMs: entry.duration ? Number(entry.duration) : null,
      viewOffsetMs: entry.viewOffset ? Number(entry.viewOffset) : null,
      artPath: entry.thumb || entry.grandparentThumb || entry.art || null,
      appUrl
    };
  });
};
