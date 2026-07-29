const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeEvent,
  sanitizeProperties,
  campaignProperties,
  resultBucket,
  priceBucket,
  track
} = require('../lib/analytics.js');

test('allows known event names and safe scalar properties', () => {
  assert.equal(sanitizeEvent('deal_click'), 'deal_click');
  assert.deepEqual(
    sanitizeProperties({
      surface: 'homepage_card',
      store: 'Steam',
      resultBucket: '10-24',
      signedIn: false
    }),
    {
      surface: 'homepage_card',
      store: 'Steam',
      resultBucket: '10-24',
      signedIn: 'false'
    }
  );
});

test('drops sensitive and unknown properties', () => {
  assert.deepEqual(
    sanitizeProperties({
      email: 'person@example.com',
      query: 'private title',
      userId: '7',
      preferenceProfile: '{"genres":["RPG"]}',
      surface: 'games'
    }),
    { surface: 'games' }
  );
  assert.equal(sanitizeEvent('page_view'), null);
});

test('accepts only stable privacy-safe campaign attribution values', () => {
  assert.deepEqual(
    sanitizeProperties({
      surface: 'weekly_roundup',
      campaignSource: 'discord',
      campaignMedium: 'community',
      campaignName: 'weekly-deals-2026-07-29'
    }),
    {
      surface: 'weekly_roundup',
      campaignSource: 'discord',
      campaignMedium: 'community',
      campaignName: 'weekly-deals-2026-07-29'
    }
  );
  assert.deepEqual(
    sanitizeProperties({
      campaignSource: 'person@example.com',
      campaignMedium: 'private-message',
      campaignName: 'charles-private-campaign'
    }),
    {}
  );
});

test('captures a valid first-touch campaign and keeps it for later actions', () => {
  const storage = new Map();
  const fakeRoot = {
    location: {
      search: '?utm_source=bluesky&utm_medium=social&utm_campaign=weekly-deals-2026-07-29'
    },
    sessionStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, value);
      }
    }
  };

  assert.deepEqual(campaignProperties(fakeRoot), {
    campaignSource: 'bluesky',
    campaignMedium: 'social',
    campaignName: 'weekly-deals-2026-07-29'
  });

  fakeRoot.location.search = '?utm_source=reddit&utm_medium=community&utm_campaign=site-launch';
  assert.deepEqual(campaignProperties(fakeRoot), {
    campaignSource: 'bluesky',
    campaignMedium: 'social',
    campaignName: 'weekly-deals-2026-07-29'
  });
});

test('ignores incomplete, unknown, and malformed campaign parameters', () => {
  assert.deepEqual(campaignProperties({
    location: { search: '?utm_source=discord&utm_campaign=weekly-deals-2026-07-29' },
    sessionStorage: { getItem: () => null, setItem: () => {} }
  }), {});
  assert.deepEqual(campaignProperties({
    location: {
      search: '?utm_source=person%40example.com&utm_medium=social&utm_campaign=weekly-deals-2026-07-29'
    },
    sessionStorage: { getItem: () => null, setItem: () => {} }
  }), {});
  assert.deepEqual(campaignProperties({
    location: { search: '?utm_source=%E0%A4%A' },
    sessionStorage: { getItem: () => null, setItem: () => {} }
  }), {});
});

test('allows only privacy-safe account sync outcomes', () => {
  assert.equal(sanitizeEvent('account_sync'), 'account_sync');
  assert.deepEqual(
    sanitizeProperties({
      result: 'success',
      email: 'person@example.com',
      userId: 'user-123',
      gameId: 'private-game',
      targetPrice: 4.99,
      watchlist: ['private-game'],
      preferenceProfile: { genres: ['RPG'] }
    }),
    { result: 'success' }
  );
  assert.deepEqual(sanitizeProperties({ result: 'failure' }), { result: 'failure' });
  assert.deepEqual(sanitizeProperties({ result: 'maybe' }), {});
});

test('allows only Google and email authentication providers', () => {
  assert.equal(sanitizeEvent('auth_request'), 'auth_request');
  assert.deepEqual(
    sanitizeProperties({
      surface: 'login',
      provider: 'google',
      signedIn: false,
      email: 'person@example.com',
      userId: 'user-123'
    }),
    { surface: 'login', provider: 'google', signedIn: 'false' }
  );
  assert.deepEqual(sanitizeProperties({ provider: 'email' }), { provider: 'email' });
  assert.deepEqual(sanitizeProperties({ provider: 'github' }), {});
  assert.deepEqual(sanitizeProperties({ provider: 'person@example.com' }), {});
});

test('account deletion analytics carries no private properties', () => {
  assert.equal(sanitizeEvent('account_delete_request'), 'account_delete_request');
  assert.deepEqual(
    sanitizeProperties({
      email: 'private@example.com',
      userId: 'user-123',
      reason: 'private'
    }),
    {}
  );
});

test('notification analytics carries only an allow-listed category and enabled state', () => {
  assert.equal(sanitizeEvent('notification_toggle'), 'notification_toggle');
  assert.deepEqual(
    sanitizeProperties({
      category: 'target_price',
      enabled: true,
      surface: 'account',
      email: 'private@example.com',
      userId: 'user-123',
      targetPrice: 4.99,
      gameKey: 'private-game'
    }, 'notification_toggle'),
    { category: 'target_price', enabled: 'true' }
  );
  assert.deepEqual(
    sanitizeProperties({ category: 'free_game', enabled: false }, 'notification_toggle'),
    { category: 'free_game', enabled: 'false' }
  );
  assert.deepEqual(
    sanitizeProperties({ category: 'weekly_digest', enabled: true }, 'notification_toggle'),
    { category: 'weekly_digest', enabled: 'true' }
  );
  assert.deepEqual(
    sanitizeProperties({ category: 'all', enabled: false }, 'notification_toggle'),
    {}
  );
  assert.deepEqual(
    sanitizeProperties({ category: 'private-game', enabled: true }, 'notification_toggle'),
    {}
  );
  assert.deepEqual(
    sanitizeProperties({ category: 'free_game', enabled: true }, 'deal_click'),
    {}
  );
});

test('keeps property values printable and bounded', () => {
  const longValue = `  home\npage\u0000card ${'x'.repeat(100)}  `;
  const properties = sanitizeProperties({
    surface: longValue,
    action: '',
    store: null,
    signedIn: true
  });

  assert.equal(properties.surface.length, 80);
  assert.match(properties.surface, /^home page card x+/);
  assert.equal(properties.signedIn, 'true');
  assert.equal('action' in properties, false);
  assert.equal('store' in properties, false);
  assert.deepEqual(
    sanitizeProperties({ surface: '\uD800', action: 'open' }),
    { action: 'open' }
  );
});

test('uses fixed result and price buckets', () => {
  assert.equal(resultBucket(0), '0');
  assert.equal(resultBucket(1), '1-9');
  assert.equal(resultBucket(9), '1-9');
  assert.equal(resultBucket(10), '10-24');
  assert.equal(resultBucket(24), '10-24');
  assert.equal(resultBucket(25), '25+');
  assert.equal(resultBucket('unknown'), null);

  assert.equal(priceBucket(0), 'free');
  assert.equal(priceBucket(4.99), 'under-5');
  assert.equal(priceBucket(5), 'under-10');
  assert.equal(priceBucket(10), 'under-25');
  assert.equal(priceBucket(25), '25-plus');
  assert.equal(priceBucket(-1), null);
  assert.equal(priceBucket(null), null);
});

test('returns false for invalid events or unavailable GoatCounter', () => {
  const previous = globalThis.goatcounter;
  delete globalThis.goatcounter;
  try {
    assert.equal(track('deal_click', { surface: 'homepage_card' }), false);
    assert.equal(track('not_allowed', { surface: 'homepage_card' }), false);
  } finally {
    if (previous === undefined) delete globalThis.goatcounter;
    else globalThis.goatcounter = previous;
  }
});

test('schedules a sanitized GoatCounter event asynchronously', async () => {
  const previous = globalThis.goatcounter;
  const calls = [];
  globalThis.goatcounter = {
    count(payload) {
      calls.push(payload);
    }
  };

  try {
    const accepted = track('deal_click', {
      surface: 'homepage card',
      store: 'Green Man Gaming',
      query: 'must not leave the browser'
    });

    assert.equal(accepted, true);
    assert.equal(calls.length, 0);
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      path: 'deal_click?surface=homepage%20card&store=Green%20Man%20Gaming',
      title: 'Deal click',
      event: true
    });
    assert.doesNotMatch(calls[0].path, /query|must%20not|browser/i);
  } finally {
    if (previous === undefined) delete globalThis.goatcounter;
    else globalThis.goatcounter = previous;
  }
});

test('does not throw when GoatCounter rejects an event', async () => {
  const previous = globalThis.goatcounter;
  globalThis.goatcounter = {
    count() {
      throw new Error('blocked');
    }
  };

  try {
    assert.equal(track('auth_request', { surface: 'login' }), true);
    await Promise.resolve();
  } finally {
    if (previous === undefined) delete globalThis.goatcounter;
    else globalThis.goatcounter = previous;
  }
});

test('returns false when the analytics transport cannot be inspected', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'goatcounter');
  Object.defineProperty(globalThis, 'goatcounter', {
    configurable: true,
    get() {
      throw new Error('blocked');
    }
  });

  try {
    assert.equal(track('deal_click', { surface: 'homepage_card' }), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'goatcounter', previous);
    else delete globalThis.goatcounter;
  }
});
