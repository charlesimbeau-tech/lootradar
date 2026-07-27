const test = require('node:test');
const assert = require('node:assert/strict');

const { safeRedirect } = require('../lib/safe-redirect.js');

test('accepts same-site paths that begin with exactly one slash', () => {
  assert.equal(safeRedirect('/recommendations.html', '/'), '/recommendations.html');
  assert.equal(
    safeRedirect('/recommendations.html?mode=deals#saved', '/'),
    '/recommendations.html?mode=deals#saved'
  );
  assert.equal(
    safeRedirect('%2Frecommendations.html', '/'),
    '/recommendations.html'
  );
});

test('rejects origins, schemes, protocol-relative URLs, and bare paths', () => {
  const unsafe = [
    'https://evil.test',
    'https://thelootradar.com/recommendations.html',
    'javascript:alert(1)',
    'data:text/html,hello',
    'recommendations.html',
    '//evil.test',
    '///evil.test',
    '%2F%2Fevil.test',
    '%252F%252Fevil.test'
  ];

  for (const value of unsafe) {
    assert.equal(safeRedirect(value, '/'), '/', value);
  }
});

test('rejects backslashes and encoded path-confusion forms', () => {
  const unsafe = [
    '\\\\evil.test',
    '/\\evil.test',
    '/%5Cevil.test',
    '%2F%5Cevil.test',
    'C:\\windows\\system32',
    '/safe\\..\\evil'
  ];

  for (const value of unsafe) {
    assert.equal(safeRedirect(value, '/recommendations.html'), '/recommendations.html', value);
  }
});

test('rejects raw or encoded controls and malformed encoding', () => {
  const unsafe = [
    '/safe\u0000path',
    '/safe\npath',
    '/safe\u007fpath',
    '/safe%00path',
    '/safe%0Apath',
    '/safe%7Fpath',
    '/bad%encoding',
    ' /recommendations.html',
    '/recommendations.html '
  ];

  for (const value of unsafe) {
    assert.equal(safeRedirect(value, '/'), '/', JSON.stringify(value));
  }
});

test('validates the fallback and defaults to the site root', () => {
  assert.equal(safeRedirect(null, '/recommendations.html'), '/recommendations.html');
  assert.equal(safeRedirect('', '/recommendations.html'), '/recommendations.html');
  assert.equal(safeRedirect(null, 'https://evil.test'), '/');
  assert.equal(safeRedirect('//evil.test', '//also-evil.test'), '/');
});

test('login redirects default to the private account page', () => {
  for (const value of [
    null,
    '',
    'https://evil.test/account.html',
    '//evil.test/account.html',
    'javascript:alert(1)'
  ]) {
    assert.equal(safeRedirect(value, '/account.html'), '/account.html', String(value));
  }
  assert.equal(
    safeRedirect('/recommendations.html', '/account.html'),
    '/recommendations.html'
  );
});
