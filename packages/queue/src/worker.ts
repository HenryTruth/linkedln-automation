import {
  scheduleWithdrawalJobs,
  startAnomalyTicker,
  startSequenceTicker,
  startSyncStatusTicker,
  startSequenceEngineTicker,
  startWorkers,
} from "./scheduler.js";

async function main(): Promise<void> {
  startWorkers();
  await scheduleWithdrawalJobs();
  await startSequenceTicker();
  await startAnomalyTicker();
  await startSyncStatusTicker();
  await startSequenceEngineTicker();
}

main().catch((err) => {
  console.error("Queue worker failed to start", err);
  process.exit(1);
});
