const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateSnapshot
} = require('../lib/deal-snapshot-validator.js');

test('rejects a refresh containing failed stores', () => {
  assert.throws(
    () => validateSnapshot(
      { dealCount: 900, storeCount: 14 },
      { dealCount: 1000, storeCount: 14 },
      ['Steam']
    ),
    /failed stores: Steam/i
  );
});

test('rejects an implausible deal-count collapse', () => {
  assert.throws(
    () => validateSnapshot(
      { dealCount: 400, storeCount: 14 },
      { dealCount: 1000, storeCount: 14 },
      []
    ),
    /deal count 400 is below safety minimum 600/i
  );
});

test('rejects an implausible active-store collapse', () => {
  assert.throws(
    () => validateSnapshot(
      { dealCount: 900, storeCount: 7 },
      { dealCount: 1000, storeCount: 14 },
      []
    ),
    /store count 7 is below safety minimum 11/i
  );
});

test('rejects a first refresh with too few deals', () => {
  assert.throws(
    () => validateSnapshot(
      { dealCount: 499, storeCount: 14 },
      null,
      []
    ),
    /deal count 499 is below safety minimum 500/i
  );
});

test('accepts a complete snapshot within the safety thresholds', () => {
  assert.doesNotThrow(
    () => validateSnapshot(
      { dealCount: 850, storeCount: 14 },
      { dealCount: 1000, storeCount: 14 },
      []
    )
  );
});
