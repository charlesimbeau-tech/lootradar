(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LootRadarAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ACCOUNT_PATH = '/account.html';
  const CALLBACK_RECOVERY_MESSAGE =
    'We could not finish signing you in. Try Google again or use the email option below.';
  const GOOGLE_RECOVERY_MESSAGE =
    'Google sign-in is unavailable. Use the email option below.';
  const LINK_RECOVERY_MESSAGE =
    'Google could not be connected right now. Try again in a moment.';
  const CALLBACK_ERROR_KEYS = ['error', 'error_code', 'error_description'];

  function callbackHasError(location) {
    for (const source of [location?.search, location?.hash]) {
      if (typeof source !== 'string' || source.length < 2) continue;
      const params = new URLSearchParams(source.slice(1));
      if (CALLBACK_ERROR_KEYS.some(key => params.has(key))) return true;
    }
    return false;
  }

  function resolveNext(value, safeRedirect) {
    const candidate = typeof safeRedirect === 'function'
      ? safeRedirect(value, ACCOUNT_PATH)
      : ACCOUNT_PATH;

    try {
      const parsed = new URL(candidate, 'https://thelootradar.com');
      if (parsed.origin !== 'https://thelootradar.com') return ACCOUNT_PATH;
      if (parsed.pathname.toLowerCase() === '/login.html') return ACCOUNT_PATH;
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_) {
      return ACCOUNT_PATH;
    }
  }

  function oauthRedirect(location, path) {
    return `${location.origin}${path}`;
  }

  function setBusy(button, busy) {
    if (button) button.disabled = busy;
  }

  async function probeAuthService(options) {
    const url = options?.url;
    const key = options?.key;
    const fetchFn = options?.fetchFn;
    const timeoutMs = Number.isFinite(options?.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : 5000;
    if (!url || !key || typeof fetchFn !== 'function') return false;

    let endpoint;
    try {
      endpoint = new URL('/auth/v1/health', url);
      if (endpoint.protocol !== 'https:') return false;
    } catch (_) {
      return false;
    }

    const controller = typeof AbortController === 'function'
      ? new AbortController()
      : null;
    const timer = controller && timeoutMs > 0
      ? setTimeout(function () { controller.abort(); }, timeoutMs)
      : null;

    try {
      const response = await fetchFn(endpoint.toString(), {
        method: 'GET',
        headers: { apikey: key },
        signal: controller ? controller.signal : undefined,
        cache: 'no-store'
      });
      return Boolean(response?.ok);
    } catch (_) {
      return false;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  function createLoginController(options) {
    const client = options.client;
    const location = options.location;
    const analytics = options.analytics;
    const next = options.next || ACCOUNT_PATH;
    const elements = options.elements || {};
    const googleButton = elements.googleButton;
    const emailButton = elements.emailButton;
    const emailInput = elements.emailInput;
    const message = elements.message;
    let redirecting = false;
    let bound = false;

    function show(text) {
      if (message) message.textContent = text;
    }

    function track(provider) {
      if (!analytics || typeof analytics.track !== 'function') return;
      analytics.track('auth_request', {
        surface: 'login',
        provider,
        signedIn: false
      });
    }

    function returnToNext() {
      if (redirecting) return;
      redirecting = true;
      show('Signed in. Opening your account…');
      location.assign(next);
    }

    async function googleLogin() {
      track('google');
      setBusy(googleButton, true);
      show('Opening Google sign-in…');
      try {
        const { error } = await client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: oauthRedirect(
              location,
              `/login.html?next=${encodeURIComponent(next)}`
            )
          }
        });
        if (error) throw error;
      } catch (_) {
        show(GOOGLE_RECOVERY_MESSAGE);
        setBusy(googleButton, false);
        setBusy(emailButton, false);
      }
    }

    async function emailLogin() {
      const email = (emailInput?.value || '').trim();
      if (!email) {
        show('Enter your email address to receive a sign-in link.');
        emailInput?.focus();
        return;
      }

      track('email');
      setBusy(emailButton, true);
      show('Sending your private sign-in link…');
      try {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: oauthRedirect(
              location,
              `/login.html?next=${encodeURIComponent(next)}`
            )
          }
        });
        if (error) throw error;
        show('Check your inbox. The sign-in link will bring you back to LootRadar.');
      } catch (_) {
        show('We could not send the sign-in link. Check the address and try again.');
        setBusy(emailButton, false);
      }
    }

    function bind() {
      if (bound) return;
      bound = true;
      googleButton?.addEventListener('click', googleLogin);
      emailButton?.addEventListener('click', emailLogin);
      emailInput?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        emailButton?.click();
      });

      if (typeof client.auth.onAuthStateChange === 'function') {
        client.auth.onAuthStateChange((event, session) => {
          if (
            (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
            session?.user
          ) {
            returnToNext();
          }
        });
      }
    }

    async function start() {
      bind();
      const callbackFailed = callbackHasError(location);
      if (callbackFailed) show(CALLBACK_RECOVERY_MESSAGE);

      let result;
      try {
        result = await client.auth.getSession();
      } catch (_) {
        show(CALLBACK_RECOVERY_MESSAGE);
        return { status: 'ready', session: null };
      }

      if (result?.error) {
        show(CALLBACK_RECOVERY_MESSAGE);
        return { status: 'ready', session: null };
      }

      const session = result?.data?.session || null;
      if (session?.user) {
        returnToNext();
        return { status: 'redirecting', session };
      }
      return { status: 'ready', session: null };
    }

    return {
      start,
      googleLogin,
      emailLogin
    };
  }

  async function bindGoogleIdentityLink(options) {
    const client = options.client;
    const button = options.button;
    const location = options.location;
    const show = typeof options.show === 'function' ? options.show : function () {};
    if (!button) return { available: false, linked: false };

    button.hidden = true;
    let result;
    try {
      result = await client.auth.getUserIdentities();
    } catch (_) {
      return { available: false, linked: false };
    }
    if (result?.error) return { available: false, linked: false };

    const identities = Array.isArray(result?.data?.identities)
      ? result.data.identities
      : [];
    const linked = identities.some(identity => identity?.provider === 'google');
    if (linked) return { available: false, linked: true };

    button.hidden = false;
    button.addEventListener('click', async () => {
      setBusy(button, true);
      show('Connecting Google…');
      try {
        const { error } = await client.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: oauthRedirect(
              location,
              `/login.html?next=${encodeURIComponent('/account.html?linked=google')}`
            )
          }
        });
        if (error) throw error;
      } catch (_) {
        show(LINK_RECOVERY_MESSAGE);
        setBusy(button, false);
      }
    });
    return { available: true, linked: false };
  }

  return {
    ACCOUNT_PATH,
    CALLBACK_RECOVERY_MESSAGE,
    GOOGLE_RECOVERY_MESSAGE,
    LINK_RECOVERY_MESSAGE,
    callbackHasError,
    resolveNext,
    probeAuthService,
    createLoginController,
    bindGoogleIdentityLink
  };
});
