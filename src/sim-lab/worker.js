import { runJob } from "../sim/jobs.js";

self.onmessage = (event) => {
  const { id, job } = event.data;
  try {
    self.postMessage({ id, result: runJob(job) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.stack || error) });
  }
};
