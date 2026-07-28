(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarAuthNav = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 2000;

  function accountHref(guestHref) {
    const href = String(guestHref || 'login.html');
    return href.replace(/login\.html(?:[?#].*)?$/, 'account.html');
  }

  async function updateAuthNavigation(options) {
    const settings = options || {};
    const client = settings.client;
    const documentRef = settings.document;
    const timeoutMs = Number.isFinite(settings.timeoutMs)
      ? Math.max(0, settings.timeoutMs)
      : DEFAULT_TIMEOUT_MS;

    if (!client || !client.auth || typeof client.auth.getSession !== 'function' ||
        !documentRef || typeof documentRef.querySelectorAll !== 'function') {
      return 'guest';
    }

    let timeout;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => client.auth.getSession()),
        new Promise((resolve) => {
          timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
        })
      ]);
      clearTimeout(timeout);

      if (result && !result.timedOut && !result.error && result.data && result.data.session) {
        for (const link of documentRef.querySelectorAll('[data-account-link]')) {
          link.textContent = 'My account';
          link.setAttribute('href', accountHref(link.getAttribute('href')));
        }
        return 'authenticated';
      }
    } catch (_) {
      clearTimeout(timeout);
    }

    return 'guest';
  }

  function start(globalRef) {
    const browser = globalRef || (typeof window !== 'undefined' ? window : null);
    if (!browser || !browser.document || !browser.supabase ||
        typeof browser.supabase.createClient !== 'function' ||
        !browser.LR_SUPABASE_URL || !browser.LR_SUPABASE_ANON_KEY) {
      return Promise.resolve('guest');
    }

    try {
      const client = browser.supabase.createClient(
        browser.LR_SUPABASE_URL,
        browser.LR_SUPABASE_ANON_KEY
      );
      return updateAuthNavigation({
        client,
        document: browser.document,
        timeoutMs: DEFAULT_TIMEOUT_MS
      });
    } catch (_) {
      return Promise.resolve('guest');
    }
  }

  if (typeof window !== 'undefined' && window.document) {
    if (window.document.readyState === 'loading') {
      window.document.addEventListener('DOMContentLoaded', () => {
        start(window);
      }, { once: true });
    } else {
      start(window);
    }
  }

  return {
    DEFAULT_TIMEOUT_MS,
    accountHref,
    start,
    updateAuthNavigation
  };
});
