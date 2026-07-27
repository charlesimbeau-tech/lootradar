const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'db', 'supabase-recommendations.sql'),
  'utf8'
);

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
