// deno-lint-ignore-file require-await
import assert from "node:assert/strict";

import { type EmailMessage, EmailProviderError } from "../_shared/email-provider.ts";
import {
  type AlertDeliveryRow,
  type AlertPreference,
  type AlertRepository,
  createProcessAlertsHandler,
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

  async claimSnapshot(input: { snapshotId: string }): Promise<boolean> {
    if (this.snapshots.has(input.snapshotId)) return false;
    this.snapshots.set(input.snapshotId, "processing");
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

  async markSnapshotProcessed(snapshotId: string): Promise<void> {
    this.snapshots.set(snapshotId, "processed");
  }

  async markSnapshotFailed(snapshotId: string): Promise<void> {
    this.snapshots.set(snapshotId, "failed");
  }

  async listSendableDeliveries(limit: number): Promise<AlertDeliveryRow[]> {
    return structuredClone(
      this.deliveries.filter((row) => row.status === "pending" || row.status === "retryable").slice(
        0,
        limit,
      ),
    );
  }

  async claimDelivery(id: string): Promise<AlertDeliveryRow | null> {
    const row = this.deliveries.find((candidate) => candidate.id === id);
    if (!row || !["pending", "retryable"].includes(row.status)) return null;
    row.status = "sending";
    row.attempt_count += 1;
    return structuredClone(row);
  }

  async resolveUserEmail(): Promise<string | null> {
    return this.email;
  }

  async updateDelivery(
    id: string,
    patch: Partial<AlertDeliveryRow>,
  ): Promise<void> {
    const row = this.deliveries.find((candidate) => candidate.id === id);
    if (!row) throw new Error("Missing delivery");
    Object.assign(row, structuredClone(patch));
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
  const sent: Array<{ key: string; to: string; allUrl: string }> = [];
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
        });
        return { id: `provider-${sent.length}` };
      }),
    },
    signToken: async (payload) => `signed-${payload.category}-${payload.userId}`,
    now: () => new Date(NOW),
    publicSiteUrl: "https://thelootradar.com/",
    unsubscribeUrl: "https://project.supabase.co/functions/v1/unsubscribe",
    deadlineMs: options.deadlineMs,
  });
  return { handler, repository, sent };
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
  const { handler, repository } = makeHarness({
    send: async (_message, key) => {
      attempts += 1;
      keys.push(key);
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
  await handler(makeRequest());

  assert.equal(attempts, 2);
  assert.equal(keys[0], keys[1]);
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
