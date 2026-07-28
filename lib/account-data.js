(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarAccountData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value instanceof Map) {
      const clone = {};
      value.forEach(function (entry, key) {
        clone[String(key)] = cloneValue(entry);
      });
      return clone;
    }
    if (isRecord(value)) {
      const clone = {};
      Object.keys(value).forEach(function (key) {
        clone[key] = cloneValue(value[key]);
      });
      return clone;
    }
    return value;
  }

  function timestampOr(value, fallback) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
    if (typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value))) return value;
    return fallback;
  }

  function currentTimestamp(now) {
    const supplied = timestampOr(now, null);
    return supplied || new Date().toISOString();
  }

  function actionEntries(value) {
    if (value instanceof Map) return Array.from(value.entries());
    if (!isRecord(value)) return [];
    return Object.keys(value).map(function (key) {
      return [key, value[key]];
    });
  }

  function normalizeActions(value, fallbackTimestamp) {
    const actions = {};
    actionEntries(value).forEach(function (entry) {
      const key = String(entry[0] == null ? '' : entry[0]).trim();
      const rawTimestamp = entry[1];
      if (!key || rawTimestamp === false || rawTimestamp == null) return;

      const timestamp = rawTimestamp === true
        ? fallbackTimestamp
        : timestampOr(rawTimestamp, null);
      if (timestamp) actions[key] = timestamp;
    });
    return actions;
  }

  function mergeActions(local, remote) {
    const merged = {};
    [local, remote].forEach(function (source) {
      actionEntries(source).forEach(function (entry) {
        const key = String(entry[0] == null ? '' : entry[0]).trim();
        const timestamp = timestampOr(entry[1], null);
        if (!key || !timestamp) return;
        if (!merged[key] || Date.parse(timestamp) > Date.parse(merged[key])) {
          merged[key] = timestamp;
        }
      });
    });
    return merged;
  }

  function resolveDirectConflicts(likes, dislikes) {
    Object.keys(likes).forEach(function (key) {
      if (!dislikes[key]) return;
      if (Date.parse(likes[key]) >= Date.parse(dislikes[key])) delete dislikes[key];
      else delete likes[key];
    });
  }

  function normalizeProfile(value, now) {
    const profile = isRecord(value) ? cloneValue(value) : {};
    const fallbackTimestamp = currentTimestamp(now);
    profile.schemaVersion = 1;
    profile.updatedAt = timestampOr(profile.updatedAt, fallbackTimestamp);
    profile.likes = normalizeActions(profile.likes, profile.updatedAt);
    profile.dislikes = normalizeActions(profile.dislikes, profile.updatedAt);
    resolveDirectConflicts(profile.likes, profile.dislikes);
    return profile;
  }

  function watchlistEntries(value) {
    if (value instanceof Map) return Array.from(value.entries());
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return [item && (item.key || item.gameKey || item.game_key), item];
      });
    }
    if (!isRecord(value)) return [];
    return Object.keys(value).map(function (key) {
      return [key, value[key]];
    });
  }

  function normalizeWatchItem(recordKey, value, now) {
    if (!isRecord(value)) return null;

    const key = String(value.key || value.gameKey || value.game_key || recordKey || '').trim();
    const rawTargetPrice = value.targetPrice != null ? value.targetPrice : value.target_price;
    const targetPrice = Number(rawTargetPrice);
    if (!key || !Number.isFinite(targetPrice) || targetPrice < 0) return null;

    const updatedAt = timestampOr(value.updatedAt || value.updated_at, now);
    const addedAt = timestampOr(
      value.addedAt || value.added_at || value.createdAt || value.created_at,
      updatedAt
    );
    const title = String(value.title || key).trim() || key;
    const rawLastKnownPrice = value.lastKnownPrice != null
      ? value.lastKnownPrice
      : value.last_known_price;
    const parsedLastKnownPrice = rawLastKnownPrice === '' || rawLastKnownPrice == null
      ? NaN
      : Number(rawLastKnownPrice);
    const lastKnownPrice = Number.isFinite(parsedLastKnownPrice) && parsedLastKnownPrice >= 0
      ? parsedLastKnownPrice
      : null;
    const rawLastKnownStore = value.lastKnownStore != null
      ? value.lastKnownStore
      : value.last_known_store;
    const normalizedStore = typeof rawLastKnownStore === 'string'
      ? rawLastKnownStore.trim()
      : '';
    const lastKnownStore = normalizedStore || null;
    const deletedAt = timestampOr(value.deletedAt || value.deleted_at, null);

    const item = {
      key,
      title,
      targetPrice,
      lastKnownPrice,
      lastKnownStore,
      addedAt,
      updatedAt
    };
    if (deletedAt) item.deletedAt = deletedAt;
    return item;
  }

  function normalizeWatchlistState(value, now) {
    const fallbackTimestamp = currentTimestamp(now);
    const watchlist = {};
    watchlistEntries(value).forEach(function (entry) {
      const item = normalizeWatchItem(entry[0], entry[1], fallbackTimestamp);
      if (!item) return;
      const current = watchlist[item.key];
      if (!current || Date.parse(item.updatedAt) >= Date.parse(current.updatedAt)) {
        watchlist[item.key] = item;
      }
    });
    return watchlist;
  }

  function normalizeWatchlist(value, now) {
    const state = normalizeWatchlistState(value, now);
    const active = {};
    Object.keys(state).forEach(function (key) {
      if (state[key].deletedAt) return;
      active[key] = state[key];
    });
    return active;
  }

  function mergeProfiles(local, remote) {
    const mergeTimestamp = new Date().toISOString();
    local = normalizeProfile(local, mergeTimestamp);
    remote = normalizeProfile(remote, mergeTimestamp);

    const localWins = Date.parse(local.updatedAt || 0) >= Date.parse(remote.updatedAt || 0);
    const merged = Object.assign({}, localWins ? remote : local, localWins ? local : remote);
    merged.schemaVersion = 1;
    merged.likes = mergeActions(local.likes, remote.likes);
    merged.dislikes = mergeActions(local.dislikes, remote.dislikes);
    resolveDirectConflicts(merged.likes, merged.dislikes);
    return merged;
  }

  function mergeWatchlists(local, remoteRows) {
    const mergeTimestamp = new Date().toISOString();
    const localItems = normalizeWatchlistState(local, mergeTimestamp);
    const remoteItems = normalizeWatchlistState(remoteRows, mergeTimestamp);
    const mergedState = {};

    Object.keys(localItems).forEach(function (key) {
      mergedState[key] = cloneValue(localItems[key]);
    });
    Object.keys(remoteItems).forEach(function (key) {
      const localItem = mergedState[key];
      const remoteItem = remoteItems[key];
      const remoteIsNewer = !localItem ||
        Date.parse(remoteItem.updatedAt) > Date.parse(localItem.updatedAt);
      const tombstoneWinsTie = localItem &&
        Date.parse(remoteItem.updatedAt) === Date.parse(localItem.updatedAt) &&
        Boolean(remoteItem.deletedAt) &&
        !localItem.deletedAt;
      if (remoteIsNewer || tombstoneWinsTie) {
        mergedState[key] = cloneValue(remoteItem);
      }
    });
    const merged = {};
    Object.keys(mergedState).forEach(function (key) {
      if (mergedState[key].deletedAt) return;
      merged[key] = cloneValue(mergedState[key]);
      delete merged[key].deletedAt;
    });
    return merged;
  }

  function applyFeedbackRows(profile, rows) {
    const normalized = normalizeProfile(profile);
    const likes = mergeActions(normalized.likes, {});
    const dislikes = mergeActions(normalized.dislikes, {});

    if (Array.isArray(rows)) {
      rows.forEach(function (row) {
        if (!isRecord(row)) return;
        const key = String(row.itemId || row.item_id || '').trim();
        const action = row.action;
        const timestamp = timestampOr(row.updatedAt || row.updated_at, null);
        if (!key || (action !== 'like' && action !== 'dislike') || !timestamp) return;

        const target = action === 'like' ? likes : dislikes;
        if (!target[key] || Date.parse(timestamp) > Date.parse(target[key])) {
          target[key] = timestamp;
        }
      });
    }

    resolveDirectConflicts(likes, dislikes);
    normalized.likes = likes;
    normalized.dislikes = dislikes;
    return normalized;
  }

  return {
    normalizeProfile,
    normalizeWatchlist,
    mergeProfiles,
    mergeWatchlists,
    applyFeedbackRows
  };
});
