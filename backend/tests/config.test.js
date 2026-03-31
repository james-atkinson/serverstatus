import test from "node:test";
import assert from "node:assert/strict";
import { config, services } from "../src/config/env.js";

test("has default ping targets", () => {
  assert.ok(Array.isArray(config.pingTargets));
  assert.ok(config.pingTargets.length > 0);
});

test("includes expected service ids", () => {
  const ids = services.map((service) => service.id);
  for (const required of [
    "sonarr",
    "radarr",
    "whisparr",
    "overseerr",
    "bazarr",
    "sabnzbd",
    "plex",
    "jellyfin"
  ]) {
    assert.ok(ids.includes(required));
  }
});
