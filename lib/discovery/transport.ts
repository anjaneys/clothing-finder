import {
  sourceMessages,
  type RuntimeOptions,
  type SourceState,
} from "./types.ts";

/** Only controlled messages cross the API boundary, never provider text or headers. */
export class ProviderError extends Error {
  code: SourceState;
  retryAfterMs?: number;
  constructor(code: SourceState, retryAfterMs?: number) {
    super(sourceMessages[code]);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export function abortError(signal: AbortSignal) {
  return new ProviderError(
    signal.reason?.name === "TimeoutError" ? "timeout" : "cancelled",
  );
}

export async function withSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw abortError(signal);
  let onAbort: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort!);
  }
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
}

/** FIFO permits; aborted queued requests are removed and never consume a slot. */
export class Semaphore {
  private active = 0;
  private queue: {
    signal: AbortSignal;
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    abort: () => void;
  }[] = [];
  private limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }
  acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(abortError(signal));
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(this.releaseOnce());
    }
    return new Promise((resolve, reject) => {
      const entry = { signal, resolve, reject, abort: () => {} };
      entry.abort = () => {
        this.queue = this.queue.filter((e) => e !== entry);
        reject(abortError(signal));
      };
      signal.addEventListener("abort", entry.abort, { once: true });
      this.queue.push(entry);
    });
  }
  private releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.queue.shift();
      if (next) {
        next.signal.removeEventListener("abort", next.abort);
        this.active++;
        next.resolve(this.releaseOnce());
      }
    };
  }
}

export function retryAfterMs(headers: Headers, now: number): number {
  const retry = headers.get("retry-after");
  if (retry) {
    const seconds = Number(retry);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(seconds * 1000, 86400000);
    const date = Date.parse(retry);
    if (Number.isFinite(date))
      return Math.min(Math.max(0, date - now), 86400000);
  }
  // Brave reset values are seconds from now, paired with the corresponding window.
  const remaining = headers
    .get("x-ratelimit-remaining")
    ?.split(",")
    .map((v) => Number(v.trim()));
  const reset = headers
    .get("x-ratelimit-reset")
    ?.split(",")
    .map((v) => Number(v.trim()));
  const limits = headers
    .get("x-ratelimit-limit")
    ?.split(",")
    .map((v) => Number(v.trim()));
  if (remaining && reset && remaining.length === reset.length) {
    const exhausted = reset.filter(
      (value, i) =>
        remaining[i] === 0 &&
        limits?.[i] !== 0 &&
        Number.isFinite(value) &&
        value >= 0,
    );
    if (exhausted.length)
      return Math.min(Math.max(...exhausted) * 1000, 86400000);
  }
  return 1000;
}

export interface RequestBudget {
  requests: number;
  maxRequests: number;
  deadlineAt: number;
  signal: AbortSignal;
}

export function createTransport(options: RuntimeOptions = {}) {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const pause = options.sleep ?? sleep;
  const random = options.random ?? Math.random;
  async function request(
    url: string,
    init: RequestInit,
    budget: RequestBudget,
    asText = false,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (budget.signal.aborted) throw abortError(budget.signal);
      if (now() >= budget.deadlineAt) throw new ProviderError("timeout");
      if (budget.requests >= budget.maxRequests)
        throw new ProviderError("partial");
      budget.requests++;
      let response: Response;
      try {
        response = await withSignal(
          fetcher(url, { ...init, signal: budget.signal, redirect: "manual" }),
          budget.signal,
        );
      } catch (error) {
        if (budget.signal.aborted) throw abortError(budget.signal);
        if (error instanceof ProviderError) throw error;
        if (attempt === 0 && budget.requests < budget.maxRequests) {
          await pause(200 + Math.floor(random() * 100), budget.signal);
          continue;
        }
        throw new ProviderError("unavailable");
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 401) throw new ProviderError("auth_error");
        if (response.status === 403) throw new ProviderError("access_denied");
        const rateLimited = response.status === 429;
        const transient = response.status >= 500;
        const delay = rateLimited
          ? retryAfterMs(response.headers, now())
          : 200 + Math.floor(random() * 100);
        if (
          (rateLimited || transient) &&
          attempt === 0 &&
          budget.requests < budget.maxRequests &&
          now() + delay + 100 < budget.deadlineAt
        ) {
          await pause(delay, budget.signal);
          continue;
        }
        throw new ProviderError(
          rateLimited ? "rate_limited" : "unavailable",
          rateLimited ? delay : undefined,
        );
      }
      // Bound memory while parsing provider responses, including response-body time.
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError("invalid_response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await withSignal(reader.read(), budget.signal);
          if (part.done) break;
          size += part.value.byteLength;
          if (size > (asText ? 5 : 2) * 1024 * 1024)
            throw new ProviderError("invalid_response");
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) {
          bytes.set(part, offset);
          offset += part.byteLength;
        }
        const text = new TextDecoder().decode(bytes);
        return asText ? text : JSON.parse(text);
      } catch (error) {
        void reader.cancel().catch(() => {});
        if (budget.signal.aborted) throw abortError(budget.signal);
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("invalid_response");
      } finally {
        reader.releaseLock();
      }
    }
    throw new ProviderError("unavailable");
  }
  return {
    json: (url: string, init: RequestInit, budget: RequestBudget) =>
      request(url, init, budget),
    text: (url: string, init: RequestInit, budget: RequestBudget) =>
      request(url, init, budget, true) as Promise<string>,
    now,
  };
}
