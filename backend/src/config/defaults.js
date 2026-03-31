export const SERVICE_DEFAULTS = {
  sonarr: { name: "Sonarr", url: "http://192.168.1.5:8989", envKey: "SONARR_API_KEY", type: "arr" },
  radarr: { name: "Radarr", url: "http://192.168.1.5:7878", envKey: "RADARR_API_KEY", type: "arr" },
  whisparr: { name: "Whisparr", url: "http://192.168.1.5:6969", envKey: "WHISPARR_API_KEY", type: "arr" },
  overseerr: { name: "Overseerr", url: "http://192.168.1.5:5055", envKey: "OVERSEERR_API_KEY", type: "overseerr" },
  bazarr: { name: "Bazarr", url: "http://192.168.1.5:6767", envKey: "BAZARR_API_KEY", type: "arr" },
  sabnzbd: { name: "SABnzbd", url: "http://192.168.1.5:8080", envKey: "SABNZBD_API_KEY", type: "sabnzbd" },
  plex: { name: "Plex", url: "http://192.168.1.5:32400", envKey: "PLEX_TOKEN", type: "plex" },
  jellyfin: { name: "Jellyfin", url: "http://192.168.1.5:8096", envKey: "JELLYFIN_API_KEY", type: "jellyfin" }
};

export const APP_DEFAULTS = {
  PORT: 80,
  CHECK_INTERVAL_SEC: 60,
  SPEEDTEST_INTERVAL_MIN: 30,
  SQLITE_PATH: "./data/status.db",
  PING_TARGETS: "1.1.1.1,8.8.8.8,192.168.1.1",
  MONITORED_FILESYSTEMS: "/dev/sda1",
  MONITORED_PATHS: "/home/media/TV Shows,/home/media/Movies"
};
