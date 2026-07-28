(function (root, factory) {
  const accountData = root && root.LootRadarAccountData
    ? root.LootRadarAccountData
    : (typeof module === 'object' && module.exports ? require('./account-data.js') : null);
  const api = factory(root, accountData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarAccountClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, data) {
  'use strict';

  const PROFILE_STORAGE_KEY = 'lr_rec_profile_v3';
  const WATCHLIST_STORAGE_KEY = 'lr_watchlist_v1';
  const CACHE_OWNER_KEY = 'lr_account_cache_owner_v1';
  const GUEST_PROFILE_STORAGE_KEY = `${PROFILE_STORAGE_KEY}:guest`;
  const GUEST_WATCHLIST_STORAGE_KEY = `${WATCHLIST_STORAGE_KEY}:guest`;
  const WRITE_DELAY_MS = 400;

  function createAccountClient(options) {
    options = options || {};
    const client = options.client;
    const storage = options.storage || null;
    const now = typeof options.now === 'function'
      ? options.now
      : function () { return new Date().toISOString(); };
    const listeners = new Set();
    const pendingWrites = new Map();
    const resourceQueues = new Map();
    const resourceVersions = new Map();
    const watchBaselines = new Map();
    const memoryCaches = new Map();
    let memoryOwner = null;
    let observedUserId;
    let authEpoch = 0;
    let localMutationEpoch = 0;
    let current = {
      status: 'guest',
      user: null,
      profile: null,
      watchlist: null
    };

    if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
      throw new TypeError('A Supabase-compatible client is required.');
    }
    if (!client.rpc || typeof client.rpc !== 'function') {
      throw new TypeError('The Supabase client must support timestamp-guarded RPCs.');
    }
    if (!data || typeof data.mergeProfiles !== 'function') {
      throw new TypeError('LootRadarAccountData must be loaded before the account client.');
    }

    function timestamp() {
      try {
        const value = now();
        if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
        if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
      } catch (_) {
        // Fall through to the system clock.
      }
      return new Date().toISOString();
    }

    function timestampAfter(value) {
      const candidate = timestamp();
      const previous = Date.parse(value);
      if (!Number.isFinite(previous) || Date.parse(candidate) > previous) {
        return candidate;
      }
      return new Date(previous + 1).toISOString();
    }

    function snapshot() {
      return {
        status: current.status,
        user: current.user,
        profile: current.profile,
        watchlist: current.watchlist
      };
    }

    function notify() {
      const value = snapshot();
      listeners.forEach(function (listener) {
        try {
          listener(value);
        } catch (_) {
          // A page listener must not interrupt account synchronization.
        }
      });
    }

    function setStatus(status, extras) {
      current = Object.assign({}, current, extras || {}, { status });
      notify();
      return snapshot();
    }

    function track(result) {
      try {
        const analytics = root && root.LootRadarAnalytics;
        if (analytics && typeof analytics.track === 'function') {
          analytics.track('account_sync', { result });
        }
      } catch (_) {
        // Account features do not depend on analytics availability.
      }
    }

    function cancelPendingWrites() {
      pendingWrites.forEach(function (pending) {
        if (pending.timer !== null) clearTimeout(pending.timer);
        pending.resolvers.forEach(function (resolve) { resolve(false); });
      });
      pendingWrites.clear();
    }

    function invalidateAuth(nextUser) {
      authEpoch += 1;
      cancelPendingWrites();
      current = {
        status: nextUser ? 'syncing' : 'guest',
        user: nextUser || null,
        profile: null,
        watchlist: null
      };
      notify();
    }

    function observeUser(user) {
      const userId = user && user.id ? user.id : null;
      if (observedUserId === undefined) {
        observedUserId = userId;
        return false;
      }
      if (observedUserId === userId) return false;
      observedUserId = userId;
      invalidateAuth(user || null);
      return true;
    }

    async function sessionContext() {
      try {
        const response = await client.auth.getSession();
        if (response && response.error) {
          return { failed: true, session: null, user: null };
        }
        const activeSession = response && response.data ? response.data.session : null;
        const user = activeSession && activeSession.user ? activeSession.user : null;
        observeUser(user);
        return {
          failed: false,
          session: activeSession || null,
          user
        };
      } catch (_) {
        return { failed: true, session: null, user: null };
      }
    }

    function operationToken(user) {
      return { userId: user.id, epoch: authEpoch };
    }

    async function operationIsCurrent(token) {
      if (!token || token.epoch !== authEpoch) return false;
      const context = await sessionContext();
      return !context.failed &&
        token.epoch === authEpoch &&
        Boolean(context.user) &&
        context.user.id === token.userId;
    }

    function cancelledResult() {
      return { synced: false, delayed: true, cancelled: true };
    }

    function delayed(extras, shouldTrack) {
      setStatus('delayed', extras);
      if (shouldTrack !== false) track('failure');
      return Object.assign({ synced: false, delayed: true }, extras || {});
    }

    function storageGet(key) {
      if (!storage || typeof storage.getItem !== 'function') return null;
      try {
        return storage.getItem(key);
      } catch (_) {
        return null;
      }
    }

    function storageSet(key, value) {
      if (!storage || typeof storage.setItem !== 'function') return true;
      try {
        storage.setItem(key, value);
        return true;
      } catch (_) {
        return false;
      }
    }

    function storageRemove(key) {
      if (!storage || typeof storage.removeItem !== 'function') return true;
      try {
        storage.removeItem(key);
        return true;
      } catch (_) {
        return false;
      }
    }

    function userCacheKey(base, userId) {
      return `${base}:user:${encodeURIComponent(userId)}`;
    }

    function cacheOwner() {
      return storageGet(CACHE_OWNER_KEY) || memoryOwner;
    }

    function parseStored(key, fallback) {
      try {
        const value = storageGet(key);
        if (value) return JSON.parse(value);
      } catch (_) {
        // Invalid cache data is ignored.
      }
      return fallback;
    }

    function readUserCache(userId) {
      if (memoryCaches.has(userId)) return memoryCaches.get(userId);
      return {
        profile: parseStored(userCacheKey(PROFILE_STORAGE_KEY, userId), {}),
        watchlist: parseStored(userCacheKey(WATCHLIST_STORAGE_KEY, userId), {})
      };
    }

    function hasGuestCache() {
      return storageGet(GUEST_PROFILE_STORAGE_KEY) !== null ||
        storageGet(GUEST_WATCHLIST_STORAGE_KEY) !== null ||
        memoryCaches.has('guest');
    }

    function readGuestCache(localProfile, localWatchlist) {
      if (memoryCaches.has('guest')) return memoryCaches.get('guest');
      const owner = cacheOwner();
      const distinct = hasGuestCache();
      const mayUseGeneric = !owner || owner === 'guest';
      const profile = distinct
        ? parseStored(GUEST_PROFILE_STORAGE_KEY, {})
        : (mayUseGeneric ? parseStored(PROFILE_STORAGE_KEY, localProfile || {}) : {});
      const watchlist = distinct
        ? parseStored(GUEST_WATCHLIST_STORAGE_KEY, {})
        : (mayUseGeneric ? parseStored(WATCHLIST_STORAGE_KEY, localWatchlist || {}) : {});
      return {
        profile: data.normalizeProfile(profile, timestamp()),
        watchlist: data.normalizeWatchlist(watchlist, timestamp())
      };
    }

    function chooseSignedInLocal(userId, localProfile, localWatchlist) {
      const owner = cacheOwner();
      if (owner === userId) {
        return {
          profile: data.normalizeProfile(localProfile, timestamp()),
          watchlist: data.normalizeWatchlist(localWatchlist, timestamp()),
          fromGuest: false
        };
      }
      if (!owner || owner === 'guest') {
        const guest = readGuestCache(localProfile, localWatchlist);
        return {
          profile: guest.profile,
          watchlist: guest.watchlist,
          fromGuest: true,
          distinctGuest: hasGuestCache()
        };
      }
      const cached = readUserCache(userId);
      return {
        profile: data.normalizeProfile(cached.profile, timestamp()),
        watchlist: data.normalizeWatchlist(cached.watchlist, timestamp()),
        fromGuest: false
      };
    }

    function chooseGuestLocal(localProfile, localWatchlist) {
      return readGuestCache(localProfile, localWatchlist);
    }

    function normalizedCache(profile, watchlist) {
      return {
        profile: data.normalizeProfile(profile, timestamp()),
        watchlist: data.normalizeWatchlist(watchlist, timestamp())
      };
    }

    function saveUserSpecificCache(userId, profile, watchlist) {
      const normalized = normalizedCache(profile, watchlist);
      memoryCaches.set(userId, normalized);
      return [
        storageSet(
          userCacheKey(PROFILE_STORAGE_KEY, userId),
          JSON.stringify(normalized.profile)
        ),
        storageSet(
          userCacheKey(WATCHLIST_STORAGE_KEY, userId),
          JSON.stringify(normalized.watchlist)
        )
      ].every(Boolean);
    }

    function clearGuestCache() {
      memoryCaches.delete('guest');
      return [
        storageRemove(GUEST_PROFILE_STORAGE_KEY),
        storageRemove(GUEST_WATCHLIST_STORAGE_KEY)
      ].every(Boolean);
    }

    function saveGuestCache(profile, watchlist) {
      const normalized = normalizedCache(profile, watchlist);
      memoryCaches.set('guest', normalized);
      memoryOwner = 'guest';
      const serializedProfile = JSON.stringify(normalized.profile);
      const serializedWatchlist = JSON.stringify(normalized.watchlist);
      return [
        storageSet(GUEST_PROFILE_STORAGE_KEY, serializedProfile),
        storageSet(GUEST_WATCHLIST_STORAGE_KEY, serializedWatchlist),
        storageSet(PROFILE_STORAGE_KEY, serializedProfile),
        storageSet(WATCHLIST_STORAGE_KEY, serializedWatchlist),
        storageSet(CACHE_OWNER_KEY, 'guest')
      ].every(Boolean);
    }

    function saveUserCache(userId, profile, watchlist) {
      const normalized = {
        profile: data.normalizeProfile(profile, timestamp()),
        watchlist: data.normalizeWatchlist(watchlist, timestamp())
      };
      const serializedProfile = JSON.stringify(normalized.profile);
      const serializedWatchlist = JSON.stringify(normalized.watchlist);
      if (!saveUserSpecificCache(userId, normalized.profile, normalized.watchlist)) {
        return false;
      }
      const writes = [
        storageSet(PROFILE_STORAGE_KEY, serializedProfile),
        storageSet(WATCHLIST_STORAGE_KEY, serializedWatchlist)
      ];
      if (writes.some(function (success) { return !success; })) return false;
      if (!storageSet(CACHE_OWNER_KEY, userId)) return false;
      memoryOwner = userId;
      return clearGuestCache();
    }

    function saveResourceCache(userId, resource, value) {
      if (cacheOwner() !== userId) return false;
      const cached = readUserCache(userId);
      if (resource === 'watchlist') cached.watchlist = value;
      else cached.profile = value;
      return saveUserCache(userId, cached.profile, cached.watchlist);
    }

    function feedbackRows(profile) {
      const normalized = data.normalizeProfile(profile, timestamp());
      const rows = [];
      Object.keys(normalized.likes).forEach(function (key) {
        rows.push({ itemId: key, action: 'like', updatedAt: normalized.likes[key] });
      });
      Object.keys(normalized.dislikes).forEach(function (key) {
        rows.push({ itemId: key, action: 'dislike', updatedAt: normalized.dislikes[key] });
      });
      return rows;
    }

    function watchRows(watchlist) {
      const normalized = data.normalizeWatchlist(watchlist, timestamp());
      return Object.keys(normalized).sort().map(function (key) {
        return normalized[key];
      });
    }

    async function rpcBoolean(name, parameters) {
      try {
        const response = await client.rpc(name, parameters);
        return Boolean(response && !response.error && response.data === true);
      } catch (_) {
        return false;
      }
    }

    async function writeProfile(profile, token) {
      if (!await operationIsCurrent(token)) return { success: false, cancelled: true };
      const normalized = data.normalizeProfile(profile, timestamp());
      const success = await rpcBoolean('lr_sync_profile', {
        p_expected_user_id: token.userId,
        p_data: normalized,
        p_schema_version: normalized.schemaVersion,
        p_updated_at: normalized.updatedAt
      });
      return { success };
    }

    async function writeFeedback(profile, token) {
      if (!await operationIsCurrent(token)) return { success: false, cancelled: true };
      const rows = feedbackRows(profile);
      const results = await Promise.all(rows.map(function (row) {
        return rpcBoolean('lr_sync_feedback', {
          p_expected_user_id: token.userId,
          p_item_id: row.itemId,
          p_action: row.action,
          p_updated_at: row.updatedAt
        });
      }));
      return { success: results.every(Boolean) };
    }

    function cloneBaseline(source) {
      return new Map(source ? Array.from(source.entries()) : []);
    }

    function baselineFromWatchlist(watchlist) {
      const baseline = new Map();
      Object.keys(watchlist).forEach(function (key) {
        baseline.set(key, watchlist[key].updatedAt);
      });
      return baseline;
    }

    async function writeWatchlist(watchlist, token, baseline, allowDeletes) {
      if (!await operationIsCurrent(token)) {
        return { success: false, cancelled: true, baseline };
      }
      const rows = watchRows(watchlist);
      const rowsToUpsert = allowDeletes
        ? rows.filter(function (item) {
          const baselineTimestamp = baseline && baseline.get(item.key);
          return !baselineTimestamp ||
            Date.parse(item.updatedAt) > Date.parse(baselineTimestamp);
        })
        : rows;
      const upserts = await Promise.all(rowsToUpsert.map(function (item) {
        return rpcBoolean('lr_sync_watch_item', {
          p_expected_user_id: token.userId,
          p_game_key: item.key,
          p_title: item.title,
          p_target_price: item.targetPrice,
          p_last_known_price: item.lastKnownPrice,
          p_last_known_store: item.lastKnownStore,
          p_created_at: item.addedAt,
          p_updated_at: item.updatedAt
        });
      }));
      if (!upserts.every(Boolean)) return { success: false, baseline };

      const currentKeys = new Set(rows.map(function (item) { return item.key; }));
      const removals = allowDeletes
        ? Array.from((baseline || new Map()).entries()).filter(function (entry) {
          return !currentKeys.has(entry[0]);
        })
        : [];
      const deleted = await Promise.all(removals.map(function (entry) {
        const deletedAt = timestampAfter(entry[1]);
        return rpcBoolean('lr_delete_watch_item', {
          p_expected_user_id: token.userId,
          p_game_key: entry[0],
          p_expected_updated_at: entry[1],
          p_deleted_at: deletedAt
        });
      }));
      if (!deleted.every(Boolean)) return { success: false, baseline };
      return { success: true, baseline: baselineFromWatchlist(data.normalizeWatchlist(watchlist, timestamp())) };
    }

    function enqueueResource(name, task) {
      const previous = resourceQueues.get(name) || Promise.resolve();
      const next = previous.catch(function () {}).then(task);
      const tail = next.catch(function () {});
      resourceQueues.set(name, tail);
      tail.finally(function () {
        if (resourceQueues.get(name) === tail) resourceQueues.delete(name);
      });
      return next;
    }

    function prepareProfile(profile) {
      const editTimestamp = timestamp();
      return data.normalizeProfile(
        Object.assign({}, profile || {}, { updatedAt: editTimestamp }),
        editTimestamp
      );
    }

    function comparableWatchItem(item) {
      return JSON.stringify({
        title: item.title,
        targetPrice: item.targetPrice,
        lastKnownPrice: item.lastKnownPrice,
        lastKnownStore: item.lastKnownStore
      });
    }

    function prepareWatchlist(watchlist, userId) {
      const editTimestamp = timestamp();
      const normalized = data.normalizeWatchlist(watchlist, editTimestamp);
      const source = userId === 'guest'
        ? readGuestCache({}, {})
        : readUserCache(userId);
      const previous = data.normalizeWatchlist(source.watchlist, editTimestamp);
      Object.keys(normalized).forEach(function (key) {
        if (!previous[key] ||
            comparableWatchItem(previous[key]) !== comparableWatchItem(normalized[key])) {
          normalized[key].updatedAt = editTimestamp;
        }
      });
      return normalized;
    }

    function nextVersion(name) {
      const version = (resourceVersions.get(name) || 0) + 1;
      resourceVersions.set(name, version);
      return version;
    }

    function finishBackground(result, token, version, resource, value) {
      if (token.epoch !== authEpoch || resourceVersions.get(resource) !== version) {
        return Boolean(result && result.success);
      }
      if (result && result.success) {
        const extras = { user: current.user };
        if (resource === 'watchlist') extras.watchlist = value;
        else extras.profile = value;
        setStatus('synced', extras);
        track('success');
        return true;
      }
      if (result && result.cancelled) return false;
      setStatus('delayed');
      track('failure');
      return false;
    }

    function debouncedWrite(resource, input, prepare, writer) {
      return new Promise(function (resolve) {
        sessionContext().then(async function (context) {
          if (context.failed) {
            delayed();
            resolve(false);
            return;
          }
          if (!context.user || !context.user.id) {
            const guest = readGuestCache({}, {});
            const value = prepare(input, 'guest');
            if (resource === 'watchlist') guest.watchlist = value;
            else guest.profile = value;
            saveGuestCache(guest.profile, guest.watchlist);
            setStatus('guest', {
              user: null,
              profile: guest.profile,
              watchlist: guest.watchlist
            });
            resolve(false);
            return;
          }
          const owner = cacheOwner();
          if (owner && owner !== 'guest' && owner !== context.user.id) {
            delayed({ user: context.user, profile: null, watchlist: null });
            resolve(false);
            return;
          }

          const token = operationToken(context.user);
          const value = prepare(input, context.user.id);
          let locallySaved;
          if (!owner || owner === 'guest') {
            const guest = readGuestCache({}, {});
            locallySaved = saveUserSpecificCache(
              context.user.id,
              resource === 'watchlist' ? guest.profile : value,
              resource === 'watchlist' ? value : guest.watchlist
            );
          } else {
            locallySaved = saveResourceCache(context.user.id, resource, value);
          }
          if (!locallySaved) {
            delayed({ user: context.user });
            resolve(false);
            return;
          }
          localMutationEpoch += 1;
          const version = nextVersion(resource);
          const extras = { user: context.user };
          if (resource === 'watchlist') extras.watchlist = value;
          else extras.profile = value;
          setStatus('syncing', extras);

          let pending = pendingWrites.get(resource);
          if (pending && pending.token.userId !== token.userId) {
            clearTimeout(pending.timer);
            pending.resolvers.forEach(function (settle) { settle(false); });
            pending = null;
          }
          if (!pending) {
            pending = {
              timer: null,
              token,
              value,
              version,
              resolvers: []
            };
          }
          clearTimeout(pending.timer);
          pending.token = token;
          pending.value = value;
          pending.version = version;
          pending.resolvers.push(resolve);
          pending.timer = setTimeout(function () {
            pendingWrites.delete(resource);
            enqueueResource(resource, async function () {
              if (!await operationIsCurrent(pending.token)) {
                return { success: false, cancelled: true };
              }
              const result = await writer(pending.value, pending.token);
              if (!await operationIsCurrent(pending.token)) {
                return { success: false, cancelled: true };
              }
              if (resource === 'watchlist' && result.success && result.baseline) {
                watchBaselines.set(pending.token.userId, cloneBaseline(result.baseline));
              }
              return result;
            }).then(function (result) {
              const success = finishBackground(
                result,
                pending.token,
                pending.version,
                resource,
                pending.value
              );
              pending.resolvers.forEach(function (settle) { settle(success); });
            }).catch(function () {
              const success = finishBackground(
                { success: false },
                pending.token,
                pending.version,
                resource,
                pending.value
              );
              pending.resolvers.forEach(function (settle) { settle(success); });
            });
          }, WRITE_DELAY_MS);
          pendingWrites.set(resource, pending);
        }).catch(function () {
          delayed();
          resolve(false);
        });
      });
    }

    async function loadAndMerge(localProfile, localWatchlist) {
      const context = await sessionContext();
      if (context.failed) return delayed();

      if (!context.user) {
        const guest = chooseGuestLocal(localProfile, localWatchlist);
        setStatus('guest', {
          user: null,
          profile: guest.profile,
          watchlist: guest.watchlist
        });
        return {
          profile: guest.profile,
          watchlist: guest.watchlist,
          synced: false,
          guest: true
        };
      }

      const token = operationToken(context.user);
      const startingMutationEpoch = localMutationEpoch;
      const local = chooseSignedInLocal(
        context.user.id,
        localProfile,
        localWatchlist
      );
      setStatus('syncing', {
        user: context.user,
        profile: null,
        watchlist: null
      });

      let profileResponse;
      let feedbackResponse;
      let watchResponse;
      try {
        [profileResponse, feedbackResponse, watchResponse] = await Promise.all([
          client.from('lr_profiles').select('data,updated_at,schema_version').maybeSingle(),
          client.from('lr_feedback').select('item_id,action,updated_at'),
          client.from('lr_watchlist').select('*')
        ]);
      } catch (_) {
        if (!await operationIsCurrent(token)) return cancelledResult();
        return delayed({
          user: context.user,
          profile: local.profile,
          watchlist: local.watchlist
        });
      }

      if (!await operationIsCurrent(token) ||
          startingMutationEpoch !== localMutationEpoch) return cancelledResult();
      if (
        !profileResponse || profileResponse.error ||
        !feedbackResponse || feedbackResponse.error ||
        !watchResponse || watchResponse.error
      ) {
        return delayed({
          user: context.user,
          profile: local.profile,
          watchlist: local.watchlist
        });
      }

      const profileRow = profileResponse.data || {};
      const profileData = Object.assign({}, profileRow.data || {});
      if (!profileData.updatedAt && profileRow.updated_at) profileData.updatedAt = profileRow.updated_at;
      if (!profileData.schemaVersion && profileRow.schema_version) {
        profileData.schemaVersion = profileRow.schema_version;
      }
      const remoteProfile = data.applyFeedbackRows(
        profileData,
        Array.isArray(feedbackResponse.data) ? feedbackResponse.data : []
      );
      const profile = data.mergeProfiles(local.profile, remoteProfile);
      const remoteWatchRows = Array.isArray(watchResponse.data) ? watchResponse.data : [];
      const watchlist = data.mergeWatchlists(local.watchlist, remoteWatchRows);

      const initialBaseline = baselineFromWatchlist(
        data.normalizeWatchlist(remoteWatchRows, timestamp())
      );
      const written = await Promise.all([
        enqueueResource('profile', function () { return writeProfile(profile, token); }),
        enqueueResource('feedback', function () { return writeFeedback(profile, token); }),
        enqueueResource('watchlist', function () {
          return writeWatchlist(watchlist, token, initialBaseline, false);
        })
      ]);

      if (!await operationIsCurrent(token) ||
          startingMutationEpoch !== localMutationEpoch) return cancelledResult();
      const allWritten = written.every(function (result) { return result.success; });
      if (!allWritten) {
        const staged = saveUserSpecificCache(context.user.id, profile, watchlist);
        if (local.fromGuest && !local.distinctGuest) {
          saveGuestCache(profile, watchlist);
        }
        if (!staged) return delayed({ user: context.user, profile, watchlist });
        return delayed({ user: context.user, profile, watchlist });
      }
      const localSaved = saveUserCache(context.user.id, profile, watchlist);
      if (!localSaved) return delayed({ user: context.user, profile, watchlist });

      watchBaselines.set(context.user.id, baselineFromWatchlist(watchlist));
      setStatus('synced', { user: context.user, profile, watchlist });
      track('success');
      return { profile, watchlist, synced: true };
    }

    async function session() {
      const context = await sessionContext();
      if (context.failed) {
        setStatus('delayed');
        return null;
      }
      if (!context.user) {
        setStatus('guest', { user: null, profile: null, watchlist: null });
      } else {
        setStatus('syncing', { user: context.user, profile: null, watchlist: null });
      }
      return context.session;
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') return function () {};
      listeners.add(listener);
      try {
        listener(snapshot());
      } catch (_) {
        // Subscription delivery is isolated from the client.
      }
      return function () { listeners.delete(listener); };
    }

    async function signOut() {
      try {
        const response = await client.auth.signOut();
        if (response && response.error) {
          setStatus('delayed');
          return false;
        }
        observedUserId = null;
        invalidateAuth(null);
        const guest = readGuestCache({}, {});
        if (!saveGuestCache(guest.profile, guest.watchlist)) {
          return delayed({ user: null, profile: guest.profile, watchlist: guest.watchlist });
        }
        setStatus('guest', {
          user: null,
          profile: guest.profile,
          watchlist: guest.watchlist
        });
        return true;
      } catch (_) {
        setStatus('delayed');
        return false;
      }
    }

    if (typeof client.auth.onAuthStateChange === 'function') {
      try {
        client.auth.onAuthStateChange(function (_event, authSession) {
          const user = authSession && authSession.user ? authSession.user : null;
          const changed = observeUser(user);
          if (!changed) {
            if (!user) {
              setStatus('guest', { user: null, profile: null, watchlist: null });
            } else if (!current.user || current.user.id !== user.id) {
              setStatus('syncing', { user, profile: null, watchlist: null });
            }
          }
        });
      } catch (_) {
        // Session polling through session() remains available.
      }
    }

    return {
      session,
      subscribe,
      state: snapshot,
      syncProfile: function (profile) {
        return debouncedWrite('profile', profile, prepareProfile, writeProfile);
      },
      syncFeedback: function (profile) {
        return debouncedWrite('feedback', profile, prepareProfile, writeFeedback);
      },
      syncWatchlist: function (watchlist) {
        return debouncedWrite(
          'watchlist',
          watchlist,
          prepareWatchlist,
          function (value, token) {
            const baseline = watchBaselines.get(token.userId) || new Map();
            return writeWatchlist(value, token, baseline, true);
          }
        );
      },
      loadAndMerge,
      signOut
    };
  }

  return {
    PROFILE_STORAGE_KEY,
    WATCHLIST_STORAGE_KEY,
    CACHE_OWNER_KEY,
    GUEST_PROFILE_STORAGE_KEY,
    GUEST_WATCHLIST_STORAGE_KEY,
    WRITE_DELAY_MS,
    createAccountClient
  };
});
