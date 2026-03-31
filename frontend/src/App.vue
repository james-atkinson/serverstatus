<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <h1>Server Status</h1>
      </div>
      <button class="theme-btn" @click="toggleTheme">Theme: {{ themeLabel }}</button>
    </header>

    <main class="dashboard">
      <section class="top-stack">
      <div class="grid-row">
      <StatusCard title="System Health">
        <div v-if="system">
          <div class="system-grid system-grid-primary">
            <div class="system-grid-item">
              <span class="system-grid-label">Host</span>
              <strong>{{ system.hostname }}</strong>
            </div>
            <div class="system-grid-item">
              <span class="system-grid-label">Uptime</span>
              <strong>{{ formatUptime(system.uptimeSec) }}</strong>
            </div>
            <div class="system-grid-item">
              <span class="system-grid-label">Kernel</span>
              <strong>{{ system.kernelVersion || "n/a" }}</strong>
            </div>
            <div class="system-grid-item">
              <span class="system-grid-label">CPU</span>
              <strong>{{ system.cpuUsagePct }}%</strong>
            </div>
          </div>
          <div class="system-grid system-grid-compact">
            <div class="system-grid-item">
              <span class="system-grid-label">Load</span>
              <strong>{{ formatLoadAvg(system.loadAvg) }}</strong>
            </div>
            <div class="system-grid-item">
              <span class="system-grid-label">Disk I/O</span>
              <strong>R {{ formatRate(system.diskIo?.readBytesSec) }} / W {{ formatRate(system.diskIo?.writeBytesSec) }}</strong>
              <span class="recent-episode-time">TPS {{ Number(system.diskIo?.tps || 0).toFixed(1) }}</span>
            </div>
            <div class="system-grid-item">
              <span class="system-grid-label">Network</span>
              <strong>{{ system.network?.iface || "n/a" }} RX {{ formatRate(system.network?.rxBytesSec) }} / TX {{ formatRate(system.network?.txBytesSec) }}</strong>
            </div>
          </div>
          <div class="metric-block">
            <div class="metric-row">
              <span>Memory</span>
              <span>{{ memoryUsagePct }}% ({{ toGiB(system.memory.used) }} / {{ toGiB(system.memory.total) }} GiB)</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${memoryUsagePct}%` }"></div>
            </div>
          </div>
          <div class="metric-block">
            <div class="metric-row">
              <span>Disk Monitors</span>
              <span>{{ (system.filesystems || []).length }} filesystems</span>
            </div>
            <div class="filesystem-list">
              <div v-for="filesystem in system.filesystems || []" :key="filesystem.id || `${filesystem.fs}-${filesystem.path}`" class="filesystem-item">
                <div class="metric-row">
                  <span>{{ filesystem.fs }}</span>
                  <span>{{ filesystem.usePct }}% ({{ toGiB(filesystem.used) }} / {{ toGiB(filesystem.total) }} GiB)</span>
                </div>
                <div class="recent-episode-time">{{ filesystem.fs }}</div>
                <div class="progress-track">
                  <div class="progress-fill progress-fill-disk" :style="{ width: `${Math.min(100, filesystem.usePct)}%` }"></div>
                </div>
                <details v-if="(filesystem.paths || []).length" class="filesystem-accordion">
                  <summary>Monitored paths ({{ filesystem.paths.length }})</summary>
                  <div class="filesystem-paths">
                    <div
                      v-for="pathEntry in filesystem.paths"
                      :key="pathEntry.id || pathEntry.path"
                      class="filesystem-path-item"
                    >
                      <div class="metric-row">
                        <span>{{ pathEntry.path }}</span>
                        <span>
                          {{ pathEntry.directoryBytes === null ? "n/a" : `${toGiB(pathEntry.directoryBytes)} GiB` }}
                          <template v-if="pathEntry.directoryBytes !== null">
                            ({{ pathEntry.usePctOfFilesystem }}%)
                          </template>
                        </span>
                      </div>
                      <div class="progress-track">
                        <div
                          class="progress-fill progress-fill-path"
                          :style="{ width: `${Math.min(100, pathEntry.usePctOfFilesystem || 0)}%` }"
                        ></div>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
        <p v-else>Loading system data...</p>
      </StatusCard>

      <StatusCard title="Services">
        <ul class="service-list">
          <li>
            <span>Plex</span>
            <span :class="'state-' + (plexAuth.connected ? 'up' : 'down')">
              {{ plexAuth.connected ? "up" : "down" }}
            </span>
          </li>
          <li v-for="svc in visibleServices" :key="svc.serviceName ?? svc.name">
            <a
              class="service-link"
              :href="svc.appUrl || svc.url || '#'"
              :target="svc.appUrl || svc.url ? '_blank' : null"
              rel="noreferrer noopener"
            >
              {{ svc.serviceName ?? svc.name }}
            </a>
            <span :class="'state-' + (svc.status || (svc.enabled ? 'up' : 'disabled'))">
              {{ svc.status || (svc.enabled ? "up" : "disabled") }}
            </span>
          </li>
        </ul>
      </StatusCard>
      </div>

      <StatusCard title="Network" subtitle="Current checks + latest speed test">
        <template #header-right>
          <button class="theme-btn card-action-btn" :disabled="speedtestRunning" @click="runSpeedtestNow">
            {{ speedtestRunning ? "Running..." : "Check Now" }}
          </button>
        </template>
        <div>
          <div class="speed-widget">
            <div class="speed-widget-header">
              <span class="speed-widget-title">Latest Speed Test</span>
              <span class="speed-widget-time">{{ network.speed?.ts ? formatTimestamp(network.speed.ts) : "no sample yet" }}</span>
            </div>
            <div v-if="network.speed" class="speed-metrics">
              <div class="speed-metric">
                <span class="speed-icon">↓</span>
                <span class="speed-label">Download</span>
                <strong>{{ formatMbps(network.speed.downloadMbps) }} Mbps</strong>
              </div>
              <div class="speed-metric">
                <span class="speed-icon">↑</span>
                <span class="speed-label">Upload</span>
                <strong>{{ formatMbps(network.speed.uploadMbps) }} Mbps</strong>
              </div>
              <div class="speed-metric">
                <span class="speed-icon">◉</span>
                <span class="speed-label">Ping</span>
                <strong>{{ formatMs(network.speed.pingMs) }} ms</strong>
              </div>
              <div class="speed-metric">
                <span class="speed-icon">≈</span>
                <span class="speed-label">Jitter</span>
                <strong>{{ formatMs(network.speed.jitterMs) }} ms</strong>
              </div>
              <div class="speed-metric speed-server">
                <span class="speed-icon">⌂</span>
                <span class="speed-label">Server</span>
                <strong>{{ network.speed.serverName || "n/a" }}</strong>
              </div>
            </div>
          </div>
          <div class="speed-history-widget">
            <div class="metric-row">
              <span>30 Day Speed History</span>
              <span>{{ speedChart.sampleCount }} samples</span>
            </div>
            <div v-if="speedChart.downloadLinePoints" class="chart-wrap">
              <div class="chart-y-axis">
                <span v-for="tick in speedChart.yTicks" :key="tick.value">{{ tick.label }}</span>
              </div>
              <svg class="speed-history-chart" viewBox="0 0 100 36" preserveAspectRatio="none">
                <polyline class="speed-line-download" :points="speedChart.downloadLinePoints" />
                <polyline class="speed-line-upload" :points="speedChart.uploadLinePoints" />
              </svg>
            </div>
            <p v-else class="speed-history-empty">No 30-day speed data yet.</p>
            <div class="speed-history-legend">
              <span><i class="legend-dot legend-download"></i>Download</span>
              <span><i class="legend-dot legend-upload"></i>Upload</span>
            </div>
          </div>
          <div class="ping-history-widget">
            <div class="metric-row">
              <span>30 Day Ping History</span>
              <span>{{ (network.checks || []).length }} targets</span>
            </div>
            <div class="ping-target-list">
              <div v-for="check in network.checks || []" :key="check.target" class="ping-target-card">
                <div class="metric-row">
                  <span>{{ check.target }}</span>
                  <span :class="'state-' + (check.success ? 'up' : 'down')">
                    {{ check.success ? "up" : "down" }}
                  </span>
                </div>
                <div class="metric-row" v-if="pingChartByTarget[check.target]">
                  <span>{{ pingChartByTarget[check.target].uptimePct }}% up</span>
                  <span>Loss {{ pingChartByTarget[check.target].latestLoss }}%</span>
                </div>
                <div v-if="pingChartByTarget[check.target]" class="chart-wrap">
                  <div class="chart-y-axis">
                    <span
                      v-for="tick in pingChartByTarget[check.target].yTicks"
                      :key="`${check.target}-${tick.value}`"
                    >
                      {{ tick.label }}
                    </span>
                  </div>
                  <svg class="speed-history-chart" viewBox="0 0 100 36" preserveAspectRatio="none">
                    <polyline class="ping-line" :points="pingChartByTarget[check.target].linePoints" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <p v-if="networkHistory.uptimePct !== null">30d Uptime: {{ networkHistory.uptimePct }}%</p>
        </div>
      </StatusCard>
      </section>

      <section class="grid-row">
      <StatusCard title="Media Archive">
        <div v-if="media">
          <p>TV Series: {{ media.sonarrSeriesCount ?? "n/a" }} ({{ media.sonarrEpisodeCount ?? "n/a" }} episodes)</p>
          <div class="recent-episodes">
            <p class="recent-episodes-title">Recently Added Episodes (Last 5)</p>
            <ul class="recent-episode-list">
              <li v-for="episode in media.sonarrRecentEpisodes || []" :key="episode.id">
                <a class="recent-item-link" :href="sonarrItemUrl(episode)" target="_blank" rel="noreferrer noopener">
                  <img
                    class="recent-episode-art"
                    :src="resolveSonarrArt(episode)"
                    :alt="`${episode.seriesTitle} artwork`"
                    loading="lazy"
                  />
                  <div class="recent-episode-meta">
                    <strong>{{ episode.seriesTitle }}</strong>
                    <span>S{{ pad2(episode.seasonNumber) }}E{{ pad2(episode.episodeNumber) }} - {{ episode.episodeTitle }}</span>
                    <span class="recent-episode-time">{{ formatTimestamp(episode.date) }}</span>
                  </div>
                </a>
              </li>
            </ul>
            <p v-if="!(media.sonarrRecentEpisodes || []).length" class="speed-history-empty">
              No recent Sonarr episode imports found.
            </p>
          </div>
          <div class="recent-episodes">
            <p class="recent-episodes-title">Coming Soon TV (Next 30 Days)</p>
            <ul class="recent-episode-list">
              <li v-for="episode in media.sonarrComingSoon || []" :key="`soon-tv-${episode.id}`">
                <a class="recent-item-link" :href="sonarrItemUrl(episode)" target="_blank" rel="noreferrer noopener">
                  <img
                    class="recent-episode-art"
                    :src="resolveSonarrArt(episode)"
                    :alt="`${episode.seriesTitle} artwork`"
                    loading="lazy"
                  />
                  <div class="recent-episode-meta">
                    <strong>{{ episode.seriesTitle }}</strong>
                    <span>S{{ pad2(episode.seasonNumber) }}E{{ pad2(episode.episodeNumber) }} - {{ episode.episodeTitle }}</span>
                    <span class="recent-episode-time">{{ formatRelativeDate(episode.date) }}</span>
                  </div>
                </a>
              </li>
            </ul>
            <p v-if="!(media.sonarrComingSoon || []).length" class="speed-history-empty">
              No upcoming Sonarr releases in the next 30 days.
            </p>
          </div>
          <p>Movies: {{ media.radarrMovieCount ?? "n/a" }}</p>
          <div class="recent-episodes">
            <p class="recent-episodes-title">Recently Added Movies (Last 5)</p>
            <ul class="recent-episode-list">
              <li v-for="movie in media.radarrRecentMovies || []" :key="movie.id">
                <a class="recent-item-link" :href="radarrItemUrl(movie)" target="_blank" rel="noreferrer noopener">
                  <img
                    class="recent-episode-art"
                    :src="resolveRadarrArt(movie)"
                    :alt="`${movie.title} artwork`"
                    loading="lazy"
                  />
                  <div class="recent-episode-meta">
                    <strong>{{ movie.title }}</strong>
                    <span>{{ movie.year || "Unknown Year" }}</span>
                    <span class="recent-episode-time">{{ formatTimestamp(movie.added) }}</span>
                  </div>
                </a>
              </li>
            </ul>
            <p v-if="!(media.radarrRecentMovies || []).length" class="speed-history-empty">
              No recent Radarr movie imports found.
            </p>
          </div>
          <div class="recent-episodes">
            <p class="recent-episodes-title">Coming Soon Movies (Next 90 Days)</p>
            <ul class="recent-episode-list">
              <li v-for="movie in media.radarrComingSoon || []" :key="`soon-movie-${movie.id}`">
                <a class="recent-item-link" :href="radarrItemUrl(movie)" target="_blank" rel="noreferrer noopener">
                  <img
                    class="recent-episode-art"
                    :src="resolveRadarrArt(movie)"
                    :alt="`${movie.title} artwork`"
                    loading="lazy"
                  />
                  <div class="recent-episode-meta">
                    <strong>{{ movie.title }}</strong>
                    <span>{{ movie.year || "Unknown Year" }}</span>
                    <span class="recent-episode-time">{{ formatRelativeDate(movie.releaseDate) }}</span>
                  </div>
                </a>
              </li>
            </ul>
            <p v-if="!(media.radarrComingSoon || []).length" class="speed-history-empty">
              No upcoming Radarr releases in the next 90 days.
            </p>
          </div>
        </div>
        <p v-else>Loading media data...</p>
      </StatusCard>

      <div class="services-stack">
      <StatusCard title="Plex">
        <div class="plex-widget">
          <div class="metric-row">
            <span>Plex Connection</span>
            <span>{{ plexAuth.connected ? "Connected" : "Disconnected" }}</span>
          </div>
          <p v-if="plexAuth.serverName">Server: {{ plexAuth.serverName }}</p>
          <button v-if="!plexAuth.connected" class="theme-btn" @click="startPlexAuth">Connect Plex</button>
          <div v-if="plexPin" class="plex-pin">
            <p>Code: <strong>{{ plexPin.code }}</strong></p>
            <a :href="plexPin.authUrl" target="_blank" rel="noreferrer noopener">Open Plex Login</a>
            <p>Waiting for Plex approval...</p>
          </div>
        </div>

        <div class="plex-activity">
          <div class="metric-row">
            <span>Now Playing</span>
          </div>
          <div class="recent-episodes">
            <ul class="recent-episode-list">
              <li v-for="item in plexNowPlaying" :key="item.sessionId || item.title">
                <a class="recent-item-link" :href="item.appUrl || '#'" :target="item.appUrl ? '_blank' : null" rel="noreferrer noopener">
                  <img
                    class="recent-episode-art"
                    :src="resolvePlexArt(item)"
                    :alt="`${item.title} artwork`"
                    loading="lazy"
                  />
                  <div class="progress-track now-playing-progress-track">
                    <div class="progress-fill now-playing-progress-fill" :style="{ width: `${Math.min(100, item.progressPct || 0)}%` }"></div>
                  </div>
                  <div class="recent-episode-meta">
                    <strong>{{ item.user }}</strong>
                    <span>{{ item.grandparentTitle ? `${item.grandparentTitle} - ` : "" }}{{ item.title }}</span>
                    <span class="recent-episode-time">{{ item.client }} | {{ item.state }} | {{ item.progressPct }}%</span>
                  </div>
                </a>
              </li>
            </ul>
            <p v-if="!plexNowPlaying.length" class="speed-history-empty">Nothing is currently playing.</p>
          </div>

          <div class="metric-row">
            <span>Play History</span>
          </div>
          <div class="recent-episodes">
            <ul class="recent-episode-list">
              <li v-for="item in plexHistory" :key="`${item.historyId || item.title}-${item.playedAt || 'n/a'}`">
                <a class="recent-item-link" :href="item.appUrl || '#'" :target="item.appUrl ? '_blank' : null" rel="noreferrer noopener">
                  <img
                    class="recent-episode-art"
                    :src="resolvePlexArt(item)"
                    :alt="`${item.title} artwork`"
                    loading="lazy"
                  />
                  <div class="recent-episode-meta">
                    <strong>{{ item.grandparentTitle ? `${item.grandparentTitle} - ` : "" }}{{ item.title }}</strong>
                    <span class="recent-episode-time">{{ formatTimestamp(item.playedAt) }}</span>
                  </div>
                </a>
              </li>
            </ul>
            <p v-if="!plexHistory.length" class="speed-history-empty">No recent Plex play history found.</p>
          </div>
        </div>

      </StatusCard>

      </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import StatusCard from "./components/StatusCard.vue";

const system = ref(null);
const services = ref([]);
const media = ref(null);
const network = ref({ checks: [], speed: null });
const networkHistory = ref({ network: [], speed: [], uptimePct: null });
const plexAuth = ref({ connected: false, serverName: null, serverUrl: null, updatedAt: null });
const plexNowPlaying = ref([]);
const plexHistory = ref([]);
const plexPin = ref(null);
const speedtestRunning = ref(false);
let plexPollTimer = null;
const theme = ref(localStorage.getItem("theme") || "dark");

const themeLabel = computed(() => (theme.value === "dark" ? "Dark" : "Light"));
const visibleServices = computed(() =>
  (services.value || []).filter((svc) => (svc.serviceName ?? svc.name)?.toLowerCase() !== "plex")
);
const memoryUsagePct = computed(() => {
  if (!system.value?.memory?.total) return 0;
  return Math.min(100, Math.round((system.value.memory.used / system.value.memory.total) * 100));
});
const speedChart = computed(() => {
  const rows = (networkHistory.value?.speed || []).filter(
    (row) => typeof row.downloadMbps === "number" || typeof row.uploadMbps === "number"
  );
  const sampleCount = rows.length;
  if (!sampleCount) {
    return { downloadLinePoints: null, uploadLinePoints: null, sampleCount: 0, yTicks: [] };
  }

  const maxMbps = Math.max(1, ...rows.map((row) => Math.max(row.downloadMbps || 0, row.uploadMbps || 0)));
  const chartRows = rows.slice(-120);
  const denominator = Math.max(1, chartRows.length - 1);
  const toPoint = (index, value) => {
    const x = (index / denominator) * 100;
    const y = 34 - ((value || 0) / maxMbps) * 32;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  return {
    downloadLinePoints: chartRows.map((row, index) => toPoint(index, row.downloadMbps)).join(" "),
    uploadLinePoints: chartRows.map((row, index) => toPoint(index, row.uploadMbps)).join(" "),
    sampleCount,
    yTicks: [
      { value: maxMbps, label: `${maxMbps.toFixed(0)} Mbps` },
      { value: maxMbps / 2, label: `${(maxMbps / 2).toFixed(0)} Mbps` },
      { value: 0, label: "0 Mbps" }
    ]
  };
});
const pingCharts = computed(() => {
  const rows = networkHistory.value?.network || [];
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.target)) grouped.set(row.target, []);
    grouped.get(row.target).push(row);
  }

  return Array.from(grouped.entries()).map(([target, targetRows]) => {
    const ordered = targetRows.slice().sort((a, b) => a.ts.localeCompare(b.ts)).slice(-180);
    const maxLatency = Math.max(1, ...ordered.map((row) => (typeof row.latencyMs === "number" ? row.latencyMs : 0)));
    const denominator = Math.max(1, ordered.length - 1);
    const linePoints = ordered
      .map((row, index) => {
        const x = (index / denominator) * 100;
        const latency = typeof row.latencyMs === "number" ? row.latencyMs : maxLatency;
        const y = 34 - (latency / maxLatency) * 32;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    const successes = ordered.filter((row) => row.success).length;
    const uptimePct = ordered.length ? Number(((successes / ordered.length) * 100).toFixed(2)) : 0;
    const latest = ordered[ordered.length - 1];

    return {
      target,
      linePoints,
      uptimePct,
      latestLoss: typeof latest?.packetLossPct === "number" ? latest.packetLossPct.toFixed(0) : "n/a",
      yTicks: [
        { value: maxLatency, label: `${maxLatency.toFixed(0)} ms` },
        { value: maxLatency / 2, label: `${(maxLatency / 2).toFixed(0)} ms` },
        { value: 0, label: "0 ms" }
      ]
    };
  });
});
const pingChartByTarget = computed(() =>
  Object.fromEntries((pingCharts.value || []).map((chart) => [chart.target, chart]))
);
const toggleTheme = () => {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme.value;
  localStorage.setItem("theme", theme.value);
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
};
const fetchOptionalJson = async (url, fallback) => {
  try {
    return await fetchJson(url);
  } catch {
    return fallback;
  }
};

const loadData = async () => {
  try {
    const [systemData, serviceData, mediaData, networkData, configured, historyData, plexState, nowPlaying, history] = await Promise.all([
      fetchJson("/api/health/system"),
      fetchJson("/api/health/services"),
      fetchJson("/api/media/summary"),
      fetchJson("/api/network/current"),
      fetchJson("/api/meta/configured-services"),
      fetchJson("/api/network/history?range=30d"),
      fetchOptionalJson("/api/plex/auth/state", { connected: false }),
      fetchOptionalJson("/api/plex/now-playing", []),
      fetchOptionalJson("/api/plex/history?limit=5", [])
    ]);
    system.value = systemData;
    services.value = serviceData.length ? serviceData : configured;
    media.value = mediaData;
    network.value = networkData;
    networkHistory.value = historyData;
    plexAuth.value = plexState;
    plexNowPlaying.value = Array.isArray(nowPlaying) ? nowPlaying : [];
    plexHistory.value = Array.isArray(history) ? history : [];
  } catch (error) {
    console.error(error);
  }
};
const runSpeedtestNow = async () => {
  if (speedtestRunning.value) return;
  speedtestRunning.value = true;
  try {
    await fetchJson("/api/network/speedtest", { method: "POST" });
    await loadData();
  } catch (error) {
    console.error(error);
  } finally {
    speedtestRunning.value = false;
  }
};

const toGiB = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(1);
const formatUptime = (seconds) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
const formatMbps = (value) => (typeof value === "number" ? value.toFixed(2) : "n/a");
const formatMs = (value) => (typeof value === "number" ? value.toFixed(2) : "n/a");
const formatLoadAvg = (values) => {
  if (!Array.isArray(values) || !values.length) return "n/a";
  return values.map((value) => Number(value).toFixed(2)).join(" / ");
};
const formatRate = (bytesPerSec) => {
  const bytes = Number(bytesPerSec || 0);
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  if (bytes < 1024) return `${bytes.toFixed(0)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
};
const pad2 = (value) => String(value ?? 0).padStart(2, "0");
const resolveSonarrArt = (episode) => {
  if (episode?.artUrl) return episode.artUrl;
  if (episode?.artPath) return `/api/media/sonarr/art?path=${encodeURIComponent(episode.artPath)}`;
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='135'%3E%3Crect width='240' height='135' fill='%23111116'/%3E%3Ctext x='50%25' y='50%25' fill='%23adadb8' font-size='14' text-anchor='middle' dominant-baseline='middle'%3ENo Art%3C/text%3E%3C/svg%3E";
};
const resolveRadarrArt = (movie) => {
  if (movie?.artUrl) return movie.artUrl;
  if (movie?.artPath) return `/api/media/radarr/art?path=${encodeURIComponent(movie.artPath)}`;
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='360'%3E%3Crect width='240' height='360' fill='%23111116'/%3E%3Ctext x='50%25' y='50%25' fill='%23adadb8' font-size='14' text-anchor='middle' dominant-baseline='middle'%3ENo Poster%3C/text%3E%3C/svg%3E";
};
const resolvePlexArt = (item) => {
  if (item?.artUrl) return item.artUrl;
  if (item?.artPath) return `/api/plex/art?path=${encodeURIComponent(item.artPath)}`;
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='360'%3E%3Crect width='240' height='360' fill='%23111116'/%3E%3Ctext x='50%25' y='50%25' fill='%23adadb8' font-size='14' text-anchor='middle' dominant-baseline='middle'%3ENo Art%3C/text%3E%3C/svg%3E";
};
const sonarrItemUrl = (episode) => {
  const base = media.value?.sonarrBaseUrl;
  if (!base) return "#";
  if (episode?.seriesSlug) return `${base}/series/${episode.seriesSlug}`;
  if (episode?.seriesId) return `${base}/series/${episode.seriesId}`;
  return "#";
};
const radarrItemUrl = (movie) => {
  const base = media.value?.radarrBaseUrl;
  if (!base) return "#";
  if (movie?.movieSlug) return `${base}/movie/${movie.movieSlug}`;
  if (movie?.movieId) return `${base}/movie/${movie.movieId}`;
  return "#";
};
const formatTimestamp = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "n/a" : parsed.toLocaleString();
};
const formatRelativeDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "n/a";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
  const timeText = parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (diffDays <= 0) return `Today @ ${timeText}`;
  if (diffDays === 1) return `Tomorrow @ ${timeText}`;
  if (diffDays < 7) return `In ${diffDays} days`;

  const weeks = Math.round(diffDays / 7);
  if (diffDays < 30) return `In ${weeks} ${weeks === 1 ? "week" : "weeks"}`;

  const months = Math.round(diffDays / 30);
  return `In ${months} ${months === 1 ? "month" : "months"}`;
};

const stopPlexPolling = () => {
  if (plexPollTimer) {
    clearInterval(plexPollTimer);
    plexPollTimer = null;
  }
};

const startPlexAuth = async () => {
  try {
    const pinData = await fetchJson("/api/plex/auth/start", { method: "POST" });
    plexPin.value = pinData;
    stopPlexPolling();
    plexPollTimer = setInterval(async () => {
      const status = await fetchOptionalJson(`/api/plex/auth/status?pinId=${encodeURIComponent(pinData.pinId)}`, null);
      if (status?.authorized) {
        stopPlexPolling();
        plexPin.value = null;
        await loadData();
      }
    }, 3000);
  } catch (error) {
    console.error(error);
  }
};

onMounted(() => {
  document.documentElement.dataset.theme = theme.value;
  loadData();
  setInterval(loadData, 30000);
});

onUnmounted(() => {
  stopPlexPolling();
});
</script>
