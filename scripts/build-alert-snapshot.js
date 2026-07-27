'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildDealDataset } = require('../lib/deal-dataset.js');
const {
  buildAlertSnapshot,
  validateAlertSnapshot
} = require('../lib/alert-snapshot.js');
const config = require('../config/editorial-config.js');

const root = path.resolve(__dirname, '..');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeSnapshotAtomically(output, snapshot) {
  const temporary = `${output}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'w'
    });
    validateAlertSnapshot(readJSON(temporary));
    fs.renameSync(temporary, output);
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Keep the original failure.
    }
    throw error;
  }
}

function buildAlertSnapshotFile(options = {}) {
  const base = options.base || readJSON(path.join(root, 'deals.json'));
  const enriched = options.enriched || readJSON(path.join(root, 'enriched-deals.json'));
  const snapshot = buildAlertSnapshot(base, enriched, {
    buildDataset: options.buildDataset || buildDealDataset,
    config: options.config || config
  });
  const output = path.resolve(options.output || path.join(root, 'alert-deals.json'));
  writeSnapshotAtomically(output, snapshot);
  return { output, snapshot };
}

if (require.main === module) {
  const result = buildAlertSnapshotFile();
  console.log(
    `Published ${result.snapshot.qualifiedDealCount} qualified deals to ${result.output}.`
  );
}

module.exports = { buildAlertSnapshotFile, writeSnapshotAtomically };
