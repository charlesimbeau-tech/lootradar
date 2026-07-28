const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function scriptSources(html) {
  return Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi), match => match[1]);
}

function sourceIndex(sources, fragment) {
  return sources.findIndex(source => source.includes(fragment));
}

test('homepage and recommendations load account dependencies before page code', () => {
  for (const [page, pageScript] of [
    ['index.html', 'app.js'],
    ['recommendations.html', 'recommendations.js']
  ]) {
    const sources = scriptSources(read(page));
    const pageIndex = sourceIndex(sources, pageScript);
    assert.ok(sourceIndex(sources, '@supabase/supabase-js') > -1, `${page} loads Supabase`);
    for (const dependency of [
      'supabase-config.js',
      'lib/account-data.js',
      'lib/account-client.js',
      'lib/auth-controller.js'
    ]) {
      const dependencyIndex = sourceIndex(sources, dependency);
      assert.ok(dependencyIndex > -1, `${page} loads ${dependency}`);
      assert.ok(dependencyIndex < pageIndex, `${dependency} loads before ${pageScript}`);
    }
    assert.ok(
      sourceIndex(sources, 'lib/account-client.js') <
        sourceIndex(sources, 'lib/auth-controller.js'),
      `${page} initializes account sync dependencies before the auth controller`
    );
  }
});

test('each page owns one account client and performs one initial merge', () => {
  for (const file of ['app.js', 'recommendations.js']) {
    const source = read(file);
    assert.equal(
      (source.match(/createAccountClient\s*\(/g) || []).length,
      1,
      `${file} creates exactly one account client`
    );
    assert.equal(
      (source.match(/\.loadAndMerge\s*\(/g) || []).length,
      1,
      `${file} performs exactly one initial merge`
    );
  }
});

test('homepage immediately persists and backgrounds watchlist synchronization', () => {
  const source = read('app.js');
  const saveBody = source.match(/function saveWatchlist\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(saveBody, 'saveWatchlist exists');
  const localWrite = saveBody[1].indexOf('localStorage.setItem');
  const remoteWrite = saveBody[1].indexOf('account.syncWatchlist');
  assert.ok(localWrite > -1, 'watchlist is saved locally');
  assert.ok(remoteWrite > localWrite, 'local save happens before syncWatchlist');
});

test('recommendations sync profile and feedback through the account client', () => {
  const source = read('recommendations.js');
  const saveBody = source.match(/function saveProfile\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(saveBody, 'saveProfile exists');
  const localWrite = saveBody[1].indexOf('localStorage.setItem');
  const profileWrite = saveBody[1].indexOf('account.syncProfile');
  assert.ok(localWrite > -1, 'profile is saved locally');
  assert.ok(profileWrite > localWrite, 'local save happens before syncProfile');
  assert.match(source, /account\.syncFeedback\s*\(/);
  assert.doesNotMatch(source, /supabase\.from\(['"]lr_(?:profiles|feedback)['"]\)/);
});

test('both pages expose local, pending, complete, and delayed status copy', () => {
  for (const file of ['app.js', 'recommendations.js']) {
    const source = read(file);
    for (const label of ['Saved on this device', 'Syncing…', 'Synced', 'Sync delayed']) {
      assert.ok(source.includes(label), `${file} contains "${label}"`);
    }
    assert.match(source, /login\.html\?next=/);
    assert.match(source, /account\.html/);
  }
});
