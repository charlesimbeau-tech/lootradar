// deno-lint-ignore-file require-await
import assert from "node:assert/strict";

import { type EmailMessage, EmailProviderError } from "../_shared/email-provider.ts";
import {
  type AlertDeliveryRow,
  type AlertPreference,
  type AlertRepository,
  buildDigestUrl,
  buildLootRadarDealUrl,
  collectPaginated,
  createProcessAlertsHandler,
  digestWindowDue,
  fairDeliveryOrder,
  RestAlertRepository,
  retryAt,
} from "./index.ts";

const NOW = new Date("2026-07-31T14:15:00.000Z");
const CRON_SECRET = "cron-secret-with-at-least-32-bytes!";

function makeSnapshot(updatedAt = NOW.toISOString()) {
  return {
    snapshotId: updatedAt,
    updatedAt,
    source: "CheapShark-derived LootRadar quality snapshot",
    qualifiedDealCount: 20,
    deals: Array.from({ length: 20 }, (_, index) => ({
      gameKey: `steam:${1000 + index}`,
      title: `Quality Game ${index + 1}`,
      salePrice: index === 0 ? 0 : index,
      normalPrice: 30 + index,
      storeName: `Store ${index % 6}`,
      dealId: `encoded-deal-${index}`,
      dealScore: 100 - index,
      recommendation: `Quality reason ${index + 1}`,
      free: index === 0,
    })),
  };
}

function preference(
  overrides: Partial<AlertPreference> = {},
): AlertPreference {
  return {
    user_id: "user-a",
    target_price_enabled: false,
    free_game_enabled: true,
    weekly_digest_enabled: false,
    timezone: "America/New_York",
    digest_day: 5,
    digest_hour: 10,
    unsubscribed_at: null,
    ...overrides,
  };
}

class MemoryRepository implements AlertRepository {
  snapshots = new Map<string, string>();
  snapshotClaims = new Map<string, string>();
  preferences: AlertPreference[] = [preference()];
  watchlists = [{
    user_id: "user-a",
    game_key: "steam:1001",
    title: "Quality Game 2",
    target_price: 2,
  }];
  deliveries: AlertDeliveryRow[] = [];
  rejected: string[] = [];
  email = "player@example.test";

  async recordRejectedSnapshot(
    input: { snapshotId: string; reason: string },
  ): Promise<void> {
    this.snapshots.set(input.snapshotId, "rejected");
    this.rejected.push(input.reason);
  }

  async claimSnapshot(
    input: { snapshotId: string },
  ): Promise<{ token: string } | null> {
    const current = this.snapshots.get(input.snapshotId);
    if (current && current !== "failed") return null;
    const token = crypto.randomUUID();
    this.snapshots.set(input.snapshotId, "processing");
    this.snapshotClaims.set(input.snapshotId, token);
    return { token };
  }

  async completeSnapshot(
    snapshotId: string,
    claimToken: string,
    outcome: "processed" | "failed",
  ): Promise<boolean> {
    if (
      this.snapshots.get(snapshotId) !== "processing" ||
      this.snapshotClaims.get(snapshotId) !== claimToken
    ) {
      return false;
    }
    this.snapshots.set(snapshotId, outcome);
    this.snapshotClaims.delete(snapshotId);
    return true;
  }

  async loadEnabledPreferences(): Promise<AlertPreference[]> {
    return structuredClone(this.preferences);
  }

  async loadWatchlists(): Promise<typeof this.watchlists> {
    return structuredClone(this.watchlists);
  }

  async loadPriorDeliveryKeys(): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    for (const row of this.deliveries) {
      const keys = result.get(row.user_id) ?? new Set<string>();
      keys.add(row.condition_key);
      result.set(row.user_id, keys);
    }
    return result;
  }

  async insertDeliveries(rows: AlertDeliveryRow[]): Promise<void> {
    for (const row of rows) {
      if (
        !this.deliveries.some((current) =>
          current.user_id === row.user_id &&
          current.condition_key === row.condition_key
        )
      ) {
        this.deliveries.push(structuredClone(row));
      }
    }
  }

  async recoverSendingLeases(
    now: string,
    retrySafetyCutoff: string,
  ): Promise<void> {
    for (const row of this.deliveries) {
      if (
        row.status !== "sending" ||
        !row.lease_expires_at ||
        Date.parse(row.lease_expires_at) > Date.parse(now)
      ) {
        continue;
      }
      const safe = Boolean(
        row.first_attempt_at &&
          Date.parse(row.first_attempt_at) >= Date.parse(retrySafetyCutoff) &&
          row.attempt_count < 5,
      );
      Object.assign(row, {
        status: safe ? "retryable" : "failed",
        next_attempt_at: safe ? now : row.next_attempt_at,
        lease_token: null,
        lease_expires_at: null,
      });
    }
  }

  async listSendableDeliveries(
    limit: number,
    now: string,
  ): Promise<AlertDeliveryRow[]> {
    const due = (row: AlertDeliveryRow) =>
      row.attempt_count < 5 &&
      Date.parse(row.next_attempt_at ?? row.created_at ?? NOW.toISOString()) <=
        Date.parse(now);
    const pending = this.deliveries.filter((row) => row.status === "pending" && due(row));
    const retryable = this.deliveries.filter((row) => row.status === "retryable" && due(row));
    return structuredClone(fairDeliveryOrder(pending, retryable, limit));
  }

  async claimDelivery(
    unclaimed: AlertDeliveryRow,
    input: {
      leaseToken: string;
      now: string;
      leaseExpiresAt: string;
      maxAttempts: number;
    },
  ): Promise<AlertDeliveryRow | null> {
    const row = this.deliveries.find((candidate) => candidate.id === unclaimed.id);
    if (
      !row ||
      row.status !== unclaimed.status ||
      row.attempt_count !== unclaimed.attempt_count ||
      row.attempt_count >= input.maxAttempts ||
      Date.parse(row.next_attempt_at ?? input.now) > Date.parse(input.now)
    ) {
      return null;
    }
    row.status = "sending";
    row.attempt_count += 1;
    row.lease_token = input.leaseToken;
    row.lease_expires_at = input.leaseExpiresAt;
    row.first_attempt_at ??= input.now;
    row.last_attempt_at = input.now;
    return structuredClone(row);
  }

  async resolveUserEmail(): Promise<string | null> {
    return this.email;
  }

  async freezeDeliveryPayload(
    id: string,
    leaseToken: string,
    payload: AlertDeliveryRow["email_payload"],
    idempotencyKey: string,
    now: string,
  ): Promise<AlertDeliveryRow | null> {
    const row = this.deliveries.find((candidate) =>
      candidate.id === id &&
      candidate.status === "sending" &&
      candidate.lease_token === leaseToken &&
      !candidate.email_payload
    );
    if (!row || !payload) return null;
    Object.assign(row, {
      email_payload: structuredClone(payload),
      idempotency_key: idempotencyKey,
      payload_frozen_at: now,
    });
    return structuredClone(row);
  }

  async updateDelivery(
    id: string,
    leaseToken: string,
    patch: Partial<AlertDeliveryRow>,
  ): Promise<boolean> {
    const row = this.deliveries.find((candidate) =>
      candidate.id === id &&
      candidate.status === "sending" &&
      candidate.lease_token === leaseToken
    );
    if (!row) return false;
    Object.assign(row, structuredClone(patch));
    return true;
  }
}

function makeRequest(secret = CRON_SECRET): Request {
  return new Request("https://project.supabase.co/functions/v1/process-alerts", {
    method: "POST",
    headers: { "x-lootradar-cron-secret": secret },
  });
}

function makeHarness(options: {
  snapshot?: unknown;
  repository?: MemoryRepository;
  send?: (
    message: EmailMessage,
    idempotencyKey: string,
    options?: { signal?: AbortSignal },
  ) => Promise<{ id: string }>;
  fetchError?: Error;
  deadlineMs?: number;
} = {}) {
  const repository = options.repository ?? new MemoryRepository();
  const sent: Array<{
    key: string;
    to: string;
    allUrl: string;
    payload: string;
  }> = [];
  let currentNow = new Date(NOW);
  const handler = createProcessAlertsHandler({
    cronSecret: CRON_SECRET,
    repository,
    fetchSnapshot: async () => {
      if (options.fetchError) throw options.fetchError;
      return options.snapshot ?? makeSnapshot();
    },
    emailProvider: {
      send: options.send ?? (async (message, key) => {
        sent.push({
          key,
          to: String(message.to),
          allUrl: message.allUnsubscribeUrl,
          payload: JSON.stringify(message),
        });
        return { id: `provider-${sent.length}` };
      }),
    },
    signToken: async (payload) => `signed-${payload.category}-${payload.userId}`,
    now: () => new Date(currentNow),
    publicSiteUrl: "https://thelootradar.com/",
    unsubscribeUrl: "https://project.supabase.co/functions/v1/unsubscribe",
    deadlineMs: options.deadlineMs,
  });
  return {
    handler,
    repository,
    sent,
    advance(milliseconds: number) {
      currentNow = new Date(currentNow.getTime() + milliseconds);
    },
  };
}

Deno.test("rejects an invalid cron secret before reading external state", async () => {
  let fetched = false;
  const harness = makeHarness();
  const response = await createProcessAlertsHandler({
    cronSecret: CRON_SECRET,
    repository: harness.repository,
    fetchSnapshot: async () => {
      fetched = true;
      return makeSnapshot();
    },
    emailProvider: { send: async () => ({ id: "not-used" }) },
    signToken: async () => "not-used",
    now: () => new Date(NOW),
  })(makeRequest("wrong"));

  assert.equal(response.status, 401);
  assert.equal(fetched, false);
});

Deno.test("records a stale snapshot as rejected and sends no email", async () => {
  const stale = new Date(NOW.getTime() - 9 * 60 * 60 * 1000).toISOString();
  const { handler, repository, sent } = makeHarness({
    snapshot: makeSnapshot(stale),
  });

  const response = await handler(makeRequest());

  assert.equal(response.status, 422);
  assert.equal(repository.snapshots.get(stale), "rejected");
  assert.match(repository.rejected[0], /older than 8 hours/i);
  assert.equal(sent.length, 0);
});

Deno.test("repeated invocation creates and sends no duplicate condition", async () => {
  const { handler, repository, sent } = makeHarness();

  assert.equal((await handler(makeRequest())).status, 200);
  assert.equal((await handler(makeRequest())).status, 200);

  assert.equal(sent.length, 1);
  assert.equal(new Set(sent.map((item) => item.key)).size, 1);
  assert.equal(repository.deliveries.length, 1);
  assert.equal(repository.deliveries[0].status, "delivered");
  assert.match(sent[0].allUrl, /signed-all-user-a/);
});

Deno.test("retryable provider failures are retried with the same key", async () => {
  let attempts = 0;
  const keys: string[] = [];
  const payloads: string[] = [];
  const { handler, repository, advance } = makeHarness({
    send: async (message, key) => {
      attempts += 1;
      keys.push(key);
      payloads.push(JSON.stringify(message));
      if (attempts === 1) {
        throw new EmailProviderError("rate limited", {
          retryable: true,
          status: 429,
        });
      }
      return { id: "provider-success" };
    },
  });

  await handler(makeRequest());
  assert.equal(repository.deliveries[0].status, "retryable");
  advance(15 * 60 * 1000);
  await handler(makeRequest());

  assert.equal(attempts, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(payloads[0], payloads[1]);
  assert.equal(repository.deliveries[0].status, "delivered");
  assert.equal(repository.deliveries[0].provider_message_id, "provider-success");
});

Deno.test("final provider failures are not retried", async () => {
  let attempts = 0;
  const { handler, repository } = makeHarness({
    send: async () => {
      attempts += 1;
      throw new EmailProviderError("bad request", {
        retryable: false,
        status: 400,
      });
    },
  });

  await handler(makeRequest());
  await handler(makeRequest());

  assert.equal(attempts, 1);
  assert.equal(repository.deliveries[0].status, "failed");
  assert.equal(repository.deliveries[0].last_error, "Email provider returned HTTP 400");
});

Deno.test("aborts in-flight provider work at the processor deadline", async () => {
  const { handler, repository } = makeHarness({
    deadlineMs: 5,
    send: async (_message, _key, options) => {
      await new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () =>
            reject(
              new EmailProviderError("deadline", {
                retryable: true,
              }),
            ),
          { once: true },
        );
      });
      return { id: "unreachable" };
    },
  });

  const response = await handler(makeRequest());
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.deadlineReached, true);
  assert.equal(repository.deliveries[0].status, "retryable");
});

Deno.test("snapshot fetch failure sends no email and does not claim a snapshot", async () => {
  const { handler, repository, sent } = makeHarness({
    fetchError: new Error("origin unavailable"),
  });

  const response = await handler(makeRequest());

  assert.equal(response.status, 503);
  assert.equal(repository.snapshots.size, 0);
  assert.equal(sent.length, 0);
});

Deno.test("disabled and globally unsubscribed preferences send no email", async () => {
  for (
    const currentPreference of [
      preference({ free_game_enabled: false }),
      preference({ unsubscribed_at: NOW.toISOString() }),
    ]
  ) {
    const repository = new MemoryRepository();
    repository.preferences = [currentPreference];
    const { handler, sent } = makeHarness({ repository });

    assert.equal((await handler(makeRequest())).status, 200);
    assert.equal(sent.length, 0);
    assert.equal(repository.deliveries.length, 0);
  }
});

Deno.test("selects target, free, and due weekly digest candidates", async () => {
  const repository = new MemoryRepository();
  repository.preferences = [
    preference({
      target_price_enabled: true,
      free_game_enabled: true,
      weekly_digest_enabled: true,
    }),
  ];
  const { handler, sent } = makeHarness({ repository });

  const response = await handler(makeRequest());

  assert.equal(response.status, 200);
  assert.deepEqual(
    repository.deliveries.map((row) => row.alert_type).sort(),
    ["free_game", "target_price", "weekly_digest"],
  );
  assert.equal(sent.length, 3);
});

Deno.test("suppresses an existing retry when its category is disabled", async () => {
  const repository = new MemoryRepository();
  repository.preferences = [preference({ free_game_enabled: false })];
  repository.snapshots.set(NOW.toISOString(), "processed");
  repository.deliveries.push({
    id: "delivery-old",
    user_id: "user-a",
    alert_type: "free_game",
    game_key: "steam:1000",
    condition_key: "free:user-a:steam:1000:encoded-deal-0",
    snapshot_id: NOW.toISOString(),
    status: "retryable",
    attempt_count: 1,
  });
  const { handler, sent } = makeHarness({ repository });

  await handler(makeRequest());

  assert.equal(sent.length, 0);
  assert.equal(repository.deliveries[0].status, "suppressed");
});

Deno.test("caps work at 100 rows and no more than five concurrent sends", async () => {
  const repository = new MemoryRepository();
  repository.snapshots.set(NOW.toISOString(), "processed");
  repository.preferences = [preference()];
  repository.deliveries = Array.from({ length: 110 }, (_, index) => ({
    id: `delivery-${index}`,
    user_id: "user-a",
    alert_type: "free_game" as const,
    game_key: "steam:1000",
    condition_key: "free:user-a:steam:1000:encoded-deal-0",
    snapshot_id: NOW.toISOString(),
    status: "retryable" as const,
    attempt_count: 1,
  }));
  let active = 0;
  let maximumActive = 0;
  let sends = 0;
  const { handler } = makeHarness({
    repository,
    send: async () => {
      sends += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { id: `provider-${sends}` };
    },
  });

  await handler(makeRequest());

  assert.equal(sends, 100);
  assert.ok(maximumActive <= 5);
  assert.equal(
    repository.deliveries.filter((row) => row.status === "retryable").length,
    10,
  );
});

Deno.test("digest window covers the scheduled three-hour interval and keeps the target week", () => {
  const friday = preference({
    weekly_digest_enabled: true,
    digest_day: 5,
    digest_hour: 10,
  });
  assert.equal(
    digestWindowDue(friday, new Date("2026-07-31T14:00:00.000Z")),
    "2026-W31",
  );
  assert.equal(
    digestWindowDue(friday, new Date("2026-07-31T16:59:00.000Z")),
    "2026-W31",
  );
  assert.equal(
    digestWindowDue(friday, new Date("2026-07-31T17:00:00.000Z")),
    null,
  );

  const sundayLate = preference({
    timezone: "UTC",
    digest_day: 0,
    digest_hour: 23,
  });
  assert.equal(
    digestWindowDue(sundayLate, new Date("2027-01-04T00:30:00.000Z")),
    "2026-W53",
  );
});

Deno.test("pagination reads every range exactly once", async () => {
  const ranges: Array<[number, number]> = [];
  const rows = await collectPaginated(
    (from, to) => {
      ranges.push([from, to]);
      return Promise.resolve(
        Array.from(
          { length: from < 4 ? 2 : 1 },
          (_, index) => from + index,
        ),
      );
    },
    { pageSize: 2, maxRows: 10 },
  );

  assert.deepEqual(rows, [0, 1, 2, 3, 4]);
  assert.deepEqual(ranges, [[0, 1], [2, 3], [4, 5]]);
});

Deno.test("delivery selection alternates new and retry work fairly", () => {
  const row = (
    id: string,
    status: "pending" | "retryable",
  ): AlertDeliveryRow => ({
    id,
    user_id: "user-a",
    alert_type: "free_game",
    game_key: "steam:1000",
    condition_key: `free:user-a:${id}`,
    snapshot_id: NOW.toISOString(),
    status,
    attempt_count: status === "pending" ? 0 : 1,
  });

  assert.deepEqual(
    fairDeliveryOrder(
      [row("p1", "pending"), row("p2", "pending")],
      [row("r1", "retryable"), row("r2", "retryable")],
      3,
    ).map((delivery) => delivery.id),
    ["p1", "r1", "p2"],
  );
});

Deno.test("retry backoff stops at the attempt ceiling", () => {
  assert.equal(
    retryAt(1, NOW),
    new Date(NOW.getTime() + 15 * 60 * 1000).toISOString(),
  );
  assert.equal(
    retryAt(4, NOW),
    new Date(NOW.getTime() + 6 * 60 * 60 * 1000).toISOString(),
  );
  assert.equal(retryAt(5, NOW), null);
});

Deno.test("deal email CTA stays on LootRadar search", () => {
  const url = new URL(
    buildLootRadarDealUrl(
      "https://thelootradar.com/deals/old-path?unsafe=1#fragment",
      "A Game & Friends",
    ),
  );
  assert.equal(url.origin, "https://thelootradar.com");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("q"), "A Game & Friends");
  assert.equal(url.searchParams.get("collection"), "all");
  assert.equal(url.hash, "");
});

Deno.test("weekly digest CTA points to the published permanent collection", () => {
  assert.equal(
    buildDigestUrl("https://thelootradar.com/"),
    "https://thelootradar.com/deals/best-pc-game-deals.html",
  );
});

Deno.test("a lost snapshot claim cannot be completed by the old worker", async () => {
  class LostClaimRepository extends MemoryRepository {
    override async completeSnapshot(): Promise<boolean> {
      return false;
    }
  }
  const repository = new LostClaimRepository();
  const { handler, sent } = makeHarness({ repository });

  const response = await handler(makeRequest());

  assert.equal(response.status, 409);
  assert.equal(sent.length, 0);
  assert.equal(repository.snapshots.get(NOW.toISOString()), "processing");
});

Deno.test("expired sending leases recover only inside the provider safety window", async () => {
  const repository = new MemoryRepository();
  const base: AlertDeliveryRow = {
    id: "safe",
    user_id: "user-a",
    alert_type: "free_game",
    game_key: "steam:1000",
    condition_key: "free:user-a:steam:1000:deal",
    snapshot_id: NOW.toISOString(),
    status: "sending",
    attempt_count: 1,
    first_attempt_at: new Date(NOW.getTime() - 22 * 60 * 60 * 1000).toISOString(),
    lease_expires_at: new Date(NOW.getTime() - 1).toISOString(),
  };
  repository.deliveries = [
    base,
    {
      ...base,
      id: "unsafe",
      first_attempt_at: new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      ...base,
      id: "exhausted",
      attempt_count: 5,
    },
  ];

  await repository.recoverSendingLeases(
    NOW.toISOString(),
    new Date(NOW.getTime() - 23 * 60 * 60 * 1000).toISOString(),
  );

  assert.deepEqual(
    repository.deliveries.map((delivery) => delivery.status),
    ["retryable", "failed", "failed"],
  );
});

Deno.test("REST watchlist reads are user-batched, paginated, and tombstone-filtered", async () => {
  const requests: Array<{ url: URL; range: string | null }> = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    requests.push({
      url,
      range: new Headers(init?.headers).get("range"),
    });
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const repository = new RestAlertRepository({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    fetchImpl,
  });
  const userIds = Array.from(
    { length: 101 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );

  await repository.loadWatchlists(userIds);

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url.pathname, "/rest/v1/lr_watchlist");
    assert.equal(request.url.searchParams.get("deleted_at"), "is.null");
    assert.equal(request.range, "0-499");
  }
  assert.match(requests[0].url.searchParams.get("user_id") ?? "", /^in\.\(/);
});

Deno.test("REST delivery claims enforce the attempt ceiling in the CAS query", async () => {
  const requests: URL[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
  ) => {
    requests.push(new URL(String(input)));
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  const repository = new RestAlertRepository({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    fetchImpl,
  });
  const row: AlertDeliveryRow = {
    id: "delivery-a",
    user_id: "user-a",
    alert_type: "free_game",
    game_key: "steam:1000",
    condition_key: "free:user-a:steam:1000:deal",
    snapshot_id: NOW.toISOString(),
    status: "retryable",
    attempt_count: 4,
  };
  const input = {
    leaseToken: crypto.randomUUID(),
    now: NOW.toISOString(),
    leaseExpiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    maxAttempts: 5,
  };

  await repository.claimDelivery(row, input);
  assert.equal(
    requests[0].searchParams.get("and"),
    "(attempt_count.eq.4,attempt_count.lt.5)",
  );

  requests.length = 0;
  await repository.claimDelivery({ ...row, attempt_count: 5 }, input);
  assert.equal(requests.length, 0);
});

Deno.test("REST delivery claims confirm an empty self-invalidating PATCH response", async () => {
  const leaseToken = crypto.randomUUID();
  const row: AlertDeliveryRow = {
    id: "delivery-a",
    user_id: "user-a",
    alert_type: "free_game",
    game_key: "steam:1000",
    condition_key: "free:user-a:steam:1000:deal",
    snapshot_id: NOW.toISOString(),
    status: "retryable",
    attempt_count: 1,
    next_attempt_at: NOW.toISOString(),
  };
  const requests: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    if (requests.length === 1) return Response.json([]);
    return Response.json([{
      ...row,
      status: "sending",
      attempt_count: 2,
      lease_token: leaseToken,
    }]);
  }) as typeof fetch;
  const repository = new RestAlertRepository({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    fetchImpl,
  });

  const claimed = await repository.claimDelivery(row, {
    leaseToken,
    now: NOW.toISOString(),
    leaseExpiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    maxAttempts: 5,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get("status"), "eq.sending");
  assert.equal(requests[1].searchParams.get("lease_token"), `eq.${leaseToken}`);
  assert.equal(requests[1].searchParams.get("attempt_count"), "eq.2");
  assert.equal(claimed?.lease_token, leaseToken);
});

Deno.test("REST payload freezing uses the typed lease-owned database RPC", async () => {
  const requests: Array<{ url: URL; body: Record<string, unknown> }> = [];
  const leaseToken = crypto.randomUUID();
  const frozenRow: AlertDeliveryRow = {
    id: "delivery-a",
    user_id: "user-a",
    alert_type: "target_price",
    game_key: "steam:1000",
    condition_key: "target:user-a:steam:1000:1000:20",
    snapshot_id: NOW.toISOString(),
    status: "sending",
    attempt_count: 1,
    lease_token: leaseToken,
  };
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push({
      url: new URL(String(input)),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return Response.json([frozenRow]);
  }) as typeof fetch;
  const repository = new RestAlertRepository({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    fetchImpl,
  });

  const result = await repository.freezeDeliveryPayload(
    frozenRow.id,
    leaseToken,
    {
      to: "player@example.test",
      subject: "Target reached",
      html: "<p>Target reached</p>",
      text: "Target reached",
      allUnsubscribeUrl: "https://example.test/unsubscribe",
    },
    "idempotency-key",
    NOW.toISOString(),
  );

  assert.equal(result?.id, frozenRow.id);
  assert.equal(requests[0].url.pathname, "/rest/v1/rpc/lr_freeze_alert_delivery");
  assert.equal(requests[0].url.search, "");
  assert.equal(requests[0].body.p_id, frozenRow.id);
  assert.equal(requests[0].body.p_lease_token, leaseToken);
  assert.equal(requests[0].body.p_idempotency_key, "idempotency-key");
});

Deno.test("REST and Auth requests inherit caller cancellation", async () => {
  const observedSignals: AbortSignal[] = [];
  const fetchImpl = ((
    _input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const signal = init?.signal as AbortSignal;
    observedSignals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }) as typeof fetch;
  const repository = new RestAlertRepository({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-secret",
    fetchImpl,
    requestTimeoutMs: 60_000,
  });

  for (
    const operation of [
      (signal: AbortSignal) => repository.loadEnabledPreferences(signal),
      (signal: AbortSignal) => repository.resolveUserEmail("user-a", signal),
    ]
  ) {
    const controller = new AbortController();
    const pending = operation(controller.signal);
    controller.abort(new DOMException("deadline", "TimeoutError"));
    await assert.rejects(pending, /deadline/);
  }
  assert.equal(observedSignals.length, 2);
  assert.ok(observedSignals.every((signal) => signal.aborted));
});
