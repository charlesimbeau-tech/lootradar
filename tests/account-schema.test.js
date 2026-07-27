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
    /delete from public\.lr_watchlist[\s\S]+?updated_at\s*=\s*p_expected_updated_at/i
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
