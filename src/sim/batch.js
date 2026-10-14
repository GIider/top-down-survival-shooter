import os from "node:os";
import { Worker } from "node:worker_threads";

/** Runs jobs across a worker_threads pool; results keep the order of `jobs`. */
export function runJobs(jobs, { workers = Math.max(1, os.cpus().length - 1), onProgress } = {}) {
  const count = Math.max(1, Math.min(workers, jobs.length));
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;

  return new Promise((resolve, reject) => {
    if (jobs.length === 0) {
      resolve(results);
      return;
    }
    const pool = [];
    const finish = (error) => {
      pool.forEach((worker) => worker.terminate());
      error ? reject(error) : resolve(results);
    };
    const dispatch = (worker) => {
      if (next >= jobs.length) {
        return;
      }
      const id = next;
      next += 1;
      worker.postMessage({ id, job: jobs[id] });
    };
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker(new URL("./nodeWorker.js", import.meta.url));
      worker.on("message", ({ id, result, error }) => {
        if (error) {
          finish(new Error(error));
          return;
        }
        results[id] = result;
        done += 1;
        onProgress?.(done, jobs.length);
        if (done === jobs.length) {
          finish();
        } else {
          dispatch(worker);
        }
      });
      worker.on("error", finish);
      pool.push(worker);
      dispatch(worker);
    }
  });
}
