import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import iconv from 'iconv-lite';

export const NTU_BASE = 'https://wish.wis.ntu.edu.sg/webexe/owa';

/** NTU serves these pages as Windows-1252 regardless of what the markup claims. */
const SOURCE_ENCODING = 'win1252';

export interface NtuClientOptions {
  /** Directory for cached raw responses. Caching is off when omitted. */
  cacheDir?: string;
  /** Minimum gap between requests to NTU. Be a good citizen. */
  minIntervalMs?: number;
  /** Re-fetch even when a cached copy exists. */
  force?: boolean;
  userAgent?: string;
  onRequest?: (info: { url: string; cached: boolean; key: string }) => void;
}

/**
 * Fetches pages from NTU's public course systems: one request at a time,
 * spaced out, decoded from Windows-1252, and cached on disk so re-runs of the
 * pipeline don't hit NTU again.
 */
export class NtuClient {
  private readonly cacheDir?: string;
  private readonly minIntervalMs: number;
  private readonly force: boolean;
  private readonly userAgent: string;
  private readonly onRequest?: NtuClientOptions['onRequest'];
  /** Serialises requests and enforces the interval between them. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: NtuClientOptions = {}) {
    this.cacheDir = options.cacheDir;
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.force = options.force ?? false;
    this.userAgent = options.userAgent ?? 'ModIntel/0.1 (NTU student project)';
    this.onRequest = options.onRequest;
  }

  get(endpoint: string, cacheKey: string): Promise<string> {
    return this.request(endpoint, undefined, cacheKey);
  }

  postForm(endpoint: string, params: Record<string, string>, cacheKey: string): Promise<string> {
    const body = new URLSearchParams(params);
    return this.request(endpoint, body, cacheKey);
  }

  private async request(
    endpoint: string,
    body: URLSearchParams | undefined,
    cacheKey: string,
  ): Promise<string> {
    const url = `${NTU_BASE}/${endpoint}`;
    const cachePath = this.cachePathFor(endpoint, body, cacheKey);

    if (cachePath && !this.force) {
      const cached = await readFile(cachePath).catch(() => null);
      if (cached) {
        this.onRequest?.({ url, cached: true, key: cacheKey });
        return iconv.decode(cached, SOURCE_ENCODING);
      }
    }

    const buffer = await this.enqueue(() => this.fetchWithRetry(url, body));
    this.onRequest?.({ url, cached: false, key: cacheKey });

    if (cachePath) {
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, buffer);
    }
    return iconv.decode(buffer, SOURCE_ENCODING);
  }

  private cachePathFor(
    endpoint: string,
    body: URLSearchParams | undefined,
    cacheKey: string,
  ): string | undefined {
    if (!this.cacheDir) return undefined;
    // The key keeps filenames readable; the hash keeps them unique.
    const hash = createHash('sha1')
      .update(`${endpoint}?${body?.toString() ?? ''}`)
      .digest('hex')
      .slice(0, 10);
    const slug = cacheKey.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
    return join(this.cacheDir, `${slug}.${hash}.html`);
  }

  /** Runs `task` after the previous one, respecting `minIntervalMs`. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const result = await task();
      await sleep(this.minIntervalMs);
      return result;
    });
    // Keep the chain alive even if this task rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async fetchWithRetry(url: string, body: URLSearchParams | undefined): Promise<Buffer> {
    const attempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: body ? 'POST' : 'GET',
          headers: {
            'User-Agent': this.userAgent,
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          body,
          signal: AbortSignal.timeout(45_000),
        });
        if (response.status >= 500) {
          throw new Error(`NTU returned ${response.status} for ${url}`);
        }
        if (!response.ok) {
          // 4xx won't fix itself on retry.
          throw Object.assign(new Error(`NTU returned ${response.status} for ${url}`), {
            fatal: true,
          });
        }
        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        if ((error as { fatal?: boolean }).fatal) throw error;
        lastError = error;
        if (attempt < attempts) await sleep(this.minIntervalMs * 2 ** attempt);
      }
    }
    throw lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
