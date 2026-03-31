import fs from "node:fs";
import path from "node:path";
import { config } from "../config/env.js";

const dbPath = path.resolve(process.cwd(), config.sqlitePath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const defaultStore = {
  network_checks: [],
  speed_tests: [],
  service_checks: [],
  plex_auth: {
    connected: false,
    accountToken: null,
    serverToken: null,
    serverUrl: null,
    serverId: null,
    serverName: null,
    updatedAt: null
  },
  counters: {
    network_checks: 0,
    speed_tests: 0,
    service_checks: 0
  }
};

let store = structuredClone(defaultStore);

const persist = () => {
  const tempPath = `${dbPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store), "utf8");
  fs.renameSync(tempPath, dbPath);
};

export const initDb = async () => {
  if (!fs.existsSync(dbPath)) {
    persist();
    return;
  }

  try {
    const raw = fs.readFileSync(dbPath, "utf8");
    const parsed = JSON.parse(raw);
    store = {
      ...structuredClone(defaultStore),
      ...parsed,
      counters: {
        ...defaultStore.counters,
        ...(parsed?.counters || {})
      }
    };
  } catch {
    store = structuredClone(defaultStore);
    persist();
  }
};

export const readStore = () => store;

export const writeStore = (updater) => {
  updater(store);
  persist();
};
