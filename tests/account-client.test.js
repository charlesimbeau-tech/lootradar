const test = require('node:test');
const assert = require('node:assert/strict');

const accountData = require('../lib/account-data.js');

const PROFILE_KEY = 'lr_rec_profile_v3';
const WATCHLIST_KEY = 'lr_watchlist_v1';
const CACHE_OWNER_KEY = 'lr_account_cache_owner_v1';
const GUEST_PROFILE_KEY = `${PROFILE_KEY}:guest`;
const GUEST_WATCHLIST_KEY = `${WATCHLIST_KEY}:guest`;

function userCacheKey(base, userId) {
  return `${base}:user:${encodeURIComponent(userId)}`;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, timeoutMs = 1500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

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
    },
    removeItem(key) {
      values.delete(key);
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
  let authCallback = null;
  const rpcHandlers = Object.assign({}, options.rpcHandlers || {});

  function readResult(table) {
    const configured = reads[table] || { data: [], error: null };
    return typeof configured === 'function' ? configured() : configured;
  }

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
        return {
          maybeSingle() {
            return Promise.resolve(readResult(table));
          },
          then(resolve, reject) {
            return Promise.resolve(readResult(table)).then(resolve, reject);
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
        authCallback = callback;
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
        if (typeof options.onSignOut === 'function') options.onSignOut();
        return { error: options.signOutError ? new Error('sign out failed') : null };
      }
    },
    from,
    async rpc(name, parameters) {
      calls.push({ operation: 'rpc', name, parameters });
      if (options.errors && options.errors[`rpc:${name}`]) {
        return { data: null, error: new Error(options.errors[`rpc:${name}`]) };
      }
      if (typeof rpcHandlers[name] === 'function') {
        return rpcHandlers[name](parameters);
      }
      return { data: true, error: null };
    },
    emitAuth(event, nextUser) {
      if (authCallback) {
        authCallback(event, nextUser ? { user: nextUser, access_token: 'token' } : null);
      }
    },
    setRead(table, value) {
      reads[table] = value;
    },
    setRpcHandler(name, handler) {
      rpcHandlers[name] = handler;
    }
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
  assert.deepEqual(storage.writes.map(([key]) => key), [
    userCacheKey(PROFILE_KEY, 'user-123'),
    userCacheKey(WATCHLIST_KEY, 'user-123'),
    PROFILE_KEY,
    WATCHLIST_KEY,
    CACHE_OWNER_KEY
  ]);
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
    errors: { 'rpc:lr_sync_profile': 'offline' }
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
      lr_profiles: { data: null, error: null },
      lr_feedback: { data: [], error: null },
      lr_watchlist: {
        data: [{
          game_key: 'portal',
          title: 'Portal',
          target_price: 5,
          created_at: '2026-07-27T12:00:00.000Z',
          updated_at: '2026-07-27T12:00:00.000Z'
        }, {
          game_key: 'hades',
          title: 'Hades',
          target_price: 10,
          created_at: '2026-07-27T12:00:00.000Z',
          updated_at: '2026-07-27T12:00:00.000Z'
        }],
        error: null
      }
    }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage: makeStorage() });
  const loaded = await client.loadAndMerge({}, {});
  fake.calls.length = 0;
  const first = client.syncWatchlist({
    portal: loaded.watchlist.portal
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

  assert.equal(fake.calls.some(call => call.operation === 'rpc'), false);
  assert.equal(await first, true);
  assert.equal(await second, true);

  const upsert = fake.calls.find(call => call.name === 'lr_sync_watch_item');
  assert.equal(upsert.parameters.p_target_price, 3);
  assert.equal(upsert.parameters.p_expected_user_id, 'user-123');
  const removal = fake.calls.find(call => call.name === 'lr_delete_watch_item');
  assert.equal(removal.parameters.p_game_key, 'hades');
  assert.equal(removal.parameters.p_expected_updated_at, '2026-07-27T12:00:00.000Z');
  assert.ok(
    Date.parse(removal.parameters.p_deleted_at) >
      Date.parse(removal.parameters.p_expected_updated_at)
  );
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
  const storage = makeStorage({
    [CACHE_OWNER_KEY]: 'user-a',
    [PROFILE_KEY]: '{}',
    [WATCHLIST_KEY]: '{}',
    [userCacheKey(PROFILE_KEY, 'user-a')]: '{}',
    [userCacheKey(WATCHLIST_KEY, 'user-a')]: '{}'
  });
  const client = createAccountClient({ client: fake, storage });

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
  assert.equal(client.state().status, 'syncing');
  assert.equal(client.state().user.id, 'user-b');
  assert.equal(client.state().profile, null);
  assert.equal(fake.calls.some(call => call.name === 'lr_sync_profile'), false);
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

test('a signed-in account never merges another account cache', async () => {
  const accountAProfile = {
    schemaVersion: 1,
    budget: 99,
    genres: ['Private A'],
    updatedAt: '2026-07-27T12:00:00.000Z',
    likes: {},
    dislikes: {}
  };
  const accountBProfile = {
    schemaVersion: 1,
    budget: 12,
    genres: ['B'],
    updatedAt: '2026-07-27T11:00:00.000Z',
    likes: {},
    dislikes: {}
  };
  const storage = makeStorage({
    [PROFILE_KEY]: JSON.stringify(accountAProfile),
    [WATCHLIST_KEY]: JSON.stringify({
      secretA: {
        key: 'secretA',
        title: 'Private A',
        targetPrice: 1,
        addedAt: '2026-07-27T12:00:00.000Z',
        updatedAt: '2026-07-27T12:00:00.000Z'
      }
    }),
    [CACHE_OWNER_KEY]: 'user-a',
    [userCacheKey(PROFILE_KEY, 'user-b')]: JSON.stringify(accountBProfile),
    [userCacheKey(WATCHLIST_KEY, 'user-b')]: '{}'
  });
  const fake = makeFakeSupabase({
    user: { id: 'user-b' },
    reads: {
      lr_profiles: { data: null, error: null },
      lr_feedback: { data: [], error: null },
      lr_watchlist: { data: [], error: null }
    }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });

  const result = await client.loadAndMerge(accountAProfile, JSON.parse(storage.getItem(WATCHLIST_KEY)));

  assert.equal(result.profile.budget, 12);
  assert.deepEqual(result.profile.genres, ['B']);
  assert.deepEqual(result.watchlist, {});
  assert.equal(storage.getItem(CACHE_OWNER_KEY), 'user-b');
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).budget, 12);
});

test('sign-out never reclassifies the previous account cache as guest data', async () => {
  let activeUser = { id: 'user-a' };
  const storage = makeStorage({
    [CACHE_OWNER_KEY]: 'user-a',
    [PROFILE_KEY]: JSON.stringify({
      schemaVersion: 1,
      budget: 88,
      updatedAt: '2026-07-27T12:00:00.000Z',
      likes: {},
      dislikes: {}
    }),
    [WATCHLIST_KEY]: '{}'
  });
  const fake = makeFakeSupabase({ getUser: () => activeUser });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });
  activeUser = null;
  fake.emitAuth('SIGNED_OUT', null);

  const result = await client.loadAndMerge(
    JSON.parse(storage.getItem(PROFILE_KEY)),
    JSON.parse(storage.getItem(WATCHLIST_KEY))
  );

  assert.equal(result.guest, true);
  assert.notEqual(result.profile.budget, 88);
  assert.deepEqual(result.watchlist, {});
  assert.equal(storage.getItem(CACHE_OWNER_KEY), 'user-a');
});

test('a concurrent remote watch addition absent from the synchronized baseline is not deleted', async () => {
  const storage = makeStorage();
  const fake = makeFakeSupabase({
    reads: {
      lr_profiles: { data: null, error: null },
      lr_feedback: { data: [], error: null },
      lr_watchlist: {
        data: [{
          game_key: 'portal',
          title: 'Portal',
          target_price: 5,
          created_at: '2026-07-27T10:00:00.000Z',
          updated_at: '2026-07-27T10:00:00.000Z'
        }],
        error: null
      }
    }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });
  const initial = await client.loadAndMerge({}, {});
  fake.calls.length = 0;
  fake.setRead('lr_watchlist', {
    data: [
      { game_key: 'portal' },
      { game_key: 'hades' }
    ],
    error: null
  });

  await client.syncWatchlist(initial.watchlist);

  const deletedKeys = fake.calls
    .filter(call => call.name === 'lr_delete_watch_item')
    .map(call => call.parameters.p_game_key);
  assert.deepEqual(deletedKeys, []);
});

test('loadAndMerge does not save or emit private data after sign-out during reads', async () => {
  let activeUser = { id: 'user-a' };
  const profileRead = deferred();
  const fake = makeFakeSupabase({
    getUser: () => activeUser,
    reads: {
      lr_profiles: () => profileRead.promise,
      lr_feedback: { data: [], error: null },
      lr_watchlist: { data: [], error: null }
    }
  });
  const storage = makeStorage();
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });
  const states = [];
  client.subscribe(state => states.push(state));
  const loading = client.loadAndMerge({
    schemaVersion: 1,
    budget: 77,
    updatedAt: '2026-07-27T12:00:00.000Z',
    likes: {},
    dislikes: {}
  }, {});
  await waitFor(() => fake.calls.filter(call => call.operation === 'select').length === 3);
  activeUser = null;
  fake.emitAuth('SIGNED_OUT', null);
  profileRead.resolve({ data: null, error: null });

  const result = await loading;

  assert.equal(result.cancelled, true);
  assert.deepEqual(storage.writes, []);
  assert.equal(client.state().status, 'guest');
  assert.equal(
    states.some(state => state.status !== 'syncing' && state.profile && state.profile.budget === 77),
    false
  );
});

test('loadAndMerge does not save or emit account A data after switching to account B during reads', async () => {
  let activeUser = { id: 'user-a' };
  const watchRead = deferred();
  const fake = makeFakeSupabase({
    getUser: () => activeUser,
    reads: {
      lr_profiles: { data: null, error: null },
      lr_feedback: { data: [], error: null },
      lr_watchlist: () => watchRead.promise
    }
  });
  const storage = makeStorage();
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });
  const loading = client.loadAndMerge({
    schemaVersion: 1,
    budget: 77,
    updatedAt: '2026-07-27T12:00:00.000Z',
    likes: {},
    dislikes: {}
  }, {});
  await waitFor(() => fake.calls.filter(call => call.operation === 'select').length === 3);
  activeUser = { id: 'user-b' };
  fake.emitAuth('SIGNED_IN', activeUser);
  watchRead.resolve({ data: [], error: null });

  const result = await loading;

  assert.equal(result.cancelled, true);
  assert.deepEqual(storage.writes, []);
  assert.equal(client.state().status, 'syncing');
  assert.equal(client.state().user.id, 'user-b');
  assert.equal(client.state().profile, null);
  assert.equal(client.state().watchlist, null);
});

test('same-resource writes remain serialized after the debounce window', async () => {
  const firstRpc = deferred();
  const storage = makeStorage();
  const fake = makeFakeSupabase({
    reads: {
      lr_profiles: { data: null, error: null },
      lr_feedback: { data: [], error: null },
      lr_watchlist: { data: [], error: null }
    }
  });
  const { createAccountClient } = loadClient();
  let clock = Date.parse('2026-07-27T12:00:00.000Z');
  const client = createAccountClient({
    client: fake,
    storage,
    now: () => new Date(clock += 1000).toISOString()
  });
  await client.loadAndMerge({}, {});
  fake.calls.length = 0;
  let profileRpcCount = 0;
  fake.setRpcHandler('lr_sync_profile', () => {
    profileRpcCount += 1;
    return profileRpcCount === 1
      ? firstRpc.promise
      : Promise.resolve({ data: true, error: null });
  });

  const first = client.syncProfile({ budget: 10, likes: {}, dislikes: {} });
  await waitFor(() => profileRpcCount === 1);
  const second = client.syncProfile({ budget: 20, likes: {}, dislikes: {} });
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(profileRpcCount, 1);

  firstRpc.resolve({ data: true, error: null });
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(profileRpcCount, 2);
  const writes = fake.calls.filter(call => call.name === 'lr_sync_profile');
  assert.deepEqual(writes.map(call => call.parameters.p_data.budget), [10, 20]);
  assert.ok(
    Date.parse(writes[1].parameters.p_updated_at) >
      Date.parse(writes[0].parameters.p_updated_at)
  );
});

test('a server-rejected stale write stays local and reports sync delayed', async () => {
  const storage = makeStorage();
  const fake = makeFakeSupabase({
    reads: {
      lr_profiles: { data: null, error: null },
      lr_feedback: { data: [], error: null },
      lr_watchlist: { data: [], error: null }
    }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });
  await client.loadAndMerge({}, {});
  fake.setRpcHandler('lr_sync_profile', () => ({ data: false, error: null }));

  const success = await client.syncProfile({
    budget: 42,
    likes: {},
    dislikes: {}
  });

  assert.equal(success, false);
  assert.equal(client.state().status, 'delayed');
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).budget, 42);
});

test('an edit made during load cancels the stale load before it can replace the local cache', async () => {
  const profileRead = deferred();
  const existingProfile = {
    schemaVersion: 1,
    budget: 10,
    updatedAt: '2026-07-27T10:00:00.000Z',
    likes: {},
    dislikes: {}
  };
  const storage = makeStorage({
    [CACHE_OWNER_KEY]: 'user-123',
    [PROFILE_KEY]: JSON.stringify(existingProfile),
    [WATCHLIST_KEY]: '{}',
    [userCacheKey(PROFILE_KEY, 'user-123')]: JSON.stringify(existingProfile),
    [userCacheKey(WATCHLIST_KEY, 'user-123')]: '{}'
  });
  const fake = makeFakeSupabase({
    reads: {
      lr_profiles: () => profileRead.promise,
      lr_feedback: { data: [], error: null },
      lr_watchlist: { data: [], error: null }
    }
  });
  const { createAccountClient } = loadClient();
  let clock = Date.parse('2026-07-27T12:00:00.000Z');
  const client = createAccountClient({
    client: fake,
    storage,
    now: () => new Date(clock += 1000).toISOString()
  });
  const loading = client.loadAndMerge(existingProfile, {});
  await waitFor(() => fake.calls.filter(call => call.operation === 'select').length === 3);
  const saving = client.syncProfile({ budget: 20, likes: {}, dislikes: {} });
  profileRead.resolve({
    data: {
      data: {
        schemaVersion: 1,
        budget: 5,
        updatedAt: '2026-07-27T11:00:00.000Z',
        likes: {},
        dislikes: {}
      },
      updated_at: '2026-07-27T11:00:00.000Z',
      schema_version: 1
    },
    error: null
  });

  const loadResult = await loading;
  assert.equal(loadResult.cancelled, true);
  assert.equal(await saving, true);
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).budget, 20);
  assert.equal(client.state().profile.budget, 20);
});

test('sign-out activates a distinct guest cache and signed-out edits survive reload', async () => {
  let activeUser = { id: 'user-a' };
  const accountProfile = {
    schemaVersion: 1,
    budget: 88,
    updatedAt: '2026-07-27T12:00:00.000Z',
    likes: {},
    dislikes: {}
  };
  const guestProfile = {
    schemaVersion: 1,
    budget: 7,
    updatedAt: '2026-07-27T11:00:00.000Z',
    likes: {},
    dislikes: {}
  };
  const storage = makeStorage({
    [CACHE_OWNER_KEY]: 'user-a',
    [PROFILE_KEY]: JSON.stringify(accountProfile),
    [WATCHLIST_KEY]: '{}',
    [userCacheKey(PROFILE_KEY, 'user-a')]: JSON.stringify(accountProfile),
    [userCacheKey(WATCHLIST_KEY, 'user-a')]: '{}',
    [GUEST_PROFILE_KEY]: JSON.stringify(guestProfile),
    [GUEST_WATCHLIST_KEY]: '{}'
  });
  const fake = makeFakeSupabase({
    getUser: () => activeUser,
    onSignOut: () => { activeUser = null; }
  });
  const { createAccountClient } = loadClient();
  const client = createAccountClient({ client: fake, storage });

  assert.equal(await client.signOut(), true);
  assert.equal(client.state().status, 'guest');
  assert.equal(client.state().profile.budget, 7);
  assert.equal(storage.getItem(CACHE_OWNER_KEY), 'guest');
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).budget, 7);

  assert.equal(await client.syncProfile({ budget: 9, likes: {}, dislikes: {} }), false);
  assert.equal(JSON.parse(storage.getItem(GUEST_PROFILE_KEY)).budget, 9);
  assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).budget, 9);

  const reloaded = createAccountClient({
    client: makeFakeSupabase({ user: null }),
    storage
  });
  const result = await reloaded.loadAndMerge(
    JSON.parse(storage.getItem(PROFILE_KEY)),
    JSON.parse(storage.getItem(WATCHLIST_KEY))
  );
  assert.equal(result.guest, true);
  assert.equal(result.profile.budget, 9);
  assert.notEqual(result.profile.budget, 88);
});

for (const failure of [
  { label: 'profile', rpc: 'lr_sync_profile' },
  { label: 'feedback', rpc: 'lr_sync_feedback' },
  { label: 'watchlist', rpc: 'lr_sync_watch_item' }
]) {
  test(`failed ${failure.label} sync does not consume or reassign the guest cache`, async () => {
    const guestProfile = {
      schemaVersion: 1,
      budget: 21,
      updatedAt: '2026-07-27T12:00:00.000Z',
      likes: { portal: '2026-07-27T12:00:00.000Z' },
      dislikes: {}
    };
    const guestWatchlist = {
      portal: {
        key: 'portal',
        title: 'Portal',
        targetPrice: 3,
        addedAt: '2026-07-27T12:00:00.000Z',
        updatedAt: '2026-07-27T12:00:00.000Z'
      }
    };
    const storage = makeStorage({
      [CACHE_OWNER_KEY]: 'guest',
      [PROFILE_KEY]: JSON.stringify(guestProfile),
      [WATCHLIST_KEY]: JSON.stringify(guestWatchlist),
      [GUEST_PROFILE_KEY]: JSON.stringify(guestProfile),
      [GUEST_WATCHLIST_KEY]: JSON.stringify(guestWatchlist)
    });
    const fake = makeFakeSupabase({
      errors: { [`rpc:${failure.rpc}`]: 'offline' },
      reads: {
        lr_profiles: { data: null, error: null },
        lr_feedback: { data: [], error: null },
        lr_watchlist: { data: [], error: null }
      }
    });
    const { createAccountClient } = loadClient();
    const client = createAccountClient({ client: fake, storage });

    const result = await client.loadAndMerge(guestProfile, guestWatchlist);

    assert.equal(result.synced, false);
    assert.equal(result.delayed, true);
    assert.equal(storage.getItem(CACHE_OWNER_KEY), 'guest');
    assert.deepEqual(JSON.parse(storage.getItem(GUEST_PROFILE_KEY)), guestProfile);
    assert.deepEqual(JSON.parse(storage.getItem(GUEST_WATCHLIST_KEY)), guestWatchlist);
    assert.equal(JSON.parse(storage.getItem(PROFILE_KEY)).budget, 21);
    assert.ok(storage.getItem(userCacheKey(PROFILE_KEY, 'user-123')));
    assert.ok(storage.getItem(userCacheKey(WATCHLIST_KEY, 'user-123')));
  });
}

test('a remote tombstone removes stale local watch data and a later explicit re-add clears it', async () => {
  const staleLocal = {
    portal: {
      key: 'portal',
      title: 'Portal',
      targetPrice: 3,
      addedAt: '2026-07-27T10:00:00.000Z',
      updatedAt: '2026-07-27T12:00:00.000Z'
    }
  };
  const fake = makeFakeSupabase({
    reads: {
      lr_profiles: { data: null, error: null },
      lr_feedback: { data: [], error: null },
      lr_watchlist: {
        data: [{
          game_key: 'portal',
          title: 'Portal',
          target_price: 3,
          created_at: '2026-07-27T10:00:00.000Z',
          updated_at: '2026-07-27T13:00:00.000Z',
          deleted_at: '2026-07-27T13:00:00.000Z'
        }],
        error: null
      }
    }
  });
  const storage = makeStorage();
  const { createAccountClient } = loadClient();
  const client = createAccountClient({
    client: fake,
    storage,
    now: () => '2026-07-27T14:00:00.000Z'
  });

  const loaded = await client.loadAndMerge({}, staleLocal);
  assert.deepEqual(loaded.watchlist, {});
  fake.calls.length = 0;
  const readded = {
    portal: {
      key: 'portal',
      title: 'Portal',
      targetPrice: 2,
      addedAt: '2026-07-27T14:00:00.000Z'
    }
  };
  assert.equal(await client.syncWatchlist(readded), true);
  const rpc = fake.calls.find(call => call.name === 'lr_sync_watch_item');
  assert.equal(rpc.parameters.p_game_key, 'portal');
  assert.equal(rpc.parameters.p_updated_at, '2026-07-27T14:00:00.000Z');
});

test('a successful guest claim is consumed once and never leaks into another account', async () => {
  const guestProfile = {
    schemaVersion: 1,
    budget: 17,
    updatedAt: '2026-07-27T12:00:00.000Z',
    likes: {},
    dislikes: {}
  };
  const storage = makeStorage({
    [CACHE_OWNER_KEY]: 'guest',
    [PROFILE_KEY]: JSON.stringify(guestProfile),
    [WATCHLIST_KEY]: '{}',
    [GUEST_PROFILE_KEY]: JSON.stringify(guestProfile),
    [GUEST_WATCHLIST_KEY]: '{}'
  });
  const emptyReads = {
    lr_profiles: { data: null, error: null },
    lr_feedback: { data: [], error: null },
    lr_watchlist: { data: [], error: null }
  };
  const { createAccountClient } = loadClient();
  const first = createAccountClient({
    client: makeFakeSupabase({ user: { id: 'user-a' }, reads: emptyReads }),
    storage
  });

  const claimed = await first.loadAndMerge(guestProfile, {});
  assert.equal(claimed.synced, true);
  assert.equal(claimed.profile.budget, 17);
  assert.equal(storage.getItem(CACHE_OWNER_KEY), 'user-a');
  assert.equal(storage.getItem(GUEST_PROFILE_KEY), null);
  assert.equal(storage.getItem(GUEST_WATCHLIST_KEY), null);

  const second = createAccountClient({
    client: makeFakeSupabase({ user: { id: 'user-b' }, reads: emptyReads }),
    storage
  });
  const isolated = await second.loadAndMerge(
    JSON.parse(storage.getItem(PROFILE_KEY)),
    JSON.parse(storage.getItem(WATCHLIST_KEY))
  );
  assert.notEqual(isolated.profile.budget, 17);
  assert.equal(storage.getItem(CACHE_OWNER_KEY), 'user-b');
});
