(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const EVENTS = new Set([
    'deal_click',
    'search_used',
    'watchlist_add',
    'watchlist_remove',
    'watchlist_open',
    'watchlist_target_update',
    'recommendation_like',
    'recommendation_skip',
    'auth_request',
    'account_sync',
    'account_delete_request',
    'notification_toggle'
  ]);

  const PROPERTIES = new Set([
    'surface',
    'store',
    'priceBucket',
    'resultBucket',
    'action',
    'provider',
    'signedIn',
    'result',
    'category',
    'enabled'
  ]);

  const NOTIFICATION_CATEGORIES = new Set([
    'target_price',
    'free_game',
    'weekly_digest'
  ]);

  const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]+/g;
  const MAX_PROPERTY_LENGTH = 80;

  function sanitizeEvent(value) {
    return typeof value === 'string' && EVENTS.has(value) ? value : null;
  }

  function sanitizeValue(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      value = String(value);
    }
    if (typeof value !== 'string') return null;

    const printable = value
      .replace(CONTROL_CHARACTERS, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!printable) return null;
    const bounded = Array.from(printable).slice(0, MAX_PROPERTY_LENGTH).join('');
    try {
      encodeURIComponent(bounded);
    } catch (_) {
      return null;
    }
    return bounded;
  }

  function sanitizeProperties(input, eventName) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

    const clean = {};
    try {
      for (const key of PROPERTIES) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
        const notificationProperty = key === 'category' || key === 'enabled';
        if (eventName === 'notification_toggle' && !notificationProperty) continue;
        if (eventName !== 'notification_toggle' && notificationProperty) continue;
        const safeValue = sanitizeValue(input[key]);
        if (safeValue === null) continue;
        if (key === 'result' && safeValue !== 'success' && safeValue !== 'failure') continue;
        if (key === 'provider' && safeValue !== 'google' && safeValue !== 'email') continue;
        if (key === 'category' && !NOTIFICATION_CATEGORIES.has(safeValue)) continue;
        if (key === 'enabled' && safeValue !== 'true' && safeValue !== 'false') continue;
        clean[key] = safeValue;
      }
    } catch (_) {
      return {};
    }
    if (
      eventName === 'notification_toggle' &&
      (!clean.category || !clean.enabled)
    ) return {};
    return clean;
  }

  function resultBucket(value) {
    if (value === '' || value == null) return null;
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) return null;
    if (count === 0) return '0';
    if (count < 10) return '1-9';
    if (count < 25) return '10-24';
    return '25+';
  }

  function priceBucket(value) {
    if (value === '' || value == null) return null;
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return null;
    if (price === 0) return 'free';
    if (price < 5) return 'under-5';
    if (price < 10) return 'under-10';
    if (price < 25) return 'under-25';
    return '25-plus';
  }

  function eventPath(eventName, properties) {
    const pairs = Object.entries(properties).map(([key, value]) => (
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    ));
    return pairs.length ? `${eventName}?${pairs.join('&')}` : eventName;
  }

  function eventTitle(eventName) {
    const words = eventName.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function schedule(callback) {
    if (root && typeof root.queueMicrotask === 'function') {
      root.queueMicrotask(callback);
      return;
    }
    Promise.resolve().then(callback);
  }

  function track(eventName, properties) {
    let safeEvent;
    let payload;
    try {
      safeEvent = sanitizeEvent(eventName);
      if (!safeEvent) return false;

      const goatCounter = root && root.goatcounter;
      if (!goatCounter || typeof goatCounter.count !== 'function') return false;

      const safeProperties = sanitizeProperties(properties, safeEvent);
      payload = {
        path: eventPath(safeEvent, safeProperties),
        title: eventTitle(safeEvent),
        event: true
      };
    } catch (_) {
      return false;
    }

    try {
      schedule(function () {
        try {
          const activeGoatCounter = root && root.goatcounter;
          if (!activeGoatCounter || typeof activeGoatCounter.count !== 'function') return;
          activeGoatCounter.count(payload);
        } catch (_) {
          // Analytics must never interrupt the user action being measured.
        }
      });
    } catch (_) {
      return false;
    }
    return true;
  }

  return {
    EVENTS,
    PROPERTIES,
    MAX_PROPERTY_LENGTH,
    sanitizeEvent,
    sanitizeProperties,
    resultBucket,
    priceBucket,
    track
  };
});
