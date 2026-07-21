import express from "express";
import cors from "cors";
import { accountsRouter } from "./routes/accounts.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { sequencesRouter } from "./routes/sequences.js";
import { leadsRouter } from "./routes/leads.js";
import { activityRouter } from "./routes/activity.js";
import { checkpointsRouter } from "./routes/checkpoints.js";
import { statsRouter } from "./routes/stats.js";
import { proxiesRouter } from "./routes/proxies.js";
import { contentSignalRouter } from "./routes/contentSignal.js";
import { settingsRouter } from "./routes/settings.js";
import { authRouter } from "./routes/auth.js";
import { jobsRouter } from "./routes/jobs.js";
import { browserSessionsRouter } from "./routes/browserSessions.js";
import { errorMiddleware } from "./middleware/error.js";
import { requireAuth } from "./middleware/auth.js";
import { apiRateLimit } from "./middleware/rateLimit.js";
import { prisma } from "@linkedin-automation/db";
import {
  connectQueue,
  startWorkers,
  scheduleWithdrawalJobs,
  startSequenceTicker,
  startAnomalyTicker,
  startSyncStatusTicker,
  startSequenceEngineTicker,
  startSessionHealthCheckTicker,
} from "@linkedin-automation/queue";

const app = express();
const PORT = process.env.PORT ?? 3001;
const shouldStartWorkers =
  process.env.START_WORKERS === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.START_WORKERS !== "false");

// Allow cross-origin requests from the dashboard (potentially on a different server).
// Set ALLOWED_ORIGINS=https://dashboard.example.com in production.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : "*";
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json({ limit: "5mb" }));
app.use(apiRateLimit);

app.get("/health", async (_req, res) => {
  const checks = { api: true, database: false, redis: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch {
    checks.database = false;
  }
  try {
    await connectQueue.waitUntilReady();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const ok = checks.database && checks.redis;
  res.status(ok ? 200 : 503).json({ ok, checks });
});

app.use("/auth", authRouter);
app.use(requireAuth);

app.use("/accounts", accountsRouter);
app.use("/accounts", browserSessionsRouter);
app.use("/campaigns", campaignsRouter);
app.use("/campaigns", sequencesRouter);
app.use("/leads", leadsRouter);
app.use("/activity", activityRouter);
app.use("/checkpoints", checkpointsRouter);
app.use("/stats", statsRouter);
app.use("/proxies", proxiesRouter);
app.use("/content-signal", contentSignalRouter);
app.use("/settings", settingsRouter);
app.use("/jobs", jobsRouter);

app.use(errorMiddleware);

app.listen(PORT, async () => {
  console.log(`API server running on http://localhost:${PORT}`);
  if (shouldStartWorkers) {
    startWorkers();
    await scheduleWithdrawalJobs();
    await startSequenceTicker();
    await startAnomalyTicker();
    await startSyncStatusTicker();
    await startSequenceEngineTicker();
    await startSessionHealthCheckTicker();
  } else {
    console.log("Queue workers disabled for this API process");
  }
});
