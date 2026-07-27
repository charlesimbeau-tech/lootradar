import assert from "node:assert/strict";

import { createResendProvider, EmailProviderError } from "./email-provider.ts";
import {
  renderFreeGameEmail,
  renderTargetPriceEmail,
  renderWeeklyDigestEmail,
} from "./email-templates.ts";

const CATEGORY_URL = "https://api.example.test/unsubscribe?token=category-token";
const ALL_URL = "https://api.example.test/unsubscribe?token=all-token";
const LOOTRADAR_URL = "https://thelootradar.com/deals/";
const RAW_USER_ID = "0f82c908-raw-user-id";

const messages = [
  renderTargetPriceEmail({
    title: "Hades",
    salePrice: 9.99,
    targetPrice: 10,
    storeName: "Steam",
    lootRadarUrl: LOOTRADAR_URL,
    categoryUnsubscribeUrl: CATEGORY_URL,
    allUnsubscribeUrl: ALL_URL,
  }),
  renderFreeGameEmail({
    title: "A Free Game",
    normalPrice: 19.99,
    storeName: "GOG",
    lootRadarUrl: LOOTRADAR_URL,
    categoryUnsubscribeUrl: CATEGORY_URL,
    allUnsubscribeUrl: ALL_URL,
  }),
  renderWeeklyDigestEmail({
    deals: [
      { title: "Hades", salePrice: 9.99, storeName: "Steam", dealScore: 94 },
      { title: "Celeste", salePrice: 4.99, storeName: "GOG", dealScore: 92 },
      { title: "Portal 2", salePrice: 0.99, storeName: "Steam", dealScore: 91 },
      { title: "Disco Elysium", salePrice: 7.99, storeName: "Humble", dealScore: 90 },
      { title: "Into the Breach", salePrice: 5.99, storeName: "Fanatical", dealScore: 89 },
    ],
    lootRadarUrl: LOOTRADAR_URL,
    categoryUnsubscribeUrl: CATEGORY_URL,
    allUnsubscribeUrl: ALL_URL,
  }),
];

Deno.test("every email template includes required links, caveats, and no raw user ID", () => {
  for (const message of messages) {
    for (const rendered of [message.html, message.text]) {
      assert.match(rendered, /retailer.+authoritative.+final price.+availability/is);
      assert.ok(rendered.includes(LOOTRADAR_URL));
      assert.ok(rendered.includes(CATEGORY_URL));
      assert.ok(rendered.includes(ALL_URL));
      assert.ok(!rendered.includes(RAW_USER_ID));
    }
  }
});

Deno.test("free-game email states the CheapShark-derived coverage limit", () => {
  const message = messages[1];
  assert.match(message.html, /coverage is limited.+CheapShark-derived snapshot/is);
  assert.match(message.text, /coverage is limited.+CheapShark-derived snapshot/is);
});

Deno.test("templates escape user-controlled deal content", () => {
  const message = renderTargetPriceEmail({
    title: "<script>alert('x')</script>",
    salePrice: 1,
    targetPrice: 2,
    storeName: "Store & Sons",
    lootRadarUrl: LOOTRADAR_URL,
    categoryUnsubscribeUrl: CATEGORY_URL,
    allUnsubscribeUrl: ALL_URL,
  });

  assert.ok(!message.html.includes("<script>"));
  assert.ok(message.html.includes("&lt;script&gt;"));
  assert.ok(message.html.includes("Store &amp; Sons"));
});

Deno.test("Resend adapter builds the expected request without real network access", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl: typeof fetch = (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return Promise.resolve(Response.json({ id: "email-123" }));
  };
  const provider = createResendProvider({
    apiKey: "re_test_key",
    from: "LootRadar <deals@thelootradar.com>",
    fetchImpl,
  });
  const message = {
    to: "reader@example.com",
    ...messages[0],
    allUnsubscribeUrl: ALL_URL,
  };

  assert.deepEqual(await provider.send(message, "delivery-key-123"), { id: "email-123" });
  assert.equal(capturedUrl, "https://api.resend.com/emails");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(capturedInit?.redirect, "manual");

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("authorization"), "Bearer re_test_key");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("user-agent"), "LootRadar-Alerts/1.0");
  assert.equal(headers.get("idempotency-key"), "delivery-key-123");

  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.from, "LootRadar <deals@thelootradar.com>");
  assert.equal(body.to, "reader@example.com");
  assert.equal(body.headers["List-Unsubscribe"], `<${ALL_URL}>`);
  assert.equal(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

Deno.test("Resend adapter classifies HTTP and network failures", async () => {
  for (
    const [status, retryable] of [
      [307, false],
      [400, false],
      [408, true],
      [429, true],
      [500, true],
      [503, true],
    ] as const
  ) {
    const provider = createResendProvider({
      apiKey: "re_test_key",
      from: "LootRadar <deals@thelootradar.com>",
      fetchImpl: () =>
        Promise.resolve(
          Response.json({ message: `provider status ${status}` }, { status }),
        ),
    });

    await assert.rejects(
      () =>
        provider.send(
          { to: "reader@example.com", ...messages[0], allUnsubscribeUrl: ALL_URL },
          `delivery-${status}`,
        ),
      (error) => {
        assert.ok(error instanceof EmailProviderError);
        assert.equal(error.status, status);
        assert.equal(error.retryable, retryable);
        return true;
      },
    );
  }

  const networkProvider = createResendProvider({
    apiKey: "re_test_key",
    from: "LootRadar <deals@thelootradar.com>",
    fetchImpl: () => Promise.reject(new TypeError("offline")),
  });
  await assert.rejects(
    () =>
      networkProvider.send(
        { to: "reader@example.com", ...messages[0], allUnsubscribeUrl: ALL_URL },
        "delivery-network",
      ),
    (error) => {
      assert.ok(error instanceof EmailProviderError);
      assert.equal(error.retryable, true);
      assert.equal(error.status, undefined);
      return true;
    },
  );
});
