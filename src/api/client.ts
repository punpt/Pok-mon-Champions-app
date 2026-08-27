/** HTTP com timeout, retry com backoff e leitura tolerante de corpo. */

export interface FetchResult {
  ok: boolean;
  status: number | null;
  body: unknown;
  raw: string;
  ms: number;
  error?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT = 12_000;

export async function fetchJson(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const { timeoutMs = DEFAULT_TIMEOUT, retries = 1, signal } = opts;
  let last: FetchResult = { ok: false, status: null, body: null, raw: '', ms: 0, error: 'nao executado' };

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) break;
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.8' },
        mode: 'cors',
        credentials: 'omit',
      });
      const raw = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      last = {
        ok: res.ok && body !== null,
        status: res.status,
        body,
        raw,
        ms: Math.round(performance.now() - started),
        error: res.ok ? (body === null ? 'resposta nao e JSON valido' : undefined) : `HTTP ${res.status}`,
      };
      if (last.ok) return last;
    } catch (err) {
      last = {
        ok: false,
        status: null,
        body: null,
        raw: '',
        ms: Math.round(performance.now() - started),
        error: describeNetworkError(err),
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    if (attempt < retries && !signal?.aborted) {
      await sleep(400 * Math.pow(2, attempt));
    }
  }

  return last;
}

function describeNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/abort/i.test(msg)) return 'tempo esgotado';
  // Um erro de CORS chega ao browser como TypeError generico de rede.
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'falha de rede (pode ser CORS bloqueado, offline ou host fora do ar)';
  }
  return msg;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
