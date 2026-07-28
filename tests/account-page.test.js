const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'account.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'account.js'), 'utf8');
const deletion = fs.readFileSync(
  path.join(root, 'supabase', 'functions', 'delete-account', 'index.ts'),
  'utf8'
);

test('private dashboard exposes the approved account controls without indexing', () => {
  assert.match(html, /name="robots" content="noindex,follow"/);
  for (const token of [
    'Watched games and target prices',
    'Recommendation preferences',
    'Deal email',
    'Recent alert history',
    'id="linkGoogle"',
    'id="signOut"',
    'id="openDelete"'
  ]) assert.ok(html.includes(token), `missing ${token}`);
});

test('dashboard renders dynamic private values through text nodes only', () => {
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(script, /\.textContent\s*=/);
  assert.match(script, /createTextNode/);
  assert.match(script, /confirm:\s*'DELETE'/);
  assert.match(script, /account_delete_request/);
});

test('dashboard exposes three independent default-off alert toggles and an all-email off action', () => {
  for (const token of [
    'id="targetPriceAlert"',
    'id="freeGameAlert"',
    'id="weeklyDigestAlert"',
    'id="disableAllAlerts"'
  ]) assert.ok(html.includes(token), `missing ${token}`);
  assert.equal((html.match(/type="checkbox" disabled/g) || []).length, 3);
  assert.match(script, /window\.LR_ALERTS_ENABLED === true/);
  assert.match(script, /Email alerts are not available yet\./);
});

test('dashboard uses fixed preference mappings and browser-local digest defaults', () => {
  assert.match(script, /target_price:\s*'target_price_enabled'/);
  assert.match(script, /free_game:\s*'free_game_enabled'/);
  assert.match(script, /weekly_digest:\s*'weekly_digest_enabled'/);
  assert.match(script, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(script, /'America\/New_York'/);
  assert.match(script, /digest_day:\s*5/);
  assert.match(script, /digest_hour:\s*10/);
  assert.match(script, /\.from\('lr_notification_preferences'\)\.upsert/);
  assert.doesNotMatch(script, /\[event\.target\.dataset\.column\]/);
});

test('dashboard loads only safe recent delivery-history fields', () => {
  assert.match(script, /\.from\('lr_alert_deliveries'\)/);
  assert.match(script, /\.select\('alert_type,status,created_at'\)/);
  assert.match(script, /\.order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(script, /\.limit\(20\)/);
  assert.doesNotMatch(script, /provider_message_id|condition_key|game_key/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});

test('server deletion verifies caller recency and uses service role only server-side', () => {
  assert.match(deletion, /MAX_SESSION_AGE_SECONDS = 10 \* 60/);
  assert.match(deletion, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(deletion, /getUser\(authorization/);
  assert.match(deletion, /deleteUser\(user\.id/);
  assert.doesNotMatch(html + script, /SUPABASE_SERVICE_ROLE_KEY/);
});
