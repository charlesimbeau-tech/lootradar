(function () {
  'use strict';

  const statusNode = document.getElementById('accountStatus');
  const identityNode = document.getElementById('accountIdentity');
  const contentNode = document.getElementById('accountContent');
  const watchlistNode = document.getElementById('accountWatchlist');
  const emptyWatchlistNode = document.getElementById('emptyWatchlist');
  const preferencesNode = document.getElementById('accountPreferences');
  const providersNode = document.getElementById('identityProviders');
  const linkGoogleButton = document.getElementById('linkGoogle');
  const signOutButton = document.getElementById('signOut');
  const openDeleteButton = document.getElementById('openDelete');
  const deleteDialog = document.getElementById('deleteDialog');
  const deleteForm = document.getElementById('deleteForm');
  const deleteConfirm = document.getElementById('deleteConfirm');
  const confirmDelete = document.getElementById('confirmDelete');
  const alertAvailabilityNode = document.getElementById('alertAvailability');
  const alertHistoryNode = document.getElementById('alertHistory');
  const alertHistoryStatusNode = document.getElementById('alertHistoryStatus');
  const disableAllAlertsButton = document.getElementById('disableAllAlerts');
  const ALERT_COLUMNS = Object.freeze({
    target_price: 'target_price_enabled',
    free_game: 'free_game_enabled',
    weekly_digest: 'weekly_digest_enabled'
  });
  const ALERT_INPUTS = Object.freeze({
    target_price: document.getElementById('targetPriceAlert'),
    free_game: document.getElementById('freeGameAlert'),
    weekly_digest: document.getElementById('weeklyDigestAlert')
  });
  const ALERT_LABELS = Object.freeze({
    target_price: 'Target price',
    free_game: 'Free game',
    weekly_digest: 'Weekly digest'
  });

  function show(text) {
    if (statusNode) statusNode.textContent = text;
  }

  function parseLocal(key) {
    try {
      return JSON.parse(window.localStorage.getItem(key) || '{}');
    } catch (_) {
      return {};
    }
  }

  function addTextRow(parent, label, value) {
    const row = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    row.appendChild(strong);
    row.appendChild(document.createTextNode(value));
    parent.appendChild(row);
  }

  function renderWatchlist(watchlist) {
    watchlistNode.replaceChildren();
    const items = Object.values(watchlist || {}).sort((a, b) =>
      String(a.title).localeCompare(String(b.title))
    );
    emptyWatchlistNode.hidden = items.length > 0;
    for (const item of items) {
      const row = document.createElement('li');
      row.className = 'account-item';
      const title = document.createElement('span');
      title.textContent = item.title || item.key || 'Saved game';
      const target = document.createElement('span');
      target.className = 'account-muted';
      target.textContent = Number.isFinite(Number(item.targetPrice))
        ? `Target $${Number(item.targetPrice).toFixed(2)}`
        : 'Target not set';
      row.append(title, target);
      watchlistNode.appendChild(row);
    }
  }

  function renderPreferences(profile) {
    preferencesNode.replaceChildren();
    const values = profile || {};
    addTextRow(preferencesNode, 'Budget', Number.isFinite(Number(values.budget))
      ? `$${Number(values.budget).toFixed(0)}`
      : 'No limit saved');
    addTextRow(preferencesNode, 'Genres', Array.isArray(values.genres) && values.genres.length
      ? values.genres.join(', ')
      : 'Any');
    addTextRow(preferencesNode, 'Stores', Array.isArray(values.stores) && values.stores.length
      ? values.stores.join(', ')
      : 'Any qualified retailer');
    const likes = values.likes && typeof values.likes === 'object'
      ? Object.keys(values.likes).length
      : 0;
    const dislikes = values.dislikes && typeof values.dislikes === 'object'
      ? Object.keys(values.dislikes).length
      : 0;
    addTextRow(preferencesNode, 'Recommendation choices', `${likes} liked, ${dislikes} dismissed`);
  }

  function browserTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    } catch (_) {
      return 'America/New_York';
    }
  }

  function defaultAlertPreferences() {
    return {
      target_price_enabled: false,
      free_game_enabled: false,
      weekly_digest_enabled: false,
      timezone: browserTimeZone(),
      digest_day: 5,
      digest_hour: 10,
      unsubscribed_at: null
    };
  }

  function setAlertControlsEnabled(enabled) {
    for (const input of Object.values(ALERT_INPUTS)) {
      if (input) input.disabled = !enabled;
    }
    if (disableAllAlertsButton) disableAllAlertsButton.disabled = !enabled;
  }

  function applyAlertPreferences(preferences) {
    for (const [category, column] of Object.entries(ALERT_COLUMNS)) {
      if (ALERT_INPUTS[category]) ALERT_INPUTS[category].checked = preferences[column] === true;
    }
  }

  function renderAlertHistory(rows) {
    if (!alertHistoryNode || !alertHistoryStatusNode) return;
    alertHistoryNode.replaceChildren();
    if (!rows.length) {
      alertHistoryStatusNode.textContent = 'No deal email has been recorded for this account.';
      return;
    }
    alertHistoryStatusNode.textContent = 'Your latest 20 deal-email delivery records.';
    for (const delivery of rows) {
      const row = document.createElement('li');
      row.className = 'account-item';
      const summary = document.createElement('span');
      summary.textContent = ALERT_LABELS[delivery.alert_type] || 'Deal alert';
      const detail = document.createElement('span');
      detail.className = 'account-muted';
      const createdAt = new Date(delivery.created_at);
      const dateLabel = Number.isNaN(createdAt.getTime())
        ? 'Date unavailable'
        : createdAt.toLocaleString();
      const statusLabel = typeof delivery.status === 'string'
        ? delivery.status.replace(/_/g, ' ')
        : 'unknown';
      detail.textContent = `${statusLabel} · ${dateLabel}`;
      row.append(summary, detail);
      alertHistoryNode.appendChild(row);
    }
  }

  async function loadAlertHistory(supabase) {
    const result = await supabase
      .from('lr_alert_deliveries')
      .select('alert_type,status,created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (result.error) {
      alertHistoryNode.replaceChildren();
      alertHistoryStatusNode.textContent = 'Recent deal-email history is unavailable right now.';
      return;
    }
    renderAlertHistory(Array.isArray(result.data) ? result.data : []);
  }

  async function setupAlertControls(supabase, user) {
    const alertsEnabled = window.LR_ALERTS_ENABLED === true;
    if (!alertsEnabled) {
      setAlertControlsEnabled(false);
      alertAvailabilityNode.textContent = 'Email alerts are not available yet.';
      return;
    }

    let preferences = defaultAlertPreferences();
    const result = await supabase
      .from('lr_notification_preferences')
      .select(
        'target_price_enabled,free_game_enabled,weekly_digest_enabled,' +
        'timezone,digest_day,digest_hour,unsubscribed_at'
      )
      .eq('user_id', user.id)
      .maybeSingle();
    if (result.error) {
      setAlertControlsEnabled(false);
      alertAvailabilityNode.textContent = 'Email alert settings are unavailable right now.';
      await loadAlertHistory(supabase);
      return;
    }
    if (result.data) preferences = { ...preferences, ...result.data };
    applyAlertPreferences(preferences);
    setAlertControlsEnabled(true);
    alertAvailabilityNode.textContent =
      `Choose the email you want. Weekly digests arrive Friday at 10:00 a.m. (${preferences.timezone || browserTimeZone()}).`;

    async function saveCategory(category, enabled) {
      const column = ALERT_COLUMNS[category];
      const input = ALERT_INPUTS[category];
      if (!column || !input) return;
      setAlertControlsEnabled(false);
      const next = {
        ...preferences,
        [column]: enabled,
        timezone: browserTimeZone(),
        digest_day: 5,
        digest_hour: 10,
        unsubscribed_at: enabled ? null : preferences.unsubscribed_at,
        updated_at: new Date().toISOString()
      };
      const save = await supabase.from('lr_notification_preferences').upsert({
        user_id: user.id,
        [column]: enabled,
        timezone: next.timezone,
        digest_day: 5,
        digest_hour: 10,
        unsubscribed_at: next.unsubscribed_at,
        updated_at: next.updated_at
      }, { onConflict: 'user_id' });
      if (save.error) {
        input.checked = preferences[column] === true;
        show('That email setting could not be saved. Try again.');
      } else {
        preferences = next;
        window.LootRadarAnalytics?.track('notification_toggle', { category, enabled });
        show('Deal email setting saved.');
      }
      setAlertControlsEnabled(true);
    }

    for (const [category, input] of Object.entries(ALERT_INPUTS)) {
      input.addEventListener('change', () => {
        saveCategory(category, input.checked).catch(() => {
          input.checked = preferences[ALERT_COLUMNS[category]] === true;
          setAlertControlsEnabled(true);
          show('That email setting could not be saved. Try again.');
        });
      });
    }

    disableAllAlertsButton.addEventListener('click', async () => {
      setAlertControlsEnabled(false);
      const disabledAt = new Date().toISOString();
      try {
        const save = await supabase.from('lr_notification_preferences').upsert({
          user_id: user.id,
          target_price_enabled: false,
          free_game_enabled: false,
          weekly_digest_enabled: false,
          timezone: browserTimeZone(),
          digest_day: 5,
          digest_hour: 10,
          unsubscribed_at: disabledAt,
          updated_at: disabledAt
        }, { onConflict: 'user_id' });
        if (save.error) throw save.error;
        preferences = {
          ...preferences,
          target_price_enabled: false,
          free_game_enabled: false,
          weekly_digest_enabled: false,
          unsubscribed_at: disabledAt,
          updated_at: disabledAt
        };
        applyAlertPreferences(preferences);
        for (const category of Object.keys(ALERT_COLUMNS)) {
          window.LootRadarAnalytics?.track('notification_toggle', {
            category,
            enabled: false
          });
        }
        show('All deal email is off.');
      } catch (_) {
        show('Deal email could not be turned off. Try again.');
      }
      setAlertControlsEnabled(true);
    });

    await loadAlertHistory(supabase);
  }

  function recentSession(session) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]
        .replace(/-/g, '+').replace(/_/g, '/')));
      return Number.isFinite(payload.iat) &&
        Math.floor(Date.now() / 1000) - payload.iat <= 10 * 60 &&
        payload.iat <= Math.floor(Date.now() / 1000) + 5 * 60;
    } catch (_) {
      return false;
    }
  }

  function clearPrivateCache() {
    const exact = [
      'lr_watchlist_v1',
      'lr_rec_profile_v3',
      'lr_account_cache_owner_v1',
      'lr_guest_profile_v1',
      'lr_guest_watchlist_v1'
    ];
    for (const key of exact) window.localStorage.removeItem(key);
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (
        key && (
          key.startsWith('lr_watchlist_v1:user:') ||
          key.startsWith('lr_rec_profile_v3:user:')
        )
      ) {
        window.localStorage.removeItem(key);
      }
    }
  }

  async function start() {
    if (
      !window.supabase ||
      !window.LR_SUPABASE_URL ||
      !window.LR_SUPABASE_ANON_KEY ||
      !window.LootRadarAccountClient
    ) {
      show('Account access is unavailable right now.');
      return;
    }
    const supabase = window.supabase.createClient(
      window.LR_SUPABASE_URL,
      window.LR_SUPABASE_ANON_KEY
    );
    const sessionResult = await supabase.auth.getSession();
    const session = sessionResult?.data?.session || null;
    if (sessionResult?.error || !session?.user) {
      window.location.replace('/login.html?next=%2Faccount.html');
      return;
    }

    const account = window.LootRadarAccountClient.createAccountClient({
      client: supabase,
      storage: window.localStorage
    });
    account.subscribe(state => {
      const labels = {
        guest: 'Saved on this device',
        syncing: 'Syncing…',
        synced: 'Synced',
        delayed: 'Sync delayed'
      };
      show(labels[state.status] || '');
    });

    identityNode.textContent = session.user.email || 'Signed-in LootRadar account';
    contentNode.hidden = false;
    const localProfile = parseLocal('lr_rec_profile_v3');
    const localWatchlist = parseLocal('lr_watchlist_v1');
    const merged = await account.loadAndMerge(localProfile, localWatchlist);
    renderWatchlist(merged.watchlist || localWatchlist);
    renderPreferences(merged.profile || localProfile);
    setupAlertControls(supabase, session.user).catch(() => {
      setAlertControlsEnabled(false);
      alertAvailabilityNode.textContent = 'Email alert settings are unavailable right now.';
      alertHistoryStatusNode.textContent = 'Recent deal-email history is unavailable right now.';
    });

    const providers = Array.isArray(session.user.identities)
      ? session.user.identities.map(identity => identity.provider).filter(Boolean)
      : [];
    providersNode.textContent = providers.length
      ? `Connected sign-in: ${providers.join(', ')}`
      : 'Your sign-in methods are private.';

    if (window.LootRadarAuth?.bindGoogleIdentityLink) {
      await window.LootRadarAuth.bindGoogleIdentityLink({
        client: supabase,
        button: linkGoogleButton,
        location: window.location,
        show
      });
    }

    signOutButton.addEventListener('click', async () => {
      signOutButton.disabled = true;
      show('Signing out…');
      const signedOut = await account.signOut();
      if (signedOut) window.location.assign('/');
      else {
        show('Sign-out is delayed. Try again.');
        signOutButton.disabled = false;
      }
    });

    openDeleteButton.addEventListener('click', () => {
      deleteConfirm.value = '';
      deleteDialog.showModal();
      deleteConfirm.focus();
    });

    deleteForm.addEventListener('submit', async event => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      if (deleteConfirm.value !== 'DELETE') {
        show('Type DELETE exactly to confirm.');
        deleteConfirm.focus();
        return;
      }
      const currentResult = await supabase.auth.getSession();
      const currentSession = currentResult?.data?.session;
      if (!currentSession || !recentSession(currentSession)) {
        window.location.assign('/login.html?next=%2Faccount.html%3Fdelete%3D1');
        return;
      }
      confirmDelete.disabled = true;
      show('Deleting your private account data…');
      window.LootRadarAnalytics?.track('account_delete_request');
      const result = await supabase.functions.invoke('delete-account', {
        body: { confirm: 'DELETE' }
      });
      if (result.error || result.data?.deleted !== true) {
        show('The account could not be deleted. Your account and local data are unchanged.');
        confirmDelete.disabled = false;
        return;
      }
      clearPrivateCache();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (_) {
        // The server-side deletion already invalidated the account.
      }
      window.location.replace('/?account=deleted');
    });
  }

  start().catch(() => {
    show('Account access is unavailable right now. Your local data is unchanged.');
  });
})();
