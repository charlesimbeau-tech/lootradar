#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const REQUIRED_ENV = [
  'LR_SUPABASE_URL',
  'LR_SUPABASE_ANON_KEY',
  'LR_RLS_USER_A_JWT',
  'LR_RLS_USER_B_JWT'
];

function readEnvironment() {
  const missing = REQUIRED_ENV.filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    baseUrl: process.env.LR_SUPABASE_URL.replace(/\/+$/, ''),
    anonKey: process.env.LR_SUPABASE_ANON_KEY,
    userAToken: process.env.LR_RLS_USER_A_JWT,
    userBToken: process.env.LR_RLS_USER_B_JWT
  };
}

function jwtSubject(token, label) {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error(`${label} is not a JWT`);
  }

  let payload;
  try {
    payload = JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8')
    );
  } catch {
    throw new Error(`${label} has an unreadable payload`);
  }

  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error(`${label} does not contain a user subject`);
  }

  return payload.sub;
}

function headers(anonKey, token, prefer) {
  const result = {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
  if (prefer) result.Prefer = prefer;
  return result;
}

function rpcUrl(baseUrl, functionName) {
  return new URL(`${baseUrl}/rest/v1/rpc/${functionName}`);
}

function tableUrl(baseUrl, table, filters = {}, extra = {}) {
  const url = new URL(`${baseUrl}/rest/v1/${table}`);
  url.searchParams.set('select', extra.select || '*');
  for (const [column, value] of Object.entries(filters)) {
    url.searchParams.set(column, `eq.${value}`);
  }
  if (extra.onConflict) {
    url.searchParams.set('on_conflict', extra.onConflict);
  }
  return url;
}

async function request(url, options, context) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new Error(`${context}: request failed (${error.message})`);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { ok: response.ok, status: response.status, data };
}

async function callRpc(config, token, functionName, parameters, context) {
  return request(
    rpcUrl(config.baseUrl, functionName),
    {
      method: 'POST',
      headers: headers(config.anonKey, token),
      body: JSON.stringify(parameters)
    },
    context || `${functionName} RPC`
  );
}

async function assertRpcBlocked(
  config,
  token,
  functionName,
  parameters,
  context
) {
  const result = await callRpc(
    config,
    token,
    functionName,
    parameters,
    context
  );
  assert.ok(
    !result.ok && (result.status === 401 || result.status === 403),
    `${context} was not rejected (${result.status}): ${JSON.stringify(result.data)}`
  );
}

async function assertRpcBoolean(
  config,
  token,
  functionName,
  parameters,
  expected,
  context
) {
  const result = await callRpc(
    config,
    token,
    functionName,
    parameters,
    context
  );
  assert.equal(
    result.ok,
    true,
    `${context} failed (${result.status}): ${JSON.stringify(result.data)}`
  );
  assert.equal(result.data, expected, `${context} returned the wrong result`);
}

async function readRows(config, token, definition) {
  const result = await request(
    tableUrl(config.baseUrl, definition.table, definition.filters),
    { method: 'GET', headers: headers(config.anonKey, token) },
    `${definition.table} read`
  );
  assert.equal(
    result.ok,
    true,
    `${definition.table} read failed (${result.status}): ${JSON.stringify(result.data)}`
  );
  assert.ok(
    Array.isArray(result.data),
    `${definition.table} read did not return an array`
  );
  return result.data;
}

async function upsert(config, token, definition, record) {
  const result = await request(
    tableUrl(config.baseUrl, definition.table, {}, {
      onConflict: definition.conflict
    }),
    {
      method: 'POST',
      headers: headers(
        config.anonKey,
        token,
        'resolution=merge-duplicates,return=representation'
      ),
      body: JSON.stringify(record)
    },
    `${definition.table} upsert`
  );
  assert.equal(
    result.ok,
    true,
    `${definition.table} upsert failed (${result.status}): ${JSON.stringify(result.data)}`
  );
  assert.ok(
    Array.isArray(result.data) && result.data.length === 1,
    `${definition.table} upsert did not return exactly one owner row`
  );
}

async function assertCrossUserWriteBlocked(
  config,
  definition,
  method,
  body
) {
  const result = await request(
    tableUrl(config.baseUrl, definition.table, definition.filters),
    {
      method,
      headers: headers(
        config.anonKey,
        config.userBToken,
        'return=representation'
      ),
      ...(body ? { body: JSON.stringify(body) } : {})
    },
    `${definition.table} cross-user ${method.toLowerCase()}`
  );

  if (!result.ok) {
    assert.ok(
      result.status === 401 || result.status === 403,
      `${definition.table} cross-user ${method} failed unexpectedly (${result.status})`
    );
    return;
  }

  assert.deepEqual(
    result.data,
    [],
    `${definition.table} allowed user B to ${method.toLowerCase()} user A's row`
  );
}

async function removeRows(config, token, definition) {
  const result = await request(
    tableUrl(config.baseUrl, definition.table, definition.filters),
    {
      method: 'DELETE',
      headers: headers(config.anonKey, token, 'return=representation')
    },
    `${definition.table} cleanup`
  );
  assert.equal(
    result.ok,
    true,
    `${definition.table} cleanup failed (${result.status}): ${JSON.stringify(result.data)}`
  );
}

async function verifyTable(config, definition, backups) {
  backups.set(definition.table, await readRows(
    config,
    config.userAToken,
    definition
  ));

  await upsert(config, config.userAToken, definition, definition.record);

  const ownerRows = await readRows(config, config.userAToken, definition);
  assert.equal(
    ownerRows.length,
    1,
    `${definition.table} owner could not read the probe row`
  );
  assert.deepEqual(
    ownerRows[0][definition.probeColumn],
    definition.probeValue,
    `${definition.table} owner read returned the wrong probe value`
  );

  const crossUserRows = await readRows(config, config.userBToken, definition);
  assert.deepEqual(
    crossUserRows,
    [],
    `${definition.table} exposed user A's row to user B`
  );

  await assertCrossUserWriteBlocked(
    config,
    definition,
    'PATCH',
    definition.intruderPatch
  );
  await assertCrossUserWriteBlocked(config, definition, 'DELETE');

  const unchangedRows = await readRows(config, config.userAToken, definition);
  assert.equal(
    unchangedRows.length,
    1,
    `${definition.table} probe row disappeared after a cross-user write`
  );
  assert.deepEqual(
    unchangedRows[0][definition.probeColumn],
    definition.probeValue,
    `${definition.table} probe row changed after a cross-user write`
  );
}

async function verifyRpcBoundary(config, userAId, runId) {
  const baseMs = Date.now();
  const timestamp = offset => new Date(baseMs + offset).toISOString();
  const profileData = {
    rlsProbe: `rpc-${runId}`,
    schemaVersion: 1,
    updatedAt: timestamp(4_000),
    likes: {},
    dislikes: {}
  };
  const profileParameters = {
    p_expected_user_id: userAId,
    p_data: profileData,
    p_schema_version: 1,
    p_updated_at: profileData.updatedAt
  };

  await assertRpcBlocked(
    config,
    null,
    'lr_sync_profile',
    profileParameters,
    'anonymous RPC authorization'
  );
  await assertRpcBlocked(
    config,
    config.userBToken,
    'lr_sync_profile',
    profileParameters,
    'cross-user profile RPC authorization'
  );
  await assertRpcBoolean(
    config,
    config.userAToken,
    'lr_sync_profile',
    profileParameters,
    true,
    'owner profile RPC'
  );
  await assertRpcBoolean(
    config,
    config.userAToken,
    'lr_sync_profile',
    {
      ...profileParameters,
      p_data: { ...profileData, rlsProbe: 'stale' },
      p_updated_at: timestamp(3_000)
    },
    false,
    'stale profile RPC'
  );

  const itemId = `rls-probe-${runId}`;
  await assertRpcBoolean(
    config,
    config.userAToken,
    'lr_sync_feedback',
    {
      p_expected_user_id: userAId,
      p_item_id: itemId,
      p_action: 'like',
      p_updated_at: timestamp(5_000)
    },
    true,
    'owner feedback RPC'
  );
  await assertRpcBoolean(
    config,
    config.userAToken,
    'lr_sync_feedback',
    {
      p_expected_user_id: userAId,
      p_item_id: itemId,
      p_action: 'dislike',
      p_updated_at: timestamp(4_000)
    },
    false,
    'stale feedback RPC'
  );

  const watchParameters = {
    p_expected_user_id: userAId,
    p_game_key: itemId,
    p_title: 'RLS RPC probe',
    p_target_price: 2.34,
    p_last_known_price: 2.34,
    p_last_known_store: 'Test store',
    p_created_at: timestamp(1_000),
    p_updated_at: timestamp(6_000)
  };
  await assertRpcBlocked(
    config,
    config.userBToken,
    'lr_sync_watch_item',
    watchParameters,
    'cross-user watch RPC authorization'
  );
  await assertRpcBoolean(
    config,
    config.userAToken,
    'lr_sync_watch_item',
    watchParameters,
    true,
    'owner watch RPC'
  );
  await assertRpcBoolean(
    config,
    config.userAToken,
    'lr_sync_watch_item',
    {
      ...watchParameters,
      p_target_price: 0.01,
      p_updated_at: timestamp(5_000)
    },
    false,
    'stale watch RPC'
  );

  const deletedAt = timestamp(7_000);
  await assertRpcBoolean(
    config,
    config.userAToken,
    'lr_delete_watch_item',
    {
      p_expected_user_id: userAId,
      p_game_key: itemId,
      p_expected_updated_at: timestamp(5_000),
      p_deleted_at: deletedAt
    },
    false,
    'stale conditional delete RPC'
  );
  await assertRpcBoolean(
    config,
    config.userAToken,
    'lr_delete_watch_item',
    {
      p_expected_user_id: userAId,
      p_game_key: itemId,
      p_expected_updated_at: timestamp(6_000),
      p_deleted_at: deletedAt
    },
    true,
    'owner conditional delete RPC'
  );

  const tombstoneRows = await readRows(config, config.userAToken, {
    table: 'lr_watchlist',
    filters: { user_id: userAId, game_key: itemId }
  });
  assert.equal(tombstoneRows.length, 1, 'watch tombstone disappeared');
  assert.equal(
    tombstoneRows[0].deleted_at,
    deletedAt,
    'conditional delete did not persist deleted_at'
  );
}

async function restoreTables(config, definitions, backups) {
  const failures = [];

  for (const definition of [...definitions].reverse()) {
    if (!backups.has(definition.table)) continue;
    try {
      const previousRows = backups.get(definition.table);
      await removeRows(config, config.userAToken, definition);
      for (const row of previousRows) {
        await upsert(config, config.userAToken, definition, row);
      }
    } catch (error) {
      failures.push(`${definition.table}: ${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`RLS probe cleanup failed:\n${failures.join('\n')}`);
  }
}

async function main() {
  const config = readEnvironment();
  const userAId = jwtSubject(config.userAToken, 'LR_RLS_USER_A_JWT');
  const userBId = jwtSubject(config.userBToken, 'LR_RLS_USER_B_JWT');
  assert.notEqual(
    userAId,
    userBId,
    'RLS verification requires tokens for two different users'
  );

  const runId = randomUUID();
  const now = new Date().toISOString();
  const definitions = [
    {
      table: 'lr_profiles',
      conflict: 'user_id',
      filters: { user_id: userAId },
      record: {
        user_id: userAId,
        data: { rlsProbe: 'owner-a' },
        schema_version: 1,
        updated_at: now
      },
      probeColumn: 'data',
      probeValue: { rlsProbe: 'owner-a' },
      intruderPatch: { data: { rlsProbe: 'intruder-b' } }
    },
    {
      table: 'lr_feedback',
      conflict: 'user_id,item_id',
      filters: { user_id: userAId, item_id: `rls-probe-${runId}` },
      record: {
        user_id: userAId,
        item_id: `rls-probe-${runId}`,
        action: 'like',
        updated_at: now
      },
      probeColumn: 'action',
      probeValue: 'like',
      intruderPatch: { action: 'dislike' }
    },
    {
      table: 'lr_watchlist',
      conflict: 'user_id,game_key',
      filters: { user_id: userAId, game_key: `rls-probe-${runId}` },
      record: {
        user_id: userAId,
        game_key: `rls-probe-${runId}`,
        title: 'RLS probe',
        target_price: 1.23,
        updated_at: now
      },
      probeColumn: 'target_price',
      probeValue: 1.23,
      intruderPatch: { target_price: 999.99 }
    },
    {
      table: 'lr_notification_preferences',
      conflict: 'user_id',
      filters: { user_id: userAId },
      record: {
        user_id: userAId,
        target_price_enabled: false,
        free_game_enabled: false,
        weekly_digest_enabled: false,
        timezone: 'Etc/UTC',
        digest_day: 5,
        digest_hour: 10,
        updated_at: now
      },
      probeColumn: 'timezone',
      probeValue: 'Etc/UTC',
      intruderPatch: { timezone: 'Pacific/Honolulu' }
    }
  ];

  const backups = new Map();
  let verificationError;

  try {
    for (const definition of definitions) {
      await verifyTable(config, definition, backups);
    }
    await verifyRpcBoundary(config, userAId, runId);
  } catch (error) {
    verificationError = error;
  }

  try {
    await restoreTables(config, definitions, backups);
  } catch (cleanupError) {
    if (verificationError) {
      throw new AggregateError(
        [verificationError, cleanupError],
        'RLS verification and cleanup both failed'
      );
    }
    throw cleanupError;
  }

  if (verificationError) throw verificationError;

  console.log(
    'Verified owner access, cross-user isolation, and stale RPC protection for 4 account tables.'
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
