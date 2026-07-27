const test = require('node:test');
const assert = require('node:assert/strict');

const accountData = require('../lib/account-data.js');

const PROFILE_KEY = 'lr_rec_profile_v3';
const WATCHLIST_KEY = 'lr_watchlist_v1';

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
      writes.push([key, value]);
    }
  };
}

function makeFakeSupabase(options = {}) {
  const user = options.user === undefined ? { id: 'user-123' } : options.user;
  const reads = Object.assign({
    lr_profiles: {
      data: {
        data: {
          schemaVersion: 1,
          budget: 30,
          updatedAt: '2026-07-27T11:00:00.000Z',
          likes: {},
          dislikes: {}
        },
        updated_at: '2026-07-27T11:00:00.000Z',
        schema_version: 1
      },
      error: null
    },
    lr_feedback: {
      data: [{
        item_id: 'hades',
        action: 'like',
        updated_at: '2026-07-27T13:00:00.000Z'
      }],
      error: null
    },
    lr_watchlist: {
      data: [{
        user_id: 'user-123',
        game_key: 'hades',
        title: 'Hades',
        target_price: 10,
        created_at: '2026-07-27T10:00:00.000Z',
        updated_at: '2026-07-27T10:00:00.000Z'
      }],
      error: null
    }
  }, options.reads || {});
  const calls = [];

  function responseFor(table, operation) {
    const key = `${table}:${operation}`;
    if (options.errors && options.errors[key]) {
      return Promise.resolve({ data: null, error: new Error(options.errors[key]) });
    }
    return Promise.resolve({ data: null, error: null });
  }

  function from(table) {
    return {
      select(columns) {
        calls.push({ table, operation: 'select', columns });
        const result = reads[table] || { data: [], error: null };
        return {
          maybeSingle() {
            return Promise.resolve(result);
          },
          then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
          }
        };
      },
      upsert(rows, config) {
        calls.push({ table, operation: 'upsert', rows, config });
        return responseFor(table, 'upsert');
      },
      delete() {
        calls.push({ table, operation: 'delete' });
        return {
          in(column, values) {
            calls.push({ table, operation: 'delete-in', column, values });
            return responseFor(table, 'delete');
          }
        };
      }
    };
  }

  return {
    calls,
    auth: {
      async getSession() {
        if (options.sessionError) return { data: { session: null }, error: new Error('session failed') };
        const activeUser = typeof options.getUser === 'function' ? options.getUser() : user;
        return {
          data: {
            session: activeUser ? { user: activeUser, access_token: 'token' } : null
          },
          error: null
        };
      },
      onAuthStateChange(callback) {
        return {
          data: {
            subscription: {
              unsubscribe() {}
            }
          }
        };
      },
      async signOut() {
        calls.push({ operation: 'signOut' });
        return { error: options.signOutError ? new Error('sign out failed') : null };
      }
    },
    from
  };
}

function loadClient() {
  globalThis.LootRadarAccountData = accountData;
  delete require.cache[require.resolve('../lib/account-client.js')];
  return require('../lib/account-client.js');
}

test('loadAndMerge reads all account records, applies feedback, then writes merged local state', async () => {
  const storage = makeStorage();
  const fake = makeFakeSupabase();
  const { createAccountClient } = loadClient();
  const client = createAccountClient({
    client: fake,
    storage,
    now: () => '2026-07-27T14:00:00.000Z'
  });
  const localProfile = {
    schemaVersion: 1,
    budget: 15,
    updatedAt: '2026-07-27T12:00:00.000Z',
    likes: {},
    dislikes: {}
  };
  const localWatchlist = {
    portal: {
      key: 'portal',
      title: 'Portal',
      targetPrice: 3,
      addedAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z'
    }
  };

  const result = await client.loadAndMerge(localProfile, localWatchlist);

  assert.equal(result.synced, true);
  assert.equal(result.profile.budget, 15);
  assert.equal(result.profile.likes.hades, '2026-07-27T13:00:00.000Z');
  assert.deepEqual(Object.keys(result.watchlist).sort(), ['hades', 'portal']);
  assert.deepEqual(
    fake.calls.filter(call => call.operation === 'select').map(call => call.table),
    ['lr_profiles', 'lr_feedback', 'lr_watchlist']
  );
  assert.deepEqual(storage.writes.map(([key]) => key), [PROFILE_KEY, WATCHLIST_KEY]);
  assert.deepEqual(JSON.parse(storage.getItem(PROFILE_KEY)), result.profile);
  assert.deepEqual(JSON.parse(storage.getItem(WATCHLIST_KEY)), result.watchlist);
  assert.equal(client.state().status, 'synced');
  assert.equal(client.state().user.id, 'user-123');
});

test('failed reads do not write local storage and report delayed without throwing', async () => {
  const storage = makeStorage({
    [PROFILE_KEY]: '{"keep":"profile"}',
    [WATCHLIST_KEY]: '{"keep":"watchlist"}'
  });
  const fake = makeFakeSupabase({
    reads: {
      lr_feedback: { data: null, error: new Error('offline') }
    }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });

  const result = await client.loadAndMerge({ budget: 20 }, {});

  assert.equal(result.synced, false);
  assert.equal(result.delayed, true);
  assert.equal(client.state().status, 'delayed');
  assert.deepEqual(storage.writes, []);
  assert.equal(storage.getItem(PROFILE_KEY), '{"keep":"profile"}');
  assert.equal(storage.getItem(WATCHLIST_KEY), '{"keep":"watchlist"}');
});

test('failed remote writes keep the successfully merged local caches and report delayed', async () => {
  const storage = makeStorage();
  const fake = makeFakeSupabase({
    errors: { 'lr_profiles:upsert': 'offline' }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });

  const result = await client.loadAndMerge(
    {
      schemaVersion: 1,
      budget: 15,
      updatedAt: '2026-07-27T12:00:00.000Z',
      likes: {},
      dislikes: {}
    },
    {}
  );

  assert.equal(result.synced, false);
  assert.equal(result.delayed, true);
  assert.equal(client.state().status, 'delayed');
  assert.deepEqual(JSON.parse(storage.getItem(PROFILE_KEY)), result.profile);
  assert.deepEqual(JSON.parse(storage.getItem(WATCHLIST_KEY)), result.watchlist);
});

test('an absent remote profile does not replace newer local preferences', async () => {
  const fake = makeFakeSupabase({
    reads: {
      lr_profiles: { data: null, error: null },
      lr_feedback: { data: [], error: null },
      lr_watchlist: { data: [], error: null }
    }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage: makeStorage() });

  const result = await client.loadAndMerge({
    schemaVersion: 1,
    budget: 17,
    genres: ['RPG'],
    updatedAt: '2026-07-27T12:00:00.000Z',
    likes: {},
    dislikes: {}
  }, {});

  assert.equal(result.profile.budget, 17);
  assert.deepEqual(result.profile.genres, ['RPG']);
});

test('syncWatchlist debounces writes, upserts current rows, and deletes removed remote keys', async () => {
  const fake = makeFakeSupabase({
    reads: {
      lr_watchlist: {
        data: [{ game_key: 'portal' }, { game_key: 'hades' }],
        error: null
      }
    }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage: makeStorage() });
  const first = client.syncWatchlist({
    portal: {
      key: 'portal',
      title: 'Portal',
      targetPrice: 5,
      addedAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z'
    }
  });
  const second = client.syncWatchlist({
    portal: {
      key: 'portal',
      title: 'Portal',
      targetPrice: 3,
      addedAt: '2026-07-27T12:00:00.000Z',
      updatedAt: '2026-07-27T13:00:00.000Z'
    }
  });

  assert.equal(fake.calls.some(call => call.operation === 'upsert'), false);
  assert.equal(await first, true);
  assert.equal(await second, true);

  const upsert = fake.calls.find(call => call.table === 'lr_watchlist' && call.operation === 'upsert');
  assert.equal(upsert.rows.length, 1);
  assert.equal(upsert.rows[0].target_price, 3);
  assert.equal(upsert.rows[0].user_id, 'user-123');
  assert.deepEqual(upsert.config, { onConflict: 'user_id,game_key' });
  const removal = fake.calls.find(call => call.table === 'lr_watchlist' && call.operation === 'delete-in');
  assert.equal(removal.column, 'game_key');
  assert.deepEqual(removal.values, ['hades']);
});

test('guest and session failures report delayed or guest without rejecting writes', async () => {
  const { createAccountClient } = loadClient();
  const guest = createAccountClient({
    client: makeFakeSupabase({ user: null }),
    storage: makeStorage()
  });
  assert.equal(await guest.syncProfile({ budget: 10 }), false);
  assert.equal(guest.state().status, 'guest');

  const failed = createAccountClient({
    client: makeFakeSupabase({ sessionError: true }),
    storage: makeStorage()
  });
  assert.equal(await failed.syncFeedback({ likes: {}, dislikes: {} }), false);
  assert.equal(failed.state().status, 'delayed');
});

test('a debounced write is cancelled when the authenticated account changes', async () => {
  let activeUser = { id: 'user-a' };
  const fake = makeFakeSupabase({ getUser: () => activeUser });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage: makeStorage() });

  const pending = client.syncProfile({
    schemaVersion: 1,
    budget: 12,
    updatedAt: '2026-07-27T12:00:00.000Z',
    likes: {},
    dislikes: {}
  });
  await Promise.resolve();
  activeUser = { id: 'user-b' };

  assert.equal(await pending, false);
  assert.equal(client.state().status, 'delayed');
  assert.equal(fake.calls.some(call => call.table === 'lr_profiles' && call.operation === 'upsert'), false);
});

test('account synchronization analytics exposes only success or failure', async () => {
  const previous = globalThis.LootRadarAnalytics;
  const events = [];
  globalThis.LootRadarAnalytics = {
    track(name, properties) {
      events.push([name, properties]);
    }
  };
  try {
    const { createAccountClient } = loadClient();
    const successful = createAccountClient({
      client: makeFakeSupabase(),
      storage: makeStorage()
    });
    await successful.loadAndMerge({}, {});

    const delayed = createAccountClient({
      client: makeFakeSupabase({
        reads: { lr_feedback: { data: null, error: new Error('offline') } }
      }),
      storage: makeStorage()
    });
    await delayed.loadAndMerge({}, {});

    assert.deepEqual(events, [
      ['account_sync', { result: 'success' }],
      ['account_sync', { result: 'failure' }]
    ]);
  } finally {
    if (previous === undefined) delete globalThis.LootRadarAnalytics;
    else globalThis.LootRadarAnalytics = previous;
  }
});
