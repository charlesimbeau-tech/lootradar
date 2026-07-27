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
  const WRITE_DELAY_MS = 400;

  function createAccountClient(options) {
    options = options || {};
    const client = options.client;
    const storage = options.storage || null;
    const now = typeof options.now === 'function' ? options.now : function () {
      return new Date().toISOString();
    };
    const listeners = new Set();
    const pendingWrites = new Map();
    let current = {
      status: 'guest',
      user: null,
      profile: null,
      watchlist: null
    };

    if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
      throw new TypeError('A Supabase-compatible client is required.');
    }
    if (!data || typeof data.mergeProfiles !== 'function') {
      throw new TypeError('LootRadarAccountData must be loaded before the account client.');
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

    async function sessionContext() {
      try {
        const response = await client.auth.getSession();
        if (response && response.error) return { failed: true, session: null, user: null };
        const activeSession = response && response.data ? response.data.session : null;
        return {
          failed: false,
          session: activeSession || null,
          user: activeSession && activeSession.user ? activeSession.user : null
        };
      } catch (_) {
        return { failed: true, session: null, user: null };
      }
    }

    function delay(extras, shouldTrack) {
      setStatus('delayed', extras);
      if (shouldTrack !== false) track('failure');
      return Object.assign({ synced: false, delayed: true }, extras || {});
    }

    function saveMergedLocal(profile, watchlist) {
      if (!storage || typeof storage.setItem !== 'function') return true;
      try {
        storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
        storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
        return true;
      } catch (_) {
        return false;
      }
    }

    async function activeUser(expectedUserId) {
      const context = await sessionContext();
      if (context.failed) return { ok: false, guest: false, user: null };
      if (!context.user || !context.user.id) return { ok: false, guest: true, user: null };
      if (expectedUserId && context.user.id !== expectedUserId) {
        return { ok: false, guest: false, user: context.user };
      }
      return { ok: true, guest: false, user: context.user };
    }

    async function writeProfile(profile, expectedUserId) {
      try {
        const context = await activeUser(expectedUserId);
        if (!context.ok) return { success: false, guest: context.guest, user: null };
        const normalized = data.normalizeProfile(profile, timestamp());
        const response = await client.from('lr_profiles').upsert({
          user_id: context.user.id,
          schema_version: normalized.schemaVersion,
          data: normalized,
          updated_at: normalized.updatedAt
        }, { onConflict: 'user_id' });
        return {
          success: !(response && response.error),
          guest: false,
          user: context.user
        };
      } catch (_) {
        return { success: false, guest: false, user: null };
      }
    }

    function feedbackRows(profile, user) {
      const normalized = data.normalizeProfile(profile, timestamp());
      const rows = [];
      Object.keys(normalized.likes).forEach(function (key) {
        rows.push({
          user_id: user.id,
          item_id: key,
          action: 'like',
          updated_at: normalized.likes[key]
        });
      });
      Object.keys(normalized.dislikes).forEach(function (key) {
        rows.push({
          user_id: user.id,
          item_id: key,
          action: 'dislike',
          updated_at: normalized.dislikes[key]
        });
      });
      return rows;
    }

    async function writeFeedback(profile, expectedUserId) {
      try {
        const context = await activeUser(expectedUserId);
        if (!context.ok) return { success: false, guest: context.guest, user: null };
        const rows = feedbackRows(profile, context.user);
        if (!rows.length) return { success: true, guest: false, user: context.user };
        const response = await client.from('lr_feedback').upsert(
          rows,
          { onConflict: 'user_id,item_id' }
        );
        return {
          success: !(response && response.error),
          guest: false,
          user: context.user
        };
      } catch (_) {
        return { success: false, guest: false, user: null };
      }
    }

    function watchRows(watchlist, user) {
      const normalized = data.normalizeWatchlist(watchlist, timestamp());
      return Object.keys(normalized).sort().map(function (key) {
        const item = normalized[key];
        return {
          user_id: user.id,
          game_key: item.key,
          title: item.title,
          target_price: item.targetPrice,
          last_known_price: item.lastKnownPrice,
          last_known_store: item.lastKnownStore,
          created_at: item.addedAt,
          updated_at: item.updatedAt
        };
      });
    }

    async function writeWatchlist(watchlist, knownRemoteKeys, expectedUserId) {
      try {
        const context = await activeUser(expectedUserId);
        if (!context.ok) return { success: false, guest: context.guest, user: null };
        const rows = watchRows(watchlist, context.user);
        let remoteKeys = knownRemoteKeys;

        if (!remoteKeys) {
          const remoteResponse = await client.from('lr_watchlist').select('game_key');
          if (remoteResponse && remoteResponse.error) {
            return { success: false, guest: false, user: context.user };
          }
          remoteKeys = (remoteResponse && Array.isArray(remoteResponse.data) ? remoteResponse.data : [])
            .map(function (row) { return row && row.game_key; })
            .filter(Boolean);
        }

        if (rows.length) {
          const upsertResponse = await client.from('lr_watchlist').upsert(
            rows,
            { onConflict: 'user_id,game_key' }
          );
          if (upsertResponse && upsertResponse.error) {
            return { success: false, guest: false, user: context.user };
          }
        }

        const currentKeys = new Set(rows.map(function (row) { return row.game_key; }));
        const removedKeys = Array.from(new Set(remoteKeys)).filter(function (key) {
          return !currentKeys.has(key);
        }).sort();
        if (removedKeys.length) {
          const deleteResponse = await client
            .from('lr_watchlist')
            .delete()
            .in('game_key', removedKeys);
          if (deleteResponse && deleteResponse.error) {
            return { success: false, guest: false, user: context.user };
          }
        }

        return { success: true, guest: false, user: context.user };
      } catch (_) {
        return { success: false, guest: false, user: null };
      }
    }

    function finishBackground(result, extras) {
      if (result.success) {
        setStatus('synced', Object.assign({ user: result.user }, extras || {}));
        track('success');
        return true;
      }
      if (result.guest) {
        setStatus('guest', Object.assign({ user: null }, extras || {}));
        return false;
      }
      setStatus('delayed', extras);
      track('failure');
      return false;
    }

    function debouncedWrite(name, value, writer, extras) {
      setStatus('syncing', extras ? extras(value) : null);
      return new Promise(function (resolve) {
        sessionContext().then(function (context) {
          if (context.failed) {
            resolve(finishBackground(
              { success: false, guest: false, user: null },
              extras ? extras(value) : null
            ));
            return;
          }
          if (!context.user || !context.user.id) {
            resolve(finishBackground(
              { success: false, guest: true, user: null },
              extras ? extras(value) : null
            ));
            return;
          }

          let pending = pendingWrites.get(name);
          if (pending && pending.expectedUserId !== context.user.id) {
            if (pending.timer !== null) clearTimeout(pending.timer);
            pending.resolvers.forEach(function (settle) { settle(false); });
            pending = null;
          }
          if (!pending) {
            pending = {
              timer: null,
              value: null,
              expectedUserId: context.user.id,
              resolvers: []
            };
          }
          if (pending.timer !== null) clearTimeout(pending.timer);
          pending.value = value;
          pending.resolvers.push(resolve);
          pending.timer = setTimeout(async function () {
            pendingWrites.delete(name);
            let result;
            try {
              result = await writer(pending.value, pending.expectedUserId);
            } catch (_) {
              result = { success: false, guest: false, user: null };
            }
            const success = finishBackground(
              result,
              extras ? extras(pending.value) : null
            );
            pending.resolvers.forEach(function (settle) {
              settle(success);
            });
          }, WRITE_DELAY_MS);
          pendingWrites.set(name, pending);
        }).catch(function () {
          resolve(finishBackground(
            { success: false, guest: false, user: null },
            extras ? extras(value) : null
          ));
        });
      });
    }

    async function loadAndMerge(localProfile, localWatchlist) {
      const context = await sessionContext();
      const normalizedLocalProfile = data.normalizeProfile(localProfile, timestamp());
      const normalizedLocalWatchlist = data.normalizeWatchlist(localWatchlist, timestamp());

      if (context.failed) {
        return delay({
          profile: normalizedLocalProfile,
          watchlist: normalizedLocalWatchlist
        });
      }
      if (!context.user) {
        setStatus('guest', {
          user: null,
          profile: normalizedLocalProfile,
          watchlist: normalizedLocalWatchlist
        });
        return {
          profile: normalizedLocalProfile,
          watchlist: normalizedLocalWatchlist,
          synced: false,
          guest: true
        };
      }

      setStatus('syncing', { user: context.user });
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
        return delay({
          user: context.user,
          profile: normalizedLocalProfile,
          watchlist: normalizedLocalWatchlist
        });
      }

      if (
        !profileResponse || profileResponse.error ||
        !feedbackResponse || feedbackResponse.error ||
        !watchResponse || watchResponse.error
      ) {
        return delay({
          user: context.user,
          profile: normalizedLocalProfile,
          watchlist: normalizedLocalWatchlist
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
      const profile = data.mergeProfiles(normalizedLocalProfile, remoteProfile);
      const remoteWatchRows = Array.isArray(watchResponse.data) ? watchResponse.data : [];
      const watchlist = data.mergeWatchlists(normalizedLocalWatchlist, remoteWatchRows);
      const localSaved = saveMergedLocal(profile, watchlist);

      const written = await Promise.all([
        writeProfile(profile, context.user.id),
        writeFeedback(profile, context.user.id),
        writeWatchlist(
          watchlist,
          remoteWatchRows.map(function (row) { return row && row.game_key; }).filter(Boolean),
          context.user.id
        )
      ]);
      if (!localSaved || written.some(function (result) { return !result.success; })) {
        return delay({ user: context.user, profile, watchlist });
      }

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
      if (!context.user) setStatus('guest', { user: null });
      else setStatus('syncing', { user: context.user });
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
      return function () {
        listeners.delete(listener);
      };
    }

    async function signOut() {
      try {
        const response = await client.auth.signOut();
        if (response && response.error) {
          setStatus('delayed');
          return false;
        }
        setStatus('guest', { user: null, profile: null, watchlist: null });
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
          if (!user) setStatus('guest', { user: null });
          else setStatus('syncing', { user });
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
        return debouncedWrite('profile', profile, writeProfile, function (value) {
          return { profile: value };
        });
      },
      syncFeedback: function (profile) {
        return debouncedWrite('feedback', profile, writeFeedback, function (value) {
          return { profile: value };
        });
      },
      syncWatchlist: function (watchlist) {
        return debouncedWrite('watchlist', watchlist, function (value, expectedUserId) {
          return writeWatchlist(value, null, expectedUserId);
        }, function (value) {
          return { watchlist: value };
        });
      },
      loadAndMerge,
      signOut
    };
  }

  return {
    PROFILE_STORAGE_KEY,
    WATCHLIST_STORAGE_KEY,
    WRITE_DELAY_MS,
    createAccountClient
  };
});
