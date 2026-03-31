import axios from "axios";
import { services } from "../config/env.js";
import { getPlexConnection } from "./plexAuth.js";

const client = axios.create({ timeout: 8000 });

const getHeaders = (service, tokenOverride = null) => {
  const token = tokenOverride || service.token;
  if (!token) return {};
  if (service.type === "plex") return { "X-Plex-Token": token };
  if (service.type === "jellyfin") return { "X-Emby-Token": service.token };
  if (service.type === "overseerr") return { "X-Api-Key": service.token };
  return { "X-Api-Key": service.token };
};

const healthEndpoint = (service) => {
  if (service.type === "overseerr") return "/api/v1/status";
  if (service.type === "sabnzbd") return "/api?mode=version&output=json&apikey=" + encodeURIComponent(service.token);
  if (service.type === "plex") return "/";
  if (service.type === "jellyfin") return "/System/Info/Public";
  return "/api/v3/system/status";
};

export const checkServices = async () => {
  const now = new Date().toISOString();
  const checks = await Promise.all(
    services.map(async (service) => {
      const plexConnection = service.type === "plex" ? getPlexConnection() : null;
      const effectiveToken = plexConnection?.token || service.token;
      const effectiveUrl = plexConnection?.url || service.url;
      const enabled = service.type === "plex" ? Boolean(plexConnection || service.token) : service.enabled;

      if (!enabled) {
        return {
          serviceId: service.id,
          serviceName: service.name,
          appUrl: effectiveUrl,
          checkedAt: now,
          status: "disabled",
          responseMs: null,
          errorText: "Missing API token"
        };
      }

      const start = Date.now();
      try {
        await client.get(`${effectiveUrl}${healthEndpoint(service)}`, {
          headers: getHeaders(service, effectiveToken)
        });

        return {
          serviceId: service.id,
          serviceName: service.name,
          appUrl: effectiveUrl,
          checkedAt: now,
          status: "up",
          responseMs: Date.now() - start,
          errorText: null
        };
      } catch (error) {
        return {
          serviceId: service.id,
          serviceName: service.name,
          appUrl: effectiveUrl,
          checkedAt: now,
          status: "down",
          responseMs: Date.now() - start,
          errorText: error.message
        };
      }
    })
  );

  return checks;
};

export const getConfiguredServices = () =>
  services.map((service) => ({
    id: service.id,
    name: service.name,
    url: service.url,
    enabled: service.enabled
  }));
