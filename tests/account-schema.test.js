const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'db', 'supabase-recommendations.sql'),
  'utf8'
);
const migrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260801211500_account_sync.sql'
);
const notificationMigrationPath = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260801211600_account_notifications.sql'
);
const rlsVerifier = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'verify-account-rls.js'),
  'utf8'
);

test('the production account schema is a transactional Supabase migration', () => {
  assert.equal(fs.existsSync(migrationPath), true, 'account migration is missing');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert.equal(migration, sql, 'migration drifted from the canonical account SQL');
  assert.match(migration, /^-- Run in Supabase SQL editor\s+\s*begin;/i);
  assert.match(migration, /commit;\s*$/i);
});

test('the production notification schema is a Supabase migration', () => {
  assert.equal(
    fs.existsSync(notificationMigrationPath),
    true,
    'notification migration is missing'
  );
  const canonical = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'supabase-notifications.sql'),
    'utf8'
  );
  assert.equal(
    fs.readFileSync(notificationMigrationPath, 'utf8'),
    canonical,
    'notification migration drifted from its canonical SQL'
  );
});

test('account schema contains private synchronized records', () => {
  for (const token of [
    'schema_version integer not null default 1',
    'create table if not exists public.lr_watchlist',
    'primary key (user_id, game_key)',
    'create table if not exists public.lr_notification_preferences',
    'target_price_enabled boolean not null default false',
    'free_game_enabled boolean not null default false',
    'weekly_digest_enabled boolean not null default false'
  ]) {
    assert.match(
      sql,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    );
  }
});

test('every exposed account table enables RLS and checks auth.uid', () => {
  for (const table of [
    'lr_profiles',
    'lr_feedback',
    'lr_watchlist',
    'lr_notification_preferences'
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, 'i')
    );
    assert.match(
      sql,
      new RegExp(
        `create policy "${table} owner"[\\s\\S]+?on public\\.${table} for all to authenticated[\\s\\S]+?using \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)[\\s\\S]+?with check \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)`,
        'i'
      )
    );
  }
});

test('account sync RPCs derive ownership and reject stale timestamps atomically', () => {
  for (const functionName of [
    'lr_sync_profile',
    'lr_sync_feedback',
    'lr_sync_watch_item',
    'lr_delete_watch_item'
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${functionName}`, 'i'));
    assert.match(
      sql,
      new RegExp(
        `function public\\.${functionName}[\\s\\S]+?auth\\.uid\\(\\)[\\s\\S]+?p_expected_user_id`,
        'i'
      )
    );
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]+?from public`, 'i')
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]+?to authenticated`, 'i')
    );
  }

  assert.match(
    sql,
    /excluded\.updated_at\s*>\s*(?:public\.)?lr_profiles\.updated_at/i
  );
  assert.match(
    sql,
    /excluded\.updated_at\s*>\s*(?:public\.)?lr_feedback\.updated_at/i
  );
  assert.match(
    sql,
    /excluded\.updated_at\s*>\s*(?:public\.)?lr_watchlist\.updated_at/i
  );
  assert.match(
    sql,
    /update public\.lr_watchlist[\s\S]+?updated_at\s*=\s*p_expected_updated_at/i
  );
  assert.match(sql, /security definer[\s\S]+?set search_path\s*=\s*''/i);
  assert.match(
    sql,
    /create or replace function public\.lr_keep_newest_account_update\(\)[\s\S]+?new\.updated_at\s*<=\s*old\.updated_at/i
  );
  for (const table of ['lr_profiles', 'lr_feedback', 'lr_watchlist']) {
    assert.match(
      sql,
      new RegExp(
        `create trigger ${table}_keep_newest[\\s\\S]+?before update on public\\.${table}`,
        'i'
      )
    );
  }
});

test('watchlist persistence uses versioned soft-delete tombstones', () => {
  assert.match(sql, /deleted_at timestamptz/i);
  assert.match(
    sql,
    /create or replace function public\.lr_delete_watch_item[\s\S]+?set deleted_at\s*=\s*p_deleted_at[\s\S]+?updated_at\s*=\s*p_deleted_at/i
  );
  assert.match(
    sql,
    /create or replace function public\.lr_sync_watch_item[\s\S]+?deleted_at\s*=\s*null/i
  );
  assert.match(
    sql,
    /comment on column public\.lr_watchlist\.deleted_at[\s\S]+?filter deleted_at is null/i
  );
});

test('live RLS verifier exercises the RPC authorization and convergence boundary', () => {
  for (const token of [
    'lr_sync_profile',
    'lr_sync_feedback',
    'lr_sync_watch_item',
    'lr_delete_watch_item',
    'anonymous RPC',
    'p_expected_user_id',
    'deleted_at',
    'stale'
  ]) {
    assert.match(
      rlsVerifier,
      new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    );
  }
});
