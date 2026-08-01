(function () {
  'use strict';

  const googleButton = document.getElementById('googleLogin');
  const emailButton = document.getElementById('sendLogin');
  const emailInput = document.getElementById('loginEmail');
  const message = document.getElementById('loginMsg');

  function show(text) {
    if (message) message.textContent = text;
  }

  function setControlsDisabled(disabled) {
    if (googleButton) googleButton.disabled = disabled;
    if (emailButton) emailButton.disabled = disabled;
    if (emailInput) emailInput.disabled = disabled;
  }

  function setUnavailable() {
    show('Account access is unavailable right now. You can still browse and save deals on this device.');
    setControlsDisabled(true);
  }

  async function start() {
    setControlsDisabled(true);
    show('Checking account access\u2026');
    if (
      !window.supabase ||
      !window.LR_SUPABASE_URL ||
      !window.LR_SUPABASE_ANON_KEY ||
      !window.LootRadarAuthNav ||
      !window.LootRadarAuth ||
      !window.LootRadarRedirect
    ) {
      setUnavailable();
      return;
    }

    const available = await window.LootRadarAuth.probeAuthService({
      url: window.LR_SUPABASE_URL,
      key: window.LR_SUPABASE_ANON_KEY,
      fetchFn: typeof window.fetch === 'function' ? window.fetch.bind(window) : null,
      timeoutMs: 5000
    });
    if (!available) {
      setUnavailable();
      return;
    }

    setControlsDisabled(false);
    show('');
    const client = window.LootRadarAuthNav.clientFor(window);
    if (!client) {
      setUnavailable();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const next = window.LootRadarAuth.resolveNext(
      params.get('next'),
      window.LootRadarRedirect.safeRedirect
    );
    const controller = window.LootRadarAuth.createLoginController({
      client,
      location: window.location,
      analytics: window.LootRadarAnalytics,
      next,
      elements: {
        googleButton,
        emailButton,
        emailInput,
        message
      }
    });
    await controller.start();
  }

  start().catch(setUnavailable);
})();
