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

test('login controls fail closed until the authentication service is healthy', () => {
  const login = read('login.html');
  const controller = read('lib/auth-controller.js');
  const startup = read('login.js');

  assert.match(login, /id="googleLogin"[^>]*disabled/);
  assert.match(login, /id="loginEmail"[^>]*disabled/);
  assert.match(login, /id="sendLogin"[^>]*disabled/);
  assert.match(controller, /\/auth\/v1\/health/);
  assert.match(startup, /probeAuthService/);
  assert.match(startup, /setUnavailable/);
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

test('account surfaces reuse the navigation Supabase client', () => {
  const navigation = read('lib/auth-nav.js');
  assert.match(navigation, /function clientFor\(browser\)/);
  assert.equal((navigation.match(/\.createClient\s*\(/g) || []).length, 1);

  for (const file of ['app.js', 'recommendations.js', 'account.js', 'login.js']) {
    const source = read(file);
    assert.match(source, /LootRadarAuthNav\.clientFor\(window\)/, `${file} requests the shared client`);
    assert.doesNotMatch(source, /(?:window\.)?supabase\.createClient\s*\(/, `${file} does not create a second client`);
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

test('recommendation feedback uses discoverable visible button names', () => {
  const html = read('recommendations.html');
  const source = read('recommendations.js');
  assert.match(html, /Use <strong>More like this<\/strong> or <strong>Not for me<\/strong>/);
  assert.match(source, />More like this<\/button>/);
  assert.match(source, />Not for me<\/button>/);
  assert.match(source, /Choose More like this on a few games/);
  assert.doesNotMatch(source, /Hit like on a few games/);
});

test('recommendations expose synchronized trusted-store controls and filtering', () => {
  const html = read('recommendations.html');
  const source = read('recommendations.js');
  assert.match(html, /Stores you trust/);
  assert.match(html, /id="storePills"/);
  assert.match(html, /id="trustAllStores"/);
  assert.match(source, /stores:\s*\[\]/);
  assert.match(source, /profile\.stores\.indexOf\(gameStoreName\(game\)\)/);
  assert.match(source, /saveProfile\(\);\s*buildStorePills\(\);\s*renderRecommendations\(\)/);
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
