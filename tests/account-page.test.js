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

test('server deletion verifies caller recency and uses service role only server-side', () => {
  assert.match(deletion, /MAX_SESSION_AGE_SECONDS = 10 \* 60/);
  assert.match(deletion, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(deletion, /getUser\(authorization/);
  assert.match(deletion, /deleteUser\(user\.id/);
  assert.doesNotMatch(html + script, /SUPABASE_SERVICE_ROLE_KEY/);
});
