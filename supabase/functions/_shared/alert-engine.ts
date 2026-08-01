const SNAPSHOT_SOURCE = "CheapShark-derived LootRadar quality snapshot";
const MINIMUM_QUALIFIED_DEALS = 20;
const MAXIMUM_SNAPSHOT_AGE_MS = 8 * 60 * 60 * 1000;
const MAXIMUM_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SAFE_ENCODED_DEAL_ID = /^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$/;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type AlertDeal = Readonly<{
  gameKey: string;
  title: string;
  salePrice: number;
  normalPrice: number;
  storeName: string;
  dealId: string;
  dealScore: number;
  recommendation: string;
  genres: readonly string[];
  free: boolean;
}>;

export type AlertSnapshot = Readonly<{
  snapshotId: string;
  updatedAt: string;
  source: string;
  qualifiedDealCount: number;
  deals: readonly AlertDeal[];
}>;

export type WatchlistEntry = Readonly<{
  game_key: string;
  title?: string;
  target_price: number;
}>;

export type TargetCandidate = Readonly<{
  alertType: "target_price";
  conditionKey: string;
  snapshotId: string;
  gameKey: string;
  targetPrice: number;
  deal: AlertDeal;
}>;

export type FreeCandidate = Readonly<{
  alertType: "free_game";
  conditionKey: string;
  snapshotId: string;
  gameKey: string;
  deal: AlertDeal;
}>;

export type DigestCandidate = Readonly<{
  alertType: "weekly_digest";
  conditionKey: string;
  snapshotId: string;
  weekKey: string;
  deals: readonly AlertDeal[];
  personalized: boolean;
}>;

export type DigestPreference = Readonly<{
  timezone: string;
  digest_day: number;
  digest_hour: number;
}>;

export type DigestProfile = Readonly<{
  budget: number | null;
  genres: readonly string[];
  stores: readonly string[];
  genreMatchMode: "any" | "all";
  likes: ReadonlySet<string>;
  dislikes: ReadonlySet<string>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  const hasControlCharacters = typeof value === "string" &&
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    });
  if (typeof value !== "string" || value.trim() === "" || hasControlCharacters) {
    throw new TypeError(`${label} must be a non-empty string without control characters`);
  }
}

function requireFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
}

function validateDeal(value: unknown, index: number): asserts value is AlertDeal {
  if (!isRecord(value)) {
    throw new TypeError(`Deal ${index} must be an object`);
  }

  requireNonEmptyString(value.gameKey, `Deal ${index} game key`);
  requireNonEmptyString(value.title, `Deal ${index} title`);
  requireNonEmptyString(value.storeName, `Deal ${index} store name`);
  requireNonEmptyString(value.recommendation, `Deal ${index} recommendation`);
  requireNonEmptyString(value.dealId, `Deal ${index} deal ID`);

  if (!Array.isArray(value.genres) || value.genres.length > 20) {
    throw new TypeError(`Deal ${index} genres must be an array of at most 20 values`);
  }
  const genreKeys = new Set<string>();
  value.genres.forEach((genre, genreIndex) => {
    requireNonEmptyString(genre, `Deal ${index} genre ${genreIndex}`);
    if (genre.length > 80) throw new TypeError(`Deal ${index} genre is too long`);
    const key = genre.normalize("NFKC").trim().toLocaleLowerCase("en");
    if (key !== genre.toLocaleLowerCase("en") || genreKeys.has(key)) {
      throw new TypeError(`Deal ${index} genres must be normalized and distinct`);
    }
    genreKeys.add(key);
  });

  if (!SAFE_ENCODED_DEAL_ID.test(value.dealId)) {
    throw new TypeError(`Deal ${index} must use an HTTPS-safe encoded deal ID`);
  }
  try {
    decodeURIComponent(value.dealId);
  } catch {
    throw new TypeError(`Deal ${index} must use a valid encoded deal ID`);
  }

  requireFiniteNumber(value.salePrice, `Deal ${index} sale price`);
  requireFiniteNumber(value.normalPrice, `Deal ${index} normal price`);
  requireFiniteNumber(value.dealScore, `Deal ${index} deal score`);

  if (value.salePrice < 0 || value.normalPrice < 0) {
    throw new RangeError(`Deal ${index} prices must be non-negative`);
  }
  if (value.dealScore < 0 || value.dealScore > 100) {
    throw new RangeError(`Deal ${index} deal score must be between 0 and 100`);
  }
  if (typeof value.free !== "boolean" || value.free !== (value.salePrice === 0)) {
    throw new TypeError(`Deal ${index} free flag must exactly match a zero sale price`);
  }
}

/**
 * Validates the server-consumed snapshot and returns the same object with a
 * narrowed type. Invalid data always throws before any candidate is selected.
 */
export function validateSnapshot(snapshot: unknown, now: Date = new Date()): AlertSnapshot {
  if (!isRecord(snapshot)) {
    throw new TypeError("Alert snapshot must be an object");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("Current time must be a valid Date");
  }

  requireNonEmptyString(snapshot.snapshotId, "Snapshot ID");
  requireNonEmptyString(snapshot.updatedAt, "Snapshot updatedAt");
  if (snapshot.snapshotId !== snapshot.updatedAt) {
    throw new TypeError("Snapshot ID must exactly match updatedAt");
  }
  if (snapshot.source !== SNAPSHOT_SOURCE) {
    throw new TypeError("Snapshot source is not the supported LootRadar quality source");
  }
  if (!Number.isInteger(snapshot.qualifiedDealCount)) {
    throw new TypeError("Snapshot qualified deal count must be an integer");
  }
  if (!Array.isArray(snapshot.deals)) {
    throw new TypeError("Snapshot deals must be an array");
  }
  if (snapshot.qualifiedDealCount !== snapshot.deals.length) {
    throw new RangeError("Snapshot qualified deal count does not match the deals array");
  }
  if (snapshot.qualifiedDealCount < MINIMUM_QUALIFIED_DEALS) {
    throw new RangeError(
      `Snapshot must contain at least ${MINIMUM_QUALIFIED_DEALS} qualified deals`,
    );
  }

  const updatedAtMs = Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    throw new TypeError("Snapshot updatedAt must be a valid ISO timestamp");
  }
  if (updatedAtMs > now.getTime() + MAXIMUM_CLOCK_SKEW_MS) {
    throw new RangeError("Snapshot updatedAt is too far in the future");
  }
  if (now.getTime() - updatedAtMs > MAXIMUM_SNAPSHOT_AGE_MS) {
    throw new RangeError("Snapshot is older than 8 hours");
  }

  const gameKeys = new Set<string>();
  snapshot.deals.forEach((deal, index) => {
    validateDeal(deal, index);
    if (gameKeys.has(deal.gameKey)) {
      throw new TypeError(`Snapshot contains duplicate game key: ${deal.gameKey}`);
    }
    gameKeys.add(deal.gameKey);
  });

  return snapshot as unknown as AlertSnapshot;
}

export const targetKey = (
  userId: string,
  gameKey: string,
  targetPrice: number,
  currentPrice: number,
): string =>
  `target:${userId}:${gameKey}:${Math.floor(targetPrice * 100)}:${Math.floor(currentPrice * 4)}`;

export const freeKey = (userId: string, gameKey: string, dealId: string): string =>
  `free:${userId}:${gameKey}:${dealId}`;

export const digestKey = (userId: string, week: string): string => `digest:${userId}:${week}`;

export function targetCandidates(
  snapshot: AlertSnapshot,
  userId: string,
  watchlist: readonly WatchlistEntry[],
  priorKeys: ReadonlySet<string>,
): TargetCandidate[] {
  const watchedByGame = new Map<string, WatchlistEntry>();
  for (const entry of watchlist) {
    if (
      typeof entry?.game_key === "string" &&
      entry.game_key !== "" &&
      Number.isFinite(entry.target_price) &&
      entry.target_price >= 0
    ) {
      watchedByGame.set(entry.game_key, entry);
    }
  }

  const candidates: TargetCandidate[] = [];
  for (const deal of snapshot.deals) {
    const watched = watchedByGame.get(deal.gameKey);
    if (!watched || deal.salePrice > watched.target_price) continue;

    const conditionKey = targetKey(
      userId,
      deal.gameKey,
      watched.target_price,
      deal.salePrice,
    );
    if (priorKeys.has(conditionKey)) continue;

    candidates.push({
      alertType: "target_price",
      conditionKey,
      snapshotId: snapshot.snapshotId,
      gameKey: deal.gameKey,
      targetPrice: watched.target_price,
      deal,
    });
  }
  return candidates;
}

export function freeCandidates(
  snapshot: AlertSnapshot,
  userId: string,
  priorKeys: ReadonlySet<string>,
): FreeCandidate[] {
  const candidates: FreeCandidate[] = [];
  for (const deal of snapshot.deals) {
    if (!deal.free || deal.salePrice !== 0) continue;

    const conditionKey = freeKey(userId, deal.gameKey, deal.dealId);
    if (priorKeys.has(conditionKey)) continue;
    candidates.push({
      alertType: "free_game",
      conditionKey,
      snapshotId: snapshot.snapshotId,
      gameKey: deal.gameKey,
      deal,
    });
  }
  return candidates;
}

function compareDeals(a: AlertDeal, b: AlertDeal): number {
  return b.dealScore - a.dealScore ||
    a.title.localeCompare(b.title, "en", { sensitivity: "base" }) ||
    a.gameKey.localeCompare(b.gameKey);
}

function normalizedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.normalize("NFKC").trim().toLocaleLowerCase("en");
    if (!normalized || normalized.length > 100 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length === 50) break;
  }
  return result;
}

function actionKeys(value: unknown): Set<string> {
  if (!isRecord(value)) return new Set();
  return new Set(
    Object.keys(value)
      .map((key) => key.trim())
      .filter((key) => key.length > 0 && key.length <= 256),
  );
}

export function normalizeDigestProfile(value: unknown): DigestProfile {
  const profile = isRecord(value) ? value : {};
  const rawBudget = profile.budget === null || profile.budget === ""
    ? Number.NaN
    : Number(profile.budget);
  return {
    budget: Number.isFinite(rawBudget) && rawBudget >= 0 && rawBudget <= 10_000 ? rawBudget : null,
    genres: normalizedStringList(profile.genres),
    stores: normalizedStringList(profile.stores),
    genreMatchMode: profile.genreMatchMode === "all" ? "all" : "any",
    likes: actionKeys(profile.likes),
    dislikes: actionKeys(profile.dislikes),
  };
}

function profileReferencesDeal(keys: ReadonlySet<string>, deal: AlertDeal): boolean {
  if (keys.has(deal.dealId) || keys.has(deal.gameKey)) return true;
  if (deal.gameKey.startsWith("steam:")) {
    return keys.has(`app-${deal.gameKey.slice("steam:".length)}`);
  }
  return false;
}

function titleFamily(title: string): string {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(
      /\b(game of the year|goty|complete|ultimate|definitive|deluxe|gold|premium|collector'?s|edition|bundle|collection|remaster(?:ed)?)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function chooseDigestDeals(
  deals: readonly AlertDeal[],
  profileValue?: unknown,
): AlertDeal[] {
  const profile = normalizeDigestProfile(profileValue);
  const trustedStores = new Set(profile.stores);
  const preferredGenres = new Set(profile.genres);
  const personalizedScore = (deal: AlertDeal): number => {
    const dealGenres = deal.genres.map((genre) => genre.toLocaleLowerCase("en"));
    const matches = dealGenres.filter((genre) => preferredGenres.has(genre)).length;
    const genreBoost = profile.genres.length === 0
      ? 0
      : profile.genreMatchMode === "all"
      ? (matches === profile.genres.length ? 15 : 0)
      : 15 * Math.min(1, matches / profile.genres.length);
    return deal.dealScore + genreBoost + (profileReferencesDeal(profile.likes, deal) ? 30 : 0);
  };
  const exactTitles = new Set<string>();
  const remaining = [...deals]
    .filter((deal) => profile.budget === null || deal.salePrice <= profile.budget)
    .filter((deal) =>
      trustedStores.size === 0 || trustedStores.has(deal.storeName.toLocaleLowerCase("en"))
    )
    .filter((deal) => !profileReferencesDeal(profile.dislikes, deal))
    .sort((a, b) => personalizedScore(b) - personalizedScore(a) || compareDeals(a, b))
    .filter((deal) => {
      const normalizedTitle = deal.title.normalize("NFKC").toLocaleLowerCase("en");
      if (exactTitles.has(normalizedTitle)) return false;
      exactTitles.add(normalizedTitle);
      return true;
    });
  if (remaining.length === 0) return [];

  const selected: AlertDeal[] = [];
  const usedStores = new Set<string>();
  const usedFamilies = new Set<string>();

  while (selected.length < 5 && remaining.length > 0) {
    const index = remaining.findIndex((deal) =>
      !usedStores.has(deal.storeName) && !usedFamilies.has(titleFamily(deal.title))
    );
    const familyIndex = remaining.findIndex((deal) => !usedFamilies.has(titleFamily(deal.title)));
    const storeIndex = remaining.findIndex((deal) => !usedStores.has(deal.storeName));
    const chosenIndex = index >= 0
      ? index
      : familyIndex >= 0
      ? familyIndex
      : storeIndex >= 0
      ? storeIndex
      : 0;
    const [deal] = remaining.splice(chosenIndex, 1);
    selected.push(deal);
    usedStores.add(deal.storeName);
    usedFamilies.add(titleFamily(deal.title));
  }

  return selected;
}

export function digestCandidates(
  snapshot: AlertSnapshot,
  userId: string,
  weekKey: string,
  priorKeys: ReadonlySet<string>,
  profile?: unknown,
): DigestCandidate[] {
  const conditionKey = digestKey(userId, weekKey);
  if (priorKeys.has(conditionKey)) return [];

  const deals = chooseDigestDeals(snapshot.deals, profile);
  if (deals.length < 5) return [];
  const normalizedProfile = normalizeDigestProfile(profile);
  return [{
    alertType: "weekly_digest",
    conditionKey,
    snapshotId: snapshot.snapshotId,
    weekKey,
    deals,
    personalized: normalizedProfile.budget !== null ||
      normalizedProfile.genres.length > 0 ||
      normalizedProfile.stores.length > 0 ||
      normalizedProfile.likes.size > 0 ||
      normalizedProfile.dislikes.size > 0,
  }];
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

/**
 * Returns the local calendar's stable ISO-week key for the configured hour, or
 * null outside that hour. Duplicate suppression remains the responsibility of
 * digestCandidates(), which has the user's delivery-key set.
 */
export function isDigestDue(
  preference: DigestPreference,
  now: Date = new Date(),
): string | null {
  if (
    !isRecord(preference) ||
    typeof preference.timezone !== "string" ||
    !Number.isInteger(preference.digest_day) ||
    preference.digest_day < 0 ||
    preference.digest_day > 6 ||
    !Number.isInteger(preference.digest_hour) ||
    preference.digest_hour < 0 ||
    preference.digest_hour > 23 ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    return null;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: preference.timezone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (
      values.weekday !== DAY_NAMES[preference.digest_day] ||
      Number(values.hour) !== preference.digest_hour
    ) {
      return null;
    }

    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    if (![year, month, day].every(Number.isInteger)) return null;
    return isoWeekKey(year, month, day);
  } catch {
    return null;
  }
}
