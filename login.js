(function () {
  'use strict';

  const googleButton = document.getElementById('googleLogin');
  const emailButton = document.getElementById('sendLogin');
  const emailInput = document.getElementById('loginEmail');
  const message = document.getElementById('loginMsg');

  function show(text) {
    if (message) message.textContent = text;
  }

  function setUnavailable() {
    show('Account access is unavailable right now. You can still browse and save deals on this device.');
    if (googleButton) googleButton.disabled = true;
    if (emailButton) emailButton.disabled = true;
  }

  async function start() {
    if (
      !window.supabase ||
      !window.LR_SUPABASE_URL ||
      !window.LR_SUPABASE_ANON_KEY ||
      !window.LootRadarAuth ||
      !window.LootRadarRedirect
    ) {
      setUnavailable();
      return;
    }

    const client = window.supabase.createClient(
      window.LR_SUPABASE_URL,
      window.LR_SUPABASE_ANON_KEY
    );
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
