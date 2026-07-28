import {
  type AlertSnapshot,
  digestCandidates,
  freeCandidates,
  targetCandidates,
  validateSnapshot,
} from "../_shared/alert-engine.ts";
import {
  createResendProvider,
  type EmailMessage,
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
const NETWORK_TIMEOUT_MS = 15_000;
const SNAPSHOT_LEASE_MS = 9 * 60 * 1000;
const SENDING_LEASE_MS = 10 * 60 * 1000;
const PROVIDER_IDEMPOTENCY_SAFETY_MS = 23 * 60 * 60 * 1000;
const UNSUBSCRIBE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000 - 1_000;
const MAX_ATTEMPTS = 5;
const DIGEST_WINDOW_MINUTES = 3 * 60;
const REST_PAGE_SIZE = 500;
const USER_FILTER_BATCH_SIZE = 100;
const WEEK_MINUTES = 7 * 24 * 60;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const RETRY_DELAYS_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

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

export interface FrozenEmailPayload extends EmailMessage {
  to: string;
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
  email_payload?: FrozenEmailPayload | null;
  idempotency_key?: string | null;
  payload_frozen_at?: string | null;
  next_attempt_at?: string;
  lease_token?: string | null;
  lease_expires_at?: string | null;
  first_attempt_at?: string | null;
  last_attempt_at?: string | null;
  provider_message_id?: string | null;
  last_error?: string | null;
  delivered_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SnapshotClaim {
  token: string;
}

export interface AlertRepository {
  recordRejectedSnapshot(
    input: {
      snapshotId: string;
      updatedAt: string;
      qualifiedDealCount: number;
      reason: string;
      now: string;
    },
    signal?: AbortSignal,
  ): Promise<void>;
  claimSnapshot(
    input: {
      snapshotId: string;
      updatedAt: string;
      qualifiedDealCount: number;
      now: string;
    },
    signal?: AbortSignal,
  ): Promise<SnapshotClaim | null>;
  completeSnapshot(
    snapshotId: string,
    claimToken: string,
    outcome: "processed" | "failed",
    reason: string | null,
    now: string,
    signal?: AbortSignal,
  ): Promise<boolean>;
  loadEnabledPreferences(signal?: AbortSignal): Promise<AlertPreference[]>;
  loadWatchlists(
    userIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<AlertWatchlistEntry[]>;
  loadPriorDeliveryKeys(
    userIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<string, Set<string>>>;
  insertDeliveries(
    rows: AlertDeliveryRow[],
    signal?: AbortSignal,
  ): Promise<void>;
  recoverSendingLeases(
    now: string,
    retrySafetyCutoff: string,
    signal?: AbortSignal,
  ): Promise<void>;
  listSendableDeliveries(
    limit: number,
    now: string,
    signal?: AbortSignal,
  ): Promise<AlertDeliveryRow[]>;
  claimDelivery(
    row: AlertDeliveryRow,
    input: {
      leaseToken: string;
      now: string;
      leaseExpiresAt: string;
      maxAttempts: number;
    },
    signal?: AbortSignal,
  ): Promise<AlertDeliveryRow | null>;
  resolveUserEmail(userId: string, signal?: AbortSignal): Promise<string | null>;
  freezeDeliveryPayload(
    id: string,
    leaseToken: string,
    payload: FrozenEmailPayload,
    idempotencyKey: string,
    now: string,
    signal?: AbortSignal,
  ): Promise<AlertDeliveryRow | null>;
  updateDelivery(
    id: string,
    leaseToken: string,
    patch: Partial<AlertDeliveryRow>,
    signal?: AbortSignal,
  ): Promise<boolean>;
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

export async function collectPaginated<T>(
  fetchPage: (from: number, to: number) => Promise<readonly T[]>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? REST_PAGE_SIZE;
  const maxRows = options.maxRows ?? 500_000;
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  ) {
    throw new Error("Pagination limits must be positive integers");
  }

  const all: T[] = [];
  while (all.length < maxRows) {
    const requested = Math.min(pageSize, maxRows - all.length);
    const page = await fetchPage(all.length, all.length + requested - 1);
    all.push(...page);
    if (page.length < requested) return all;
  }
  return all;
}

export function fairDeliveryOrder(
  pending: readonly AlertDeliveryRow[],
  retryable: readonly AlertDeliveryRow[],
  limit: number,
): AlertDeliveryRow[] {
  const result: AlertDeliveryRow[] = [];
  let pendingIndex = 0;
  let retryIndex = 0;
  while (
    result.length < limit &&
    (pendingIndex < pending.length || retryIndex < retryable.length)
  ) {
    if (pendingIndex < pending.length && result.length < limit) {
      result.push(pending[pendingIndex++]);
    }
    if (retryIndex < retryable.length && result.length < limit) {
      result.push(retryable[retryIndex++]);
    }
  }
  return result;
}

function isoWeekKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export function digestWindowDue(
  preference: Pick<AlertPreference, "timezone" | "digest_day" | "digest_hour">,
  now: Date,
  windowMinutes = DIGEST_WINDOW_MINUTES,
): string | null {
  if (
    !preference ||
    typeof preference.timezone !== "string" ||
    !Number.isInteger(preference.digest_day) ||
    preference.digest_day < 0 ||
    preference.digest_day > 6 ||
    !Number.isInteger(preference.digest_hour) ||
    preference.digest_hour < 0 ||
    preference.digest_hour > 23 ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !Number.isInteger(windowMinutes) ||
    windowMinutes < 1 ||
    windowMinutes > WEEK_MINUTES
  ) {
    return null;
  }

  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: preference.timezone,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now).map((part) => [part.type, part.value]),
    );
    const weekday = DAY_NAMES.indexOf(values.weekday as typeof DAY_NAMES[number]);
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    if (
      weekday < 0 ||
      ![year, month, day, hour, minute].every(Number.isInteger)
    ) {
      return null;
    }

    const currentWeekMinute = weekday * 24 * 60 + hour * 60 + minute;
    const targetWeekMinute = preference.digest_day * 24 * 60 +
      preference.digest_hour * 60;
    const elapsed = (currentWeekMinute - targetWeekMinute + WEEK_MINUTES) % WEEK_MINUTES;
    if (elapsed >= windowMinutes) return null;

    const daysBack = (weekday - preference.digest_day + 7) % 7;
    const targetDate = new Date(Date.UTC(year, month - 1, day));
    targetDate.setUTCDate(targetDate.getUTCDate() - daysBack);
    return isoWeekKey(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth() + 1,
      targetDate.getUTCDate(),
    );
  } catch {
    return null;
  }
}

export function buildLootRadarDealUrl(
  publicSiteUrl: string,
  title: string,
): string {
  const url = new URL(publicSiteUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("q", title);
  url.searchParams.set("collection", "all");
  return url.toString();
}

export function buildDigestUrl(publicSiteUrl: string): string {
  return new URL("deals/best-pc-game-deals.html", publicSiteUrl).toString();
}

export function retryAt(attemptCount: number, now: Date): string | null {
  if (
    !Number.isInteger(attemptCount) ||
    attemptCount < 1 ||
    attemptCount >= MAX_ATTEMPTS
  ) {
    return null;
  }
  const delay = RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)];
  return new Date(now.getTime() + delay).toISOString();
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
          next_attempt_at: now.toISOString(),
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
          next_attempt_at: now.toISOString(),
        });
      }
    }
    if (preference.weekly_digest_enabled) {
      const weekKey = digestWindowDue(preference, now);
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
            next_attempt_at: now.toISOString(),
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
): FrozenEmailPayload {
  const lootRadarUrl = candidate.alertType === "weekly_digest"
    ? buildDigestUrl(publicSiteUrl)
    : buildLootRadarDealUrl(publicSiteUrl, candidate.deal.title);
  const shared = {
    lootRadarUrl,
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

function isFrozenPayload(value: unknown): value is FrozenEmailPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return ["to", "subject", "html", "text", "allUnsubscribeUrl"].every((field) =>
    typeof payload[field] === "string" && payload[field].length > 0
  );
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
          const value = values[nextIndex++];
          await worker(value);
        }
      },
    ),
  );
}

function terminalPatch(
  status: "failed" | "suppressed",
  lastError: string,
  now: Date,
): Partial<AlertDeliveryRow> {
  return {
    status,
    last_error: lastError,
    lease_token: null,
    lease_expires_at: null,
    updated_at: now.toISOString(),
  };
}

function retryPatch(
  delivery: AlertDeliveryRow,
  lastError: string,
  now: Date,
): Partial<AlertDeliveryRow> {
  const next = retryAt(delivery.attempt_count, now);
  return next
    ? {
      status: "retryable",
      last_error: lastError,
      next_attempt_at: next,
      lease_token: null,
      lease_expires_at: null,
      updated_at: now.toISOString(),
    }
    : terminalPatch("failed", `${lastError}; retry limit reached`, now);
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
    const signal = deadlineController.signal;

    try {
      let unvalidatedSnapshot: unknown;
      try {
        unvalidatedSnapshot = await dependencies.fetchSnapshot(signal);
      } catch {
        return jsonResponse(503, { error: "Deal snapshot is temporarily unavailable" });
      }

      let snapshot: AlertSnapshot;
      try {
        snapshot = validateSnapshot(unvalidatedSnapshot, startedAt);
      } catch (error) {
        const identity = await rejectionIdentity(unvalidatedSnapshot, startedAt);
        await dependencies.repository.recordRejectedSnapshot(
          {
            ...identity,
            reason: safeReason(error),
            now: startedAt.toISOString(),
          },
          signal,
        );
        return jsonResponse(422, { error: "Deal snapshot was rejected" });
      }

      const claim = await dependencies.repository.claimSnapshot(
        {
          snapshotId: snapshot.snapshotId,
          updatedAt: snapshot.updatedAt,
          qualifiedDealCount: snapshot.qualifiedDealCount,
          now: startedAt.toISOString(),
        },
        signal,
      );

      const preferences = (await dependencies.repository.loadEnabledPreferences(signal))
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
        ? await dependencies.repository.loadWatchlists(userIds, signal)
        : [];
      const watchlists = groupWatchlists(watchlistRows);

      let created = 0;
      if (claim) {
        try {
          const priorKeys = userIds.length > 0
            ? await dependencies.repository.loadPriorDeliveryKeys(userIds, signal)
            : new Map<string, Set<string>>();
          const rows = buildCandidateRows(
            snapshot,
            preferences,
            watchlists,
            priorKeys,
            startedAt,
          );
          if (rows.length > 0) {
            await dependencies.repository.insertDeliveries(rows, signal);
          }
          created = rows.length;
          const completed = await dependencies.repository.completeSnapshot(
            snapshot.snapshotId,
            claim.token,
            "processed",
            null,
            now().toISOString(),
            signal,
          );
          if (!completed) {
            return jsonResponse(409, { error: "Snapshot processing lease was lost" });
          }
        } catch (error) {
          await dependencies.repository.completeSnapshot(
            snapshot.snapshotId,
            claim.token,
            "failed",
            safeReason(error),
            now().toISOString(),
            signal,
          );
          return jsonResponse(500, { error: "Alert selection failed safely" });
        }
      }

      const currentTime = now();
      await dependencies.repository.recoverSendingLeases(
        currentTime.toISOString(),
        new Date(currentTime.getTime() - PROVIDER_IDEMPOTENCY_SAFETY_MS).toISOString(),
        signal,
      );
      const preferencesByUser = new Map(
        preferences.map((preference) => [preference.user_id, preference]),
      );
      const sendable = await dependencies.repository.listSendableDeliveries(
        MAX_DELIVERIES,
        currentTime.toISOString(),
        signal,
      );
      let delivered = 0;
      let retryable = 0;
      let failed = 0;
      let suppressed = 0;

      await runWithConcurrency(sendable, MAX_CONCURRENT_SENDS, async (unclaimed) => {
        if (signal.aborted || now().getTime() >= deadlineAt) return;

        const leaseToken = crypto.randomUUID();
        const claimed = await dependencies.repository.claimDelivery(
          unclaimed,
          {
            leaseToken,
            now: now().toISOString(),
            leaseExpiresAt: new Date(now().getTime() + SENDING_LEASE_MS).toISOString(),
            maxAttempts: MAX_ATTEMPTS,
          },
          signal,
        );
        if (!claimed) return;

        const preference = preferencesByUser.get(claimed.user_id);
        if (!preferenceAllows(preference, claimed.alert_type)) {
          suppressed += 1;
          await dependencies.repository.updateDelivery(
            claimed.id,
            leaseToken,
            terminalPatch(
              "suppressed",
              "Email category is disabled or unsubscribed",
              now(),
            ),
            signal,
          );
          return;
        }

        let accountEmail: string | null;
        try {
          accountEmail = await dependencies.repository.resolveUserEmail(
            claimed.user_id,
            signal,
          );
        } catch {
          retryable += 1;
          await dependencies.repository.updateDelivery(
            claimed.id,
            leaseToken,
            retryPatch(claimed, "Account email lookup failed", now()),
            signal,
          );
          return;
        }
        if (!accountEmail) {
          suppressed += 1;
          await dependencies.repository.updateDelivery(
            claimed.id,
            leaseToken,
            terminalPatch(
              "suppressed",
              "No deliverable account email is available",
              now(),
            ),
            signal,
          );
          return;
        }

        let delivery = claimed;
        if (delivery.email_payload !== null && delivery.email_payload !== undefined) {
          if (
            !isFrozenPayload(delivery.email_payload) ||
            typeof delivery.idempotency_key !== "string" ||
            delivery.idempotency_key.length === 0
          ) {
            failed += 1;
            await dependencies.repository.updateDelivery(
              delivery.id,
              leaseToken,
              terminalPatch("failed", "Stored email payload is incomplete", now()),
              signal,
            );
            return;
          }
          if (delivery.email_payload.to !== accountEmail) {
            suppressed += 1;
            await dependencies.repository.updateDelivery(
              delivery.id,
              leaseToken,
              terminalPatch(
                "suppressed",
                "Account email changed after this delivery was prepared",
                now(),
              ),
              signal,
            );
            return;
          }
        } else {
          const candidate = candidateForDelivery(snapshot, delivery, watchlists);
          if (!candidate) {
            suppressed += 1;
            await dependencies.repository.updateDelivery(
              delivery.id,
              leaseToken,
              terminalPatch(
                "suppressed",
                "The current qualified snapshot no longer satisfies this condition",
                now(),
              ),
              signal,
            );
            return;
          }
          try {
            const links = await unsubscribeLinks(delivery, dependencies, now());
            const payload = renderDelivery(
              candidate,
              accountEmail,
              links,
              dependencies.publicSiteUrl ?? PUBLIC_SITE_URL,
            );
            const frozen = await dependencies.repository.freezeDeliveryPayload(
              delivery.id,
              leaseToken,
              payload,
              await idempotencyKey(delivery.condition_key),
              now().toISOString(),
              signal,
            );
            if (!frozen) return;
            delivery = frozen;
          } catch {
            failed += 1;
            await dependencies.repository.updateDelivery(
              delivery.id,
              leaseToken,
              terminalPatch("failed", "Email preparation failed", now()),
              signal,
            );
            return;
          }
        }

        if (
          !isFrozenPayload(delivery.email_payload) ||
          typeof delivery.idempotency_key !== "string"
        ) {
          failed += 1;
          await dependencies.repository.updateDelivery(
            delivery.id,
            leaseToken,
            terminalPatch("failed", "Stored email payload is incomplete", now()),
            signal,
          );
          return;
        }

        try {
          const result = await dependencies.emailProvider.send(
            delivery.email_payload,
            delivery.idempotency_key,
            { signal },
          );
          delivered += 1;
          await dependencies.repository.updateDelivery(
            delivery.id,
            leaseToken,
            {
              status: "delivered",
              provider_message_id: result.id,
              last_error: null,
              delivered_at: now().toISOString(),
              lease_token: null,
              lease_expires_at: null,
              updated_at: now().toISOString(),
            },
            signal,
          );
        } catch (error) {
          const canRetry = error instanceof EmailProviderError ? error.retryable : signal.aborted;
          const reason = error instanceof EmailProviderError && error.status
            ? `Email provider returned HTTP ${error.status}`
            : "Email delivery failed";
          const patch = canRetry
            ? retryPatch(delivery, reason, now())
            : terminalPatch("failed", reason, now());
          if (patch.status === "retryable") retryable += 1;
          else failed += 1;
          await dependencies.repository.updateDelivery(
            delivery.id,
            leaseToken,
            patch,
            signal,
          );
        }
      });

      return jsonResponse(200, {
        snapshotId: snapshot.snapshotId,
        claimed: claim !== null,
        created,
        considered: sendable.length,
        delivered,
        retryable,
        failed,
        suppressed,
        deadlineReached: signal.aborted || now().getTime() >= deadlineAt,
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
  requestTimeoutMs?: number;
}

function boundedSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abortFromParent = () =>
    controller.abort(parent?.reason ?? new DOMException("Request aborted", "AbortError"));
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("Network request timed out", "TimeoutError"),
      ),
    timeoutMs,
  );
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener("abort", abortFromParent, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

async function fetchBounded(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
  parent: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  const bounded = boundedSignal(parent, timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: bounded.signal });
  } finally {
    bounded.cleanup();
  }
}

export class RestAlertRepository implements AlertRepository {
  readonly #url: string;
  readonly #serviceRoleKey: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;

  constructor(options: RestRepositoryOptions) {
    this.#url = options.supabaseUrl.replace(/\/+$/u, "");
    this.#serviceRoleKey = options.serviceRoleKey;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? NETWORK_TIMEOUT_MS;
  }

  async #rest<T>(
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetchBounded(
      this.#fetch,
      `${this.#url}/rest/v1/${path}`,
      {
        ...init,
        headers: {
          apikey: this.#serviceRoleKey,
          Authorization: `Bearer ${this.#serviceRoleKey}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      },
      signal,
      this.#requestTimeoutMs,
    );
    if (!response.ok) {
      throw new Error(`Supabase REST request failed with HTTP ${response.status}`);
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async #allPages<T>(
    path: string,
    signal?: AbortSignal,
    options: { maxRows?: number; pageSize?: number } = {},
  ): Promise<T[]> {
    return await collectPaginated<T>(
      (from, to) =>
        this.#rest<T[]>(
          path,
          { headers: { Range: `${from}-${to}` } },
          signal,
        ),
      options,
    );
  }

  async recordRejectedSnapshot(
    input: {
      snapshotId: string;
      updatedAt: string;
      qualifiedDealCount: number;
      reason: string;
      now: string;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    await this.#rest(
      "lr_processed_snapshots?on_conflict=snapshot_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({
          snapshot_id: input.snapshotId,
          updated_at: input.updatedAt,
          processed_at: input.now,
          qualified_deal_count: input.qualifiedDealCount,
          status: "rejected",
          rejection_reason: input.reason,
          claim_token: null,
          lease_expires_at: null,
        }),
      },
      signal,
    );
  }

  async claimSnapshot(
    input: {
      snapshotId: string;
      updatedAt: string;
      qualifiedDealCount: number;
      now: string;
    },
    signal?: AbortSignal,
  ): Promise<SnapshotClaim | null> {
    const claimToken = crypto.randomUUID();
    const leaseExpiresAt = new Date(
      Date.parse(input.now) + SNAPSHOT_LEASE_MS,
    ).toISOString();
    const inserted = await this.#rest<Array<{ snapshot_id: string }>>(
      "lr_processed_snapshots?on_conflict=snapshot_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({
          snapshot_id: input.snapshotId,
          updated_at: input.updatedAt,
          processed_at: null,
          qualified_deal_count: input.qualifiedDealCount,
          status: "processing",
          rejection_reason: null,
          claim_token: claimToken,
          lease_expires_at: leaseExpiresAt,
        }),
      },
      signal,
    );
    if (inserted.length > 0) return { token: claimToken };

    const query = new URLSearchParams({
      select: "snapshot_id,status,claim_token,lease_expires_at",
      snapshot_id: `eq.${input.snapshotId}`,
      limit: "1",
    });
    const existing = await this.#rest<
      Array<{
        status: string;
        claim_token: string | null;
        lease_expires_at: string | null;
      }>
    >(`lr_processed_snapshots?${query}`, {}, signal);
    const row = existing[0];
    if (!row || row.status === "processed" || row.status === "rejected") return null;

    const reclaimable = row.status === "failed" ||
      (
        row.status === "processing" &&
        row.lease_expires_at !== null &&
        Date.parse(row.lease_expires_at) <= Date.parse(input.now)
      );
    if (!reclaimable) return null;

    const reclaim = new URLSearchParams({
      snapshot_id: `eq.${input.snapshotId}`,
      status: `eq.${row.status}`,
      claim_token: row.claim_token === null ? "is.null" : `eq.${row.claim_token}`,
      lease_expires_at: row.lease_expires_at === null ? "is.null" : `eq.${row.lease_expires_at}`,
      select: "snapshot_id",
    });
    const reclaimed = await this.#rest<Array<{ snapshot_id: string }>>(
      `lr_processed_snapshots?${reclaim}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: "processing",
          processed_at: null,
          rejection_reason: null,
          claim_token: claimToken,
          lease_expires_at: leaseExpiresAt,
        }),
      },
      signal,
    );
    return reclaimed.length > 0 ? { token: claimToken } : null;
  }

  async completeSnapshot(
    snapshotId: string,
    claimToken: string,
    outcome: "processed" | "failed",
    reason: string | null,
    now: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const query = new URLSearchParams({
      snapshot_id: `eq.${snapshotId}`,
      status: "eq.processing",
      claim_token: `eq.${claimToken}`,
      select: "snapshot_id",
    });
    const rows = await this.#rest<Array<{ snapshot_id: string }>>(
      `lr_processed_snapshots?${query}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          status: outcome,
          processed_at: now,
          rejection_reason: reason,
          claim_token: null,
          lease_expires_at: null,
        }),
      },
      signal,
    );
    return rows.length > 0;
  }

  async loadEnabledPreferences(signal?: AbortSignal): Promise<AlertPreference[]> {
    const query = new URLSearchParams({
      select:
        "user_id,target_price_enabled,free_game_enabled,weekly_digest_enabled,timezone,digest_day,digest_hour,unsubscribed_at",
      unsubscribed_at: "is.null",
      or: "(target_price_enabled.eq.true,free_game_enabled.eq.true,weekly_digest_enabled.eq.true)",
      order: "user_id.asc",
    });
    return await this.#allPages<AlertPreference>(
      `lr_notification_preferences?${query}`,
      signal,
    );
  }

  async loadWatchlists(
    userIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<AlertWatchlistEntry[]> {
    const all: AlertWatchlistEntry[] = [];
    for (let index = 0; index < userIds.length; index += USER_FILTER_BATCH_SIZE) {
      const batch = userIds.slice(index, index + USER_FILTER_BATCH_SIZE);
      const query = new URLSearchParams({
        select: "user_id,game_key,title,target_price",
        user_id: `in.(${batch.join(",")})`,
        deleted_at: "is.null",
        order: "user_id.asc,game_key.asc",
      });
      all.push(
        ...await this.#allPages<AlertWatchlistEntry>(
          `lr_watchlist?${query}`,
          signal,
        ),
      );
    }
    return all;
  }

  async loadPriorDeliveryKeys(
    userIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    for (let index = 0; index < userIds.length; index += USER_FILTER_BATCH_SIZE) {
      const batch = userIds.slice(index, index + USER_FILTER_BATCH_SIZE);
      const query = new URLSearchParams({
        select: "user_id,condition_key",
        user_id: `in.(${batch.join(",")})`,
        order: "user_id.asc,condition_key.asc",
      });
      const rows = await this.#allPages<{ user_id: string; condition_key: string }>(
        `lr_alert_deliveries?${query}`,
        signal,
      );
      for (const row of rows) {
        const keys = result.get(row.user_id) ?? new Set<string>();
        keys.add(row.condition_key);
        result.set(row.user_id, keys);
      }
    }
    return result;
  }

  async insertDeliveries(
    rows: AlertDeliveryRow[],
    signal?: AbortSignal,
  ): Promise<void> {
    for (let index = 0; index < rows.length; index += REST_PAGE_SIZE) {
      const batch = rows.slice(index, index + REST_PAGE_SIZE);
      await this.#rest(
        "lr_alert_deliveries?on_conflict=user_id,condition_key",
        {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify(batch.map((row) => ({
            id: row.id,
            user_id: row.user_id,
            alert_type: row.alert_type,
            game_key: row.game_key,
            condition_key: row.condition_key,
            snapshot_id: row.snapshot_id,
            status: row.status,
            attempt_count: row.attempt_count,
            next_attempt_at: row.next_attempt_at,
          }))),
        },
        signal,
      );
    }
  }

  async recoverSendingLeases(
    now: string,
    retrySafetyCutoff: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const exhausted = new URLSearchParams({
      status: "eq.sending",
      lease_expires_at: `lte.${now}`,
      attempt_count: `gte.${MAX_ATTEMPTS}`,
    });
    await this.#rest(`lr_alert_deliveries?${exhausted}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "failed",
        last_error: "Sending lease expired after the retry limit was reached",
        lease_token: null,
        lease_expires_at: null,
        updated_at: now,
      }),
    }, signal);

    const stale = new URLSearchParams({
      status: "eq.sending",
      lease_expires_at: `lte.${now}`,
      attempt_count: `lt.${MAX_ATTEMPTS}`,
      or: `(first_attempt_at.is.null,first_attempt_at.lt.${retrySafetyCutoff})`,
    });
    await this.#rest(`lr_alert_deliveries?${stale}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "failed",
        last_error: "Sending lease expired outside provider idempotency safety window",
        lease_token: null,
        lease_expires_at: null,
        updated_at: now,
      }),
    }, signal);

    const safe = new URLSearchParams({
      status: "eq.sending",
      lease_expires_at: `lte.${now}`,
      first_attempt_at: `gte.${retrySafetyCutoff}`,
      attempt_count: `lt.${MAX_ATTEMPTS}`,
    });
    await this.#rest(`lr_alert_deliveries?${safe}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "retryable",
        last_error: "Recovered expired sending lease within provider idempotency window",
        next_attempt_at: now,
        lease_token: null,
        lease_expires_at: null,
        updated_at: now,
      }),
    }, signal);
  }

  async listSendableDeliveries(
    limit: number,
    now: string,
    signal?: AbortSignal,
  ): Promise<AlertDeliveryRow[]> {
    const readStatus = async (status: "pending" | "retryable") => {
      const query = new URLSearchParams({
        select: "*",
        status: `eq.${status}`,
        next_attempt_at: `lte.${now}`,
        attempt_count: `lt.${MAX_ATTEMPTS}`,
        order: status === "pending" ? "created_at.asc" : "next_attempt_at.asc,created_at.asc",
      });
      return await this.#allPages<AlertDeliveryRow>(
        `lr_alert_deliveries?${query}`,
        signal,
        { maxRows: limit, pageSize: Math.min(50, limit) },
      );
    };
    const [pending, retryable] = await Promise.all([
      readStatus("pending"),
      readStatus("retryable"),
    ]);
    return fairDeliveryOrder(pending, retryable, limit);
  }

  async claimDelivery(
    row: AlertDeliveryRow,
    input: {
      leaseToken: string;
      now: string;
      leaseExpiresAt: string;
      maxAttempts: number;
    },
    signal?: AbortSignal,
  ): Promise<AlertDeliveryRow | null> {
    if (
      !Number.isSafeInteger(input.maxAttempts) ||
      input.maxAttempts < 1 ||
      row.attempt_count >= input.maxAttempts
    ) {
      return null;
    }
    const query = new URLSearchParams({
      id: `eq.${row.id}`,
      status: `eq.${row.status}`,
      and: `(attempt_count.eq.${row.attempt_count},attempt_count.lt.${input.maxAttempts})`,
      next_attempt_at: `lte.${input.now}`,
      select: "*",
    });
    const rows = await this.#rest<AlertDeliveryRow[]>(`lr_alert_deliveries?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "sending",
        attempt_count: row.attempt_count + 1,
        lease_token: input.leaseToken,
        lease_expires_at: input.leaseExpiresAt,
        first_attempt_at: row.first_attempt_at ?? input.now,
        last_attempt_at: input.now,
        updated_at: input.now,
      }),
    }, signal);
    return rows[0] ?? null;
  }

  async resolveUserEmail(
    userId: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    const response = await fetchBounded(
      this.#fetch,
      `${this.#url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          apikey: this.#serviceRoleKey,
          Authorization: `Bearer ${this.#serviceRoleKey}`,
        },
      },
      signal,
      this.#requestTimeoutMs,
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Supabase Auth request failed with HTTP ${response.status}`);
    }
    const user = await response.json() as { email?: unknown };
    return typeof user.email === "string" && user.email.trim() ? user.email.trim() : null;
  }

  async freezeDeliveryPayload(
    id: string,
    leaseToken: string,
    payload: FrozenEmailPayload,
    frozenIdempotencyKey: string,
    now: string,
    signal?: AbortSignal,
  ): Promise<AlertDeliveryRow | null> {
    const query = new URLSearchParams({
      id: `eq.${id}`,
      status: "eq.sending",
      lease_token: `eq.${leaseToken}`,
      email_payload: "is.null",
      select: "*",
    });
    const rows = await this.#rest<AlertDeliveryRow[]>(`lr_alert_deliveries?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        email_payload: payload,
        idempotency_key: frozenIdempotencyKey,
        payload_frozen_at: now,
        updated_at: now,
      }),
    }, signal);
    return rows[0] ?? null;
  }

  async updateDelivery(
    id: string,
    leaseToken: string,
    patch: Partial<AlertDeliveryRow>,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const allowed = {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.provider_message_id !== undefined
        ? { provider_message_id: patch.provider_message_id }
        : {}),
      ...(patch.last_error !== undefined ? { last_error: patch.last_error } : {}),
      ...(patch.delivered_at !== undefined ? { delivered_at: patch.delivered_at } : {}),
      ...(patch.next_attempt_at !== undefined ? { next_attempt_at: patch.next_attempt_at } : {}),
      ...(patch.lease_token !== undefined ? { lease_token: patch.lease_token } : {}),
      ...(patch.lease_expires_at !== undefined ? { lease_expires_at: patch.lease_expires_at } : {}),
      ...(patch.updated_at !== undefined ? { updated_at: patch.updated_at } : {}),
    };
    const query = new URLSearchParams({
      id: `eq.${id}`,
      status: "eq.sending",
      lease_token: `eq.${leaseToken}`,
      select: "id",
    });
    const rows = await this.#rest<Array<{ id: string }>>(
      `lr_alert_deliveries?${query}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(allowed),
      },
      signal,
    );
    return rows.length > 0;
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
      const response = await fetchBounded(
        fetch,
        SNAPSHOT_URL,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "LootRadar-Alerts/1.0",
          },
          redirect: "error",
        },
        signal,
        NETWORK_TIMEOUT_MS,
      );
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
