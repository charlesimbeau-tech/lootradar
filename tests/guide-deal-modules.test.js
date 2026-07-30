const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGuideModules,
  replaceLiveModule,
  renderDiscountArticle
} = require('../scripts/build-guide-deal-modules.js');

function deal(overrides = {}) {
  return {
    title: 'Psychonauts',
    eligible: true,
    excludedContent: false,
    isBundle: false,
    isEarlyAccess: false,
    salePrice: 0.99,
    normalPrice: 9.99,
    discount: 90,
    userRating: 95,
    reviewCount: 8932,
    dealScore: 92,
    steamAppID: '3830',
    storeName: 'Steam',
    genres: ['Action'],
    ...overrides
  };
}

const snapshot = { updatedAt: '2026-07-29T18:15:00.000Z' };

test('guide modules use current evidence, permanent pages, and qualified language', () => {
  const modules = createGuideModules({
    snapshot,
    deals: [
      deal(),
      deal({
        title: 'Injustice 2',
        steamAppID: '627270',
        salePrice: 4.99,
        normalPrice: 49.99,
        userRating: 85,
        reviewCount: 6871,
        dealScore: 89
      })
    ],
    permanentDeals: [
      deal(),
      deal({
        title: 'Injustice 2',
        steamAppID: '627270',
        salePrice: 4.99,
        normalPrice: 49.99,
        userRating: 85,
        reviewCount: 6871,
        dealScore: 89
      })
    ]
  });

  assert.match(modules.comparison, /Prices checked July 29, 2026/);
  assert.match(modules.comparison, /psychonauts-3830\.html/);
  assert.match(modules.steam, /Steam listings under \$10/);
  assert.match(modules.free, /No quality-qualified zero-price listing/);
  assert.doesNotMatch(Object.values(modules).join('\n'), /\u2014|historical low/i);
});

test('live module replacement is stable and rejects missing markers', () => {
  const source = '<p>Before</p><!-- LIVE_GUIDE_MODULE_START -->old<!-- LIVE_GUIDE_MODULE_END --><p>After</p>';
  const updated = replaceLiveModule(source, '<section>new</section>');
  assert.match(updated, /START --><section>new<\/section><!-- LIVE/);
  assert.throws(() => replaceLiveModule('<p>No marker</p>', 'new'), /marker block/);
});

test('the generated analysis article explains its sample and avoids absolute claims', () => {
  const html = renderDiscountArticle({
    snapshot,
    deals: [
      deal(),
      deal({ title: 'Weak evidence', steamAppID: '444', userRating: 70, reviewCount: 100 })
    ],
    permanentDeals: [deal()]
  });

  assert.match(html, /Does a 90% discount actually mean a good PC game deal\?/);
  assert.match(html, /2 qualifying game listings/);
  assert.match(html, /Prices checked July 29, 2026/);
  assert.match(html, /This is a snapshot analysis/);
  assert.match(html, /class="guide-data-hero"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /rel="canonical" href="https:\/\/thelootradar\.com\/blog\/are-90-percent-discounts-good\.html"/);
  assert.doesNotMatch(html, /\u2014|guarantee|proves|historical low/i);
});
