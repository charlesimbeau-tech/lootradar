const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCheapSharkClient,
  parseRetryAfter
} = require('../lib/cheapshark-client.js');

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'retry-after'
          ? options.retryAfter ?? null
          : null;
      }
    },
    async json() {
      return body;
    }
  };
}

test('parseRetryAfter supports seconds and HTTP dates', () => {
  assert.equal(parseRetryAfter('3', 0), 3000);
  assert.equal(
    parseRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 2000),
    3000
  );
  assert.equal(parseRetryAfter(null, 0), 0);
});

test('retries 429 using Retry-After before returning JSON', async () => {
  const waits = [];
  let calls = 0;
  const client = createCheapSharkClient({
    baseUrl: 'https://example.test/api/1.0',
    sleep: async milliseconds => waits.push(milliseconds),
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(null, { ok: false, status: 429, retryAfter: '2' })
        : jsonResponse({ ok: true });
    }
  });

  assert.deepEqual(await client.get('/deals'), { ok: true });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
});

test('retries transient server and network failures with backoff', async () => {
  const waits = [];
  let calls = 0;
  const client = createCheapSharkClient({
    baseUrl: 'https://example.test/api/1.0',
    baseDelayMs: 100,
    sleep: async milliseconds => waits.push(milliseconds),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error('network unavailable');
      if (calls === 2) return jsonResponse(null, { ok: false, status: 503 });
      return jsonResponse({ recovered: true });
    }
  });

  assert.deepEqual(await client.get('/stores'), { recovered: true });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [100, 200]);
});

test('paces every outbound attempt, including retries', async () => {
  let nowMs = 0;
  let calls = 0;
  const starts = [];
  const client = createCheapSharkClient({
    baseUrl: 'https://example.test/api/1.0',
    minRequestIntervalMs: 1500,
    baseDelayMs: 100,
    now: () => nowMs,
    sleep: async milliseconds => { nowMs += milliseconds; },
    fetchImpl: async () => {
      starts.push(nowMs);
      calls += 1;
      return calls === 1
        ? jsonResponse(null, { ok: false, status: 503 })
        : jsonResponse({ calls });
    }
  });

  assert.deepEqual(await client.get('/stores'), { calls: 2 });
  assert.deepEqual(await client.get('/deals'), { calls: 3 });
  assert.deepEqual(starts, [0, 1500, 3000]);
});

test('does not retry non-rate-limited client errors', async () => {
  let calls = 0;
  const client = createCheapSharkClient({
    baseUrl: 'https://example.test/api/1.0',
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(null, { ok: false, status: 404 });
    }
  });

  await assert.rejects(client.get('/missing'), /HTTP 404/);
  assert.equal(calls, 1);
});

test('deduplicates in-flight requests and caches successful responses', async () => {
  let calls = 0;
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const client = createCheapSharkClient({
    baseUrl: 'https://example.test/api/1.0',
    fetchImpl: async () => {
      calls += 1;
      await pending;
      return jsonResponse({ calls });
    }
  });

  const firstPromise = client.get('/games?title=portal', { cacheTtlMs: 60000 });
  const secondPromise = client.get('/games?title=portal', { cacheTtlMs: 60000 });
  release();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  const third = await client.get('/games?title=portal', { cacheTtlMs: 60000 });

  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.equal(calls, 1);
});

test('does not retry aborted requests', async () => {
  let calls = 0;
  const client = createCheapSharkClient({
    baseUrl: 'https://example.test/api/1.0',
    fetchImpl: async () => {
      calls += 1;
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
  });

  await assert.rejects(client.get('/games?title=portal'), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('a rate-limit block longer than the ceiling fails fast instead of stalling', async () => {
  // CheapShark answers a burst with Retry-After: 3576 (one hour). Sleeping that
  // out would outlive the three-hourly refresh schedule and overlap the next run.
  let slept = 0;
  const client = createCheapSharkClient({
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: name => (name === 'Retry-After' ? '3576' : null) }
    }),
    sleep: async ms => { slept += ms; },
    maxRetries: 4
  });

  await assert.rejects(() => client.get('/deals'), error => {
    assert.equal(error.status, 429);
    assert.match(error.message, /exceeds the 60s ceiling/);
    return true;
  });
  assert.equal(slept, 0, 'a long block must not be waited out');
});

test('a short rate-limit block is still retried', async () => {
  let calls = 0;
  let slept = 0;
  const client = createCheapSharkClient({
    fetchImpl: async () => {
      calls += 1;
      if (calls > 2) return { ok: true, json: async () => ['recovered'] };
      return {
        ok: false,
        status: 429,
        headers: { get: name => (name === 'Retry-After' ? '2' : null) }
      };
    },
    sleep: async ms => { slept += ms; },
    maxRetries: 4
  });

  assert.deepEqual(await client.get('/deals'), ['recovered']);
  assert.equal(slept, 4000, 'two 2s waits');
});
