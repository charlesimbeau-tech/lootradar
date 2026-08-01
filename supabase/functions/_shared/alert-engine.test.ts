import assert from "node:assert/strict";

import {
  digestCandidates,
  digestKey,
  freeCandidates,
  freeKey,
  isDigestDue,
  targetCandidates,
  targetKey,
  validateSnapshot,
} from "./alert-engine.ts";

type DealOverride = Partial<{
  gameKey: string;
  title: string;
  salePrice: number;
  normalPrice: number;
  storeName: string;
  dealId: string;
  dealScore: number;
  recommendation: string;
  genres: string[];
  free: boolean;
}>;

const NOW = new Date("2026-07-31T14:15:00.000Z");

function makeDeal(index: number, overrides: DealOverride = {}) {
  const salePrice = overrides.salePrice ?? 5 + index;
  return {
    gameKey: overrides.gameKey ?? `steam:${1000 + index}`,
    title: overrides.title ?? `Quality Game ${index + 1}`,
    salePrice,
    normalPrice: overrides.normalPrice ?? salePrice + 20,
    storeName: overrides.storeName ?? `Store ${index % 6}`,
    dealId: overrides.dealId ?? `encoded-deal-${index}`,
    dealScore: overrides.dealScore ?? 100 - index,
    recommendation: overrides.recommendation ?? `Quality reason ${index + 1}`,
    genres: overrides.genres ?? [index % 2 === 0 ? "Action" : "RPG"],
    free: overrides.free ?? salePrice === 0,
  };
}

function makeSnapshot(
  overrides: Partial<{
    snapshotId: string;
    updatedAt: string;
    source: string;
    qualifiedDealCount: number;
    deals: ReturnType<typeof makeDeal>[];
  }> = {},
) {
  const deals = overrides.deals ?? Array.from({ length: 20 }, (_, index) => makeDeal(index));
  const updatedAt = overrides.updatedAt ?? "2026-07-31T12:00:00.000Z";
  return {
    snapshotId: overrides.snapshotId ?? updatedAt,
    updatedAt,
    source: overrides.source ?? "CheapShark-derived LootRadar quality snapshot",
    qualifiedDealCount: overrides.qualifiedDealCount ?? deals.length,
    deals,
  };
}

Deno.test("validateSnapshot accepts a current complete quality snapshot", () => {
  const snapshot = makeSnapshot();
  assert.equal(validateSnapshot(snapshot, NOW), snapshot);
});

Deno.test("validateSnapshot rejects snapshots older than eight hours", () => {
  const snapshot = makeSnapshot({
    snapshotId: "2026-07-31T06:14:59.999Z",
    updatedAt: "2026-07-31T06:14:59.999Z",
  });
  assert.throws(() => validateSnapshot(snapshot, NOW), /older than 8 hours/i);
});

Deno.test("validateSnapshot rejects fewer than twenty qualified deals", () => {
  const deals = Array.from({ length: 19 }, (_, index) => makeDeal(index));
  assert.throws(
    () => validateSnapshot(makeSnapshot({ deals, qualifiedDealCount: deals.length }), NOW),
    /at least 20/i,
  );
});

Deno.test("validateSnapshot rejects count mismatches, duplicate keys, unsafe IDs, and bad values", () => {
  assert.throws(
    () => validateSnapshot(makeSnapshot({ qualifiedDealCount: 21 }), NOW),
    /count does not match/i,
  );

  const duplicateDeals = Array.from(
    { length: 20 },
    (_, index) => makeDeal(index, index === 19 ? { gameKey: "steam:1000" } : {}),
  );
  assert.throws(
    () => validateSnapshot(makeSnapshot({ deals: duplicateDeals }), NOW),
    /duplicate game key/i,
  );

  const unsafeDeals = Array.from(
    { length: 20 },
    (_, index) => makeDeal(index, index === 0 ? { dealId: "raw/deal?id=1" } : {}),
  );
  assert.throws(
    () => validateSnapshot(makeSnapshot({ deals: unsafeDeals }), NOW),
    /encoded deal id/i,
  );

  const invalidDeals = Array.from(
    { length: 20 },
    (_, index) => makeDeal(index, index === 0 ? { dealScore: Number.NaN } : {}),
  );
  assert.throws(
    () => validateSnapshot(makeSnapshot({ deals: invalidDeals }), NOW),
    /deal score must be a finite/i,
  );
});

Deno.test("validateSnapshot rejects a timestamp over five minutes in the future", () => {
  const snapshot = makeSnapshot({
    snapshotId: "2026-07-31T14:20:00.001Z",
    updatedAt: "2026-07-31T14:20:00.001Z",
  });
  assert.throws(() => validateSnapshot(snapshot, NOW), /future/i);
});

Deno.test("target candidates use stable target and quarter-dollar price-band keys", () => {
  const snapshot = makeSnapshot({
    deals: [
      makeDeal(0, { gameKey: "steam:hades", title: "Hades", salePrice: 9.99 }),
      ...Array.from({ length: 19 }, (_, index) => makeDeal(index + 1)),
    ],
  });
  const watchlist = [{ game_key: "steam:hades", title: "Hades", target_price: 10 }];
  const expectedKey = "target:user-1:steam:hades:1000:39";

  const emitted = targetCandidates(snapshot, "user-1", watchlist, new Set());
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].conditionKey, expectedKey);
  assert.equal(emitted[0].targetPrice, 10);
  assert.equal(targetKey("user-1", "steam:hades", 10, 9.99), expectedKey);

  assert.deepEqual(
    targetCandidates(snapshot, "user-1", watchlist, new Set([expectedKey])),
    [],
  );

  const lowerSnapshot = makeSnapshot({
    deals: [
      makeDeal(0, { gameKey: "steam:hades", title: "Hades", salePrice: 9.49 }),
      ...Array.from({ length: 19 }, (_, index) => makeDeal(index + 1)),
    ],
  });
  const lowered = targetCandidates(lowerSnapshot, "user-1", watchlist, new Set([expectedKey]));
  assert.equal(lowered.length, 1);
  assert.equal(lowered[0].conditionKey, "target:user-1:steam:hades:1000:37");
});

Deno.test("free candidates emit once per encoded offer condition", () => {
  const freeDeal = makeDeal(0, {
    gameKey: "steam:free",
    title: "Free Quality Game",
    salePrice: 0,
    normalPrice: 19.99,
    dealId: "offer%2Fone%3D",
    free: true,
  });
  const snapshot = makeSnapshot({
    deals: [freeDeal, ...Array.from({ length: 19 }, (_, index) => makeDeal(index + 1))],
  });
  const expectedKey = "free:user-1:steam:free:offer%2Fone%3D";

  assert.equal(freeKey("user-1", "steam:free", "offer%2Fone%3D"), expectedKey);
  assert.equal(freeCandidates(snapshot, "user-1", new Set())[0].conditionKey, expectedKey);
  assert.deepEqual(freeCandidates(snapshot, "user-1", new Set([expectedKey])), []);
});

Deno.test("digest selects five distinct titles by score with store and family diversity", () => {
  const deals = [
    makeDeal(0, { title: "Hades", storeName: "Steam", dealScore: 100 }),
    makeDeal(1, { title: "Hades Complete Edition", storeName: "GOG", dealScore: 99 }),
    makeDeal(2, { title: "Portal 2", storeName: "Steam", dealScore: 98 }),
    makeDeal(3, { title: "Disco Elysium", storeName: "GOG", dealScore: 97 }),
    makeDeal(4, { title: "Celeste", storeName: "Fanatical", dealScore: 96 }),
    makeDeal(5, { title: "Slay the Spire", storeName: "Humble Store", dealScore: 95 }),
    makeDeal(6, { title: "Into the Breach", storeName: "GreenManGaming", dealScore: 94 }),
    ...Array.from({ length: 13 }, (_, index) => makeDeal(index + 7, { dealScore: 80 - index })),
  ];
  const candidate = digestCandidates(makeSnapshot({ deals }), "user-1", "2026-W31", new Set())[0];

  assert.equal(candidate.conditionKey, digestKey("user-1", "2026-W31"));
  assert.equal(candidate.deals.length, 5);
  assert.equal(candidate.deals[0].title, "Hades");
  assert.equal(new Set(candidate.deals.map((deal) => deal.title.toLowerCase())).size, 5);
  assert.ok(new Set(candidate.deals.map((deal) => deal.storeName)).size >= 4);
  assert.ok(!candidate.deals.some((deal) => deal.title === "Hades Complete Edition"));
});

Deno.test("digest candidates suppress a week that already has a delivery key", () => {
  const snapshot = makeSnapshot();
  const key = digestKey("user-1", "2026-W31");
  assert.deepEqual(digestCandidates(snapshot, "user-1", "2026-W31", new Set([key])), []);
});

Deno.test("digest personalization enforces budget, stores, dislikes, and ranks genre matches", () => {
  const deals = [
    makeDeal(0, {
      title: "Wrong Store",
      storeName: "GOG",
      salePrice: 5,
      dealScore: 100,
      genres: ["RPG"],
    }),
    makeDeal(1, {
      title: "Over Budget",
      storeName: "Steam",
      salePrice: 25,
      dealScore: 99,
      genres: ["RPG"],
    }),
    makeDeal(2, {
      title: "Disliked",
      storeName: "Steam",
      salePrice: 5,
      dealScore: 98,
      dealId: "disliked",
      genres: ["RPG"],
    }),
    makeDeal(3, {
      title: "Genre Match",
      storeName: "Steam",
      salePrice: 9,
      dealScore: 70,
      genres: ["RPG"],
    }),
    makeDeal(4, {
      title: "Liked Match",
      storeName: "Steam",
      salePrice: 10,
      dealScore: 69,
      gameKey: "steam:444",
      genres: ["Strategy"],
    }),
    ...Array.from({ length: 15 }, (_, index) =>
      makeDeal(index + 5, {
        storeName: "Steam",
        salePrice: 10,
        dealScore: 68 - index,
        genres: [index < 4 ? "RPG" : "Action"],
      })),
  ];
  const candidate = digestCandidates(
    makeSnapshot({ deals }),
    "user-1",
    "2026-W31",
    new Set(),
    {
      budget: 10,
      genres: ["RPG"],
      stores: ["Steam"],
      likes: { "app-444": "2026-07-30T10:00:00.000Z" },
      dislikes: { disliked: "2026-07-30T10:00:00.000Z" },
    },
  )[0];

  assert.equal(candidate.deals.length, 5);
  assert.equal(candidate.deals[0].title, "Liked Match");
  assert.ok(candidate.deals.some((deal) => deal.title === "Genre Match"));
  assert.ok(candidate.deals.every((deal) => deal.salePrice <= 10));
  assert.ok(candidate.deals.every((deal) => deal.storeName === "Steam"));
  assert.ok(!candidate.deals.some((deal) => deal.dealId === "disliked"));
});

Deno.test("Friday 10:00 digest is due only in its saved IANA time-zone hour", () => {
  const preference = {
    timezone: "America/New_York",
    digest_day: 5,
    digest_hour: 10,
  };

  assert.equal(
    isDigestDue(preference, new Date("2026-07-31T14:00:00.000Z")),
    "2026-W31",
  );
  assert.equal(
    isDigestDue(preference, new Date("2026-07-31T14:59:59.999Z")),
    "2026-W31",
  );
  assert.equal(isDigestDue(preference, new Date("2026-07-31T13:59:59.999Z")), null);
  assert.equal(isDigestDue(preference, new Date("2026-07-31T15:00:00.000Z")), null);
  assert.equal(isDigestDue(preference, new Date("2026-08-01T14:15:00.000Z")), null);
});

Deno.test("digest due logic follows daylight saving changes and rejects invalid preferences", () => {
  const preference = {
    timezone: "America/New_York",
    digest_day: 5,
    digest_hour: 10,
  };

  assert.equal(
    isDigestDue(preference, new Date("2026-12-04T15:30:00.000Z")),
    "2026-W49",
  );
  assert.equal(
    isDigestDue({ ...preference, timezone: "Not/AZone" }, NOW),
    null,
  );
  assert.equal(
    isDigestDue({ ...preference, digest_hour: 24 }, NOW),
    null,
  );
});
