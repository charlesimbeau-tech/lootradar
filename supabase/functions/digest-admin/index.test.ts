import assert from "node:assert/strict";
import { createDigestAdminHandler, type DigestAdminDependencies } from "./index.ts";

const NOW = new Date("2026-08-07T14:07:00.000Z");

function snapshot() {
  return {
    snapshotId: "2026-08-07T13:30:00.000Z",
    updatedAt: "2026-08-07T13:30:00.000Z",
    source: "CheapShark-derived LootRadar quality snapshot",
    qualifiedDealCount: 20,
    deals: Array.from({ length: 20 }, (_, index) => ({
      gameKey: `steam:${index}`,
      title: `Game ${index}`,
      salePrice: index + 1,
      normalPrice: 50,
      storeName: index < 10 ? "Steam" : "GOG",
      dealId: `deal-${index}`,
      dealScore: 100 - index,
      recommendation: `Reason ${index}`,
      genres: [index % 2 ? "RPG" : "Action"],
      free: false,
    })),
  };
}

function dependencies(overrides: Partial<DigestAdminDependencies> = {}) {
  const sent: Array<{ message: unknown; key: string }> = [];
  const deps: DigestAdminDependencies = {
    adminUserIds: new Set(["admin-user"]),
    async resolveCaller() {
      return { id: "admin-user", email: "admin@example.test" };
    },
    async fetchSnapshot() {
      return snapshot();
    },
    async loadProfile() {
      return { budget: 10, genres: ["RPG"], stores: ["Steam"], likes: {}, dislikes: {} };
    },
    async sendEmail(message, key) {
      sent.push({ message, key });
      return { id: "provider-message" };
    },
    async signToken(input) {
      return `signed-${input.category}`;
    },
    now: () => NOW,
    ...overrides,
  };
  return { deps, sent };
}

function request(action: string) {
  return new Request("https://project.supabase.co/functions/v1/digest-admin", {
    method: "POST",
    headers: { Authorization: "Bearer session", "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

Deno.test("rejects missing sessions and authenticated non-admin callers", async () => {
  const missing = dependencies({ resolveCaller: async () => null });
  assert.equal((await createDigestAdminHandler(missing.deps)(request("preview"))).status, 401);

  const forbidden = dependencies({ adminUserIds: new Set() });
  assert.equal((await createDigestAdminHandler(forbidden.deps)(request("preview"))).status, 403);
});

Deno.test("previews exactly five personalized safe deal fields without sending", async () => {
  const setup = dependencies();
  const response = await createDigestAdminHandler(setup.deps)(request("preview"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.deals.length, 5);
  assert.ok(
    body.deals.every((deal: { salePrice: number; storeName: string }) =>
      deal.salePrice <= 10 && deal.storeName === "Steam"
    ),
  );
  assert.match(body.subject, /picked for you/i);
  assert.equal(setup.sent.length, 0);
  assert.equal("html" in body, false);
});

Deno.test("test send delivers only to the authenticated admin with unsubscribe headers", async () => {
  const setup = dependencies();
  const response = await createDigestAdminHandler(setup.deps)(request("send_test"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.providerMessageId, "provider-message");
  assert.equal(setup.sent.length, 1);
  const message = setup.sent[0].message as {
    to: string;
    subject: string;
    allUnsubscribeUrl: string;
  };
  assert.equal(message.to, "admin@example.test");
  assert.match(message.subject, /^\[Test\]/);
  assert.match(message.allUnsubscribeUrl, /signed-all/);
  assert.match(setup.sent[0].key, /^lootradar:digest-preview:admin-user:/);
});
