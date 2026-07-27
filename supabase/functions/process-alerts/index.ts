import {
  type AlertSnapshot,
  digestCandidates,
  freeCandidates,
  isDigestDue,
  targetCandidates,
  validateSnapshot,
} from "../_shared/alert-engine.ts";
import {
  createResendProvider,
  type EmailProvider,
  EmailProviderError,
} from "../_shared/email-provider.ts";
import {
  renderFreeGameEmail,
  renderTargetPriceEmail,
  renderWeeklyDigestEmail,
} from "../_shared/email-templates.ts";
import { signUnsubscribe, type UnsubscribePayload } from "../_shared/unsubscribe-token.ts";

const SNAPSHOT_URL = "https://thelootradar.com/alert-deals.json";
const PUBLIC_SITE_URL = "https://thelootradar.com/";
const MAX_DELIVERIES = 100;
const MAX_CONCURRENT_SENDS = 5;
const PROCESSOR_DEADLINE_MS = 8 * 60 * 1000;
const SNAPSHOT_LEASE_MS = 10 * 60 * 1000;
const UNSUBSCRIBE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000 - 1_000;

type AlertType = "target_price" | "free_game" | "weekly_digest";
type DeliveryStatus =
  | "pending"
  | "sending"
  | "delivered"
  | "retryable"
  | "failed"
  | "suppressed";

export interface AlertPreference {
  user_id: string;
  target_price_enabled: boolean;
  free_game_enabled: boolean;
  weekly_digest_enabled: boolean;
  timezone: string;
  digest_day: number;
  digest_hour: number;
  unsubscribed_at: string | null;
}

export interface AlertWatchlistEntry {
  user_id: string;
  game_key: string;
  title: string;
  target_price: number;
}

export interface AlertDeliveryRow {
  id: string;
  user_id: string;
  alert_type: AlertType;
  game_key: string | null;
  condition_key: string;
  snapshot_id: string;
  status: DeliveryStatus;
  attempt_count: number;
  provider_message_id?: string | null;
  last_error?: string | null;
  delivered_at?: string | null;
  created_at?: string;
}

export interface AlertRepository {
  recordRejectedSnapshot(input: {
    snapshotId: string;
    updatedAt: string;
    qualifiedDealCount: number;
    reason: string;
    now: string;
  }): Promise<void>;
  claimSnapshot(input: {
    snapshotId: string;
    updatedAt: string;
    qualifiedDealCount: number;
    now: string;
  }): Promise<boolean>;
  loadEnabledPreferences(): Promise<AlertPreference[]>;
  loadWatchlists(userIds: readonly string[]): Promise<AlertWatchlistEntry[]>;
  loadPriorDeliveryKeys(userIds: readonly string[]): Promise<Map<string, Set<string>>>;
  insertDeliveries(rows: AlertDeliveryRow[]): Promise<void>;
  markSnapshotProcessed(snapshotId: string, now: string): Promise<void>;
  markSnapshotFailed(snapshotId: string, reason: string, now: string): Promise<void>;
  listSendableDeliveries(limit: number): Promise<AlertDeliveryRow[]>;
  claimDelivery(id: string, attemptCount: number): Promise<AlertDeliveryRow | null>;
  resolveUserEmail(userId: string): Promise<string | null>;
  updateDelivery(id: string, patch: Partial<AlertDeliveryRow>): Promise<void>;
}

export interface ProcessAlertsDependencies {
  cronSecret: string;
  repository: AlertRepository;
  fetchSnapshot: (signal?: AbortSignal) => Promise<unknown>;
  emailProvider: EmailProvider;
  signToken: (payload: UnsubscribePayload) => Promise<string>;
  now?: () => Date;
  publicSiteUrl?: string;
  unsubscribeUrl?: string;
  deadlineMs?: number;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function secretMatches(expected: string, supplied: string | null): boolean {
  if (
    typeof expected !== "string" ||
    expected.length < 32 ||
    typeof supplied !== "string"
  ) {
    return false;
  }
  const expectedBytes = new TextEncoder().encode(expected);
  const suppliedBytes = new TextEncoder().encode(supplied);
  let difference = expectedBytes.length ^ suppliedBytes.length;
  const length = Math.max(expectedBytes.length, suppliedBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (suppliedBytes[index] ?? 0);
  }
  return difference === 0;
}

function safeReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown processing error";
  return message.replace(/[\r\n]+/gu, " ").slice(0, 500);
}

async function rejectionIdentity(
  value: unknown,
  now: Date,
): Promise<{ snapshotId: string; updatedAt: string; qualifiedDealCount: number }> {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const updatedAt = typeof record.updatedAt === "string" &&
      Number.isFinite(Date.parse(record.updatedAt))
    ? new Date(record.updatedAt).toISOString()
    : now.toISOString();
  const qualifiedDealCount = Number.isInteger(record.qualifiedDealCount) &&
      Number(record.qualifiedDealCount) >= 0
    ? Number(record.qualifiedDealCount)
    : 0;
  if (typeof record.snapshotId === "string" && record.snapshotId.trim().length > 0) {
    return {
      snapshotId: record.snapshotId.trim().slice(0, 500),
      updatedAt,
      qualifiedDealCount,
    };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value).slice(0, 100_000);
  } catch {
    serialized = String(value);
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    snapshotId: `rejected:${hex}`,
    updatedAt,
    qualifiedDealCount,
  };
}

function preferenceAllows(preference: AlertPreference | undefined, alertType: AlertType): boolean {
  if (!preference || preference.unsubscribed_at !== null) return false;
  if (alertType === "target_price") return preference.target_price_enabled === true;
  if (alertType === "free_game") return preference.free_game_enabled === true;
  return preference.weekly_digest_enabled === true;
}

function groupWatchlists(
  rows: readonly AlertWatchlistEntry[],
): Map<string, AlertWatchlistEntry[]> {
  const grouped = new Map<string, AlertWatchlistEntry[]>();
  for (const row of rows) {
    const current = grouped.get(row.user_id) ?? [];
    current.push(row);
    grouped.set(row.user_id, current);
  }
  return grouped;
}

function buildCandidateRows(
  snapshot: AlertSnapshot,
  preferences: readonly AlertPreference[],
  watchlists: ReadonlyMap<string, readonly AlertWatchlistEntry[]>,
  priorKeys: ReadonlyMap<string, ReadonlySet<string>>,
  now: Date,
): AlertDeliveryRow[] {
  const rows: AlertDeliveryRow[] = [];
  for (const preference of preferences) {
    if (preference.unsubscribed_at !== null) continue;
    const keys = priorKeys.get(preference.user_id) ?? new Set<string>();
    if (preference.target_price_enabled) {
      for (
        const candidate of targetCandidates(
          snapshot,
          preference.user_id,
          watchlists.get(preference.user_id) ?? [],
          keys,
        )
      ) {
        rows.push({
          id: crypto.randomUUID(),
          user_id: preference.user_id,
          alert_type: candidate.alertType,
          game_key: candidate.gameKey,
          condition_key: candidate.conditionKey,
          snapshot_id: candidate.snapshotId,
          status: "pending",
          attempt_count: 0,
        });
      }
    }
    if (preference.free_game_enabled) {
      for (const candidate of freeCandidates(snapshot, preference.user_id, keys)) {
        rows.push({
          id: crypto.randomUUID(),
          user_id: preference.user_id,
          alert_type: candidate.alertType,
          game_key: candidate.gameKey,
          condition_key: candidate.conditionKey,
          snapshot_id: candidate.snapshotId,
          status: "pending",
          attempt_count: 0,
        });
      }
    }
    if (preference.weekly_digest_enabled) {
      const weekKey = isDigestDue(preference, now);
      if (weekKey) {
        for (
          const candidate of digestCandidates(snapshot, preference.user_id, weekKey, keys)
        ) {
          rows.push({
            id: crypto.randomUUID(),
            user_id: preference.user_id,
            alert_type: candidate.alertType,
            game_key: null,
            condition_key: candidate.conditionKey,
            snapshot_id: candidate.snapshotId,
            status: "pending",
            attempt_count: 0,
          });
        }
      }
    }
  }
  return rows;
}

function conditionTargetPrice(conditionKey: string): number | null {
  const parts = conditionKey.split(":");
  const targetCents = Number(parts.at(-2));
  return Number.isSafeInteger(targetCents) && targetCents >= 0 ? targetCents / 100 : null;
}

function conditionWeek(conditionKey: string): string | null {
  const value = conditionKey.split(":").at(-1);
  return value && /^\d{4}-W\d{2}$/u.test(value) ? value : null;
}

function candidateForDelivery(
  snapshot: AlertSnapshot,
  delivery: AlertDeliveryRow,
  watchlists: ReadonlyMap<string, readonly AlertWatchlistEntry[]>,
) {
  if (delivery.alert_type === "target_price") {
    const targetPrice = conditionTargetPrice(delivery.condition_key);
    if (targetPrice === null) return null;
    return targetCandidates(
      snapshot,
      delivery.user_id,
      watchlists.get(delivery.user_id) ?? [],
      new Set(),
    ).find((candidate) => candidate.conditionKey === delivery.condition_key) ?? null;
  }
  if (delivery.alert_type === "free_game") {
    return freeCandidates(snapshot, delivery.user_id, new Set()).find((candidate) =>
      candidate.conditionKey === delivery.condition_key
    ) ?? null;
  }
  const week = conditionWeek(delivery.condition_key);
  if (!week) return null;
  return digestCandidates(snapshot, delivery.user_id, week, new Set()).find((candidate) =>
    candidate.conditionKey === delivery.condition_key
  ) ?? null;
}

function appendToken(endpoint: string, token: string): string {
  const url = new URL(endpoint);
  url.searchParams.set("token", token);
  return url.toString();
}

async function unsubscribeLinks(
  delivery: AlertDeliveryRow,
  deps: ProcessAlertsDependencies,
  now: Date,
): Promise<{ category: string; all: string }> {
  const endpoint = deps.unsubscribeUrl ??
    "https://thelootradar.supabase.co/functions/v1/unsubscribe";
  const expiresAt = new Date(now.getTime() + UNSUBSCRIBE_LIFETIME_MS).toISOString();
  const categoryToken = await deps.signToken({
    userId: delivery.user_id,
    category: delivery.alert_type,
    expiresAt,
  });
  const allToken = await deps.signToken({
    userId: delivery.user_id,
    category: "all",
    expiresAt,
  });
  return {
    category: appendToken(endpoint, categoryToken),
    all: appendToken(endpoint, allToken),
  };
}

function renderDelivery(
  candidate: NonNullable<ReturnType<typeof candidateForDelivery>>,
  email: string,
  links: { category: string; all: string },
  publicSiteUrl: string,
) {
  const shared = {
    lootRadarUrl: publicSiteUrl,
    categoryUnsubscribeUrl: links.category,
    allUnsubscribeUrl: links.all,
  };
  if (candidate.alertType === "target_price") {
    return {
      ...renderTargetPriceEmail({
        title: candidate.deal.title,
        salePrice: candidate.deal.salePrice,
        targetPrice: candidate.targetPrice,
        storeName: candidate.deal.storeName,
        ...shared,
      }),
      to: email,
      allUnsubscribeUrl: links.all,
    };
  }
  if (candidate.alertType === "free_game") {
    return {
      ...renderFreeGameEmail({
        title: candidate.deal.title,
        normalPrice: candidate.deal.normalPrice,
        storeName: candidate.deal.storeName,
        ...shared,
      }),
      to: email,
      allUnsubscribeUrl: links.all,
    };
  }
  return {
    ...renderWeeklyDigestEmail({
      deals: candidate.deals.map((deal) => ({
        title: deal.title,
        salePrice: deal.salePrice,
        storeName: deal.storeName,
        dealScore: deal.dealScore,
        recommendation: deal.recommendation,
      })),
      ...shared,
    }),
    to: email,
    allUnsubscribeUrl: links.all,
  };
}

async function idempotencyKey(conditionKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(conditionKey),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `lootradar:${hex}`;
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      async () => {
        while (nextIndex < values.length) {
          const value = values[nextIndex];
          nextIndex += 1;
          await worker(value);
        }
      },
    ),
  );
}

export function createProcessAlertsHandler(
  dependencies: ProcessAlertsDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" });
    }
    if (
      !secretMatches(
        dependencies.cronSecret,
        request.headers.get("x-lootradar-cron-secret"),
      )
    ) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const now = dependencies.now ?? (() => new Date());
    const startedAt = now();
    const deadlineMs = dependencies.deadlineMs ?? PROCESSOR_DEADLINE_MS;
    const deadlineAt = startedAt.getTime() + deadlineMs;
    const deadlineController = new AbortController();
    const deadlineTimer = setTimeout(
      () =>
        deadlineController.abort(
          new DOMException("Alert processor deadline reached", "TimeoutError"),
        ),
      deadlineMs,
    );

    try {
      let unvalidatedSnapshot: unknown;
      try {
        unvalidatedSnapshot = await dependencies.fetchSnapshot(deadlineController.signal);
      } catch {
        return jsonResponse(503, { error: "Deal snapshot is temporarily unavailable" });
      }

      let snapshot: AlertSnapshot;
      try {
        snapshot = validateSnapshot(unvalidatedSnapshot, startedAt);
      } catch (error) {
        const identity = await rejectionIdentity(unvalidatedSnapshot, startedAt);
        await dependencies.repository.recordRejectedSnapshot({
          ...identity,
          reason: safeReason(error),
          now: startedAt.toISOString(),
        });
        return jsonResponse(422, { error: "Deal snapshot was rejected" });
      }

      const claimed = await dependencies.repository.claimSnapshot({
        snapshotId: snapshot.snapshotId,
        updatedAt: snapshot.updatedAt,
        qualifiedDealCount: snapshot.qualifiedDealCount,
        now: startedAt.toISOString(),
      });

      const preferences = (await dependencies.repository.loadEnabledPreferences())
        .filter((preference) =>
          preference.unsubscribed_at === null &&
          (
            preference.target_price_enabled === true ||
            preference.free_game_enabled === true ||
            preference.weekly_digest_enabled === true
          )
        );
      const userIds = [...new Set(preferences.map((preference) => preference.user_id))];
      const watchlistRows = userIds.length > 0
        ? await dependencies.repository.loadWatchlists(userIds)
        : [];
      const watchlists = groupWatchlists(watchlistRows);

      let created = 0;
      if (claimed) {
        try {
          const priorKeys = userIds.length > 0
            ? await dependencies.repository.loadPriorDeliveryKeys(userIds)
            : new Map<string, Set<string>>();
          const rows = buildCandidateRows(
            snapshot,
            preferences,
            watchlists,
            priorKeys,
            startedAt,
          );
          if (rows.length > 0) {
            await dependencies.repository.insertDeliveries(rows);
          }
          created = rows.length;
          await dependencies.repository.markSnapshotProcessed(
            snapshot.snapshotId,
            now().toISOString(),
          );
        } catch (error) {
          await dependencies.repository.markSnapshotFailed(
            snapshot.snapshotId,
            safeReason(error),
            now().toISOString(),
          );
          return jsonResponse(500, { error: "Alert selection failed safely" });
        }
      }

      const preferencesByUser = new Map(
        preferences.map((preference) => [preference.user_id, preference]),
      );
      const sendable = await dependencies.repository.listSendableDeliveries(MAX_DELIVERIES);
      let delivered = 0;
      let retryable = 0;
      let failed = 0;
      let suppressed = 0;

      await runWithConcurrency(sendable, MAX_CONCURRENT_SENDS, async (unclaimed) => {
        if (
          deadlineController.signal.aborted ||
          now().getTime() >= deadlineAt
        ) {
          return;
        }
        const delivery = await dependencies.repository.claimDelivery(
          unclaimed.id,
          unclaimed.attempt_count + 1,
        );
        if (!delivery) return;

        const preference = preferencesByUser.get(delivery.user_id);
        if (!preferenceAllows(preference, delivery.alert_type)) {
          suppressed += 1;
          await dependencies.repository.updateDelivery(delivery.id, {
            status: "suppressed",
            last_error: "Email category is disabled or unsubscribed",
          });
          return;
        }
        const candidate = candidateForDelivery(snapshot, delivery, watchlists);
        if (!candidate) {
          suppressed += 1;
          await dependencies.repository.updateDelivery(delivery.id, {
            status: "suppressed",
            last_error: "The current qualified snapshot no longer satisfies this condition",
          });
          return;
        }
        let email: string | null;
        try {
          email = await dependencies.repository.resolveUserEmail(delivery.user_id);
        } catch {
          retryable += 1;
          await dependencies.repository.updateDelivery(delivery.id, {
            status: "retryable",
            last_error: "Account email lookup failed",
          });
          return;
        }
        if (!email) {
          suppressed += 1;
          await dependencies.repository.updateDelivery(delivery.id, {
            status: "suppressed",
            last_error: "No deliverable account email is available",
          });
          return;
        }

        try {
          const links = await unsubscribeLinks(delivery, dependencies, now());
          const message = renderDelivery(
            candidate,
            email,
            links,
            dependencies.publicSiteUrl ?? PUBLIC_SITE_URL,
          );
          const result = await dependencies.emailProvider.send(
            message,
            await idempotencyKey(delivery.condition_key),
            { signal: deadlineController.signal },
          );
          delivered += 1;
          await dependencies.repository.updateDelivery(delivery.id, {
            status: "delivered",
            provider_message_id: result.id,
            last_error: null,
            delivered_at: now().toISOString(),
          });
        } catch (error) {
          const canRetry = error instanceof EmailProviderError
            ? error.retryable
            : deadlineController.signal.aborted;
          if (canRetry) retryable += 1;
          else failed += 1;
          await dependencies.repository.updateDelivery(delivery.id, {
            status: canRetry ? "retryable" : "failed",
            last_error: error instanceof EmailProviderError && error.status
              ? `Email provider returned HTTP ${error.status}`
              : "Email delivery failed",
          });
        }
      });

      return jsonResponse(200, {
        snapshotId: snapshot.snapshotId,
        claimed,
        created,
        considered: sendable.length,
        delivered,
        retryable,
        failed,
        suppressed,
        deadlineReached: deadlineController.signal.aborted || now().getTime() >= deadlineAt,
      });
    } finally {
      clearTimeout(deadlineTimer);
    }
  };
}

interface RestRepositoryOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}

class RestAlertRepository implements AlertRepository {
  readonly #url: string;
  readonly #serviceRoleKey: string;
  readonly #fetch: typeof fetch;

  constructor(options: RestRepositoryOptions) {
    this.#url = options.supabaseUrl.replace(/\/+$/u, "");
    this.#serviceRoleKey = options.serviceRoleKey;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async #rest<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.#fetch(`${this.#url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.#serviceRoleKey,
        Authorization: `Bearer ${this.#serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Supabase REST request failed with HTTP ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async recordRejectedSnapshot(input: {
    snapshotId: string;
    updatedAt: string;
    qualifiedDealCount: number;
    reason: string;
    now: string;
  }): Promise<void> {
    await this.#rest("lr_processed_snapshots?on_conflict=snapshot_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        snapshot_id: input.snapshotId,
        updated_at: input.updatedAt,
        processed_at: input.now,
        qualified_deal_count: input.qualifiedDealCount,
        status: "rejected",
        rejection_reason: input.reason,
      }),
    });
  }

  async claimSnapshot(input: {
    snapshotId: string;
    updatedAt: string;
    qualifiedDealCount: number;
    now: string;
  }): Promise<boolean> {
    const inserted = await this.#rest<Array<{ snapshot_id: string }>>(
      "lr_processed_snapshots?on_conflict=snapshot_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({
          snapshot_id: input.snapshotId,
          updated_at: input.updatedAt,
          processed_at: input.now,
          qualified_deal_count: input.qualifiedDealCount,
          status: "processing",
        }),
      },
    );
    if (inserted.length > 0) return true;

    const query = new URLSearchParams({
      select: "snapshot_id,status,processed_at",
      snapshot_id: `eq.${input.snapshotId}`,
      limit: "1",
    });
    const existing = await this.#rest<
      Array<{
        status: string;
        processed_at: string | null;
      }>
    >(`lr_processed_snapshots?${query}`);
    const row = existing[0];
    if (!row || row.status === "processed" || row.status === "rejected") return false;

    const leaseExpired = row.status === "failed" ||
      row.processed_at === null ||
      Date.parse(row.processed_at) <= Date.parse(input.now) - SNAPSHOT_LEASE_MS;
    if (!leaseExpired) return false;

    const reclaim = new URLSearchParams({
      snapshot_id: `eq.${input.snapshotId}`,
      status: `eq.${row.status}`,
      processed_at: row.processed_at === null ? "is.null" : `eq.${row.processed_at}`,
      select: "snapshot_id",
    });
    const reclaimed = await this.#rest<Array<{ snapshot_id: string }>>(
      `lr_processed_snapshots?${reclaim}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "processing",
          processed_at: input.now,
          rejection_reason: null,
        }),
      },
    );
    return reclaimed.length > 0;
  }

  async loadEnabledPreferences(): Promise<AlertPreference[]> {
    const query = new URLSearchParams({
      select:
        "user_id,target_price_enabled,free_game_enabled,weekly_digest_enabled,timezone,digest_day,digest_hour,unsubscribed_at",
      unsubscribed_at: "is.null",
      or: "(target_price_enabled.eq.true,free_game_enabled.eq.true,weekly_digest_enabled.eq.true)",
    });
    return await this.#rest<AlertPreference[]>(`lr_notification_preferences?${query}`);
  }

  async loadWatchlists(userIds: readonly string[]): Promise<AlertWatchlistEntry[]> {
    if (userIds.length === 0) return [];
    const query = new URLSearchParams({
      select: "user_id,game_key,title,target_price",
      user_id: `in.(${userIds.join(",")})`,
    });
    return await this.#rest<AlertWatchlistEntry[]>(`lr_watchlist?${query}`);
  }

  async loadPriorDeliveryKeys(userIds: readonly string[]): Promise<Map<string, Set<string>>> {
    if (userIds.length === 0) return new Map();
    const query = new URLSearchParams({
      select: "user_id,condition_key",
      user_id: `in.(${userIds.join(",")})`,
    });
    const rows = await this.#rest<Array<{ user_id: string; condition_key: string }>>(
      `lr_alert_deliveries?${query}`,
    );
    const result = new Map<string, Set<string>>();
    for (const row of rows) {
      const keys = result.get(row.user_id) ?? new Set<string>();
      keys.add(row.condition_key);
      result.set(row.user_id, keys);
    }
    return result;
  }

  async insertDeliveries(rows: AlertDeliveryRow[]): Promise<void> {
    await this.#rest(
      "lr_alert_deliveries?on_conflict=user_id,condition_key",
      {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(rows.map((row) => ({
          id: row.id,
          user_id: row.user_id,
          alert_type: row.alert_type,
          game_key: row.game_key,
          condition_key: row.condition_key,
          snapshot_id: row.snapshot_id,
          status: row.status,
          attempt_count: row.attempt_count,
        }))),
      },
    );
  }

  async markSnapshotProcessed(snapshotId: string, now: string): Promise<void> {
    const query = new URLSearchParams({ snapshot_id: `eq.${snapshotId}` });
    await this.#rest(`lr_processed_snapshots?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "processed",
        processed_at: now,
        rejection_reason: null,
      }),
    });
  }

  async markSnapshotFailed(snapshotId: string, reason: string, now: string): Promise<void> {
    const query = new URLSearchParams({ snapshot_id: `eq.${snapshotId}` });
    await this.#rest(`lr_processed_snapshots?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "failed",
        processed_at: now,
        rejection_reason: reason,
      }),
    });
  }

  async listSendableDeliveries(limit: number): Promise<AlertDeliveryRow[]> {
    const query = new URLSearchParams({
      select: "*",
      status: "in.(pending,retryable)",
      order: "created_at.asc",
      limit: String(limit),
    });
    return await this.#rest<AlertDeliveryRow[]>(`lr_alert_deliveries?${query}`);
  }

  async claimDelivery(id: string, attemptCount: number): Promise<AlertDeliveryRow | null> {
    const query = new URLSearchParams({
      id: `eq.${id}`,
      status: "in.(pending,retryable)",
      select: "*",
    });
    const rows = await this.#rest<AlertDeliveryRow[]>(`lr_alert_deliveries?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "sending", attempt_count: attemptCount }),
    });
    return rows[0] ?? null;
  }

  async resolveUserEmail(userId: string): Promise<string | null> {
    const response = await this.#fetch(
      `${this.#url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          apikey: this.#serviceRoleKey,
          Authorization: `Bearer ${this.#serviceRoleKey}`,
        },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Supabase Auth request failed with HTTP ${response.status}`);
    }
    const user = await response.json() as { email?: unknown };
    return typeof user.email === "string" && user.email.trim() ? user.email.trim() : null;
  }

  async updateDelivery(id: string, patch: Partial<AlertDeliveryRow>): Promise<void> {
    const allowed = {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.provider_message_id !== undefined
        ? { provider_message_id: patch.provider_message_id }
        : {}),
      ...(patch.last_error !== undefined ? { last_error: patch.last_error } : {}),
      ...(patch.delivered_at !== undefined ? { delivered_at: patch.delivered_at } : {}),
    };
    const query = new URLSearchParams({ id: `eq.${id}` });
    await this.#rest(`lr_alert_deliveries?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(allowed),
    });
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required server configuration: ${name}`);
  }
  return value.trim();
}

function productionHandler(): (request: Request) => Promise<Response> {
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = requiredEnvironment("CRON_SECRET");
  const resendApiKey = requiredEnvironment("RESEND_API_KEY");
  const unsubscribeSecret = requiredEnvironment("UNSUBSCRIBE_SECRET");
  const unsubscribeUrl = `${supabaseUrl.replace(/\/+$/u, "")}/functions/v1/unsubscribe`;
  return createProcessAlertsHandler({
    cronSecret,
    repository: new RestAlertRepository({ supabaseUrl, serviceRoleKey }),
    fetchSnapshot: async (signal) => {
      const response = await fetch(SNAPSHOT_URL, {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "LootRadar-Alerts/1.0",
        },
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Snapshot returned HTTP ${response.status}`);
      return await response.json();
    },
    emailProvider: createResendProvider({ apiKey: resendApiKey }),
    signToken: (payload) => signUnsubscribe(payload, unsubscribeSecret),
    publicSiteUrl: PUBLIC_SITE_URL,
    unsubscribeUrl,
  });
}

if (import.meta.main) {
  Deno.serve(productionHandler());
}
