/**
 * Simple in-browser concurrency limiter for backend function invocations.
 *
 * Why: bursty parallel calls on initial page load can trigger transient 503/BOOT_ERROR
 * during cold starts. Limiting concurrency smooths traffic without changing business logic.
 */

type Awaitable<T> = Promise<T>;

class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(maxConcurrency: number) {
    this.available = Math.max(1, Math.floor(maxConcurrency));
  }

  async acquire(): Awaitable<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.available -= 1;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.available += 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

// Shared limiter instance across the app.
const polymarketDataLimiter = new Semaphore(2);

export async function withPolymarketDataLimit<T>(fn: () => Awaitable<T>): Awaitable<T> {
  const release = await polymarketDataLimiter.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
