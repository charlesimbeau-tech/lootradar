(function () {
  'use strict';

  const googleButton = document.getElementById('googleLogin');
  const emailButton = document.getElementById('sendLogin');
  const emailInput = document.getElementById('loginEmail');
  const message = document.getElementById('loginMsg');
  const linkGoogleButton = document.getElementById('linkGoogle');
  const redirect = window.LootRadarRedirect;
  const analytics = window.LootRadarAnalytics;
  const params = new URLSearchParams(window.location.search);
  const next = redirect
    ? redirect.safeRedirect(params.get('next'), '/account.html')
    : '/account.html';
  let redirecting = false;

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

  function setBusy(button, busy) {
    if (button) button.disabled = busy;
  }

  function returnToNext() {
    if (redirecting) return;
    redirecting = true;
    show('Signed in. Opening your account…');
    window.location.assign(next);
  }

  function oauthRedirect(path) {
    return `${window.location.origin}${path}`;
  }

  async function bindGoogleIdentityLink(client, session) {
    if (!linkGoogleButton) return;
    linkGoogleButton.hidden = true;
    if (!session?.user || typeof client.auth.getUserIdentities !== 'function') return;

    let result;
    try {
      result = await client.auth.getUserIdentities();
    } catch (_) {
      return;
    }
    if (result?.error) return;

    const identities = result?.data?.identities || [];
    if (identities.some(identity => identity?.provider === 'google')) return;

    linkGoogleButton.hidden = false;
    linkGoogleButton.addEventListener('click', async () => {
      setBusy(linkGoogleButton, true);
      show('Connecting Google…');
      try {
        const { error } = await client.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: oauthRedirect('/account.html?linked=google')
          }
        });
        if (error) throw error;
      } catch (_) {
        show('Google could not be connected right now. Try again in a moment.');
        setBusy(linkGoogleButton, false);
      }
    });
  }

  async function start() {
    if (
      !window.supabase ||
      !window.LR_SUPABASE_URL ||
      !window.LR_SUPABASE_ANON_KEY
    ) {
      show('Account access is unavailable right now. You can still browse and save deals on this device.');
      setBusy(googleButton, true);
      setBusy(emailButton, true);
      return;
    }

    const client = window.supabase.createClient(
      window.LR_SUPABASE_URL,
      window.LR_SUPABASE_ANON_KEY
    );

    let session = null;
    try {
      const result = await client.auth.getSession();
      session = result?.data?.session || null;
    } catch (_) {
      show('We could not check your account status. You can still try signing in.');
    }

    await bindGoogleIdentityLink(client, session);
    if (session?.user) {
      returnToNext();
      return;
    }

    if (googleButton) {
      googleButton.addEventListener('click', async () => {
        track('google');
        setBusy(googleButton, true);
        show('Opening Google sign-in…');
        try {
          const { error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: oauthRedirect(
                `/login.html?next=${encodeURIComponent(next)}`
              )
            }
          });
          if (error) throw error;
        } catch (_) {
          show('Google sign-in is unavailable. Use the email option below.');
          setBusy(googleButton, false);
        }
      });
    }

    if (emailButton) {
      emailButton.addEventListener('click', async () => {
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
      });

      emailInput?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        emailButton.click();
      });
    }

    client.auth.onAuthStateChange((event, nextSession) => {
      if (
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
        nextSession?.user
      ) {
        returnToNext();
      }
    });
  }

  start().catch(() => {
    show('Account access is unavailable right now. You can still use LootRadar without signing in.');
    setBusy(googleButton, true);
    setBusy(emailButton, true);
  });
})();
