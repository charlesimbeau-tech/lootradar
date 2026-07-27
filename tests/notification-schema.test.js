const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schemaPath = path.join(__dirname, '..', 'db', 'supabase-notifications.sql');

function readSchema() {
  return fs.readFileSync(schemaPath, 'utf8');
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function policiesFor(sql, table) {
  const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = sql.matchAll(
    new RegExp(
      `create\\s+policy\\s+["'][^"']+["']\\s+on\\s+(?:public\\.)?${escapedTable}\\s+([\\s\\S]*?);`,
      'gi'
    )
  );
  return [...matches].map(match => normalizeSql(match[0]));
}

test('creates delivery and processed snapshot persistence', () => {
  const sql = readSchema();

  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.lr_alert_deliveries/i);
  assert.match(
    sql,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+lr_alert_delivery_condition\s+on\s+public\.lr_alert_deliveries\s*\(\s*user_id\s*,\s*condition_key\s*\)/i
  );
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.lr_processed_snapshots/i);
});

test('enforces the delivery state and alert type contracts', () => {
  const sql = normalizeSql(readSchema());

  assert.match(
    sql,
    /alert_type text not null check \(alert_type in \('target_price','free_game','weekly_digest'\)\)/
  );
  assert.match(
    sql,
    /status text not null check \(status in \('pending','sending','delivered','retryable','failed','suppressed'\)\)/
  );
  assert.match(
    sql,
    /status text not null check \(status in \('processing','processed','rejected','failed'\)\)/
  );
});

test('enables row level security on both server-owned tables', () => {
  const sql = readSchema();

  assert.match(
    sql,
    /alter\s+table\s+public\.lr_alert_deliveries\s+enable\s+row\s+level\s+security\s*;/i
  );
  assert.match(
    sql,
    /alter\s+table\s+public\.lr_processed_snapshots\s+enable\s+row\s+level\s+security\s*;/i
  );
});

test('authenticated owners can read only their delivery history', () => {
  const policies = policiesFor(readSchema(), 'lr_alert_deliveries');

  assert.equal(policies.length, 1);
  assert.match(policies[0], /\bfor select\b/);
  assert.match(policies[0], /\bto authenticated\b/);
  assert.match(policies[0], /using \(\(select auth\.uid\(\)\) = user_id\)/);
});

test('browser roles have no write policy for delivery or snapshot rows', () => {
  const sql = readSchema();
  const deliveryPolicies = policiesFor(sql, 'lr_alert_deliveries');
  const snapshotPolicies = policiesFor(sql, 'lr_processed_snapshots');
  const allServerPolicies = [...deliveryPolicies, ...snapshotPolicies];

  assert.equal(snapshotPolicies.length, 0);
  for (const policy of allServerPolicies) {
    assert.doesNotMatch(policy, /\bfor (?:all|insert|update|delete)\b/);
    assert.doesNotMatch(policy, /\bto (?:anon|public)\b/);
  }
});
