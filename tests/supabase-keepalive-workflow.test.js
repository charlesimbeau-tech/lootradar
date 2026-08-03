'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'supabase-keepalive.yml'),
  'utf8'
);

test('Supabase keepalive performs three daily read-only database queries', () => {
  assert.match(workflow, /cron: '23 5,13,21 \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /secrets\.LR_SUPABASE_URL/);
  assert.match(workflow, /secrets\.LR_SUPABASE_ANON_KEY/);
  assert.match(workflow, /\/rest\/v1\/lr_profiles\?select=user_id&limit=1/);
  assert.match(workflow, /--fail-with-body/);
  assert.doesNotMatch(workflow, /SERVICE_ROLE|POST|PATCH|DELETE/);
});
