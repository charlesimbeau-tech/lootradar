'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  SIX_HOURS_MS,
  loadCurrentWeeklyIssue,
  loadWeeklyIssues,
  renderGuideFeature,
  renderGuideHero,
  renderWeeklyGuide,
  validateWeeklyIssue,
  weeklyGuideRelativePath
} = require('../lib/weekly-guide.js');
const { listWeeklyCandidates } = require('../scripts/list-weekly-candidates.js');

const root = path.resolve(__dirname, '..');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('loads and renders every structured weekly issue', () => {
  const issues = loadWeeklyIssues(root);
  assert.ok(issues.length >= 1);

  for (const issue of issues) {
    assert.equal(validateWeeklyIssue(issue), issue);
    const html = renderWeeklyGuide(issue);
    assert.match(html, new RegExp(`canonical" href="https://thelootradar\\.com/blog/${issue.slug}\\.html"`));
    assert.equal((html.match(/class="weekly-pick"/g) || []).length, 5);
    assert.equal((html.match(/data-track-deal data-track-store/g) || []).length, 5);
    assert.match(html, /price and availability can change/i);
    assert.match(html, /rel="sponsored noopener noreferrer"/);
    assert.match(html, /thelootradar\.goatcounter\.com\/count/);
    const prohibitedDash = new RegExp([
      String.fromCharCode(8212),
      '&m' + 'dash;',
      '&#82' + '12;'
    ].join('|'), 'i');
    assert.doesNotMatch(html, prohibitedDash);
  }
});

test('the newest issue drives both Guides page promotion blocks', () => {
  const issue = loadCurrentWeeklyIssue(root);
  const relativePath = weeklyGuideRelativePath(issue);
  assert.match(renderGuideHero(issue), new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(renderGuideFeature(issue), new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(renderGuideFeature(issue), /Current roundup/);
});

test('rejects stale deal evidence when a new issue is prepared', () => {
  const issue = clone(loadCurrentWeeklyIssue(root));
  const now = new Date(new Date(issue.snapshotUpdatedAt).getTime() + SIX_HOURS_MS + 1);
  assert.throws(
    () => validateWeeklyIssue(issue, { now, maxSnapshotAgeHours: 6 }),
    /no more than 6 hours old/
  );
});

test('rejects duplicate games and unsafe retailer URLs', () => {
  const duplicate = clone(loadCurrentWeeklyIssue(root));
  duplicate.picks[1].title = duplicate.picks[0].title;
  assert.throws(() => validateWeeklyIssue(duplicate), /must be unique/);

  const unsafe = clone(loadCurrentWeeklyIssue(root));
  unsafe.picks[0].dealUrl = 'https://example.com/redirect?dealID=not-approved';
  assert.throws(() => validateWeeklyIssue(unsafe), /unapproved host/);

  const insecure = clone(loadCurrentWeeklyIssue(root));
  insecure.picks[0].imageUrl = 'http://example.com/cover.jpg';
  assert.throws(() => validateWeeklyIssue(insecure), /must use HTTPS/);
});

test('rejects malformed prices and prohibited punctuation', () => {
  const badPrice = clone(loadCurrentWeeklyIssue(root));
  badPrice.picks[0].salePrice = Number.NaN;
  assert.throws(() => validateWeeklyIssue(badPrice), /must be a number/);

  const badOrder = clone(loadCurrentWeeklyIssue(root));
  badOrder.picks[0].salePrice = badOrder.picks[0].normalPrice + 1;
  assert.throws(() => validateWeeklyIssue(badOrder), /cannot exceed/);

  const badCopy = clone(loadCurrentWeeklyIssue(root));
  badCopy.picks[0].copy = `${badCopy.picks[0].copy} ${String.fromCharCode(8212)} wait.`;
  assert.throws(() => validateWeeklyIssue(badCopy), /contains an em dash/);
});

test('candidate selection fails closed on stale snapshots', () => {
  assert.throws(
    () => listWeeklyCandidates({
      base: {
        updatedAt: '2026-07-29T00:00:00.000Z',
        stores: {},
        deals: []
      },
      enriched: { games: [] },
      now: '2026-07-29T06:00:00.001Z'
    }),
    /older than six hours/
  );
});
