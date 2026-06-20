import express from "express";
import cors from "cors";
import { accountsRouter } from "./routes/accounts.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { leadsRouter } from "./routes/leads.js";
import { activityRouter } from "./routes/activity.js";
import { checkpointsRouter } from "./routes/checkpoints.js";
import { statsRouter } from "./routes/stats.js";
import { proxiesRouter } from "./routes/proxies.js";
import { contentSignalRouter } from "./routes/contentSignal.js";
import { errorMiddleware } from "./middleware/error.js";
import {
  startWorkers,
  scheduleWithdrawalJobs,
  startSequenceTicker,
} from "@linkedin-automation/queue";

const app = express();
const PORT = process.env.PORT ?? 3001;

// Allow cross-origin requests from the dashboard (potentially on a different server).
// Set ALLOWED_ORIGINS=https://dashboard.example.com in production.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : "*";
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/accounts", accountsRouter);
app.use("/campaigns", campaignsRouter);
app.use("/leads", leadsRouter);
app.use("/activity", activityRouter);
app.use("/checkpoints", checkpointsRouter);
app.use("/stats", statsRouter);
app.use("/proxies", proxiesRouter);
app.use("/content-signal", contentSignalRouter);

app.use(errorMiddleware);

app.listen(PORT, async () => {
  console.log(`API server running on http://localhost:${PORT}`);
  startWorkers();
  await scheduleWithdrawalJobs();
  await startSequenceTicker();
});
