import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  HOME_STATUS_READ_TIMEOUT_MS,
  readHomeStatusWithDeadline,
} from "../system/surface/ui/home-status-read.mjs";

test("Home status accepts validated live snapshots and provider errors remain unavailable", async () => {
  const value = { interfaces: [{ name: "eth0", state: "connected" }] };
  const snapshot = await readHomeStatusWithDeadline({ read: async () => value }, (input) => {
    assert.equal(input, value);
    return Object.freeze({ ...input });
  }, 100);
  assert.deepEqual(snapshot, value);
  await assert.rejects(
    () => readHomeStatusWithDeadline({ read: () => Promise.reject(new Error("offline")) }, x => x, 100),
    /offline/,
  );
});

test("Home status times out an uncooperative port and can retry without waiting for it", async () => {
  let reads = 0;
  const port = {
    read() {
      reads += 1;
      return reads === 1 ? new Promise(() => {}) : Promise.resolve({ state: "connected" });
    },
  };
  await assert.rejects(
    () => readHomeStatusWithDeadline(port, value => value, 15),
    /deadline exceeded/,
  );
  assert.deepEqual(await readHomeStatusWithDeadline(port, value => value, 100), { state: "connected" });
  assert.equal(reads, 2);
});

test("Home status rejects late read results without validating or presenting them", async () => {
  let release;
  let validated = 0;
  const port = { read: () => new Promise(resolve => { release = resolve; }) };
  const attempt = readHomeStatusWithDeadline(port, value => { validated += 1; return value; }, 15);
  await assert.rejects(attempt, /deadline exceeded/);
  release({ stale: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(validated, 0);
});

test("Home status keeps read deadlines finite and on the Surface side only", async () => {
  assert.equal(HOME_STATUS_READ_TIMEOUT_MS, 5_000);
  await assert.rejects(() => readHomeStatusWithDeadline(null, x => x), /readable port/);
  await assert.rejects(
    () => readHomeStatusWithDeadline({ read() {} }, x => x, 0),
    /positive integer/,
  );
  const home = await readFile(new URL("../system/surface/ui/home-status.mjs", import.meta.url), "utf8");
  assert.match(home, /readHomeStatusWithDeadline\(port, validate\)/);
  assert.match(home, /if \(refreshing\) \{\s*refreshQueued = true;\s*return;/);
  assert.match(home, /if \(refreshQueued && !destroyed\) \{\s*refreshQueued = false;\s*void refreshReadPorts\(\);/);
  assert.match(home, /finally \{[\s\S]*?render\(\);/);
  assert.doesNotMatch(home, /fetch\(|new WebSocket|llama-server/);
});
