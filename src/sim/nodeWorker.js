import { parentPort } from "node:worker_threads";
import { runJob } from "./jobs.js";

parentPort.on("message", ({ id, job }) => {
  try {
    parentPort.postMessage({ id, result: runJob(job) });
  } catch (error) {
    parentPort.postMessage({ id, error: String(error?.stack || error) });
  }
});
