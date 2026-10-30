// One presentation-level cancellation boundary for every Aura consumer.
// The canonical Intelligence port owns execution; this only guarantees
// that a non-cooperative provider cannot leave the Surface awaiting forever.
function abortError() {
  const error = new Error("Aura request was cancelled");
  error.name = "AbortError";
  return error;
}

export async function awaitAbortable(promise, signal) {
  if (signal == null) return await promise;
  if (!(signal instanceof AbortSignal))
    throw new TypeError("Aura request signal must be an AbortSignal");
  // Even if cancellation preceded this call, observe the underlying promise
  // so a late provider rejection cannot become an unhandled rejection.
  if (signal.aborted) {
    void Promise.resolve(promise).catch(() => {});
    throw abortError();
  }
  let onAbort;
  const cancelled = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    // A rejected/never-settled provider must not control the presentation's
    // cancellation latency. Promise.race also observes late rejections.
    return await Promise.race([promise, cancelled]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
