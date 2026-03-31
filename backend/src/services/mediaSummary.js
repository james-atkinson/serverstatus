import axios from "axios";
import { services } from "../config/env.js";

const client = axios.create({ timeout: 8000 });

const byId = Object.fromEntries(services.map((service) => [service.id, service]));

const safeGet = async (url, options = {}) => {
  try {
    const response = await client.get(url, options);
    return response.data;
  } catch {
    return null;
  }
};

const pickSonarrArt = (row) => {
  const episodeImages = Array.isArray(row?.episode?.images) ? row.episode.images : [];
  const seriesImages = Array.isArray(row?.series?.images) ? row.series.images : [];
  const pickByType = (images, coverType) => images.find((entry) => entry?.coverType === coverType);
  const image =
    pickByType(seriesImages, "poster") ||
    pickByType(seriesImages, "seasonPoster") ||
    pickByType(episodeImages, "screenshot") ||
    [...seriesImages, ...episodeImages].find((entry) => entry?.url || entry?.remoteUrl);
  if (!image) return { artPath: null, artUrl: null };
  if (image.remoteUrl) return { artPath: null, artUrl: image.remoteUrl };
  return { artPath: image.url || null, artUrl: null };
};

const pickRadarrArt = (movie) => {
  const images = Array.isArray(movie?.images) ? movie.images : [];
  const pickByType = (coverType) => images.find((entry) => entry?.coverType === coverType);
  const image = pickByType("poster") || pickByType("fanart") || images.find((entry) => entry?.url || entry?.remoteUrl);
  if (!image) return { artPath: null, artUrl: null };
  if (image.remoteUrl) return { artPath: null, artUrl: image.remoteUrl };
  return { artPath: image.url || null, artUrl: null };
};

export const getMediaSummary = async () => {
  const jellyfin = byId.jellyfin;
  const plex = byId.plex;
  const sonarr = byId.sonarr;
  const radarr = byId.radarr;

  const [jellyInfo, plexRoot, sonarrSeries, radarrMovies, sonarrHistory] = await Promise.all([
    jellyfin?.enabled
      ? safeGet(`${jellyfin.url}/Items/Counts`, { headers: { "X-Emby-Token": jellyfin.token } })
      : null,
    plex?.enabled
      ? safeGet(`${plex.url}/library/sections`, {
          headers: { "X-Plex-Token": plex.token, Accept: "application/json" }
        })
      : null,
    sonarr?.enabled
      ? safeGet(`${sonarr.url}/api/v3/series`, { headers: { "X-Api-Key": sonarr.token } })
      : null,
    radarr?.enabled
      ? safeGet(`${radarr.url}/api/v3/movie`, { headers: { "X-Api-Key": radarr.token } })
      : null,
    sonarr?.enabled
      ? safeGet(
          `${sonarr.url}/api/v3/history?page=1&pageSize=200&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true`,
          { headers: { "X-Api-Key": sonarr.token } }
        )
      : null
  ]);

  const sonarrRecentEpisodes = (Array.isArray(sonarrHistory?.records) ? sonarrHistory.records : [])
    .filter(
      (row) =>
        row?.episode &&
        row?.series &&
        row?.episode?.hasFile === true
    )
    .map((row) => {
      const art = pickSonarrArt(row);
      return {
        id: row.id,
        seriesId: row.series?.id ?? null,
        seriesSlug: row.series?.titleSlug || null,
        episodeId: row.episode?.id ?? null,
        seriesTitle: row.series?.title || "Unknown Series",
        seasonNumber: row.episode?.seasonNumber,
        episodeNumber: row.episode?.episodeNumber,
        episodeTitle: row.episode?.title || "Unknown Episode",
        date: row.date,
        artPath: art.artPath,
        artUrl: art.artUrl
      };
    })
    .filter(
      (row, index, arr) =>
        arr.findIndex(
          (entry) =>
            entry.seriesTitle === row.seriesTitle &&
            entry.seasonNumber === row.seasonNumber &&
            entry.episodeNumber === row.episodeNumber
        ) === index
    )
    .slice(0, 5);

  const radarrRecentMovies = (Array.isArray(radarrMovies) ? radarrMovies : [])
    .filter((movie) => movie?.hasFile === true)
    .slice()
    .sort((a, b) => {
      const aDate = new Date(a?.movieFile?.dateAdded || a?.added || a?.dateAdded || 0).getTime();
      const bDate = new Date(b?.movieFile?.dateAdded || b?.added || b?.dateAdded || 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 5)
    .map((movie) => {
      const art = pickRadarrArt(movie);
      return {
        id: movie.id,
        movieId: movie.id,
        movieSlug: movie.titleSlug || null,
        title: movie.title || "Unknown Movie",
        year: movie.year ?? null,
        added: movie.movieFile?.dateAdded || movie.added || movie.dateAdded || null,
        artPath: art.artPath,
        artUrl: art.artUrl
      };
    });

  const sonarrEpisodeCount = Array.isArray(sonarrSeries)
    ? sonarrSeries.reduce((total, series) => {
        const stats = series?.statistics || {};
        const count =
          Number(stats.episodeFileCount) ||
          Number(stats.totalEpisodeCount) ||
          Number(stats.episodeCount) ||
          0;
        return total + count;
      }, 0)
    : null;

  return {
    sonarrSeriesCount: Array.isArray(sonarrSeries) ? sonarrSeries.length : null,
    sonarrEpisodeCount,
    sonarrBaseUrl: sonarr?.url || null,
    sonarrRecentEpisodes,
    radarrMovieCount: Array.isArray(radarrMovies) ? radarrMovies.length : null,
    radarrBaseUrl: radarr?.url || null,
    radarrRecentMovies,
    jellyfinMovieCount: jellyInfo?.MovieCount ?? null,
    jellyfinSeriesCount: jellyInfo?.SeriesCount ?? null,
    plexLibrariesDetected: Array.isArray(plexRoot?.MediaContainer?.Directory)
      ? plexRoot.MediaContainer.Directory.length
      : null
  };
};
