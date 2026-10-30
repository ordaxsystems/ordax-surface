import assert from "node:assert/strict";
import test from "node:test";
import { awaitAbortable } from "../system/surface/workspace/lib/intelligence/abortable.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

test("Aura accepts only validated AbortSignal and preserves ordinary completion", async () => {
  assert.equal(await awaitAbortable(Promise.resolve("answer"), null), "answer");
  assert.equal(await awaitAbortable(Promise.resolve("answer"), new AbortController().signal), "answer");
  await assert.rejects(awaitAbortable(Promise.resolve("answer"), {}),
    /signal must be an AbortSignal/);
  await assert.rejects(awaitAbortable(Promise.reject(Error("provider failed")),
    new AbortController().signal), /provider failed/);
});

test("Aura cancellation settles immediately even when provider never resolves", async () => {
  const controller = new AbortController();
  const provider = deferred();
  const pending = awaitAbortable(provider.promise, controller.signal);
  controller.abort();
  const outcome = await Promise.race([
    pending.then(() => "unexpected success", error => error.name),
    sleep(250).then(() => "still pending"),
  ]);
  assert.equal(outcome, "AbortError");
  provider.resolve("too late");
});

test("Aura ignores late provider rejection after abort without unhandled rejection", async () => {
  const controller = new AbortController();
  const provider = deferred();
  const pending = awaitAbortable(provider.promise, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  provider.reject(Error("late upstream failure"));
  await sleep(0);
});

test("Already cancelled Aura requests reject without waiting on a non-cooperative provider", async () => {
  const controller = new AbortController();
  controller.abort();
  const never = new Promise(() => {});
  await assert.rejects(awaitAbortable(never, controller.signal), { name: "AbortError" });
});

test("Aura source consumers share the abort boundary and have explicit presentation deadlines", async () => {
  const { readFile } = await import("node:fs/promises");
  const home = await readFile(new URL("../system/surface/ui/home-aura-composer.mjs", import.meta.url), "utf8");
  const client = await readFile(new URL("../system/surface/workspace/lib/intelligence/client.mjs", import.meta.url), "utf8");
  const app = await readFile(new URL("../system/surface/workspace/components/intelligence/aura-content.tsx", import.meta.url), "utf8");
  assert.match(home, /await awaitAbortable\(intelligencePort\.respond\(/);
  assert.ok(home.includes("}), controller.signal);"));
  assert.match(home, /HOME_AURA_MAX_REQUEST_MS = 10_000/);
  assert.match(client, /await awaitAbortable\(port\.respond\(/);
  assert.ok(client.includes("}), signal);"));
  assert.match(app, /AURA_CONVERSATION_DEADLINE_MS = 120_000/);
  assert.match(app, /clearTimeout\(watchdog\)/);
  assert.match(app, /controller\.signal\.aborted && !timedOut/);
  assert.match(app, /result\.state === 'timeout'/);
  assert.doesNotMatch(home + client + app, /new WebSocket|llama-server|apiKey/);
});
