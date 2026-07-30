(function attachCheapSharkClient(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LootRadarCheapShark = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildCheapSharkClient() {
  'use strict';

  function parseRetryAfter(value, nowMs = Date.now()) {
    if (!value) return 0;

    const seconds = Number(value);
    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1000);
    }

    const dateMs = Date.parse(value);
    return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : 0;
  }

  function createCheapSharkClient(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('A fetch implementation is required.');
    }

    const baseUrl = String(options.baseUrl || 'https://www.cheapshark.com/api/1.0').replace(/\/+$/, '');
    const maxRetries = Math.max(0, Number(options.maxRetries ?? 3));
    const baseDelayMs = Math.max(1, Number(options.baseDelayMs || 750));
    // A rate-limited CheapShark asks for a full hour. Waiting that out would
    // hang the refresh past its own three-hourly schedule, so treat anything
    // longer than this as a hard failure and let the next run recover.
    const maxRetryAfterMs = Math.max(0, Number(options.maxRetryAfterMs ?? 60000));
    const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    const defaultHeaders = { Accept: 'application/json', ...(options.headers || {}) };
    const cache = new Map();
    const inFlight = new Map();

    function buildUrl(path) {
      const value = String(path || '');
      if (/^https?:\/\//i.test(value)) return value;
      return `${baseUrl}/${value.replace(/^\/+/, '')}`;
    }

    function backoff(attempt) {
      return Math.min(30000, baseDelayMs * (2 ** attempt));
    }

    async function fetchWithRetry(url, requestOptions) {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        let response;
        try {
          response = await fetchImpl(url, {
            headers: defaultHeaders,
            signal: requestOptions.signal
          });
        } catch (error) {
          if (error?.name === 'AbortError' || attempt === maxRetries) throw error;
          await sleep(backoff(attempt));
          continue;
        }

        if (response.ok) return response.json();

        const retryable = response.status === 429 || response.status >= 500;
        const retryAfterMs = parseRetryAfter(response.headers?.get?.('Retry-After'));
        const waitTooLong = retryAfterMs > maxRetryAfterMs;

        if (!retryable || waitTooLong || attempt === maxRetries) {
          const error = new Error(
            waitTooLong
              ? `HTTP ${response.status} for ${url}; Retry-After ${Math.round(retryAfterMs / 1000)}s exceeds the ${Math.round(maxRetryAfterMs / 1000)}s ceiling`
              : `HTTP ${response.status} for ${url}`
          );
          error.status = response.status;
          error.retryAfterMs = retryAfterMs;
          throw error;
        }

        await sleep(retryAfterMs || backoff(attempt));
      }

      throw new Error(`Request failed for ${url}`);
    }

    async function get(path, requestOptions = {}) {
      const url = buildUrl(path);
      const key = requestOptions.cacheKey || url;
      const cached = cache.get(key);

      if (cached && cached.expiresAt > Date.now()) return cached.value;
      if (cached) cache.delete(key);
      if (inFlight.has(key)) return inFlight.get(key);

      const promise = fetchWithRetry(url, requestOptions)
        .then(value => {
          const cacheTtlMs = Math.max(0, Number(requestOptions.cacheTtlMs || 0));
          if (cacheTtlMs > 0) {
            cache.set(key, {
              value,
              expiresAt: Date.now() + cacheTtlMs
            });
          }
          return value;
        })
        .finally(() => {
          inFlight.delete(key);
        });

      inFlight.set(key, promise);
      return promise;
    }

    return {
      get,
      clearCache() {
        cache.clear();
      }
    };
  }

  return {
    createCheapSharkClient,
    parseRetryAfter
  };
});
