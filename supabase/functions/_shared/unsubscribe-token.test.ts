import assert from "node:assert/strict";

import { signUnsubscribe, verifyUnsubscribe } from "./unsubscribe-token.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET = "a-test-secret-that-is-long-enough-for-hmac";

Deno.test("unsubscribe tokens round-trip for every allowed category", async () => {
  const expiresAt = new Date(Date.now() + 30 * DAY_MS - 1_000).toISOString();

  for (
    const category of ["target_price", "free_game", "weekly_digest", "all"] as const
  ) {
    const token = await signUnsubscribe(
      { userId: "user-123", category, expiresAt },
      SECRET,
    );
    const payload = await verifyUnsubscribe(
      token,
      SECRET,
      new Date(expiresAt).getTime() - 1,
    );

    assert.deepEqual(payload, { userId: "user-123", category, expiresAt });
    assert.equal(token.split(".").length, 2);
    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  }
});

Deno.test("unsubscribe token verification rejects tampering and the wrong secret", async () => {
  const token = await signUnsubscribe(
    {
      userId: "user-123",
      category: "target_price",
      expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
    },
    SECRET,
  );
  const [payload, signature] = token.split(".");
  const tampered = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}.${signature}`;

  await assert.rejects(
    () => verifyUnsubscribe(tampered, SECRET),
    /invalid unsubscribe token/i,
  );
  await assert.rejects(
    () => verifyUnsubscribe(token, "a-different-secret-that-is-long-enough"),
    /invalid unsubscribe token/i,
  );
});

Deno.test("unsubscribe tokens expire and cannot exceed a 30-day lifetime", async () => {
  const expiresAt = new Date(Date.now() + 30 * DAY_MS - 1_000).toISOString();
  const token = await signUnsubscribe(
    { userId: "user-123", category: "free_game", expiresAt },
    SECRET,
  );

  await assert.rejects(
    () => verifyUnsubscribe(token, SECRET, new Date(expiresAt).getTime()),
    /expired/i,
  );
  await assert.rejects(
    () =>
      signUnsubscribe(
        {
          userId: "user-123",
          category: "all",
          expiresAt: new Date(Date.now() + 31 * DAY_MS).toISOString(),
        },
        SECRET,
      ),
    /30 days/i,
  );
});

Deno.test("unsubscribe token creation and verification reject malformed input", async () => {
  await assert.rejects(
    () =>
      signUnsubscribe(
        {
          userId: "",
          category: "all",
          expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
        },
        SECRET,
      ),
    /user id/i,
  );
  await assert.rejects(
    () =>
      signUnsubscribe(
        {
          userId: "user-123",
          category: "marketing" as "all",
          expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
        },
        SECRET,
      ),
    /category/i,
  );
  await assert.rejects(
    () => verifyUnsubscribe("not-a-token", SECRET),
    /invalid unsubscribe token/i,
  );
});
