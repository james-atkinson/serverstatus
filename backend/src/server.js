import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig, config } from "./config/env.js";
import { initDb } from "./db/sqlite.js";
import { apiRouter } from "./routes/api.js";
import { startScheduler } from "./jobs/scheduler.js";

validateConfig();
await initDb();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", apiRouter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));

app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, async () => {
  console.log(`Media status server listening on port ${config.port}`);
  await startScheduler();
});
